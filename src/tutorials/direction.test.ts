import { describe, expect, test } from 'vitest'
import { PHASE_RATES, PHASE_SHOTS, cuesFor, ease, nearestTurn, shotOffset, turnSign } from './direction'
import { PHASE_IDS } from './phases'

describe('mise en scène des tutos', () => {
  test('chaque étape a son ralenti et son plan de caméra', () => {
    PHASE_IDS.forEach((phase) => {
      expect(PHASE_RATES[phase]).toBeGreaterThan(0)
      expect(PHASE_RATES[phase]).toBeLessThanOrEqual(1)
      expect(PHASE_SHOTS[phase].distance).toBeGreaterThan(0)
    })
  })

  test('l’impulsion est le moment le plus ralenti', () => {
    const slowest = Math.min(...PHASE_IDS.map((phase) => PHASE_RATES[phase]))

    expect(PHASE_RATES.pop).toBe(slowest)
  })

  test('la caméra se place de côté, de face ou au-dessus selon le plan', () => {
    const side = shotOffset(0, 0, 5)
    const front = shotOffset(90, 0, 5)
    const above = shotOffset(0, 90, 5)

    expect(side.z).toBeCloseTo(5)
    expect(side.x).toBeCloseTo(0)
    expect(front.x).toBeCloseTo(5)
    expect(above.y).toBeCloseTo(5)
  })

  test('un réglage glisse vers sa cible sans la dépasser', () => {
    const next = ease(0, 10, 3, 0.1)

    expect(next).toBeGreaterThan(0)
    expect(next).toBeLessThan(10)
    expect(ease(0, 10, 3, 100)).toBeCloseTo(10)
    expect(ease(4, 10, 3, 0)).toBe(4)
  })

  test('la caméra tourne par le plus court chemin', () => {
    expect(nearestTurn(350, 10)).toBe(370)
    expect(nearestTurn(10, 350)).toBe(-10)
    expect(nearestTurn(725, 0)).toBe(720)
    expect(nearestTurn(20, 60)).toBe(60)
  })

  test('le sens d’une rotation se lit sur deux poses successives', () => {
    const up = { x: 0, y: 1, z: 0 }
    const forward = { x: 1, y: 0, z: 0 }
    const turnedLeft = { x: 0.9, y: 0, z: -0.3 }
    const turnedRight = { x: 0.9, y: 0, z: 0.3 }

    expect(turnSign(forward, turnedLeft, up)).toBe(1)
    expect(turnSign(forward, turnedRight, up)).toBe(-1)
    expect(turnSign(forward, forward, up)).toBe(0)
  })

  test('les repères suivent l’étape et la figure', () => {
    const straight = { spins: 0, flips: 0 }
    const cork = { spins: 1, flips: 1 }

    expect(cuesFor('approach', straight)).toEqual(['gazeLip'])
    expect(cuesFor('pop', straight)).toEqual(['push'])
    expect(cuesFor('pop', cork)).toEqual(['push', 'spin', 'flip'])
    expect(cuesFor('air', { spins: 1, flips: 0 })).toEqual(['spin'])
    expect(cuesFor('air', { spins: 0, flips: -1 })).toEqual(['flip'])
    expect(cuesFor('air', straight)).toEqual(['gazeLanding'])
    expect(cuesFor('spot', cork)).toEqual(['gazeLanding'])
    expect(cuesFor('landing', cork)).toEqual(['load'])
  })
})
