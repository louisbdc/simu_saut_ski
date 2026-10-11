import { BASES } from './content/bases'
import { FLIPS } from './content/flips'
import { OFF_AXIS } from './content/offAxis'
import { SPINS } from './content/spins'
import type { Lesson } from './lesson'

export type { Lesson } from './lesson'

/** Toutes les leçons, de la plus simple à la plus dure. */
export const LESSONS: readonly Lesson[] = [...BASES, ...SPINS, ...FLIPS, ...OFF_AXIS]

const BY_ID: ReadonlyMap<string, Lesson> = new Map(LESSONS.map((lesson) => [lesson.id, lesson]))

export function getLesson(id: string): Lesson | undefined {
  return BY_ID.get(id)
}
