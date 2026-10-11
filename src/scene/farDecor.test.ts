import * as THREE from 'three'
import { describe, expect, test } from 'vitest'
import { DEFAULT_LINE } from '../physics/constants'
import { buildScenario } from '../physics/presets'
import { tuneLine } from '../physics/solver'
import { buildTerrain } from '../physics/terrain'
import type { LineConfig } from '../physics/types'
import { barrierSpots, buildFarDecor, farTreeSpots, refugeSpots } from './farDecor'
import { CHAIR_HALF_WIDTH, buildLiftLine } from './liftLine'
import { isShared } from './sharedAssets'
import { buildCourseShape, surfaceHeightAt } from './terrainShape'

function sceneFor(config: LineConfig) {
  const shape = buildCourseShape(buildTerrain(config))
  const lift = buildLiftLine(shape)
  return { shape, lift, trees: farTreeSpots(shape, lift) }
}

const hard = sceneFor(DEFAULT_LINE)
const wtf = sceneFor(tuneLine(buildScenario('wtf').config))
const firstX = hard.shape.terrain.points[0].x
const lastX = hard.shape.terrain.points[hard.shape.terrain.points.length - 1].x

describe('décor lointain', () => {
  test('couvre de forêt les deux flancs de la vallée et le versant derrière le départ', () => {
    const { trees, shape } = hard
    const flank = (side: number): number =>
      trees.filter((tree) => Math.sign(tree.z) === side && Math.abs(tree.z) > shape.halfWidth + 100).length

    expect(trees.length).toBeGreaterThan(600)
    expect(flank(-1)).toBeGreaterThan(150)
    expect(flank(1)).toBeGreaterThan(150)
    expect(trees.filter((tree) => tree.x < firstX - 40).length).toBeGreaterThan(100)
  })

  test('s’arrête à la limite des arbres : plus un sapin sur les hauts', () => {
    hard.trees.forEach((tree) => {
      expect(Math.abs(tree.z)).toBeLessThan(shape_limit(hard.shape.halfWidth))
      expect(firstX - tree.x).toBeLessThan(230)
    })
  })

  test('laisse la piste, ses abords et le télésiège dégagés', () => {
    ;[hard, wtf].forEach(({ shape, lift, trees }) => {
      const first = shape.terrain.points[0].x
      const last = shape.terrain.points[shape.terrain.points.length - 1].x
      const inner = lift.z + CHAIR_HALF_WIDTH + 2
      const outer = lift.returnZ - CHAIR_HALF_WIDTH - 2
      trees.forEach((tree) => {
        if (tree.x > first - 20 && tree.x < last + 20) expect(Math.abs(tree.z)).toBeGreaterThan(shape.halfWidth + 12)
        if (tree.x > lift.top.x - 20 && tree.x < lift.bottom.x + 25) expect(tree.z < inner && tree.z > outer).toBe(false)
      })
    })
  })

  test('plante chaque sapin dans la neige', () => {
    hard.trees.forEach((tree) => {
      const ground = surfaceHeightAt(hard.shape, tree.x, tree.z)
      expect(tree.y).toBeLessThanOrEqual(ground)
      expect(tree.y).toBeGreaterThan(ground - 1.5)
    })
  })

  test('ne déplace pas la forêt quand on change un réglage de bosse', () => {
    const tweaked = sceneFor({
      ...DEFAULT_LINE,
      kickers: DEFAULT_LINE.kickers.map((kicker, i) => (i === 0 ? { ...kicker, kickerHeight: kicker.kickerHeight + 1 } : kicker)),
    })
    const key = (tree: { x: number; z: number }): string => `${tree.x.toFixed(2)}:${tree.z.toFixed(2)}`
    const before = new Set(hard.trees.filter((tree) => tree.x < 20).map(key))
    const after = tweaked.trees.filter((tree) => tree.x < 20).map(key)

    expect(after.length).toBeGreaterThan(50)
    after.forEach((tree) => expect(before.has(tree)).toBe(true))
  })

  test('varie la taille et la teinte des sapins : la forêt n’est pas faite d’un seul arbre recopié', () => {
    const scales = hard.trees.map((tree) => tree.scale)
    const tints = hard.trees.map((tree) => tree.tint)

    expect(Math.max(...scales) / Math.min(...scales)).toBeGreaterThan(2.5)
    expect(Math.max(...tints) - Math.min(...tints)).toBeGreaterThan(0.5)
  })

  test('découpe la lisière haute de la forêt : la limite des arbres n’est pas tirée au cordeau', () => {
    const { trees, shape } = hard
    // Sur le flanc d'en face, jusqu'où la forêt monte-t-elle selon l'endroit le long de la vallée ?
    const reach = new Map<number, number>()
    trees
      .filter((tree) => tree.z < 0 && tree.x > 0 && tree.x < 300)
      .forEach((tree) => {
        const bin = Math.floor(tree.x / 40)
        reach.set(bin, Math.max(reach.get(bin) ?? 0, -tree.z - shape.halfWidth))
      })
    const limits = [...reach.values()]

    expect(limits.length).toBeGreaterThan(5)
    expect(Math.max(...limits) - Math.min(...limits)).toBeGreaterThan(25)
  })

  test('pose des rangées de paravalanches sur le versant derrière le départ', () => {
    const barriers = barrierSpots(hard.shape)
    const backs = barriers.map((barrier) => firstX - barrier.x)

    expect(barriers.length).toBeGreaterThan(20)
    // Plusieurs rangées étagées, qui suivent le terrain au lieu d'être tirées à la règle.
    expect(Math.max(...backs) - Math.min(...backs)).toBeGreaterThan(50)
    expect(new Set(backs.map((back) => Math.round(back))).size).toBeGreaterThan(6)
    barriers.forEach((barrier) => {
      expect(barrier.x).toBeLessThan(firstX - 100)
      expect(barrier.y).toBeCloseTo(surfaceHeightAt(hard.shape, barrier.x, barrier.z), 3)
    })
  })

  test('installe un refuge sur chaque flanc, à l’écart de la piste', () => {
    const refuges = refugeSpots(hard.shape)

    expect(refuges.some((refuge) => refuge.z < 0)).toBe(true)
    expect(refuges.some((refuge) => refuge.z > 0)).toBe(true)
    refuges.forEach((refuge) => {
      expect(Math.abs(refuge.z)).toBeGreaterThan(hard.shape.halfWidth + 40)
      expect(refuge.x).toBeLessThan(lastX)
    })
  })

  test('reste léger : une poignée de maillages partagés pour tout le décor lointain', () => {
    const decor = buildFarDecor(wtf.shape, wtf.lift)
    let triangles = 0
    let meshes = 0
    decor.traverse((object) => {
      if (!(object instanceof THREE.InstancedMesh)) return
      meshes++
      triangles += ((object.geometry.index?.count ?? object.geometry.getAttribute('position').count) / 3) * object.count
      expect(isShared(object.geometry)).toBe(true)
      expect(isShared(object.material as THREE.Material)).toBe(true)
    })

    expect(meshes).toBeLessThanOrEqual(4)
    expect(triangles).toBeLessThan(45_000)
  })
})

/** Écart latéral au-delà duquel le flanc est trop haut pour porter des arbres. */
function shape_limit(halfWidth: number): number {
  return halfWidth + 390
}
