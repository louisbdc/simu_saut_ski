import { DEFAULT_LINE } from '../physics/constants'
import { getKickerModel } from '../physics/presets'
import { tuneLine } from '../physics/solver'
import type { LineConfig } from '../physics/types'
import { withDirection } from '../scene/tricks'
import type { Lesson } from './lessons'

/**
 * Piste d'une leçon : une seule bosse, celle de son gabarit, avec l'élan réglé pour se poser au point
 * visé. `rightward` montre la figure dans l'autre sens.
 */
export function lessonLine(lesson: Lesson, rightward = false): LineConfig {
  return tuneLine({
    ...DEFAULT_LINE,
    kickers: [getKickerModel(lesson.bump).kicker],
    tricks: [withDirection(lesson.id, rightward)],
    startSwitch: false,
  })
}
