import { describe, expect, test } from 'vitest'
import { DEFAULT_LINE } from '../physics/constants'
import { buildScenario } from '../physics/presets'
import { tuneLine } from '../physics/solver'
import { buildTerrain } from '../physics/terrain'
import type { LineConfig } from '../physics/types'
import { TREE_CLEARANCE } from './backdrop'
import {
  CHAIR_HALF_WIDTH,
  GATE_BACK,
  MAX_SPAN,
  MIN_CLEARANCE,
  RETURN_GAP,
  WHEEL_BACK,
  buildLiftLine,
  cableAt,
  cableHeightAtX,
  loopAt,
} from './liftLine'
import { BANK_WIDTH, buildCourseShape, surfaceHeightAt } from './terrainShape'

const lineFor = (config: LineConfig) => {
  const terrain = buildTerrain(config)
  const shape = buildCourseShape(terrain)
  return { terrain, shape, lift: buildLiftLine(shape) }
}

const hard = lineFor(DEFAULT_LINE)
const giant = lineFor({ ...DEFAULT_LINE, kickers: [{ ...DEFAULT_LINE.kickers[0], kickerHeight: 12, deckDrop: 4, tableLength: 40, landingLength: 60 }] })
const cases = [hard, giant, lineFor(tuneLine(buildScenario('wtf').config)), lineFor(tuneLine(buildScenario('simple').config))]

