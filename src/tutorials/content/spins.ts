import type { Lesson, Mistake, PhaseLesson } from '../lesson'
import { PARK_SAFETY, SOURCES, STRAIGHT_PHASES, phasesWith } from './common'

const SPIN_APPROACH: PhaseLesson = {
  title: 'Approche',
  caption: 'Vitesse franche, appuis larges, skis à plat.',
  cues: [
    { part: 'Skis', text: 'À plat et droits, un peu plus écartés que les épaules.' },
    { part: 'Buste', text: 'Droit, centré, épaules calmes.' },
    { part: 'Vitesse', text: 'Franche : cherche la hauteur, pas la vitesse de rotation.' },
  ],
}

const SPIN_COMPRESSION: PhaseLesson = {
  title: 'Appui et armé',
  caption: 'Charge les jambes et arme les épaules à l’opposé.',
  cues: [
    { part: 'Jambes', text: 'Elles plient dans la courbe et se chargent.' },
    { part: 'Épaules', text: 'Elles s’arment, avec les bras, à l’opposé du sens de rotation.' },
    { part: 'Skis', text: 'Toujours droits : l’armé est en haut du corps, pas dans les pieds.' },
  ],
}

const SPIN_POP: PhaseLesson = {
  title: 'Impulsion et lancer',
  caption: 'Monte d’abord, tourne ensuite.',
  cues: [
    { part: 'Jambes', text: 'Extension complète, comme pour un saut droit.' },
    { part: 'Épaules', text: 'Elles relâchent l’armé et tournent, avec les hanches, en quittant la bosse.' },
    { part: 'Tête', text: 'Elle mène la rotation, regard haut, par-dessus l’épaule.' },
    { part: 'Skis', text: 'Droits jusqu’à ce que les talons aient quitté la lèvre.' },
  ],
}

const SPIN_MISTAKES: readonly Mistake[] = [
  {
    title: 'Tu lances la rotation avant d’avoir décollé',
    cause: 'Les épaules partent dans la courbe : rotation basse, skis qui dérapent sur la lèvre.',
    fix: 'Pop d’abord, rotation ensuite : attends que spatules et talons aient quitté la bosse.',
  },
  {
    title: 'Tu regardes la lèvre ou tes skis',
    cause: 'Le regard au sol arrête la tête, donc la rotation.',
    fix: 'Yeux à l’horizon au décollage, puis par-dessus l’épaule.',
  },
  {
    title: 'La rotation part de travers',
    cause: 'Le buste s’est penché dans la rotation au décollage.',
    fix: 'Garde le buste grand et tourne les épaules à plat.',
  },
]

