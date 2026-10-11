import type { Lesson, Mistake, PhaseLesson } from '../lesson'
import { PARK_SAFETY, SOURCES, STRAIGHT_PHASES, phasesWith } from './common'

const GRAB_SPOT: PhaseLesson = {
  title: 'Lâcher et repérage',
  caption: 'Lâche tôt et regarde la réception.',
  cues: [
    { part: 'Main', text: 'Elle lâche le ski avant que la réception ne monte vers toi.' },
    { part: 'Regard', text: 'Sur ton point de réception.' },
    { part: 'Jambes', text: 'Elles se déplient vers la neige, sans se verrouiller.' },
  ],
}

const GRAB_MISTAKES: readonly Mistake[] = [
  {
    title: 'Tu bascules vers l’avant',
    cause: 'Tu te penches pour aller chercher le ski.',
    fix: 'Monte les genoux vers la main : c’est le ski qui vient au grab.',
  },
  {
    title: 'Le grab arrive trop tard, ou dure trop',
    cause: 'Le geste n’est pas automatique et mange tout le temps de vol.',
    fix: 'Répète-le au sol, allongé sur le dos, jusqu’à le trouver sans regarder.',
  },
  {
    title: 'Les bâtons te gênent',
    cause: 'Ils s’accrochent au ski ou à la jambe.',
    fix: 'Pose-les le temps d’apprendre.',
  },
]

const grabLesson = (id: string, summary: string, prerequisites: readonly string[], air: PhaseLesson): Lesson => ({
  id,
  group: 'bases',
  level: 2,
  bump: 'medium',
  summary,
  prerequisites,
  phases: phasesWith({
    pop: { ...STRAIGHT_PHASES.pop, caption: 'Pop d’abord, grab ensuite.' },
    air,
    spot: GRAB_SPOT,
  }),
  mistakes: GRAB_MISTAKES,
  safety: PARK_SAFETY,
  sources: [SOURCES.bcaGrabs, SOURCES.redbullSafety, SOURCES.ridestore],
})

export const BASES: readonly Lesson[] = [
  {
    id: 'straight',
    group: 'bases',
    level: 1,
    bump: 'simple',
    summary: 'Décoller équilibré et se poser dans la pente : la base de toutes les figures.',
    prerequisites: [],
    phases: STRAIGHT_PHASES,
    mistakes: [
      {
        title: 'Tu recules en l’air',
        cause: 'Tu es assis en arrière au moment de l’impulsion.',
        fix: 'Reste centré dans la courbe, tibias contre les languettes, mains devant.',
      },
      {
        title: 'Tes talons traînent et tu n’as pas de hauteur',
        cause: 'Impulsion trop molle, ou extension inachevée.',
        fix: 'Pousse plus fort et finis l’extension, jambes tendues à la lèvre.',
      },
      {
        title: 'Tu pousses après la lèvre',
        cause: 'Le rythme est en retard : tu pousses dans le vide.',
        fix: 'Trace une ligne dans la neige et travaille le moment de l’impulsion dessus, à plat.',
      },
      {
        title: 'Tu te poses sur la table',
        cause: 'Tu manques de vitesse.',
        fix: 'Pars de plus haut, sans freiner dans l’élan.',
      },
    ],
    safety: PARK_SAFETY,
    sources: [SOURCES.ridestore, SOURCES.outdoorStraight],
  },
  grabLesson('safety', 'Le premier grab : la main attrape le ski du même côté, sous la chaussure.', ['straight'], {
    title: 'Safety grab',
    caption: 'Monte les genoux vers la main, ne te penche pas.',
    cues: [
      { part: 'Genoux', text: 'Ils remontent haut dès la sortie de la lèvre.' },
      { part: 'Main', text: 'Elle attrape le ski du même côté, sous la chaussure, près de la fixation.' },
      { part: 'Prise', text: 'Ferme : un grab se tient, il ne se touche pas.' },
      { part: 'Autre bras', text: 'Écarté, il tient l’équilibre.' },
    ],
  }),
  grabLesson('mute', 'La main attrape le ski opposé, devant la fixation : les skis se croisent.', ['safety'], {
    title: 'Mute grab',
    caption: 'Croise les skis et attrape le ski opposé, par l’extérieur.',
    cues: [
      { part: 'Genoux', text: 'Ils remontent vers la poitrine.' },
      { part: 'Skis', text: 'Ils se croisent en X : le ski opposé vient sous la main.' },
      { part: 'Main', text: 'Sur la carre extérieure du ski opposé, près de la fixation, sans passer entre les genoux.' },
      { part: 'Autre bras', text: 'Écarté, il tient l’équilibre.' },
    ],
  }),
  grabLesson('japan', 'La main passe derrière le genou et attrape le ski opposé, skis ramenés derrière.', ['safety'], {
    title: 'Japan grab',
    caption: 'Ramène les skis derrière toi et passe la main sous le genou.',
    cues: [
      { part: 'Jambes', text: 'Les genoux plient et les talons reviennent vers les fesses.' },
      { part: 'Main', text: 'Elle passe sous le genou du même côté et saisit le ski opposé, carre intérieure, sous la chaussure.' },
      { part: 'Dos', text: 'Il se creuse pour laisser monter les skis.' },
      { part: 'Autre bras', text: 'Écarté, il tient l’équilibre.' },
    ],
  }),
]
