import { describe, expect, test } from 'vitest'
import { DEFAULT_LINE } from '../physics/constants'
import { simulate } from '../physics/simulate'
import { tuneLine } from '../physics/solver'
import { heightAt } from '../physics/terrain'
import { crashPose } from './choreography'
import { buildCrashScene } from './crash'

// Une seule bosse : après la chute, le skieur et ses skis ont toute la sortie de piste pour glisser.
const tuned = tuneLine({ ...DEFAULT_LINE, kickers: [DEFAULT_LINE.kickers[0]], tricks: [DEFAULT_LINE.tricks[0]] })
const fallen = simulate(tuned, undefined, { failedKicker: 0 })
const scene = buildCrashScene(fallen)!
const crash = fallen.crash!
const end = fallen.duration

describe('déroulé d’une chute', () => {
  test('sans chute, il n’y a rien à animer', () => {
    expect(buildCrashScene(simulate(tuned))).toBeNull()
  })

  test('le corps commence à rouler à l’instant de la chute', () => {
    expect(scene.time).toBe(crash.time)
    expect(scene.tumbleAt(crash.time)).toBe(0)
    expect(scene.tumbleAt(crash.time + 0.3)).toBeGreaterThan(1)
  })

  test('il roule toujours dans le même sens, vite au début puis de moins en moins', () => {
    const angles = Array.from({ length: 60 }, (_, i) => scene.tumbleAt(crash.time + (i * (end - crash.time)) / 59))
    const early = scene.tumbleAt(crash.time + 0.5) - scene.tumbleAt(crash.time)
    const late = scene.tumbleAt(end) - scene.tumbleAt(end - 0.5)

    expect(angles.slice(1).every((angle, i) => angle >= angles[i] - 1e-9)).toBe(true)
    expect(early).toBeGreaterThan(late * 2)
  })

  test('il finit couché sur le dos, tête vers l’amont', () => {
    const turns = (scene.tumbleAt(end) - (3 * Math.PI) / 2) / (2 * Math.PI)

    expect(turns).toBeCloseTo(Math.round(turns), 9)
    expect(scene.settledAt(end)).toBe(1)
    expect(scene.settledAt(crash.time)).toBe(0)
  })

  test('les deux skis partent du point de chute, chacun de son côté', () => {
    const left = scene.skiAt(0, crash.time)
    const right = scene.skiAt(1, crash.time)

    expect(left.position.x).toBeCloseTo(crash.x, 6)
    expect(right.position.x).toBeCloseTo(crash.x, 6)
    expect(left.position.z).toBeLessThan(0)
    expect(right.position.z).toBeGreaterThan(0)
  })

  test('les skis restent posés sur la neige et s’écartent de la trace', () => {
    for (const index of [0, 1]) {
      const ski = scene.skiAt(index, crash.time + 2)

      expect(ski.position.y - heightAt(fallen.terrain, ski.position.x)).toBeCloseTo(0.03, 6)
      expect(Math.abs(ski.position.z)).toBeGreaterThan(1.5)
    }
  })

  test('un ski déchaussé glisse mieux que le skieur : il le distance', () => {
    const skier = fallen.samples[fallen.samples.length - 1]

    expect(scene.skiAt(0, end).position.x).toBeGreaterThan(skier.x)
    expect(scene.skiAt(0, end).position.x).toBeGreaterThan(scene.skiAt(1, end).position.x)
  })

  test('avant la chute, les skis sont encore au point de départ de leur glissade', () => {
    expect(scene.skiAt(0, crash.time - 1).position.x).toBeCloseTo(crash.x, 6)
  })
})

describe('posture de chute', () => {
  test('en plein roulé-boulé, les membres partent dans tous les sens', () => {
    const early = crashPose(1.5, 0)
    const later = crashPose(4.2, 0)

    expect(early.arms.wide + early.arms.up + early.arms.back).toBeGreaterThan(0.7)
    expect(early.flex).not.toBeCloseTo(later.flex, 2)
  })

  test('une fois arrêté, le skieur est étendu, bras écartés', () => {
    const still = crashPose(20, 1)

    expect(still.flex).toBeLessThan(0.2)
    expect(still.tuck).toBe(0)
    expect(still.twist).toBeCloseTo(0, 9)
    expect(still.arms.wide).toBeGreaterThan(0.8)
  })
})
