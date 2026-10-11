import * as THREE from 'three'
import { describe, expect, test } from 'vitest'
import { DEFAULT_LINE } from '../physics/constants'
import { buildScenario } from '../physics/presets'
import { tuneLine } from '../physics/solver'
import { buildTerrain } from '../physics/terrain'
import type { LineConfig } from '../physics/types'
import { CHAIR_HALF_WIDTH, buildLiftLine } from './liftLine'
import { buildRocks, rockSpots } from './rocks'
import { isShared } from './sharedAssets'
import { BANK_WIDTH, buildCourseShape, elevationGainAt, surfaceHeightAt } from './terrainShape'

function sceneFor(config: LineConfig) {
  const shape = buildCourseShape(buildTerrain(config))
  const lift = buildLiftLine(shape)
  return { shape, lift, spots: rockSpots(shape, lift) }
}

const hard = sceneFor(DEFAULT_LINE)
const wtf = sceneFor(tuneLine(buildScenario('wtf').config))

describe('rochers du hors-piste', () => {
  test('sème des pierres, des blocs et quelques gros affleurements', () => {
    const sizes = hard.spots.map((spot) => spot.size)

    expect(hard.spots.length).toBeGreaterThan(60)
    expect(sizes.filter((size) => size < 1).length).toBeGreaterThan(20)
    expect(sizes.filter((size) => size >= 1 && size < 4).length).toBeGreaterThan(10)
    expect(sizes.filter((size) => size >= 4).length).toBeGreaterThan(5)
  })

  test('ne pose aucun rocher sur la piste ni sur son talus', () => {
    ;[hard, wtf].forEach(({ shape, spots }) => {
      const first = shape.terrain.points[0].x
      const last = shape.terrain.points[shape.terrain.points.length - 1].x
      spots
        .filter((spot) => spot.x >= first && spot.x <= last)
        .forEach((spot) => expect(Math.abs(spot.z) - spot.size).toBeGreaterThan(shape.halfWidth + BANK_WIDTH * 0.5))
    })
  })

  test('laisse le couloir du télésiège dégagé, gares comprises', () => {
    ;[hard, wtf].forEach(({ lift, spots }) => {
      const inner = lift.z + CHAIR_HALF_WIDTH + 1.5
      const outer = lift.returnZ - CHAIR_HALF_WIDTH - 1.5
      spots.forEach((spot) => {
        const reachesCorridor = spot.z - spot.size < inner && spot.z + spot.size > outer
        expect(reachesCorridor, `rocher à x=${spot.x.toFixed(0)} z=${spot.z.toFixed(1)}`).toBe(false)
      })
    })
  })

  test('enfonce chaque rocher dans la neige : aucun ne flotte', () => {
    hard.spots.forEach((spot) => {
      const ground = surfaceHeightAt(hard.shape, spot.x, spot.z)
      expect(spot.y).toBeLessThan(ground)
      expect(spot.y).toBeGreaterThan(ground - spot.size)
    })
  })

  test('garde le même semis d’un réglage à l’autre, et l’étend quand la piste s’allonge', () => {
    const again = sceneFor(DEFAULT_LINE)

    expect(again.spots).toEqual(hard.spots)
    expect(wtf.spots.length).toBeGreaterThan(hard.spots.length)
  })

  test('met les gros affleurements loin de la piste, sur les flancs de la vallée', () => {
    const first = hard.shape.terrain.points[0].x
    hard.spots
      .filter((spot) => spot.kind === 'boulder' && spot.size >= 4 && spot.x >= first)
      .forEach((spot) => expect(Math.abs(spot.z)).toBeGreaterThan(90))
  })

  test('regroupe des affleurements au-dessus de la limite des arbres, derrière le départ et en haut des flancs', () => {
    const first = hard.shape.terrain.points[0].x
    const crags = hard.spots.filter((spot) => spot.kind === 'crag')
    const behind = crags.filter((spot) => spot.x < first - 150)
    const onFlanks = crags.filter((spot) => Math.abs(spot.z) > hard.shape.halfWidth + 250)

    expect(behind.length).toBeGreaterThan(20)
    expect(onFlanks.filter((spot) => spot.z < 0).length).toBeGreaterThan(8)
    expect(onFlanks.filter((spot) => spot.z > 0).length).toBeGreaterThan(8)
    crags.forEach((spot) => expect(elevationGainAt(hard.shape, spot.x, spot.z)).toBeGreaterThan(38))
  })

  test('ne range pas les affleurements en lignes : ils sont dispersés en amas de tailles variées', () => {
    const first = hard.shape.terrain.points[0].x
    const behind = hard.spots.filter((spot) => spot.kind === 'crag' && spot.x < first - 150)
    const distances = behind.map((spot) => first - spot.x)
    const mean = distances.reduce((sum, value) => sum + value, 0) / distances.length
    const spread = Math.sqrt(distances.reduce((sum, value) => sum + (value - mean) ** 2, 0) / distances.length)
    const sizes = behind.map((spot) => spot.size)
    // Des rangées donneraient quelques distances répétées : ici, presque autant de distances que de rochers.
    const distinct = new Set(distances.map((value) => Math.round(value / 3))).size

    expect(spread).toBeGreaterThan(30)
    expect(distinct).toBeGreaterThan(behind.length * 0.3)
    expect(Math.max(...sizes) / Math.min(...sizes)).toBeGreaterThan(2.5)
  })

  test('varie la teinte des rochers : aucun gris uniforme', () => {
    const tints = hard.spots.map((spot) => spot.tint)

    expect(Math.max(...tints) - Math.min(...tints)).toBeGreaterThan(0.25)
  })

  test('reste léger et réutilise ses formes', () => {
    const rocks = buildRocks(wtf.shape, wtf.lift)
    let triangles = 0
    rocks.traverse((object) => {
      if (!(object instanceof THREE.InstancedMesh)) return
      triangles += ((object.geometry.index?.count ?? object.geometry.getAttribute('position').count) / 3) * object.count
      expect(isShared(object.geometry)).toBe(true)
      expect(isShared(object.material as THREE.Material)).toBe(true)
    })

    expect(triangles).toBeGreaterThan(0)
    expect(triangles).toBeLessThan(32_000)
  })
})
