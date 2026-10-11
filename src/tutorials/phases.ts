import type { KickerReport, Sample } from '../physics/types'
import { OPEN_SECONDS } from '../scene/tricks'

/** Étapes d'un saut, dans l'ordre où le skieur les traverse. */
export const PHASE_IDS = ['approach', 'compression', 'pop', 'air', 'spot', 'landing'] as const
export type PhaseId = (typeof PHASE_IDS)[number]

/** Tranche du parcours occupée par une étape, en secondes depuis le départ. */
export interface PhaseWindow {
  readonly id: PhaseId
  readonly start: number
  readonly end: number
}

/** Durée d'élan montrée avant le pied du kick. */
const APPROACH_SECONDS = 2.5
/** L'impulsion commence ce temps avant la lèvre, sans jamais mordre sur plus de cette part du kick. */
const POP_LEAD_SECONDS = 0.3
const MAX_POP_KICK_SHARE = 0.5
/** Elle se lit encore ce temps après la lèvre : c'est là qu'on voit ce qu'elle a donné. */
const POP_FOLLOW_SECONDS = 0.25
/** Part du vol que l'impulsion et le repérage de la réception peuvent occuper, chacun. */
const MAX_POP_AIR_SHARE = 0.2
const MAX_SPOT_AIR_SHARE = 0.4
/** Glisse montrée après l'impact. */
const RIDE_OUT_SECONDS = 1.4

/**
 * Découpe le saut d'une bosse en étapes qui se suivent sans trou : approche, appui dans la courbe,
 * impulsion à la lèvre, figure en l'air, repérage de la réception, réception.
 */
export function phaseWindows(samples: readonly Sample[], report: KickerReport): readonly PhaseWindow[] {
  if (!report.reached || !report.landing) throw new Error('Ce saut n’a pas eu lieu : rien à découper')
  const lastTime = samples[samples.length - 1].t
  const kickEntry = samples.find((sample) => sample.kind === 'transition' || sample.kind === 'takeoff')
  const kickStart = Math.min(kickEntry?.t ?? report.takeoffTime, report.takeoffTime)
  const kickSeconds = report.takeoffTime - kickStart
  const popStart = report.takeoffTime - Math.min(POP_LEAD_SECONDS, MAX_POP_KICK_SHARE * kickSeconds)
  const popEnd = report.takeoffTime + Math.min(POP_FOLLOW_SECONDS, MAX_POP_AIR_SHARE * report.airTime)
  const spotStart = report.landingTime - Math.min(OPEN_SECONDS, MAX_SPOT_AIR_SHARE * report.airTime)
  const bounds = [
    Math.max(0, kickStart - APPROACH_SECONDS),
    kickStart,
    popStart,
    popEnd,
    spotStart,
    report.landingTime,
    Math.min(lastTime, report.landingTime + RIDE_OUT_SECONDS),
  ]
  return PHASE_IDS.map((id, index) => ({ id, start: bounds[index], end: bounds[index + 1] }))
}

/** Étape en cours à un instant ; avant la première ou après la dernière, c'est la plus proche. */
export function phaseAt(windows: readonly PhaseWindow[], time: number): PhaseId {
  const current = windows.find((window) => time < window.end)
  return (current ?? windows[windows.length - 1]).id
}
