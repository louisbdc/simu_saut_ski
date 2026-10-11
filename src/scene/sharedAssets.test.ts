import * as THREE from 'three'
import { describe, expect, test, vi } from 'vitest'
import { DEFAULT_LINE } from '../physics/constants'
import { simulate } from '../physics/simulate'
import { disposeGroup } from './scene'
import { isShared, markShared } from './sharedAssets'
import { buildTerrainGroup } from './terrainMesh'
import { buildTrajectoryGroup } from './trajectory'

describe('ressources partagées', () => {
  test('libère ce qui appartient au groupe et garde ce qui est partagé', () => {
    const own = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial())
    const kept = new THREE.Mesh(markShared(new THREE.BoxGeometry()), markShared(new THREE.MeshBasicMaterial()))
    const spies = [own, kept].map((mesh) => ({
      geometry: vi.spyOn(mesh.geometry, 'dispose'),
      material: vi.spyOn(mesh.material, 'dispose'),
    }))
    const group = new THREE.Group().add(own, kept)

    disposeGroup(group)

    expect(spies[0].geometry).toHaveBeenCalledOnce()
    expect(spies[0].material).toHaveBeenCalledOnce()
    expect(spies[1].geometry).not.toHaveBeenCalled()
    expect(spies[1].material).not.toHaveBeenCalled()
  })

  test('libère la texture d’un matériau jetable, pas une texture partagée', () => {
    const texture = new THREE.Texture()
    const sharedTexture = markShared(new THREE.Texture())
    const disposed = vi.spyOn(texture, 'dispose')
    const keptAlive = vi.spyOn(sharedTexture, 'dispose')
    const group = new THREE.Group().add(
      new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial({ map: texture })),
      new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ normalMap: sharedTexture })),
    )

    disposeGroup(group)

    expect(disposed).toHaveBeenCalledOnce()
    expect(keptAlive).not.toHaveBeenCalled()
  })

  test('ne recrée aucun matériau de piste d’une reconstruction à l’autre', () => {
    const result = simulate(DEFAULT_LINE)
    const materialsOf = (group: THREE.Object3D): Set<THREE.Material> => {
      const found = new Set<THREE.Material>()
      group.traverse((object) => {
        if (object instanceof THREE.Mesh) found.add(object.material as THREE.Material)
      })
      return found
    }

    const first = materialsOf(buildTerrainGroup(result.terrain))
    const second = materialsOf(buildTerrainGroup(result.terrain))

    expect([...second].every((material) => first.has(material) && isShared(material))).toBe(true)
  })

  test('trace les deux skis au sol sur chaque portion de glisse', () => {
    const result = simulate(DEFAULT_LINE)
    const tracks: THREE.Mesh[] = []
    buildTrajectoryGroup(result).traverse((object) => {
      if (object instanceof THREE.Mesh && isShared(object.material as THREE.Material)) tracks.push(object)
    })
    const flights = result.reports.filter((report) => report.reached).length

    expect(tracks.length).toBeGreaterThanOrEqual(flights)
    tracks.forEach((mesh) => {
      const box = new THREE.Box3().setFromBufferAttribute(mesh.geometry.getAttribute('position') as THREE.BufferAttribute)
      expect(box.min.z).toBeLessThan(0)
      expect(box.max.z).toBeGreaterThan(0)
    })
  })
})
