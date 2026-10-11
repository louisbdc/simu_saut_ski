import { describe, expect, test } from 'vitest'
import { simulate } from '../physics/simulate'
import { LESSONS } from './lessons'
import { lessonLine } from './lessonLine'
import { PHASE_IDS, phaseAt, phaseWindows } from './phases'

const jump = (id: string) => {
  const lesson = LESSONS.find((candidate) => candidate.id === id)
  if (!lesson) throw new Error(`Leçon inconnue : ${id}`)
  const result = simulate(lessonLine(lesson))
  return { result, windows: phaseWindows(result.samples, result.reports[0]) }
}

describe('découpage d’un saut en étapes', () => {
  test('les étapes se suivent dans l’ordre, sans trou ni recouvrement', () => {
    const { windows } = jump('straight')

    expect(windows.map((window) => window.id)).toEqual([...PHASE_IDS])
    windows.forEach((window, index) => {
      expect(window.end).toBeGreaterThan(window.start)
      if (index > 0) expect(window.start).toBeCloseTo(windows[index - 1].end, 9)
    })
  })

  test('l’impulsion encadre le décollage et la réception commence à l’impact', () => {
    const { result, windows } = jump('spin360')
    const report = result.reports[0]
    const byId = Object.fromEntries(windows.map((window) => [window.id, window]))

    expect(byId.pop.start).toBeLessThan(report.takeoffTime)
    expect(byId.pop.end).toBeGreaterThan(report.takeoffTime)
    expect(byId.landing.start).toBeCloseTo(report.landingTime, 9)
    expect(byId.compression.start).toBeLessThan(byId.pop.start)
  })

  test('l’approche ne commence jamais avant le départ', () => {
    const { windows } = jump('straight')

    expect(windows[0].start).toBeGreaterThanOrEqual(0)
  })

  test('on retrouve l’étape d’un instant donné', () => {
    const { result, windows } = jump('straight')
    const report = result.reports[0]

    expect(phaseAt(windows, report.takeoffTime)).toBe('pop')
    expect(phaseAt(windows, report.landingTime + 0.2)).toBe('landing')
    expect(phaseAt(windows, -5)).toBe('approach')
    expect(phaseAt(windows, 1e6)).toBe('landing')
  })

  test('une bosse jamais atteinte ne se découpe pas', () => {
    const { result } = jump('straight')

    expect(() => phaseWindows(result.samples, { ...result.reports[0], reached: false })).toThrow()
  })
})
