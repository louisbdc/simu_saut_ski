import * as THREE from 'three'

/**
 * Obstacles du décor qui peuvent passer entre la caméra et le skieur : oriflammes, arche, sapins.
 * Chacun est approché par un cylindre vertical ; quand il coupe la ligne de visée, on le cache le
 * temps qu'elle se dégage.
 */
export interface Occluder {
  /** Pied du cylindre. */
  readonly x: number
  readonly y: number
  readonly z: number
  readonly radius: number
  readonly height: number
  /** Instance à cacher dans un `InstancedMesh` ; absente, c'est le maillage entier. */
  readonly instance?: number
}

/** Clé de `userData` sous laquelle un maillage du décor déclare ses obstacles. */
export const OCCLUDERS_KEY = 'occluders'

interface Point {
  readonly x: number
  readonly y: number
  readonly z: number
}

/** Marge autour de la ligne de visée : le skieur a une largeur, et un obstacle qui le frôle gêne déjà. */
const SIGHT_MARGIN = 0.5
/** Au-delà de cette part du trajet caméra-skieur, l'obstacle est à côté du skieur : il fait partie du plan. */
const NEAR_SUBJECT = 0.94

/** Le cylindre coupe-t-il la ligne de visée qui va de la caméra au skieur ? */
export function blocksView(camera: Point, subject: Point, occluder: Occluder): boolean {
  const dx = subject.x - camera.x
  const dz = subject.z - camera.z
  const lengthSquared = dx * dx + dz * dz
  if (lengthSquared === 0) return false
  const along = ((occluder.x - camera.x) * dx + (occluder.z - camera.z) * dz) / lengthSquared
  if (along < 0 || along > NEAR_SUBJECT) return false
  const reach = occluder.radius + SIGHT_MARGIN
  const offX = camera.x + along * dx - occluder.x
  const offZ = camera.z + along * dz - occluder.z
  if (offX * offX + offZ * offZ > reach * reach) return false
  const sightY = camera.y + along * (subject.y - camera.y)
  return sightY > occluder.y - SIGHT_MARGIN && sightY < occluder.y + occluder.height + SIGHT_MARGIN
}

export interface OcclusionCuller {
  /** Cache les obstacles qui coupent la vue et rétablit ceux qui ne la coupent plus. */
  readonly update: (camera: Point, subject: Point) => void
}

const HIDDEN_MATRIX = new THREE.Matrix4().makeScale(0, 0, 0)
const MATRIX_SIZE = 16

/** Suivi d'un maillage instancié : ses matrices d'origine, pour rétablir une instance cachée. */
interface InstancedEntry {
  readonly mesh: THREE.InstancedMesh
  readonly occluders: readonly Occluder[]
  readonly original: Float32Array
  readonly hidden: Uint8Array
}

/** Prépare le masquage de tous les obstacles déclarés sous ces objets de la scène. */
export function createOcclusionCuller(roots: readonly THREE.Object3D[]): OcclusionCuller {
  const instanced: InstancedEntry[] = []
  const plain: { mesh: THREE.Object3D; occluders: readonly Occluder[] }[] = []
  roots.forEach((root) =>
    root.traverse((object) => {
      const occluders = object.userData[OCCLUDERS_KEY] as readonly Occluder[] | undefined
      if (!occluders || occluders.length === 0) return
      if (object instanceof THREE.InstancedMesh) {
        const original = Float32Array.from(object.instanceMatrix.array)
        instanced.push({ mesh: object, occluders, original, hidden: new Uint8Array(object.count) })
      } else plain.push({ mesh: object, occluders })
    }),
  )

  const updateInstanced = (entry: InstancedEntry, camera: Point, subject: Point): void => {
    const blocked = new Uint8Array(entry.mesh.count)
    entry.occluders.forEach((occluder) => {
      if (occluder.instance !== undefined && blocksView(camera, subject, occluder)) blocked[occluder.instance] = 1
    })
    let changed = false
    blocked.forEach((isBlocked, index) => {
      if (isBlocked === entry.hidden[index]) return
      entry.hidden[index] = isBlocked
      changed = true
      if (isBlocked) entry.mesh.setMatrixAt(index, HIDDEN_MATRIX)
      else entry.mesh.instanceMatrix.array.set(entry.original.subarray(index * MATRIX_SIZE, (index + 1) * MATRIX_SIZE), index * MATRIX_SIZE)
    })
    if (changed) entry.mesh.instanceMatrix.needsUpdate = true
  }

  return {
    update: (camera, subject) => {
      instanced.forEach((entry) => updateInstanced(entry, camera, subject))
      plain.forEach(({ mesh, occluders }) => {
        mesh.visible = !occluders.some((occluder) => blocksView(camera, subject, occluder))
      })
    },
  }
}
