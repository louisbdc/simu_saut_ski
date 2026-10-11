import type { PhaseId } from './phases'

/** Difficulté, sur l'échelle des pistes : verte, bleue, rouge, noire, double noire. */
export type LessonLevel = 1 | 2 | 3 | 4 | 5

export const LEVEL_LABELS: Readonly<Record<LessonLevel, string>> = {
  1: 'Verte',
  2: 'Bleue',
  3: 'Rouge',
  4: 'Noire',
  5: 'Double noire',
}

export type LessonGroup = 'bases' | 'spins' | 'flips' | 'offAxis'

export const GROUP_LABELS: Readonly<Record<LessonGroup, string>> = {
  bases: 'Les bases',
  spins: 'Rotations à plat',
  flips: 'Saltos',
  offAxis: 'Désaxés',
}

/** Consigne pour une partie du corps : « Regard », « Bras », « Hanches »… */
export interface Cue {
  readonly part: string
  readonly text: string
}

export interface PhaseLesson {
  readonly title: string
  /** La consigne à retenir, en une phrase. */
  readonly caption: string
  readonly cues: readonly Cue[]
}

export interface Mistake {
  readonly title: string
  readonly cause: string
  readonly fix: string
}

export interface Source {
  readonly label: string
  readonly url: string
}

export interface Lesson {
  /** Identifiant de la figure dans le catalogue du moteur. */
  readonly id: string
  readonly group: LessonGroup
  readonly level: LessonLevel
  /** Gabarit de la bosse sur laquelle la figure est montrée. */
  readonly bump: string
  readonly summary: string
  /** Leçons à maîtriser avant celle-ci. */
  readonly prerequisites: readonly string[]
  readonly phases: Readonly<Record<PhaseId, PhaseLesson>>
  readonly mistakes: readonly Mistake[]
  readonly safety: readonly string[]
  readonly sources: readonly Source[]
  /** Réserve à afficher quand la technique décrite repose sur peu de sources. */
  readonly caveat?: string
}
