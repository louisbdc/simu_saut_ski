import * as THREE from 'three'
import { describe, expect, test } from 'vitest'
import { DEFAULT_LINE } from '../physics/constants'
import { buildTerrain } from '../physics/terrain'
import { buildContactShadows, shadowPatches } from './contactShadows'
import { isShared } from './sharedAssets'
import { SUN_DIRECTION } from './sun'
import { buildCourseShape, surfaceHeightAt } from './terrainShape'

const shape = buildCourseShape(buildTerrain(DEFAULT_LINE))
const firstX = shape.terrain.points[0].x
/** Quelques arbres et rochers, sur le flanc et sur le versant raide derrière le départ. */
const casters = [
  { x: 60, z: -(shape.halfWidth + 60), height: 9, radius: 2 },
  { x: 120, z: shape.halfWidth + 140, height: 14, radius: 2.6 },
  { x: firstX - 180, z: 30, height: 8, radius: 2 },
  { x: firstX - 240, z: -90, height: 3, radius: 3.5 },
].map((caster) => ({ ...caster, groundY: surfaceHeightAt(shape, caster.x, caster.z) }))
const patches = shadowPatches(shape, casters)
const awayFromSun = new THREE.Vector3(-SUN_DIRECTION.x, 0, -SUN_DIRECTION.z).normalize()

describe('ombres au sol des arbres et des rochers', () => {
  test('pose une ombre par arbre, du côté opposé au soleil', () => {
    expect(patches).toHaveLength(casters.length)
    patches.forEach((patch, i) => {
      const offset = new THREE.Vector3(patch.center.x - casters[i].x, 0, patch.center.z - casters[i].z)
      expect(offset.length()).toBeGreaterThan(0.5)
      expect(offset.normalize().dot(awayFromSun)).toBeGreaterThan(0.7)
    })
  })

  test('couche l’ombre sur la pente : elle ne flotte pas et ne s’enfonce pas', () => {
    patches.forEach((patch) => {
      const tip = patch.center.clone().addScaledVector(patch.along, patch.length * 0.9)
      const foot = patch.center.clone().addScaledVector(patch.along, -patch.length * 0.9)
      ;[patch.center, tip, foot].forEach((point) => {
        const gap = point.y - surfaceHeightAt(shape, point.x, point.z)
        expect(gap).toBeGreaterThan(-0.6)
        expect(gap).toBeLessThan(0.9)
      })
    })
  })

  test('allonge l’ombre des grands arbres et garde celle des rochers ramassée', () => {
    const [tree, tallTree, , rock] = patches

    expect(tallTree.length).toBeGreaterThan(tree.length * 1.3)
    expect(rock.length).toBeLessThan(tree.length)
    expect(rock.width).toBeGreaterThan(tree.width)
  })

  test('tient en un seul maillage partagé, deux triangles par ombre', () => {
    const shadows = buildContactShadows(shape, casters)

    expect(shadows.count).toBe(casters.length)
    expect((shadows.geometry.index?.count ?? 0) / 3).toBe(2)
    expect(isShared(shadows.geometry)).toBe(true)
    expect(isShared(shadows.material as THREE.Material)).toBe(true)
    expect(shadows.castShadow).toBe(false)
  })
})
