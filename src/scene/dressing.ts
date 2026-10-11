import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { FACE_RUN } from '../physics/constants'
import { markShared } from './sharedAssets'
import { type CourseShape, type KickerShape, crossSectionAt, surfaceHeightAt } from './terrainShape'

const POLE_HEIGHT = 4.4
const POLE_RADIUS = 0.035
const BANNER_WIDTH = 0.8
const BANNER_HEIGHT = 3.3
const BANNER_ROWS = 6
const POLE_COLOR = new THREE.Color(0x2a3345)
const BANNER_TOP_COLOR = new THREE.Color(0x1747b8)
const BANNER_BOTTOM_COLOR = new THREE.Color(0x2f9bf0)
/** Écart entre une oriflamme et le pied du flanc de la bosse, puis retrait de celles de la cassure depuis le bord. */
const LIP_FLAG_CLEARANCE = 1.4
const KNUCKLE_FLAG_INSET = 2.4

/** Mur de lèvre trop bas pour porter un numéro lisible. */
const MIN_WALL_HEIGHT = 0.5
const LABEL_HEIGHT_RATIO = 0.7
const LABEL_ASPECT = 0.62
const LABEL_TEXTURE_SIZE = 256
const LABEL_COLOR = '#1f6fd6'
const LABEL_OFFSET = 0.03

/** Oriflamme : un mât et une voile en plume, plus étroite en bas, à plat dans le plan de la pente. */
function flagGeometry(): THREE.BufferGeometry {
  const tint = (geometry: THREE.BufferGeometry, colorAt: (y: number) => THREE.Color): THREE.BufferGeometry => {
    const positions = geometry.getAttribute('position')
    const colors = new Float32Array(positions.count * 3)
    for (let i = 0; i < positions.count; i++) colorAt(positions.getY(i)).toArray(colors, i * 3)
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    return geometry
  }
  const pole = tint(
    new THREE.CylinderGeometry(POLE_RADIUS, POLE_RADIUS, POLE_HEIGHT, 5).translate(0, POLE_HEIGHT / 2, 0),
    () => POLE_COLOR,
  )
  const sail = new THREE.PlaneGeometry(BANNER_WIDTH, BANNER_HEIGHT, 1, BANNER_ROWS)
  const positions = sail.getAttribute('position')
  for (let i = 0; i < positions.count; i++) {
    const ratio = positions.getY(i) / BANNER_HEIGHT + 0.5
    const width = BANNER_WIDTH * (0.35 + 0.65 * Math.sin(Math.min(1, ratio * 1.25) * Math.PI * 0.5))
    positions.setX(i, positions.getX(i) > 0 ? width : 0)
  }
  sail.translate(POLE_RADIUS, POLE_HEIGHT - BANNER_HEIGHT / 2, 0)
  const bottom = POLE_HEIGHT - BANNER_HEIGHT
  tint(sail, (y) => BANNER_BOTTOM_COLOR.clone().lerp(BANNER_TOP_COLOR, (y - bottom) / BANNER_HEIGHT))
  return markShared(mergeGeometries([pole, sail]))
}

/** Arche de départ : distance après la ligne de départ, demi-ouverture, hauteur sous la traverse. */
const ARCH_AHEAD = 2.5
const ARCH_HALF_SPAN = 5.2
const ARCH_HEIGHT = 4.6
const ARCH_COLOR = new THREE.Color(0x1b5fc4)
const ARCH_STRIPE = new THREE.Color(0xeef2f6)

/** Arche gonflable de départ, pieds à l'origine, en travers de la piste : deux jambes, une traverse, un liseré. */
function archGeometry(): THREE.BufferGeometry {
  const part = (size: readonly [number, number, number], center: readonly [number, number, number], color: THREE.Color): THREE.BufferGeometry => {
    const geometry = new THREE.BoxGeometry(...size).translate(...center).toNonIndexed()
    const colors = new Float32Array(geometry.getAttribute('position').count * 3)
    for (let i = 0; i < colors.length / 3; i++) color.toArray(colors, i * 3)
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    geometry.deleteAttribute('uv')
    return geometry
  }
  return markShared(
    mergeGeometries([
      ...[-ARCH_HALF_SPAN, ARCH_HALF_SPAN].map((z) => part([0.8, ARCH_HEIGHT + 0.9, 0.8], [0, (ARCH_HEIGHT + 0.9) / 2, z], ARCH_COLOR)),
      part([0.8, 0.9, ARCH_HALF_SPAN * 2 + 0.8], [0, ARCH_HEIGHT + 0.45, 0], ARCH_COLOR),
      part([0.84, 0.22, ARCH_HALF_SPAN * 2 - 0.8], [0, ARCH_HEIGHT + 0.45, 0], ARCH_STRIPE),
    ]),
  )
}

