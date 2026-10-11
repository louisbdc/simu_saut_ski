import { describe, expect, test } from 'vitest'
import { DEFAULT_LINE } from '../physics/constants'
import { buildTerrain, heightAt } from '../physics/terrain'
import type { KickerConfig, Terrain } from '../physics/types'
import { BANK_WIDTH, SHOULDER_DROP, START_DECK_LENGTH, buildCourseShape, rockinessAt, surfaceHeightAt } from './terrainShape'

const terrainFor = (kicker: KickerConfig): Terrain => buildTerrain({ ...DEFAULT_LINE, kickers: [kicker] })

const kicker = DEFAULT_LINE.kickers[0]
const terrain = terrainFor(kicker)
const shape = buildCourseShape(terrain)
const marks = shape.kickers[0]
const BESIDE_LIP_X = marks.lipX - 0.05
/** Écart latéral franchement dans le hors-piste, au-delà de tout talus. */
const FAR_OFF_PISTE = shape.halfWidth + 70

describe('forme de la piste', () => {
  test("suit le profil physique sur l'axe de la ligne", () => {
    const xs = [5, marks.kickStartX + 1, BESIDE_LIP_X, marks.deckStartX + 1, terrain.kickers[0].landingStartX + 3]

    xs.forEach((x) => expect(surfaceHeightAt(shape, x, 0)).toBeCloseTo(heightAt(terrain, x), 6))
  })

  test('amène la neige au niveau de la table de chaque côté de la lèvre', () => {
    const beside = surfaceHeightAt(shape, BESIDE_LIP_X, shape.halfWidth - 1)

    expect(beside).toBeCloseTo(marks.lipY - kicker.deckDrop, 1)
  })

  test('détache la bosse de la neige qui la borde', () => {
    const x = (marks.kickStartX + 3 * marks.lipX) / 4
    const onTop = surfaceHeightAt(shape, x, 0)
    const beside = surfaceHeightAt(shape, x, shape.halfWidth - 1)

    expect(onTop - beside).toBeGreaterThan(0.3)
  })

  test('descend le flanc sans remonter, du bord de la bosse à son pied', () => {
    const offsets = Array.from({ length: 40 }, (_, i) => marks.halfWidth + i * 0.1)
    const heights = offsets.map((z) => surfaceHeightAt(shape, BESIDE_LIP_X, z))

    heights.slice(1).forEach((height, i) => expect(height).toBeLessThanOrEqual(heights[i] + 1e-9))
    expect(heights[0]).toBeCloseTo(marks.lipY, 1)
  })

  test('reste plate sur toute la largeur hors de la bosse : élan, table, réception', () => {
    const xs = [5, marks.deckStartX + 1, terrain.kickers[0].landingStartX + 3]

    xs.forEach((x) => {
      expect(surfaceHeightAt(shape, x, shape.halfWidth - 0.5)).toBeCloseTo(surfaceHeightAt(shape, x, 0), 6)
      expect(surfaceHeightAt(shape, x, -marks.halfWidth - 0.5)).toBeCloseTo(surfaceHeightAt(shape, x, 0), 6)
    })
  })

  test('est symétrique de part et d’autre de la ligne', () => {
    const x = BESIDE_LIP_X

    expect(surfaceHeightAt(shape, x, -marks.halfWidth - 0.4)).toBeCloseTo(
      surfaceHeightAt(shape, x, marks.halfWidth + 0.4),
      9,
    )
  })

  test('abaisse le hors-piste au pied du talus, là où la piste suit la pente naturelle', () => {
    const x = kicker.inrunLength / 2

    expect(surfaceHeightAt(shape, x, shape.halfWidth + BANK_WIDTH)).toBeCloseTo(heightAt(terrain, x) - SHOULDER_DROP, 1)
  })

  test('laisse le hors-piste bien en dessous de la table : la bosse est un remblai', () => {
    const x = marks.deckStartX + 2

    expect(marks.deckY - surfaceHeightAt(shape, x, FAR_OFF_PISTE)).toBeGreaterThan(2)
    expect(marks.deckY - surfaceHeightAt(shape, x, -FAR_OFF_PISTE)).toBeGreaterThan(2)
  })

  test('ne reproduit ni la lèvre ni la cassure dans le hors-piste', () => {
    const { knuckleStartX, landingStartX } = terrain.kickers[0]
    const stepUnderLip = surfaceHeightAt(shape, marks.lipX - 0.5, FAR_OFF_PISTE) - surfaceHeightAt(shape, marks.lipX + 0.5, FAR_OFF_PISTE)
    const slopeBeforeKnuckle = surfaceHeightAt(shape, knuckleStartX - 4, FAR_OFF_PISTE) - surfaceHeightAt(shape, knuckleStartX, FAR_OFF_PISTE)
    const slopeAfterKnuckle = surfaceHeightAt(shape, landingStartX, FAR_OFF_PISTE) - surfaceHeightAt(shape, landingStartX + 4, FAR_OFF_PISTE)

    expect(Math.abs(stepUnderLip)).toBeLessThan(0.5)
    expect(Math.abs(slopeAfterKnuckle - slopeBeforeKnuckle)).toBeLessThan(1)
  })

  test('raccorde la piste au hors-piste sans marche', () => {
    const x = marks.deckStartX + 2
    const offsets = Array.from({ length: 200 }, (_, i) => shape.halfWidth - 1 + i * 0.25)
    const heights = offsets.map((z) => surfaceHeightAt(shape, x, z))
    const steps = heights.slice(1).map((height, i) => Math.abs(height - heights[i]))

    expect(Math.max(...steps)).toBeLessThan(0.3)
  })

  test('élargit la bosse et la piste quand la bosse grossit', () => {
    const small = buildCourseShape(terrainFor({ ...kicker, kickerHeight: 1.2, deckDrop: 0.3 }))
    const big = buildCourseShape(terrainFor({ ...kicker, kickerHeight: 6, deckDrop: 2 }))

    expect(big.kickers[0].halfWidth).toBeGreaterThan(small.kickers[0].halfWidth)
    expect(big.halfWidth).toBeGreaterThan(small.halfWidth)
  })

  test('garde la neige de côté sous la bosse quand la table est plus basse que le plat', () => {
    const stepDown = buildCourseShape(terrainFor({ ...kicker, kickerHeight: 1, deckDrop: 2.5 }))
    const { kickStartX, lipX } = stepDown.kickers[0]
    const xs = Array.from({ length: 20 }, (_, i) => kickStartX + ((i + 0.5) / 20) * (lipX - kickStartX))

    xs.forEach((x) =>
      expect(surfaceHeightAt(stepDown, x, stepDown.halfWidth - 1)).toBeLessThanOrEqual(
        surfaceHeightAt(stepDown, x, 0) + 1e-9,
      ),
    )
  })

  test('prolonge la piste en amont du départ par une plateforme qui descend doucement vers lui', () => {
    const start = terrain.points[0]
    const heights = [START_DECK_LENGTH, 20, 10, 2, 0].map((back) => surfaceHeightAt(shape, start.x - back, 0))

    expect(shape.terrain.points[0].x).toBeCloseTo(start.x - START_DECK_LENGTH)
    expect(heights[0]).toBeGreaterThan(start.y + 1)
    heights.slice(1).forEach((height, i) => expect(height).toBeLessThan(heights[i]))
    expect(heights[heights.length - 1]).toBeCloseTo(start.y, 6)
  })

  test('garde la plateforme de départ de plain-pied avec ses abords, sans talus', () => {
    const x = terrain.points[0].x - 15

    expect(surfaceHeightAt(shape, x, shape.halfWidth + 5)).toBeCloseTo(surfaceHeightAt(shape, x, 0), 1)
    expect(surfaceHeightAt(shape, x, -shape.halfWidth - 5)).toBeCloseTo(surfaceHeightAt(shape, x, 0), 1)
  })

  test('retrouve les repères des bosses sur le profil prolongé', () => {
    const marksOnShape = shape.terrain.kickers[0]

    expect(shape.terrain.points[marksOnShape.lipIndex].x).toBeCloseTo(terrain.kickers[0].lipX, 9)
    expect(shape.terrain.lipIndices.has(marksOnShape.lipIndex)).toBe(true)
    expect(marks.lipX).toBeCloseTo(terrain.kickers[0].lipX, 9)
  })

  describe('au-delà des deux bouts de la piste', () => {
    const first = shape.terrain.points[0]
    const last = shape.terrain.points[shape.terrain.points.length - 1]
    const offsets = [0, 6, shape.halfWidth + 3, shape.halfWidth + 40, -(shape.halfWidth + 40)]

    test('prolonge la neige sans marche, en haut comme en bas', () => {
      offsets.forEach((z) => {
        expect(surfaceHeightAt(shape, first.x - 0.01, z)).toBeCloseTo(surfaceHeightAt(shape, first.x, z), 1)
        expect(surfaceHeightAt(shape, last.x + 0.01, z)).toBeCloseTo(surfaceHeightAt(shape, last.x, z), 1)
      })
    })

    test('fait monter le versant derrière le départ : plus de falaise en haut', () => {
      const heights = [0, 20, 60, 150, 300, 400].map((back) => surfaceHeightAt(shape, first.x - back, 0))

      heights.slice(1).forEach((height, i) => expect(height).toBeGreaterThan(heights[i]))
      expect(heights[heights.length - 1]).toBeGreaterThan(heights[0] + 80)
    })

    test('creuse à peine la vallée après l’arrivée, puis remonte en face : plus de falaise en bas', () => {
      const end = surfaceHeightAt(shape, last.x, 0)
      const heights = Array.from({ length: 41 }, (_, i) => surfaceHeightAt(shape, last.x + i * 10, 0))

      expect(Math.min(...heights)).toBeGreaterThan(end - 4)
      expect(heights[heights.length - 1]).toBeGreaterThan(end + 20)
    })

    test('relève les deux flancs de la vallée loin de la piste : plus de falaise sur les côtés', () => {
      const x = kicker.inrunLength / 2

      expect(surfaceHeightAt(shape, x, 400)).toBeGreaterThan(surfaceHeightAt(shape, x, 150) + 40)
      expect(surfaceHeightAt(shape, x, -400)).toBeGreaterThan(surfaceHeightAt(shape, x, -150) + 40)
    })

    test('bosselle le versant derrière le départ : ce n’est pas un plan incliné', () => {
      const rises = Array.from({ length: 30 }, (_, i) => -220 + i * 15).map(
        (z) => surfaceHeightAt(shape, first.x - 220, z) - surfaceHeightAt(shape, first.x, z),
      )

      expect(Math.max(...rises) - Math.min(...rises)).toBeGreaterThan(3)
    })

    test('fait affleurer la roche par plaques, seulement en altitude', () => {
      const high = Array.from({ length: 400 }, (_, i) => rockinessAt(shape, first.x - 260 - (i % 20) * 6, -190 + Math.floor(i / 20) * 19))
      const low = Array.from({ length: 60 }, (_, i) => rockinessAt(shape, 20 + i * 4, shape.halfWidth + 40))

      low.forEach((value) => expect(value).toBe(0))
      expect(high.filter((value) => value > 0.5).length).toBeGreaterThan(20)
      // Par plaques : de la neige vierge entre les affleurements.
      expect(high.filter((value) => value < 0.05).length).toBeGreaterThan(40)
    })
  })
})
