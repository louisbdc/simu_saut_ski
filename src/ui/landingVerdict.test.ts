import { describe, expect, test } from 'vitest'
import type { LandingReport, LandingZone } from '../physics/types'
import { landingVerdict, lineVerdict } from './landingVerdict'

function landing(zone: LandingZone, equivalentFallHeight: number, crashed = false): LandingReport {
  return {
    zone,
    x: 0,
    y: 0,
    offsetFromTarget: 0,
    impactSpeed: 15,
    normalSpeed: 3,
    equivalentFallHeight,
    impactG: 2,
    speedAfter: 14,
    crashed,
  }
}

describe('verdict d’une réception', () => {
  test('dans la zone visée, la réception est bonne', () => {
    expect(landingVerdict(landing('ideal', 0.9))).toEqual({ level: 'ok', label: 'Bonne réception' })
  })

  test('se poser en douceur au-delà de la réception, dans la pente suivante, est une bonne réception', () => {
    const verdict = landingVerdict(landing('flat', 0.3))

    expect(verdict.level).toBe('ok')
    expect(verdict.label).toContain('au-delà de la réception')
  })

  test('au-delà de la réception, c’est le choc qui décide : appuyé puis dur', () => {
    expect(landingVerdict(landing('flat', 1)).level).toBe('warn')
    expect(landingVerdict(landing('flat', 2)).level).toBe('bad')
    expect(landingVerdict(landing('long', 0.3)).level).toBe('ok')
    expect(landingVerdict(landing('long', 1)).level).toBe('warn')
  })

  test('trop court reste un défaut même en douceur, et devient mauvais dès que ça tape', () => {
    expect(landingVerdict(landing('table', 0.2)).level).toBe('warn')
    expect(landingVerdict(landing('knuckle', 0.2)).level).toBe('warn')
    expect(landingVerdict(landing('table', 1)).level).toBe('bad')
    expect(landingVerdict(landing('knuckle', 1)).label).toContain('cassure')
  })

  test('une chute est toujours mauvaise', () => {
    expect(landingVerdict(landing('ideal', 3, true)).level).toBe('bad')
  })
})

describe('verdict de la ligne', () => {
  test('la ligne prend le pire verdict de ses bosses', () => {
    expect(lineVerdict([landing('ideal', 0.8), landing('flat', 0.3)]).level).toBe('ok')
    expect(lineVerdict([landing('ideal', 0.8), landing('long', 1)]).level).toBe('warn')
    expect(lineVerdict([landing('ideal', 0.8), landing('table', 1)]).level).toBe('bad')
  })

  test('une bosse non sautée fait échouer la ligne', () => {
    expect(lineVerdict([landing('ideal', 0.8), null]).level).toBe('bad')
  })
})
