/**
 * Jugement d'une réception. La zone touchée dit où le skieur se pose ; c'est le choc encaissé
 * (hauteur de chute équivalente) qui dit si c'est grave. Se poser en douceur plus loin que prévu,
 * par exemple dans la pente de la bosse suivante, est une bonne réception.
 */
import { HARD_FALL_HEIGHT, SAFE_FALL_HEIGHT } from '../physics/constants'
import type { LandingReport, LandingZone } from '../physics/types'

export type Level = 'ok' | 'warn' | 'bad'

export interface Verdict {
  readonly level: Level
  readonly label: string
}

const SEVERITY: Readonly<Record<Level, number>> = { ok: 0, warn: 1, bad: 2 }

const PLACES: Readonly<Record<Exclude<LandingZone, 'ideal'>, string>> = {
  table: 'retombe sur la table',
  knuckle: 'tape la cassure',
  long: 'bas de la réception',
  flat: 'au-delà de la réception',
}

function shockLevel(landing: LandingReport): Level {
  if (landing.equivalentFallHeight <= SAFE_FALL_HEIGHT) return 'ok'
  return landing.equivalentFallHeight <= HARD_FALL_HEIGHT ? 'warn' : 'bad'
}

export function landingVerdict(landing: LandingReport): Verdict {
  if (landing.crashed) return { level: 'bad', label: 'Chute à la réception' }
  if (landing.zone === 'ideal') return { level: 'ok', label: 'Bonne réception' }
  const place = PLACES[landing.zone]
  const shock = shockLevel(landing)
  if (landing.zone === 'table' || landing.zone === 'knuckle') {
    // Avant la pente de réception, la neige est plate ou remonte : même en douceur, c'est trop court.
    return shock === 'ok'
      ? { level: 'warn', label: `Court mais en douceur : ${place}` }
      : { level: 'bad', label: `Trop court : ${place}` }
  }
  if (shock === 'ok') return { level: 'ok', label: `Réception douce, ${place}` }
  return shock === 'warn'
    ? { level: 'warn', label: `Long, réception appuyée : ${place}` }
    : { level: 'bad', label: `Trop long, réception dure : ${place}` }
}

const LINE_LABELS: Readonly<Record<Level, string>> = {
  ok: 'La ligne passe en entier',
  warn: 'La ligne passe, avec des réceptions à surveiller',
  bad: 'La ligne ne passe pas telle quelle',
}

/** Verdict de toute la ligne : le pire de ses bosses. `null` pour une bosse qui n'a pas été sautée. */
export function lineVerdict(landings: readonly (LandingReport | null)[]): Verdict {
  const worst = landings
    .map((landing): Level => (landing ? landingVerdict(landing).level : 'bad'))
    .reduce<Level>((level, next) => (SEVERITY[next] > SEVERITY[level] ? next : level), 'ok')
  return { level: worst, label: LINE_LABELS[worst] }
}
