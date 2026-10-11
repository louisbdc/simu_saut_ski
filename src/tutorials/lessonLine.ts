import { DEFAULT_LINE } from '../physics/constants'
import { getKickerModel } from '../physics/presets'
import { tuneLine } from '../physics/solver'
import type { LineConfig } from '../physics/types'
import type { Lesson } from './lessons'

/** Piste d'une leçon : une seule bosse, celle de son gabarit, avec l'élan réglé pour se poser au point visé. */
export function lessonLine(lesson: Lesson): LineConfig {
  return tuneLine({
    ...DEFAULT_LINE,
    kickers: [getKickerModel(lesson.bump).kicker],
    tricks: [lesson.id],
    startSwitch: false,
  })
}
