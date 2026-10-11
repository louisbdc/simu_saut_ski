import * as THREE from 'three'
import { markShared } from './sharedAssets'
import { SUN_DIRECTION } from './sun'
import { type CourseShape, surfaceHeightAt } from './terrainShape'

/**
 * Ombres au sol des arbres et des rochers. Les projeter vraiment obligerait à redessiner toute la
 * forêt à chaque image ; une tache sombre couchée sur la pente, du côté opposé au soleil, suffit à
 * les ancrer dans la neige, pour deux triangles par objet.
 */

/** Longueur de l'ombre rapportée à la hauteur de l'objet, pour ce soleil, et longueur maximale. */
const LENGTH_PER_HEIGHT = 0.42
const MAX_HALF_LENGTH = 7
/** L'ombre déborde un peu de la largeur de l'objet, et son centre est décalé pour qu'elle parte de son pied. */
const WIDTH_PER_RADIUS = 0.9
const FOOT_OVERLAP = 0.75
/** Pas de mesure de la pente autour du pied, et décollement de la tache au-dessus de la neige. */
const SLOPE_PROBE = 1.5
const LIFT = 0.08
const TEXTURE_SIZE = 32

/** Objet qui projette une ombre : son pied sur la neige, sa hauteur et son rayon au sol. */
export interface ShadowCaster {
  readonly x: number
  readonly z: number
  readonly groundY: number
  readonly height: number
  readonly radius: number
}

/** Tache d'ombre posée sur le terrain : son centre, son grand axe dans le plan de la pente, ses demi-dimensions. */
export interface ShadowPatch {
  readonly center: THREE.Vector3
  /** Sens de l'ombre, à l'opposé du soleil, couché dans la pente. */
  readonly along: THREE.Vector3
  readonly normal: THREE.Vector3
  readonly length: number
  readonly width: number
}

const AWAY_FROM_SUN = new THREE.Vector3(-SUN_DIRECTION.x, 0, -SUN_DIRECTION.z).normalize()

/** Calcule où et comment coucher l'ombre de chaque objet sur la pente qui le porte. */
export function shadowPatches(shape: CourseShape, casters: readonly ShadowCaster[]): ShadowPatch[] {
  return casters.map((caster) => {
    const slopeX = (surfaceHeightAt(shape, caster.x + SLOPE_PROBE, caster.z) - caster.groundY) / SLOPE_PROBE
    const slopeZ = (surfaceHeightAt(shape, caster.x, caster.z + SLOPE_PROBE) - caster.groundY) / SLOPE_PROBE
    const normal = new THREE.Vector3(-slopeX, 1, -slopeZ).normalize()
    const along = AWAY_FROM_SUN.clone().addScaledVector(normal, -AWAY_FROM_SUN.dot(normal)).normalize()
    const length = Math.min(caster.height * LENGTH_PER_HEIGHT, MAX_HALF_LENGTH)
    const center = new THREE.Vector3(caster.x, caster.groundY, caster.z)
      .addScaledVector(along, length * FOOT_OVERLAP)
      .addScaledVector(normal, LIFT)
    return { center, along, normal, length, width: caster.radius * WIDTH_PER_RADIUS }
  })
}

/** Tache ronde aux bords fondus : elle donne sa forme à l'ombre, portée par un simple carré de deux triangles. */
function shadowTexture(): THREE.DataTexture {
  const data = new Uint8Array(TEXTURE_SIZE * TEXTURE_SIZE * 4)
  const center = (TEXTURE_SIZE - 1) / 2
  for (let row = 0; row < TEXTURE_SIZE; row++) {
    for (let column = 0; column < TEXTURE_SIZE; column++) {
      const distance = Math.hypot(column - center, row - center) / center
      const offset = (row * TEXTURE_SIZE + column) * 4
      data.fill(255, offset, offset + 3)
      data[offset + 3] = Math.round(255 * THREE.MathUtils.smoothstep(1 - distance, 0, 0.55))
    }
  }
  const texture = new THREE.DataTexture(data, TEXTURE_SIZE, TEXTURE_SIZE, THREE.RGBAFormat)
  texture.magFilter = THREE.LinearFilter
  texture.minFilter = THREE.LinearFilter
  texture.needsUpdate = true
  return markShared(texture)
}

const SHADOW_GEOMETRY = markShared(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2))
const SHADOW_MATERIAL = markShared(
  new THREE.MeshBasicMaterial({
    color: 0x1c2e4a,
    map: shadowTexture(),
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -4,
  }),
)

/** Toutes les ombres au sol d'un lot d'objets, en un seul maillage. */
export function buildContactShadows(shape: CourseShape, casters: readonly ShadowCaster[]): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(SHADOW_GEOMETRY, SHADOW_MATERIAL, casters.length)
  const matrix = new THREE.Matrix4()
  const across = new THREE.Vector3()
  const lengthwise = new THREE.Vector3()
  shadowPatches(shape, casters).forEach((patch, i) => {
    lengthwise.copy(patch.along).multiplyScalar(patch.length)
    across.crossVectors(patch.along, patch.normal).multiplyScalar(patch.width)
    matrix.makeBasis(lengthwise, patch.normal, across).setPosition(patch.center)
    mesh.setMatrixAt(i, matrix)
  })
  return mesh
}
