import type { Lesson } from '../lesson'
import { INVERTED_SAFETY, SOURCES, phasesWith } from './common'

export const OFF_AXIS: readonly Lesson[] = [
  {
    id: 'cork720',
    group: 'offAxis',
    level: 5,
    bump: 'hard',
    summary: 'Le désaxé le plus courant : un 720 lancé buste en arrière, l’épaule qui tombe, sans jamais passer tête en bas.',
    prerequisites: ['spin720', 'backflipTuck'],
    phases: phasesWith({
      approach: {
        title: 'Approche',
        caption: 'Comme pour un 720 : vitesse franche, appuis larges.',
        cues: [
          { part: 'Skis', text: 'Écartés, stables.' },
          { part: 'Buste', text: 'Centré.' },
          { part: 'Vitesse', text: 'Franche : le cork demande de la hauteur.' },
        ],
      },
      compression: {
        title: 'Appui et armé',
        caption: 'Arme les épaules comme pour une vrille.',
        cues: [
          { part: 'Jambes', text: 'Elles se chargent dans la courbe.' },
          { part: 'Épaules', text: 'Armées à l’opposé du sens de rotation.' },
        ],
      },
      pop: {
        title: 'Impulsion et lancer',
        caption: 'Pop comme un 720, puis laisse tomber l’épaule, sans précipiter.',
        cues: [
          { part: 'Jambes', text: 'Extension complète d’abord.' },
          { part: 'Épaule', text: 'Celle qui mène tombe vers l’arrière pendant que tu tournes.' },
          { part: 'Buste', text: 'Il part en arrière, un peu plus marqué que pour un 360.' },
        ],
      },
      air: {
        title: 'Rotation désaxée',
        caption: 'La tête mène, le corps suit d’un bloc.',
        cues: [
          { part: 'Tête', text: 'Elle mène la rotation, régulière sur tout le vol.' },
          { part: 'Grab', text: 'Tenu : il garde le corps d’un bloc.' },
          { part: 'Main libre', text: 'Ni croisée devant le corps, ni trop haute.' },
        ],
      },
      spot: {
        title: 'Repérage',
        caption: 'À 540°, repère la réception et redresse-toi.',
        cues: [
          { part: 'Regard', text: 'La réception apparaît vers 540° : elle te dit s’il faut tenir ou lâcher.' },
          { part: 'Corps', text: 'Il se redresse pour remettre les pieds sous toi.' },
          { part: 'Bras', text: 'Lancés vers l’avant.' },
        ],
      },
    }),
    mistakes: [
      {
        title: 'Tu te poses sur le dos',
        cause: 'Tu ne t’es pas redressé en fin de rotation.',
        fix: 'Dès que tu vois la réception, ramène les bras devant et les pieds dessous.',
      },
      {
        title: 'Tu précipites le lancer',
        cause: 'L’épaule tombe avant la fin de l’impulsion.',
        fix: 'Pop complet, puis seulement le lancer.',
      },
      {
        title: 'Tu changes de vitesse juste avant de poser',
        cause: 'Tu ouvres ou regroupes au dernier moment.',
        fix: 'Repère plus tôt, et garde une rotation régulière.',
      },
    ],
    safety: INVERTED_SAFETY,
    sources: [SOURCES.fallLine, SOURCES.corkBible, SOURCES.usSportsCamps],
  },
  {
    id: 'rodeo540',
    group: 'offAxis',
    level: 5,
    bump: 'pro',
    summary: 'Un backflip lancé avec un quart de tour d’épaules : la tête passe en bas et on se pose en switch.',
    prerequisites: ['backflipTuck', 'spin540'],
    phases: phasesWith({
      pop: {
        title: 'Impulsion et lancer',
        caption: 'Un backflip, avec un quart de tour d’épaules.',
        cues: [
          { part: 'Appuis', text: 'Poids égal sur les deux pieds.' },
          { part: 'Hanches', text: 'Lancer de backflip.' },
          { part: 'Épaules', text: 'Tournées comme pour un quart de tour.' },
        ],
      },
      air: {
        title: 'Rotation désaxée',
        caption: 'Tiens le grab : c’est lui qui finit la rotation.',
        cues: [
          { part: 'Grab', text: 'Japan, tenu : s’ouvrir tôt arrête la rotation.' },
          { part: 'Genoux', text: 'Ramenés vers toi.' },
          { part: 'Regard', text: 'Par-dessus l’épaule.' },
        ],
      },
      spot: {
        title: 'Repérage',
        caption: 'Lâche le grab et regarde l’amont.',
        cues: [
          { part: 'Main', text: 'Elle lâche le ski.' },
          { part: 'Regard', text: 'Vers l’amont pendant que les pieds descendent.' },
          { part: 'Jambes', text: 'Elles se déplient vers la neige.' },
        ],
      },
      landing: {
        title: 'Réception en switch',
        caption: 'Pose en switch, regard par-dessus l’épaule.',
        cues: [
          { part: 'Skis', text: 'Les deux ensemble, talons vers l’aval.' },
          { part: 'Amorti', text: 'Chevilles, genoux puis hanches plient.' },
        ],
      },
    }),
    mistakes: [
      {
        title: 'Tu ne finis pas la rotation',
        cause: 'Tu t’ouvres trop tôt.',
        fix: 'Tiens le grab jusqu’à voir la réception.',
      },
      {
        title: 'Tu te penches pour chercher le ski',
        cause: 'Le buste part vers le ski : risque de chute sur la nuque.',
        fix: 'Ramène les genoux vers toi, pas la tête vers les skis.',
      },
    ],
    safety: [...INVERTED_SAFETY, 'Commence sur un step-up plutôt qu’un step-down, avec une vitesse bien calée.'],
    sources: [SOURCES.freeskierRodeo, SOURCES.corkBible],
    caveat: 'Fiche peu sourcée : les consignes viennent d’extraits d’un seul article. À valider avec un entraîneur.',
  },
  {
    id: 'misty540',
    group: 'offAxis',
    level: 5,
    bump: 'medium',
    summary: 'Un salto avant désaxé, lancé par-dessus une épaule, posé en switch.',
    prerequisites: ['frontflip', 'spin540'],
    phases: phasesWith({
      pop: {
        title: 'Impulsion et lancer',
        caption: 'Pop, puis roule par-dessus l’épaule avant.',
        cues: [
          { part: 'Jambes', text: 'Extension complète d’abord.' },
          { part: 'Épaule', text: 'Elle tombe vers l’avant et le côté : c’est elle qui désaxe.' },
        ],
      },
      air: {
        title: 'Rotation désaxée',
        caption: 'Ramène les genoux et attrape le safety.',
        cues: [
          { part: 'Genoux', text: 'Ramenés à la poitrine.' },
          { part: 'Grab', text: 'Safety, tenu pendant le passage tête en bas.' },
        ],
      },
      spot: {
        title: 'Repérage',
        caption: 'Cherche la réception par-dessus l’épaule.',
        cues: [
          { part: 'Regard', text: 'Par-dessus l’épaule, vers la réception.' },
          { part: 'Jambes', text: 'Elles se déplient vers la neige.' },
        ],
      },
      landing: {
        title: 'Réception en switch',
        caption: 'Pose en switch, regard par-dessus l’épaule.',
        cues: [
          { part: 'Skis', text: 'Les deux ensemble, talons vers l’aval.' },
          { part: 'Amorti', text: 'Chevilles, genoux puis hanches plient.' },
        ],
      },
    }),
    mistakes: [
      {
        title: 'Tu plonges sans impulsion',
        cause: 'L’épaule tombe avant la fin de l’extension.',
        fix: 'Pop complet, puis seulement le lancer.',
      },
    ],
    safety: INVERTED_SAFETY,
    sources: [SOURCES.mistyWiki, SOURCES.corkBible],
    caveat:
      'Aucun pas-à-pas fiable trouvé pour le misty à skis : les consignes sont déduites de sa définition et de figures voisines. À valider avec un entraîneur.',
  },
]
