import * as THREE from 'three'
import { heightAt } from '../physics/terrain'
import { markShared } from './sharedAssets'
import { evenStations } from './snowMesh'
import { type CourseShape, crossSectionAt } from './terrainShape'

const FENCE_HEIGHT = 1.3
/** Retrait des filets par rapport au bord de la piste. */
const FENCE_INSET = 0.5
const SAMPLE_SPACING = 1
const POST_SPACING = 2.5
const POST_RADIUS = 0.035
const POST_COLOR = 0x1747b8

const TEXTURE_SIZE = 128
const MESH_CELL = 16
const NET_FILL = 'rgba(52, 128, 240, 0.4)'
const NET_LINE = 'rgba(24, 82, 205, 0.95)'
const BANNER_FILL = 'rgba(22, 78, 200, 0.92)'

/** Motif d'un panneau de filet : maille bleue translucide, lisse en haut, bandeau plein en bas. */
function netTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = TEXTURE_SIZE
  canvas.height = TEXTURE_SIZE
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas 2D indisponible : impossible de dessiner les filets de la piste.')

  context.fillStyle = NET_FILL
  context.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE)
  context.strokeStyle = NET_LINE
  context.lineWidth = 2
  for (let offset = 0; offset <= TEXTURE_SIZE; offset += MESH_CELL) {
    context.beginPath()
    context.moveTo(offset, 0)
    context.lineTo(offset, TEXTURE_SIZE)
    context.moveTo(0, offset)
    context.lineTo(TEXTURE_SIZE, offset)
    context.stroke()
  }
  context.fillStyle = BANNER_FILL
  context.fillRect(0, 0, TEXTURE_SIZE, MESH_CELL / 2)
  context.fillRect(0, TEXTURE_SIZE * 0.62, TEXTURE_SIZE, TEXTURE_SIZE * 0.3)

  const texture = markShared(new THREE.CanvasTexture(canvas))
  texture.wrapS = THREE.RepeatWrapping
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 8
  return texture
}

const edgeHeight = (shape: CourseShape, x: number): number =>
  crossSectionAt(shape, x, heightAt(shape.terrain, x)).sideY

const POST_GEOMETRY = markShared(new THREE.CylinderGeometry(POST_RADIUS, POST_RADIUS, FENCE_HEIGHT, 6))
const POST_MATERIAL = markShared(new THREE.MeshStandardMaterial({ color: POST_COLOR, roughness: 0.6 }))
let netMaterial: THREE.Material | undefined

/** Matériau des filets, peint à la première demande puis réutilisé à chaque reconstruction de la piste. */
function sharedNetMaterial(): THREE.Material {
  netMaterial ??= markShared(
    new THREE.MeshStandardMaterial({
      map: netTexture(),
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      roughness: 0.8,
    }),
  )
  return netMaterial
}

/** Portion de piste bordée d'un filet. */
export interface FencedRange {
  readonly fromX: number
  readonly toX: number
}

/** Abscisses d'un filet : espacées régulièrement, coupées net aux deux bouts de la portion bordée. */
function fenceStations(shape: CourseShape, spacing: number, range: FencedRange | undefined): number[] {
  const xs = evenStations(shape, spacing)
  if (!range) return xs
  return [range.fromX, ...xs.filter((x) => x > range.fromX && x < range.toX), range.toX]
}

/** Filet tendu le long d'un bord de piste : un ruban vertical qui épouse la neige. */
function net(shape: CourseShape, z: number, material: THREE.Material, range?: FencedRange): THREE.Mesh {
  const xs = fenceStations(shape, SAMPLE_SPACING, range)
  const positions = xs.flatMap((x) => {
    const y = edgeHeight(shape, x)
    return [x, y, z, x, y + FENCE_HEIGHT, z]
  })
  const uvs = xs.flatMap((x) => [(x - xs[0]) / POST_SPACING, 0, (x - xs[0]) / POST_SPACING, 1])
  const indices = xs.slice(1).flatMap((_, i) => {
    const a = i * 2
    return [a, a + 1, a + 2, a + 1, a + 3, a + 2]
  })

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return new THREE.Mesh(geometry, material)
}

function posts(shape: CourseShape, edgeZ: number, liftSide: FencedRange | undefined): THREE.InstancedMesh {
  const spots = [
    ...fenceStations(shape, POST_SPACING, liftSide).map((x) => ({ x, z: -edgeZ })),
    ...fenceStations(shape, POST_SPACING, undefined).map((x) => ({ x, z: edgeZ })),
  ]
  const mesh = new THREE.InstancedMesh(POST_GEOMETRY, POST_MATERIAL, spots.length)
  const transform = new THREE.Object3D()
  spots.forEach((spot, i) => {
    transform.position.set(spot.x, edgeHeight(shape, spot.x) + FENCE_HEIGHT / 2, spot.z)
    transform.updateMatrix()
    mesh.setMatrixAt(i, transform.matrix)
  })
  mesh.castShadow = true
  return mesh
}

/**
 * Filets bleus des deux bords de la piste, avec leurs piquets. Du côté du télésiège, le filet
 * s'interrompt aux deux gares pour laisser passer le skieur.
 */
export function buildFences(shape: CourseShape, liftSide?: FencedRange): THREE.Group {
  const edgeZ = shape.halfWidth - FENCE_INSET
  const material = sharedNetMaterial()
  const group = new THREE.Group()
  group.add(net(shape, -edgeZ, material, liftSide), net(shape, edgeZ, material), posts(shape, edgeZ, liftSide))
  return group
}
