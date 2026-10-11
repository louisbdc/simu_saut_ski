import { describe, expect, test } from 'vitest'
import { simulate } from '../physics/simulate'
import { planJump } from '../scene/flightPlan'
import { TRICKS, getTrick, landsOpposite } from '../scene/tricks'
import { LESSONS } from './lessons'
import { lessonLine } from './lessonLine'
import { PHASE_IDS } from './phases'

describe('leçons', () => {
  test('chaque leçon porte sur une figure du catalogue, une seule fois', () => {
    const ids = LESSONS.map((lesson) => lesson.id)

    expect(new Set(ids).size).toBe(ids.length)
    ids.forEach((id) => expect(TRICKS.some((trick) => trick.id === id)).toBe(true))
  })

  test('chaque leçon explique toutes les étapes du saut', () => {
    LESSONS.forEach((lesson) => {
      PHASE_IDS.forEach((phase) => {
        expect(lesson.phases[phase].caption.length, `${lesson.id} / ${phase}`).toBeGreaterThan(0)
        expect(lesson.phases[phase].cues.length, `${lesson.id} / ${phase}`).toBeGreaterThan(0)
      })
    })
  })

  test('les prérequis renvoient à des leçons qui existent', () => {
    const ids = new Set(LESSONS.map((lesson) => lesson.id))

    LESSONS.forEach((lesson) => lesson.prerequisites.forEach((id) => expect(ids.has(id), `${lesson.id} → ${id}`).toBe(true)))
  })

  test.each(LESSONS.map((lesson) => lesson.id))('%s : la figure passe sur sa bosse, sans chute', (id) => {
    const lesson = LESSONS.find((candidate) => candidate.id === id)!
    const trick = getTrick(lesson.id)

    const line = lessonLine(lesson)
    const result = simulate(line)
    const report = result.reports[0]
    const plan = planJump(trick, {
      airTime: report.airTime,
      takeoffTilt: report.takeoffAngle,
      landingTilt: report.landingAngle,
      switchBefore: false,
      switchAfter: landsOpposite(trick),
    })

    expect(line.kickers).toHaveLength(1)
    expect(result.outcome).toBe('finished')
    expect(report.landing?.zone).toBe('ideal')
    expect(plan.completed).toBe(true)
  }, 60_000)
})
