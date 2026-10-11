import { KICKER_LIMITS, SOLVER_TOLERANCE } from './constants'
import { simulate } from './simulate'
import type { KickerConfig, LineConfig } from './types'

const BISECTION_STEPS = 40

/**
 * tooSlow / tooFast : le point visé reste hors d'atteinte même aux bornes de la longueur d'élan.
 * unstable : l'atterrissage saute par-dessus le point visé (trajectoire qui frôle la cassure),
 * aucune longueur d'élan ne le donne exactement.
 */
export type SolveStatus = 'ok' | 'tooSlow' | 'tooFast' | 'unstable'

export interface InrunSolution {
  readonly status: SolveStatus
  readonly inrunLength: number
  /** Vitesse à la lèvre obtenue avec cette longueur d'élan, en m/s. */
  readonly lipSpeed: number
  /** Dénivelé de l'élan correspondant. */
  readonly inrunDrop: number
}

export function withKicker(config: LineConfig, index: number, changes: Partial<KickerConfig>): LineConfig {
  return {
    ...config,
    kickers: config.kickers.map((kicker, i) => (i === index ? { ...kicker, ...changes } : kicker)),
  }
}

interface Trial {
  readonly inrunLength: number
  /** Écart au point visé ; -Infinity si la lèvre n'est pas atteinte. */
  readonly error: number
  readonly lipSpeed: number
}

function tryInrun(config: LineConfig, index: number, inrunLength: number): Trial {
  // Seul le saut de cette bosse compte : inutile de simuler la suite de la ligne.
  const report = simulate(withKicker(config, index, { inrunLength }), undefined, { stopAfterKicker: index }).reports[index]
  return {
    inrunLength,
    error: report.landing ? report.landing.offsetFromTarget : -Infinity,
    lipSpeed: report.lipSpeed,
  }
}

/**
 * Cherche la longueur d'élan du kicker `index` qui fait atterrir au point visé de sa réception,
 * les kickers précédents restant inchangés.
 */
export function solveInrunLength(config: LineConfig, index: number): InrunSolution {
  const { min, max } = KICKER_LIMITS.inrunLength
  const kicker = config.kickers[index]
  const solution = (status: SolveStatus, trial: Trial): InrunSolution => ({
    status,
    inrunLength: trial.inrunLength,
    lipSpeed: trial.lipSpeed,
    inrunDrop: trial.inrunLength * Math.sin((kicker.inrunAngleDeg * Math.PI) / 180),
  })

  let low = tryInrun(config, index, min)
  let high = tryInrun(config, index, max)
  if (low.error < 0 && high.error < 0) return solution('tooSlow', low.error > high.error ? low : high)
  if (low.error > 0 && high.error > 0) return solution('tooFast', low.error < high.error ? low : high)

  for (let step = 0; step < BISECTION_STEPS; step++) {
    const middle = tryInrun(config, index, (low.inrunLength + high.inrunLength) / 2)
    if (Math.sign(middle.error) === Math.sign(low.error)) low = middle
    else high = middle
  }
  const best = Math.abs(low.error) < Math.abs(high.error) ? low : high
  return solution(Math.abs(best.error) <= SOLVER_TOLERANCE ? 'ok' : 'unstable', best)
}

/** Règle l'élan de chaque kicker l'un après l'autre pour viser le point idéal de chaque réception. */
export function tuneLine(config: LineConfig): LineConfig {
  return config.kickers.reduce(
    (tuned, _, index) => withKicker(tuned, index, { inrunLength: solveInrunLength(tuned, index).inrunLength }),
    config,
  )
}
