import type { PhaseId } from './phases'

/**
 * Mise en scène d'une leçon : à quelle vitesse chaque étape est montrée, d'où la caméra la filme et
 * quels repères (flèches, lignes de regard) s'affichent autour du skieur.
 */

/** Vitesse de lecture de chaque étape : 1 = temps réel. L'impulsion, la plus brève, est la plus ralentie. */
export const PHASE_RATES: Readonly<Record<PhaseId, number>> = {
  approach: 1,
  compression: 0.45,
  pop: 0.12,
  air: 0.3,
  spot: 0.3,
  landing: 0.6,
}

/**
 * Plan de caméra autour du skieur. `yaw` : 0° = de côté, 90° = de face, −90° = de dos ; `pitch` :
 * hauteur au-dessus de l'horizon ; `orbit` : tour que fait la caméra pendant le plan, en degrés par
 * seconde.
 */
export interface Shot {
  readonly yaw: number
  readonly pitch: number
  readonly distance: number
  readonly orbit: number
}

export const PHASE_SHOTS: Readonly<Record<PhaseId, Shot>> = {
  approach: { yaw: 55, pitch: 10, distance: 9, orbit: 0 },
  compression: { yaw: 15, pitch: 6, distance: 6.5, orbit: 0 },
  pop: { yaw: -10, pitch: 5, distance: 6, orbit: 0 },
  air: { yaw: 10, pitch: 8, distance: 7, orbit: 28 },
  spot: { yaw: -115, pitch: 20, distance: 7.5, orbit: 0 },
  landing: { yaw: 50, pitch: 9, distance: 8.5, orbit: 0 },
}

export interface Vector {
  readonly x: number
  readonly y: number
  readonly z: number
}

const RADIANS = Math.PI / 180
const FULL_TURN = 360
/** En dessous, deux poses sont trop proches pour dire dans quel sens le corps tourne. */
const TURN_EPSILON = 1e-6

/** Position de la caméra par rapport au skieur pour un plan : x vers l'aval, y vers le haut, z vers le côté. */
export function shotOffset(yaw: number, pitch: number, distance: number): Vector {
  const flat = Math.cos(pitch * RADIANS) * distance
  return {
    x: Math.sin(yaw * RADIANS) * flat,
    y: Math.sin(pitch * RADIANS) * distance,
    z: Math.cos(yaw * RADIANS) * flat,
  }
}

/** Fait glisser une valeur vers sa cible, d'autant plus vite que `rate` est grand, sans jamais la dépasser. */
export function ease(current: number, target: number, rate: number, elapsed: number): number {
  return target + (current - target) * Math.exp(-rate * elapsed)
}

/** Angle équivalent à `target`, à moins d'un demi-tour de `current` : la caméra prend le plus court chemin. */
export function nearestTurn(current: number, target: number): number {
  return target + Math.round((current - target) / FULL_TURN) * FULL_TURN
}

/**
 * Sens dans lequel un vecteur a tourné autour d'un axe entre deux poses : 1 dans le sens direct,
 * −1 dans l'autre, 0 s'il n'a pas bougé.
 */
export function turnSign(before: Vector, after: Vector, axis: Vector): -1 | 0 | 1 {
  const cross = {
    x: before.y * after.z - before.z * after.y,
    y: before.z * after.x - before.x * after.z,
    z: before.x * after.y - before.y * after.x,
  }
  const along = cross.x * axis.x + cross.y * axis.y + cross.z * axis.z
  if (Math.abs(along) < TURN_EPSILON) return 0
  return along > 0 ? 1 : -1
}

/** Repères dessinés autour du skieur. */
export type CueKind = 'gazeLip' | 'load' | 'push' | 'spin' | 'flip' | 'gazeLanding'

export const CUE_LABELS: Readonly<Record<CueKind, string>> = {
  gazeLip: 'Regard sur la lèvre',
  load: 'Flexion',
  push: 'Poussée',
  spin: 'Vrille',
  flip: 'Salto',
  gazeLanding: 'Regard sur la réception',
}

/** Repères à montrer pendant une étape, selon ce que la figure fait tourner. */
export function cuesFor(phase: PhaseId, trick: { readonly spins: number; readonly flips: number }): readonly CueKind[] {
  const rotations: readonly CueKind[] = [...(trick.spins !== 0 ? (['spin'] as const) : []), ...(trick.flips !== 0 ? (['flip'] as const) : [])]
  switch (phase) {
    case 'approach':
      return ['gazeLip']
    case 'compression':
    case 'landing':
      return ['load']
    case 'pop':
      return ['push', ...rotations]
    case 'air':
      return rotations.length > 0 ? rotations : ['gazeLanding']
    case 'spot':
      return ['gazeLanding']
  }
}
