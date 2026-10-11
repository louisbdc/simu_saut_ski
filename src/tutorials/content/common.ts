import type { PhaseLesson, Source } from '../lesson'
import type { PhaseId } from '../phases'

type Phases = Readonly<Record<PhaseId, PhaseLesson>>

/** Sources des consignes : sites d'enseignement du ski freestyle. */
export const SOURCES = {
  ridestore: { label: 'Ridestore, sauter une bosse à skis', url: 'https://www.ridestore.com/mag/how-to-hit-jumps-on-skis/' },
  outdoorStraight: { label: 'Outdoor.ch, le saut droit', url: 'https://www.outdoor.ch/en/faq/what-is-a-straight-jump-basic-air' },
  outdoor180: { label: 'Outdoor.ch, apprendre le 180', url: 'https://www.outdoor.ch/en/faq/how-do-you-learn-a-180-jump' },
  rhythm360: { label: 'Rhythm Japan, conseils pour le 360', url: 'https://rhythmjapan.com/our-stories/tips-from-the-team-360' },
  skimag360: { label: 'SKI Magazine, le 360', url: 'https://www.skimag.com/uncategorized/360/?scope=anon' },
  travelski360: { label: 'Travelski, faire un 360 à ski', url: 'https://www.travelski.com/guide/apprendre-ski/faire-un-360-ski' },
  usSportsCamps: {
    label: 'US Sports Camps, 540 et 720 à skis',
    url: 'https://www.ussportscamps.com/tips/how-to-spin-540s-and-720s-on-skis',
  },
  fallLine: { label: 'Fall-Line, le cork 720', url: 'https://www.fall-line.co.uk/?p=13142' },
  bcaGrabs: {
    label: 'Backcountry Access, les grabs',
    url: 'https://backcountryaccess.com/en-nz/blog/p/backcountry-ski-tricks-101-stylish-freestyle-grabs',
  },
  redbullSafety: { label: 'Red Bull, le safety grab', url: 'https://www.redbull.com/us-en/how-to-safety-grab-on-skis' },
  newGenBackflip: { label: 'New Generation, le backflip', url: 'https://www.skinewgen.com/?p=3616' },
  freeskierBackflip: { label: 'Freeskier, Backy Academy', url: 'https://www.freeskier.com/backy-academy' },
  stompItBackflip: {
    label: 'Stomp It Tutorials, le backflip',
    url: 'https://www.downdays.eu/videos/episode/how-to-backflip-on-skis/',
  },
  powder7Frontflip: {
    label: 'Powder7, le frontflip avec Owen Leeper',
    url: 'https://www.powder7.com/ski-blog/how-to-front-flip-on-skis-with-owen-leeper/',
  },
  corkBible: { label: 'Cork Bible, lexique des désaxés', url: 'https://www.digezz.ch/projekte/cork-bible/dictionary.html' },
  freeskierRodeo: {
    label: 'Freeskier, le rodeo 540 avec Michael Olenick',
    url: 'https://www.freeskier.com/trick-tip-tuesday-michael-olenick-rodeo-540',
  },
  mistyWiki: { label: 'Wikipédia, misty flip', url: 'https://en.wikipedia.org/wiki/Misty_flip' },
} as const satisfies Record<string, Source>

/** Le saut droit : toutes les autres figures partent de lui et n'en changent que quelques étapes. */
export const STRAIGHT_PHASES: Phases = {
  approach: {
    title: 'Approche',
    caption: 'Droit dans l’axe, genoux souples, mains devant.',
    cues: [
      { part: 'Trajectoire', text: 'Droite, sans virage de dernière seconde : la vitesse se règle plus haut.' },
      { part: 'Regard', text: 'Sur la lèvre, puis au-delà.' },
      { part: 'Genoux', text: 'Fléchis, sans t’asseoir : le poids reste au centre des skis.' },
      { part: 'Bras', text: 'Devant toi, mains visibles.' },
    ],
  },
  compression: {
    title: 'Appui dans la courbe',
    caption: 'Laisse la courbe te comprimer, sans t’asseoir.',
    cues: [
      { part: 'Jambes', text: 'Chevilles et genoux plient et encaissent l’appui, toniques.' },
      { part: 'Hanches', text: 'Au-dessus des pieds. Si elles reculent, tu partiras en arrière.' },
      { part: 'Skis', text: 'À plat, à la largeur des hanches.' },
    ],
  },
  pop: {
    title: 'Impulsion',
    caption: 'Pousse jusqu’au bout : jambes tendues quand les pieds passent la lèvre.',
    cues: [
      { part: 'Jambes', text: 'Extension complète, finie quand les pieds, et non les spatules, quittent la bosse.' },
      { part: 'Appuis', text: 'Poussée égale sur les deux pieds.' },
      { part: 'Buste', text: 'Tu te grandis vers le haut, sans te jeter en avant ni t’asseoir.' },
    ],
  },
  air: {
    title: 'En l’air',
    caption: 'Reste calme et remonte un peu les skis.',
    cues: [
      { part: 'Genoux', text: 'Ils remontent légèrement : un corps compact est un corps stable.' },
      { part: 'Bras', text: 'Sur les côtés, immobiles.' },
      { part: 'Skis', text: 'Parallèles.' },
    ],
  },
  spot: {
    title: 'Repérage de la réception',
    caption: 'Regarde où tu vas poser et déplie les jambes vers la neige.',
    cues: [
      { part: 'Regard', text: 'Sur ton point de réception.' },
      { part: 'Jambes', text: 'Elles se déplient pour aller chercher la neige, sans se verrouiller.' },
      { part: 'Skis', text: 'Ils s’inclinent pour épouser la pente.' },
    ],
  },
  landing: {
    title: 'Réception',
    caption: 'Deux skis en même temps, et amortis.',
    cues: [
      { part: 'Skis', text: 'Les deux ensemble, ni sur les talons ni sur les spatules.' },
      { part: 'Amorti', text: 'Chevilles, genoux puis hanches plient.' },
      { part: 'Buste', text: 'Légèrement vers l’avant, mains devant les hanches.' },
    ],
  },
}

/** Étapes d'une figure : celles du saut droit, sauf celles que la figure change. */
export function phasesWith(changes: Partial<Phases>): Phases {
  return { ...STRAIGHT_PHASES, ...changes }
}

export const PARK_SAFETY: readonly string[] = [
  'Casque et dorsale.',
  'Passe d’abord la bosse en saut droit pour juger sa vitesse, sa hauteur et sa réception.',
  'Repère la réception avant de t’élancer, annonce ton départ, et dégage vite après ton saut.',
]

export const INVERTED_SAFETY: readonly string[] = [
  ...PARK_SAFETY,
  'Acquiers la figure au trampoline, puis sur airbag, water-ramp ou neige molle, avant la neige dure.',
  'Une fois lancé, va au bout : une rotation abandonnée à mi-chemin est la chute la plus dangereuse.',
]