export const SPINS: readonly Lesson[] = [
  {
    id: 'spin180',
    group: 'spins',
    level: 2,
    bump: 'simple',
    summary: 'Un demi-tour : on décolle de face et on se pose en switch, en marche arrière.',
    prerequisites: ['straight'],
    phases: phasesWith({
      approach: { ...SPIN_APPROACH, caption: 'Arrive centré, épaules calmes, skis à plat.' },
      compression: { ...SPIN_COMPRESSION, caption: 'Arme légèrement les épaules à l’opposé.' },
      pop: { ...SPIN_POP, caption: 'Pop gainé, puis tourne la tête par-dessus l’épaule.' },
      air: {
        title: 'Demi-tour',
        caption: 'Reste compact et grand, le regard par-dessus l’épaule.',
        cues: [
          { part: 'Corps', text: 'Compact pour tourner, mais buste droit.' },
          { part: 'Regard', text: 'Par-dessus l’épaule, vers l’aval : tu ne quittes pas la réception des yeux.' },
          { part: 'Bras', text: 'Près du corps.' },
        ],
      },
      spot: {
        title: 'Repérage',
        caption: 'Garde l’œil sur la réception, par-dessus l’épaule.',
        cues: [
          { part: 'Regard', text: 'Toujours par-dessus la même épaule : n’en change pas.' },
          { part: 'Jambes', text: 'Elles se déplient vers la neige.' },
        ],
      },
      landing: {
        title: 'Réception en switch',
        caption: 'Pose en switch et roule quelques mètres avant de te retourner.',
        cues: [
          { part: 'Skis', text: 'Les deux ensemble, talons vers l’aval.' },
          { part: 'Amorti', text: 'Chevilles, genoux puis hanches plient.' },
          { part: 'Regard', text: 'Par-dessus l’épaule, vers l’aval.' },
        ],
      },
    }),
    mistakes: [
      SPIN_MISTAKES[0],
      {
        title: 'Ta réception en switch est instable',
        cause: 'La glisse en arrière n’est pas encore acquise.',
        fix: 'Travaille le switch hors du park jusqu’à y être à l’aise.',
      },
      {
        title: 'Tu changes d’épaule pour regarder',
        cause: 'Le regard hésite une fois en switch et le corps suit.',
        fix: 'Choisis une épaule et garde-la jusqu’à ce que tu te retournes.',
      },
    ],
    safety: [...PARK_SAFETY, 'Apprends le demi-tour à l’arrêt, puis sur le plat, avant la bosse.'],
    sources: [SOURCES.outdoor180, SOURCES.rhythm360],
  },
  {
    id: 'spin360',
    group: 'spins',
    level: 3,
    bump: 'simple',
    summary: 'Un tour complet à plat : on se pose de face, comme on est parti.',
    prerequisites: ['spin180'],
    phases: phasesWith({
      approach: SPIN_APPROACH,
      compression: SPIN_COMPRESSION,
      pop: SPIN_POP,
      air: {
        title: 'Rotation',
        caption: 'Regarde par-dessus l’épaule, pas tes skis.',
        cues: [
          { part: 'Regard', text: 'Par-dessus l’épaule, jamais vers le sol : il emmène tout le corps.' },
          { part: 'Buste', text: 'Grand et droit, pour que la rotation reste à plat.' },
          { part: 'Bras', text: 'Contenus, près du corps.' },
        ],
      },
      spot: {
        title: 'Repérage',
        caption: 'À 270°, tu vois la réception : freine la rotation.',
        cues: [
          { part: 'Regard', text: 'Il se fixe sur la réception dès qu’elle apparaît, aux trois quarts du tour.' },
          { part: 'Bras', text: 'Ils s’ouvrent pour ralentir.' },
          { part: 'Jambes', text: 'Elles se déplient vers la neige.' },
        ],
      },
      landing: {
        ...STRAIGHT_PHASES.landing,
        caption: 'Pose centré, mains devant.',
      },
    }),
    mistakes: [
      ...SPIN_MISTAKES,
      {
        title: 'Tu restes bloqué à 270°',
        cause: 'Pas assez de hauteur ni d’engagement.',
        fix: 'Plus de pop, un peu plus de vitesse, et le regard qui continue de tourner.',
      },
    ],
    safety: [
      ...PARK_SAFETY,
      'Fais le tour au sol en baskets, puis au trampoline, avant la neige.',
      'Première bosse : pas plus de 60 cm de hauteur de vol et 3 à 4 m de distance.',
    ],
    sources: [SOURCES.rhythm360, SOURCES.skimag360, SOURCES.travelski360, SOURCES.usSportsCamps],
  },
  {
    id: 'spin540',
    group: 'spins',
    level: 3,
    bump: 'medium',
    summary: 'Un tour et demi : le 360 prolongé d’un demi-tour, posé en switch.',
    prerequisites: ['spin360'],
    phases: phasesWith({
      approach: SPIN_APPROACH,
      compression: { ...SPIN_COMPRESSION, caption: 'Arme plus fort que pour un 360.' },
      pop: SPIN_POP,
      air: {
        title: 'Rotation',
        caption: 'Tu ne vois rien pendant les trois premiers quarts de tour : garde la tête haute.',
        cues: [
          { part: 'Tête', text: 'Haute, regard vers l’horizon, elle continue de mener.' },
          { part: 'Corps', text: 'Regroupé : plus tu es compact, plus tu tournes vite.' },
          { part: 'Bras', text: 'Près du corps.' },
        ],
      },
      spot: {
        title: 'Repérage',
        caption: 'Repère la réception, puis laisse les jambes finir le tour.',
        cues: [
          { part: 'Regard', text: 'Il se fixe sur la réception dès qu’elle apparaît.' },
          { part: 'Buste', text: 'Il s’arrête avec les yeux.' },
          { part: 'Jambes', text: 'Hanches et jambes finissent seules le dernier demi-tour.' },
        ],
      },
      landing: {
        title: 'Réception en switch',
        caption: 'Pose en switch, regard par-dessus l’épaule.',
        cues: [
          { part: 'Skis', text: 'Les deux ensemble, talons vers l’aval.' },
          { part: 'Amorti', text: 'Chevilles, genoux puis hanches plient.' },
          { part: 'Regard', text: 'Par-dessus l’épaule, vers l’aval.' },
        ],
      },
    }),
    mistakes: [
      {
        title: 'Tu prends une carre à la lèvre',
        cause: 'Les skis n’étaient pas redressés au moment de décoller.',
        fix: 'Skis droits et à plat sur le dernier mètre, quel que soit ton armé.',
      },
      {
        title: 'Tu précipites la rotation',
        cause: 'Quelques centièmes d’avance suffisent à transformer le lancer en faute de carre.',
        fix: 'Finis l’impulsion avant de lâcher les épaules.',
      },
      SPIN_MISTAKES[2],
    ],
    safety: [...PARK_SAFETY, 'Sois à l’aise en switch, au décollage comme à la réception, avant de t’y mettre.'],
    sources: [SOURCES.usSportsCamps, SOURCES.rhythm360],
  },
  {
    id: 'spin720',
    group: 'spins',
    level: 4,
    bump: 'medium',
    summary: 'Deux tours à plat, posés de face : la rotation se relance après un coup d’œil à mi-chemin.',
    prerequisites: ['spin540'],
    phases: phasesWith({
      approach: SPIN_APPROACH,
      compression: { ...SPIN_COMPRESSION, caption: 'Arme franchement : deux tours se décident ici.' },
      pop: SPIN_POP,
      air: {
        title: 'Rotation',
        caption: 'Tête haute, et groupe pour accélérer.',
        cues: [
          { part: 'Tête', text: 'Haute, vers l’horizon : si elle tombe, la figure se désaxe.' },
          { part: 'Corps', text: 'Se regrouper accélère la rotation, s’ouvrir la ralentit.' },
          { part: 'Regard', text: 'Un bref coup d’œil à la réception à 360°, puis il repart.' },
          { part: 'Bras', text: 'La main libre ne croise pas le corps et ne monte pas : elle bloquerait le tour.' },
        ],
      },
      spot: {
        title: 'Repérage',
        caption: 'Deuxième passage : fixe la réception et ouvre.',
        cues: [
          { part: 'Regard', text: 'Il se fixe sur la réception au deuxième passage.' },
          { part: 'Bras', text: 'Ils s’ouvrent pour ralentir.' },
          { part: 'Jambes', text: 'Elles se déplient vers la neige.' },
        ],
      },
    }),
    mistakes: [
      {
        title: 'Tu regardes trop longtemps en bas à mi-rotation',
        cause: 'Le coup d’œil s’attarde et freine le second tour.',
        fix: 'Un repère bref à 360°, puis la tête relance tout de suite.',
      },
      {
        title: 'Ta figure se désaxe',
        cause: 'La tête a quitté l’horizon.',
        fix: 'Garde le menton haut pendant les deux tours.',
      },
      {
        title: 'Ta rotation se bloque',
        cause: 'La main libre croise le corps ou monte trop haut.',
        fix: 'Garde-la basse et du même côté.',
      },
    ],
    safety: PARK_SAFETY,
    sources: [SOURCES.usSportsCamps, SOURCES.fallLine],
  },
]
