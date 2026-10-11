import type { Lesson } from '../lesson'
import { INVERTED_SAFETY, SOURCES, phasesWith } from './common'

export const FLIPS: readonly Lesson[] = [
  {
    id: 'backflipTuck',
    group: 'flips',
    level: 4,
    bump: 'medium',
    summary: 'Un salto arrière complet, groupé, lancé par les hanches et non par la tête. C’est la forme qu’on apprend ; le backflip ouvert et cambré vient ensuite.',
    prerequisites: ['straight', 'spin360'],
    phases: phasesWith({
      approach: {
        title: 'Approche',
        caption: 'Centré, pression sur tout le ski.',
        cues: [
          { part: 'Buste', text: 'Léger fléchi vers l’avant.' },
          { part: 'Appuis', text: 'Pression sur toute la longueur des skis, ni talons ni spatules.' },
          { part: 'Regard', text: 'Sur la lèvre.' },
        ],
      },
      compression: {
        title: 'Appui dans la courbe',
        caption: 'Charge comme un ressort.',
        cues: [
          { part: 'Jambes', text: 'Elles plient et se chargent dans la courbe.' },
          { part: 'Hanches', text: 'Au-dessus des pieds : c’est d’elles que partira le salto.' },
          { part: 'Tête', text: 'Droite sur les épaules.' },
        ],
      },
      pop: {
        title: 'Impulsion et lancer',
        caption: 'Saute vers le haut, pas vers l’arrière : ce sont les hanches qui lancent.',
        cues: [
          { part: 'Jambes', text: 'Poussée égale sur les deux pieds, extension complète.' },
          { part: 'Hanches', text: 'Elles montent et lancent le salto, avec le gainage.' },
          { part: 'Tête', text: 'Elle reste droite sur les épaules : elle ne part pas en arrière.' },
          { part: 'Bras', text: 'Ils montent devant toi.' },
        ],
      },
      air: {
        title: 'Salto',
        caption: 'Groupe pour tourner, ouvre pour ralentir.',
        cues: [
          { part: 'Genoux', text: 'À la poitrine : c’est le groupé qui règle la vitesse du salto.' },
          { part: 'Pieds', text: 'Pousse-les dans la rotation.' },
          { part: 'Yeux', text: 'Ouverts, toujours.' },
        ],
      },
      spot: {
        title: 'Repérage et ouverture',
        caption: 'Yeux ouverts : cherche la réception, puis ouvre tôt.',
        cues: [
          { part: 'Tête', text: 'Elle bascule légèrement jusqu’à voir la réception.' },
          { part: 'Genoux', text: 'Lâche-les et redresse-toi, plus tôt que tu ne le crois.' },
          { part: 'Pieds', text: 'Vers la neige.' },
        ],
      },
    }),
    mistakes: [
      {
        title: 'Tu lances avec la tête ou les bras',
        cause: 'Le salto part du haut du corps : tu ne contrôles plus sa vitesse.',
        fix: 'Tête droite, et laisse les hanches lancer.',
      },
      {
        title: 'Tu te jettes en arrière',
        cause: 'Tu cherches la rotation au lieu de la hauteur.',
        fix: 'Saute vers le haut : la forme de la bosse te fait déjà tourner.',
      },
      {
        title: 'Tu fermes les yeux',
        cause: 'L’appréhension de la tête en bas.',
        fix: 'Répète au trampoline en nommant ce que tu vois à chaque quart de tour.',
      },
      {
        title: 'Tu tournes trop',
        cause: 'Tu restes groupé après avoir vu la réception.',
        fix: 'Ouvre plus tôt.',
      },
    ],
    safety: INVERTED_SAFETY,
    sources: [SOURCES.newGenBackflip, SOURCES.freeskierBackflip, SOURCES.stompItBackflip],
  },
  {
    id: 'frontflip',
    group: 'flips',
    level: 4,
    bump: 'hard',
    summary: 'Un salto avant complet : on perd la réception de vue un instant, puis elle revient.',
    prerequisites: ['straight', 'backflipTuck'],
    phases: phasesWith({
      approach: {
        title: 'Approche',
        caption: 'Skis à la largeur des épaules, bien dans l’axe.',
        cues: [
          { part: 'Skis', text: 'À la largeur des épaules, à plat.' },
          { part: 'Épaules', text: 'Alignées avec les skis.' },
          { part: 'Regard', text: 'Sur la lèvre.' },
        ],
      },
      pop: {
        title: 'Impulsion et lancer',
        caption: 'Pop d’abord : ne plonge pas.',
        cues: [
          { part: 'Jambes', text: 'Extension complète sur la lèvre, avant toute bascule.' },
          { part: 'Buste', text: 'Il bascule ensuite par-dessus les spatules.' },
          { part: 'Épaules', text: 'Dans l’axe des skis : une épaule qui tombe fait vriller.' },
        ],
      },
      air: {
        title: 'Salto',
        caption: 'Groupe et patiente : tu es aveugle un instant.',
        cues: [
          { part: 'Genoux', text: 'À la poitrine.' },
          { part: 'Regard', text: 'Tu ne vois que la neige puis le ciel : c’est normal, reste groupé.' },
          { part: 'Épaules', text: 'Toujours dans l’axe.' },
        ],
      },
      spot: {
        title: 'Repérage et ouverture',
        caption: 'Le ciel, puis la réception : ouvre.',
        cues: [
          { part: 'Regard', text: 'Après le ciel, la réception apparaît : fixe-la.' },
          { part: 'Jambes', text: 'Elles se tendent vers la neige.' },
          { part: 'Buste', text: 'Il se redresse.' },
        ],
      },
    }),
    mistakes: [
      {
        title: 'Tu plonges sans impulsion',
        cause: 'Tu groupes dès la lèvre : le salto part bas et court.',
        fix: 'Finis ton extension, puis bascule.',
      },
      {
        title: 'Tu te poses sur la cassure ou à plat dos',
        cause: 'La bosse est trop petite pour finir la rotation.',
        fix: 'Travaille-le une douzaine de fois sur des bosses moyennes, réception en neige molle.',
      },
      {
        title: 'Tu te poses de travers',
        cause: 'Une épaule est tombée au lancer.',
        fix: 'Garde les deux épaules à la même hauteur, dans l’axe des skis.',
      },
    ],
    safety: INVERTED_SAFETY,
    sources: [SOURCES.powder7Frontflip],
  },
]
