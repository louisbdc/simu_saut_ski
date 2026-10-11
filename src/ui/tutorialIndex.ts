import { routeHash } from '../app/routes'
import { getKickerModel } from '../physics/presets'
import { getTrick } from '../scene/tricks'
import { GROUP_LABELS, LEVEL_LABELS, type Lesson, type LessonGroup, type LessonLevel } from '../tutorials/lesson'
import { LESSONS } from '../tutorials/lessons'
import { PHASE_IDS } from '../tutorials/phases'
import { el } from './dom'

/** Niveau de la double noire, qui porte deux pastilles. */
const DOUBLE_MARK_LEVEL: LessonLevel = 5

/** Pastille de difficulté, aux couleurs des pistes ; la double noire en porte deux. */
export function levelBadge(level: LessonLevel, suffix?: string): HTMLElement {
  const marks = Array.from({ length: level === DOUBLE_MARK_LEVEL ? 2 : 1 }, () =>
    el('i', { attributes: { 'aria-hidden': 'true' } }),
  )
  const label = suffix ? `${LEVEL_LABELS[level]} · ${suffix}` : LEVEL_LABELS[level]
  return el('p', { className: `piste level-${level}` }, [...marks, el('span', { text: label })])
}

function lessonCard(lesson: Lesson): HTMLLIElement {
  const bump = getKickerModel(lesson.bump).label
  const link = el('a', { className: 'lesson-card', attributes: { href: routeHash({ view: 'lesson', lesson: lesson.id }) } }, [
    levelBadge(lesson.level),
    el('h3', { text: getTrick(lesson.id).label }),
    el('p', { className: 'card-summary', text: lesson.summary }),
    el('p', { className: 'card-meta', text: `Bosse ${bump} · ${PHASE_IDS.length} étapes` }),
  ])
  return el('li', {}, [link])
}

function groupSection(group: LessonGroup): HTMLElement | null {
  const lessons = LESSONS.filter((lesson) => lesson.group === group)
  if (lessons.length === 0) return null
  return el('section', { className: 'lesson-group' }, [
    el('h2', { text: GROUP_LABELS[group] }),
    el('ul', { className: 'lesson-grid' }, lessons.map(lessonCard)),
  ])
}

/** Liste des tutos, rangés par famille de figures, de la plus simple à la plus dure. */
export function createTutorialIndex(): HTMLElement {
  const groups = (Object.keys(GROUP_LABELS) as LessonGroup[])
    .map(groupSection)
    .filter((section): section is HTMLElement => section !== null)
  return el('main', { attributes: { id: 'tutorials' } }, [
    el('header', { className: 'tutorials-head' }, [
      el('h1', { text: 'Tutos' }),
      el('p', {
        text: 'Chaque figure est découpée en six étapes, de l’approche à la réception. Choisis-en une : le skieur te la montre au ralenti, avec la consigne de chaque moment.',
      }),
    ]),
    ...groups,
  ])
}