describe('tracé du télésiège', () => {
  test('part du bas de la piste et arrive en haut', () => {
    const { terrain, lift } = hard
    const last = terrain.points[terrain.points.length - 1]

    expect(lift.bottom.x).toBeGreaterThan(last.x - 40)
    expect(lift.bottom.x).toBeLessThan(last.x)
    expect(lift.cable[0].x).toBeCloseTo(lift.bottom.x)
    expect(lift.cable[lift.cable.length - 1].x).toBeCloseTo(lift.top.x)
  })

  test('dépose le skieur au-dessus du départ : il n’a plus qu’à se laisser glisser', () => {
    cases.forEach(({ terrain, lift }) => {
      const start = terrain.points[0]

      expect(lift.top.x).toBeLessThan(start.x - 5)
      expect(lift.top.groundY).toBeGreaterThan(start.y + 0.5)
    })
  })

  test('longe la piste à l’extérieur du filet, sans toucher les sapins', () => {
    cases.forEach(({ shape, lift }) => {
      expect(Math.abs(lift.z)).toBeGreaterThan(shape.halfWidth + 2)
      expect(Math.abs(lift.returnZ) + CHAIR_HALF_WIDTH).toBeLessThan(shape.halfWidth + BANK_WIDTH + TREE_CLEARANCE)
    })
  })

  test('garde le câble au-dessus de la neige entre les pylônes, quelle que soit la piste', () => {
    cases.forEach(({ shape, lift }) => {
      const firstPylon = lift.pylons[0]
      const lastPylon = lift.pylons[lift.pylons.length - 1]
      for (let x = lastPylon.x; x <= firstPylon.x; x += 1) {
        expect(cableHeightAtX(lift, x) - surfaceHeightAt(shape, x, lift.z)).toBeGreaterThan(MIN_CLEARANCE - 0.05)
      }
    })
  })

  test('laisse le câble pendre entre deux pylônes au lieu de le tendre comme une barre', () => {
    const { lift } = hard
    const [lower, upper] = [lift.pylons[1], lift.pylons[2]]
    const middleX = (lower.x + upper.x) / 2
    const chord = (lower.topY + upper.topY) / 2

    expect(cableHeightAtX(lift, middleX)).toBeLessThan(chord - 0.15)
    expect(cableHeightAtX(lift, middleX)).toBeGreaterThan(chord - 1.5)
    expect(cableHeightAtX(lift, lower.x)).toBeCloseTo(lower.topY, 3)
  })

  test('ne laisse jamais une portée trop longue entre deux pylônes', () => {
    cases.forEach(({ lift }) => {
      lift.pylons.slice(1).forEach((pylon, i) => expect(lift.pylons[i].x - pylon.x).toBeLessThanOrEqual(MAX_SPAN + 1e-6))
    })
  })

  test('s’allonge avec la piste et reçoit plus de pylônes', () => {
    const longer = lineFor({ ...DEFAULT_LINE, kickers: DEFAULT_LINE.kickers.map((kicker) => ({ ...kicker, inrunLength: kicker.inrunLength + 120 })) })

    expect(longer.lift.length).toBeGreaterThan(hard.lift.length + 100)
    expect(longer.lift.pylons.length).toBeGreaterThan(hard.lift.pylons.length)
  })

  test('mesure le câble : la distance parcourue croît du quai aval au quai amont', () => {
    const { lift } = hard
    const start = cableAt(lift, 0)
    const middle = cableAt(lift, lift.length / 2)
    const end = cableAt(lift, lift.length)

    expect(start.x).toBeCloseTo(lift.bottom.x)
    expect(end.x).toBeCloseTo(lift.top.x)
    expect(middle.x).toBeLessThan(start.x)
    expect(middle.x).toBeGreaterThan(end.x)
    expect(end.y).toBeGreaterThan(start.y)
  })

  describe('boucle des sièges', () => {
    const { lift } = hard

    test('fait monter les sièges sur le brin montant, du quai aval au quai amont', () => {
      const start = loopAt(lift, 0)
      const middle = loopAt(lift, lift.length / 2)
      const end = loopAt(lift, lift.length)

      expect(start.x).toBeCloseTo(lift.bottom.x)
      expect(start.z).toBeCloseTo(lift.z)
      expect(middle.x).toBeCloseTo(cableAt(lift, lift.length / 2).x)
      expect(Math.cos(middle.yaw)).toBeCloseTo(-1)
      expect(end.x).toBeCloseTo(lift.top.x)
    })

    test('ne téléporte jamais un siège : il contourne les poulies des deux gares', () => {
      const step = 0.05
      let previous = loopAt(lift, 0)
      for (let distance = step; distance <= lift.loopLength + step; distance += step) {
        const current = loopAt(lift, distance)
        const moved = Math.hypot(current.x - previous.x, current.y - previous.y, current.z - previous.z)
        expect(moved, `saut à ${distance.toFixed(2)} m`).toBeLessThan(step * 1.6)
        previous = current
      }
    })

    test('ramène les sièges par le brin descendant, tournés vers l’aval', () => {
      const returning = loopAt(lift, lift.loopLength / 2 + lift.length / 2)

      expect(returning.z).toBeCloseTo(lift.returnZ)
      expect(Math.cos(returning.yaw)).toBeCloseTo(1)
    })

    test('fait arriver le siège dans le dos du skieur, après le tour de la poulie aval', () => {
      const wheelX = lift.bottom.x + WHEEL_BACK
      const onWheel = loopAt(lift, -WHEEL_BACK - (Math.PI * RETURN_GAP) / 4)
      const leavingWheel = loopAt(lift, -WHEEL_BACK)
      const behind = loopAt(lift, -1)

      expect(Math.hypot(onWheel.x - wheelX, onWheel.z - (lift.z + lift.returnZ) / 2)).toBeCloseTo(RETURN_GAP / 2)
      expect(onWheel.x).toBeGreaterThan(wheelX)
      expect(leavingWheel.x).toBeCloseTo(wheelX)
      expect(leavingWheel.z).toBeCloseTo(lift.z)
      expect(behind.x).toBeCloseTo(lift.bottom.x + 1)
      expect(behind.z).toBeCloseTo(lift.z)
    })

    test('oriente chaque siège dans le sens de sa marche, y compris autour des poulies', () => {
      const step = 0.02
      for (let distance = 0; distance < lift.loopLength; distance += 0.7) {
        const here = loopAt(lift, distance)
        const next = loopAt(lift, distance + step)
        const along = Math.hypot(next.x - here.x, next.z - here.z)
        if (along < step * 0.5) continue
        expect(Math.cos(here.yaw)).toBeCloseTo((next.x - here.x) / along, 1)
        expect(-Math.sin(here.yaw)).toBeCloseTo((next.z - here.z) / along, 1)
      }
    })

    test('place le portillon en aval de la poulie : le skieur attend hors du passage des sièges', () => {
      expect(GATE_BACK).toBeGreaterThan(WHEEL_BACK + RETURN_GAP / 2 + 1)
    })
  })
})
