import * as THREE from 'three'
import { describe, expect, test } from 'vitest'
import { OCCLUDERS_KEY, blocksView, createOcclusionCuller, type Occluder } from './occlusion'

const camera = { x: 0, y: 2, z: 10 }
const skier = { x: 0, y: 1, z: 0 }
const mast = (changes: Partial<Occluder> = {}): Occluder => ({ x: 0, y: 0, z: 5, radius: 0.5, height: 4, ...changes })

describe('obstacle entre la caméra et le skieur', () => {
  test('un mât planté sur la ligne de visée cache le skieur', () => {
    expect(blocksView(camera, skier, mast())).toBe(true)
  })

  test('un mât à côté de la ligne de visée ne gêne pas', () => {
    expect(blocksView(camera, skier, mast({ x: 3 }))).toBe(false)
  })

  test('un mât derrière le skieur ou derrière la caméra ne gêne pas', () => {
    expect(blocksView(camera, skier, mast({ z: -4 }))).toBe(false)
    expect(blocksView(camera, skier, mast({ z: 16 }))).toBe(false)
  })

  test('un obstacle trop bas pour atteindre la ligne de visée ne gêne pas', () => {
    expect(blocksView({ ...camera, y: 9 }, { ...skier, y: 8 }, mast({ height: 4 }))).toBe(false)
  })

  test('un obstacle suspendu au-dessus de la ligne de visée ne gêne pas', () => {
    expect(blocksView(camera, skier, mast({ y: 6, height: 1 }))).toBe(false)
  })

  test('un obstacle collé au skieur ne compte pas : il fait partie du plan', () => {
    expect(blocksView(camera, skier, mast({ z: 0.1 }))).toBe(false)
  })
})

describe('masquage des obstacles', () => {
  const instanced = (occluders: readonly Occluder[]): THREE.InstancedMesh => {
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial(), 2)
    mesh.setMatrixAt(0, new THREE.Matrix4().makeTranslation(0, 0, 5))
    mesh.setMatrixAt(1, new THREE.Matrix4().makeTranslation(8, 0, 5))
    mesh.userData[OCCLUDERS_KEY] = occluders
    return mesh
  }
  const scaleOf = (mesh: THREE.InstancedMesh, index: number): number => {
    const matrix = new THREE.Matrix4()
    mesh.getMatrixAt(index, matrix)
    return new THREE.Vector3().setFromMatrixScale(matrix).x
  }

  test('seule l’instance qui cache le skieur disparaît, et elle revient quand la vue est dégagée', () => {
    const mesh = instanced([mast({ instance: 0 }), mast({ x: 8, instance: 1 })])
    const culler = createOcclusionCuller([new THREE.Group().add(mesh)])

    culler.update(camera, skier)
    expect(scaleOf(mesh, 0)).toBe(0)
    expect(scaleOf(mesh, 1)).toBe(1)

    culler.update({ x: 20, y: 2, z: 0 }, skier)
    expect(scaleOf(mesh, 0)).toBe(1)
  })

  test('un maillage simple est caché en entier dès qu’une de ses parties gêne', () => {
    const arch = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial())
    arch.userData[OCCLUDERS_KEY] = [mast({ x: 9 }), mast()]
    const culler = createOcclusionCuller([arch])

    culler.update(camera, skier)
    expect(arch.visible).toBe(false)

    culler.update({ x: 20, y: 2, z: 0 }, skier)
    expect(arch.visible).toBe(true)
  })
})