const ARCH_GEOMETRY = archGeometry()
const ARCH_MATERIAL = markShared(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }))
const FLAG_GEOMETRY = flagGeometry()
const FLAG_MATERIAL = markShared(
  new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide }),
)
const LABEL_GEOMETRY = markShared(new THREE.PlaneGeometry(1, 1))
const labelMaterials = new Map<string, THREE.Material>()

/** Emplacements des oriflammes d'une bosse : de part et d'autre de la lèvre et de la cassure. */
function flagSpots(shape: CourseShape, kicker: KickerShape, knuckleX: number): THREE.Vector3[] {
  const lipX = kicker.lipX - 1
  const { flankRun } = crossSectionAt(shape, kicker.lipX - 0.01, kicker.lipY)
  const lipZ = Math.min(kicker.halfWidth + flankRun + LIP_FLAG_CLEARANCE, shape.halfWidth - 1)
  const knuckleZ = shape.halfWidth - KNUCKLE_FLAG_INSET
  return [
    [lipX, lipZ],
    [lipX, -lipZ],
    [knuckleX, knuckleZ],
    [knuckleX, -knuckleZ],
  ].map(([x, z]) => new THREE.Vector3(x, surfaceHeightAt(shape, x, z), z))
}

function buildFlags(shape: CourseShape): THREE.InstancedMesh {
  const spots = shape.kickers.flatMap((kicker, index) =>
    flagSpots(shape, kicker, shape.terrain.kickers[index].knuckleStartX),
  )
  const flags = new THREE.InstancedMesh(FLAG_GEOMETRY, FLAG_MATERIAL, spots.length)
  const transform = new THREE.Object3D()
  spots.forEach((spot, i) => {
    transform.position.copy(spot)
    transform.updateMatrix()
    flags.setMatrixAt(i, transform.matrix)
  })
  flags.castShadow = true
  return flags
}

/** Matériau du numéro d'une bosse, peint une fois par numéro puis réutilisé. */
function labelMaterial(label: string): THREE.Material {
  const cached = labelMaterials.get(label)
  if (cached) return cached

  const canvas = document.createElement('canvas')
  canvas.width = Math.round(LABEL_TEXTURE_SIZE * LABEL_ASPECT * label.length)
  canvas.height = LABEL_TEXTURE_SIZE
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas 2D indisponible : impossible de peindre le numéro des bosses.')
  context.fillStyle = LABEL_COLOR
  context.font = `900 ${LABEL_TEXTURE_SIZE * 0.95}px "Arial Black", "Helvetica Neue", sans-serif`
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText(label, canvas.width / 2, canvas.height * 0.54)

  const texture = markShared(new THREE.CanvasTexture(canvas))
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 8
  const material = markShared(new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }))
  labelMaterials.set(label, material)
  return material
}

/** Numéro de la bosse peint sur le mur sous la lèvre, incliné comme lui. */
function wallLabel(kicker: KickerShape, index: number): THREE.Mesh | null {
  const wallHeight = kicker.lipY - kicker.deckY
  if (wallHeight < MIN_WALL_HEIGHT) return null
  const label = String(index + 1)
  const height = wallHeight * LABEL_HEIGHT_RATIO
  const width = Math.min(height * LABEL_ASPECT * label.length, kicker.halfWidth * 1.6)
  const mesh = new THREE.Mesh(LABEL_GEOMETRY, labelMaterial(label))
  mesh.scale.set(width, height, 1)
  mesh.position.set(kicker.lipX + FACE_RUN / 2 + LABEL_OFFSET, kicker.deckY + wallHeight / 2, 0)
  mesh.rotation.order = 'YXZ'
  mesh.rotation.y = Math.PI / 2
  mesh.rotation.x = -Math.atan2(FACE_RUN, wallHeight)
  return mesh
}

/** Habillage des bosses : oriflammes à la lèvre et à la cassure, numéro sur le mur de lèvre. */
export function buildDressing(shape: CourseShape): THREE.Group {
  const group = new THREE.Group()
  const arch = new THREE.Mesh(ARCH_GEOMETRY, ARCH_MATERIAL)
  const archX = shape.startX + ARCH_AHEAD
  // Ses pieds sont posés au plus bas de la neige sous ses deux jambes : la piste part en pente.
  arch.position.set(archX, surfaceHeightAt(shape, archX + 0.4, ARCH_HALF_SPAN), 0)
  arch.castShadow = true
  group.add(buildFlags(shape), arch)
  shape.kickers.forEach((kicker, index) => {
    const label = wallLabel(kicker, index)
    if (label) group.add(label)
  })
  return group
}
