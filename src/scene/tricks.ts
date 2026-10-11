/**
 * Catalogue des figures. Une figure est décrite par ce que le skieur veut boucler : un nombre de
 * saltos (le corps bascule cul par-dessus tête) et un nombre de vrilles (il tourne sur lui-même),
 * plus le grab tenu. Un cork, un rodeo ou un misty mêlent les deux : l'axe du corps tourne alors en
 * cône autour de l'élan de rotation, c'est ce qui le fait partir « désaxé ».
 *
 * La rotation réelle est calculée par `flightPlan.ts` à partir de la dynamique du corps ; la
 * figure ne change pas la trajectoire du saut.
 */
export type TrickFamily = 'straight' | 'spin' | 'backflip' | 'frontflip' | 'cork' | 'rodeo' | 'misty'

/**
 * Grabs : safety = la main attrape le ski du même côté, sous la chaussure ; mute = la main attrape
 * le ski opposé devant la fixation, skis croisés en X ; japan = la main passe derrière la jambe
 * pour attraper le ski opposé, skis ramenés derrière et dos creusé.
 */
export type GrabKind = 'none' | 'safety' | 'mute' | 'japan'

export interface Trick {
  readonly id: string
  readonly label: string
  /** Famille de postures : appel, lancer et forme tenue en l'air. */
  readonly family: TrickFamily
  /** Saltos : positif vers l'arrière, négatif vers l'avant. */
  readonly flips: number
  /** Vrilles sur soi-même ; une demi-vrille en plus fait atterrir dans l'autre sens. */
  readonly spins: number
  /** Groupé en l'air au plus fort de la figure, de 0 (corps tendu) à 1 (genoux à la poitrine). */
  readonly tuckMax: number
  /** Grab tenu pendant le groupé. */
  readonly grab: GrabKind
}

/**
 * Durées des changements de posture, en secondes. Un mouvement de bras prend au moins 0,25 s
 * (Yeadon, simulations d'aerials) ; l'ouverture avant la réception est une estimation.
 */
export const TUCK_IN_SECONDS = 0.3
export const OPEN_SECONDS = 0.4
/**
 * Sur un long vol, le skieur prend la forme de sa figure progressivement, sur cette part du vol,
 * sans jamais y mettre plus de `MAX_SHAPING_SECONDS` : il ne se replie pas d'un coup à la lèvre.
 */
const SHAPING_SHARE = 0.32
const MAX_SHAPING_SECONDS = 0.75

/** Durées de mise en forme après la lèvre et d'ouverture avant la réception, pour un temps de vol. */
export function flightPhases(airTime: number): { readonly shaping: number; readonly opening: number } {
  const shaping = Math.min(MAX_SHAPING_SECONDS, Math.max(TUCK_IN_SECONDS, SHAPING_SHARE * airTime))
  // Un vol trop bref pour loger les deux phases les raccourcit dans les mêmes proportions.
  const scale = Math.min(1, airTime / (shaping + OPEN_SECONDS))
  return { shaping: shaping * scale, opening: OPEN_SECONDS * scale }
}
/** Groupé choisi quand le temps de vol le permet ; il se resserre seulement si la figure l'exige. */
export const RELAXED_COMPACTNESS = 0.6

export const DEFAULT_TRICK_ID = 'straight'

type Row = readonly [id: string, label: string, family: TrickFamily, flips: number, spins: number, tuckMax: number, grab: GrabKind]

const ROWS: readonly Row[] = [
  ['straight', 'Saut droit', 'straight', 0, 0, 0.3, 'none'],
  ['safety', 'Safety grab', 'straight', 0, 0, 1, 'safety'],
  ['mute', 'Mute grab', 'straight', 0, 0, 1, 'mute'],
  ['japan', 'Japan grab', 'straight', 0, 0, 1, 'japan'],
  ['spin180', '180', 'spin', 0, 0.5, 0.45, 'none'],
  ['spin360', '360', 'spin', 0, 1, 0.55, 'none'],
  ['spin360safety', '360 safety', 'spin', 0, 1, 1, 'safety'],
  ['spin360mute', '360 mute', 'spin', 0, 1, 1, 'mute'],
  ['spin360japan', '360 japan', 'spin', 0, 1, 1, 'japan'],
  ['spin540', '540', 'spin', 0, 1.5, 0.6, 'none'],
  ['spin540mute', '540 mute', 'spin', 0, 1.5, 1, 'mute'],
  ['spin720', '720', 'spin', 0, 2, 0.65, 'none'],
  ['spin720mute', '720 mute', 'spin', 0, 2, 1, 'mute'],
  ['spin1080', '1080 safety', 'spin', 0, 3, 1, 'safety'],
  ['spin1440', '1440 mute', 'spin', 0, 4, 1, 'mute'],
  ['backflip', 'Backflip', 'backflip', 1, 0, 1, 'none'],
  ['doubleBackflip', 'Double backflip', 'backflip', 2, 0, 1, 'none'],
  ['frontflip', 'Frontflip', 'frontflip', -1, 0, 1, 'none'],
  // Désaxés : le nom additionne 360° par salto et par vrille.
  ['rodeo540', 'Rodeo 540 japan', 'rodeo', 1, 0.5, 1, 'japan'],
  ['cork720', 'Cork 720 safety', 'cork', 1, 1, 1, 'safety'],
  ['cork720mute', 'Cork 720 mute', 'cork', 1, 1, 1, 'mute'],
  ['cork1080', 'Cork 1080 safety', 'cork', 1, 2, 1, 'safety'],
  ['doubleCork1080', 'Double cork 1080 mute', 'cork', 2, 1, 1, 'mute'],
  ['cork1440', 'Double cork 1440 mute', 'cork', 2, 2, 1, 'mute'],
  ['misty540', 'Misty 540 safety', 'misty', -1, 0.5, 1, 'safety'],
  ['misty720', 'Misty 720 safety', 'misty', -1, 1, 1, 'safety'],
]

export const TRICKS: readonly Trick[] = ROWS.map(([id, label, family, flips, spins, tuckMax, grab]) => ({
  id,
  label,
  family,
  flips,
  spins,
  tuckMax,
  grab,
}))

const BY_ID: ReadonlyMap<string, Trick> = new Map(TRICKS.map((trick) => [trick.id, trick]))

/** Réglages d'une figure composée à la main : saltos, vrille en degrés et grab. */
export interface CustomTrickSettings {
  /** Saltos : positif vers l'arrière, négatif vers l'avant. */
  readonly flips: number
  readonly spinDegrees: number
  readonly grab: GrabKind
}

export const CUSTOM_TRICK_PREFIX = 'custom'
export const CUSTOM_TRICK_LIMITS = { flips: 20, spinDegrees: 36000 } as const
export const GRABS: readonly GrabKind[] = ['none', 'safety', 'mute', 'japan']
/** On se pose de face ou en switch : la vrille se compte par demi-tours. */
const HALF_TURN_DEGREES = 180
const COUNT_NAMES = ['', '', 'Double ', 'Triple ', 'Quadruple '] as const

const clamp = (value: number, limit: number): number => Math.min(limit, Math.max(-limit, value))

/** Identifiant d'une figure personnalisée : il porte ses réglages, donc se range comme une figure du catalogue. */
export function customTrickId(settings: CustomTrickSettings): string {
  return [CUSTOM_TRICK_PREFIX, settings.flips, settings.spinDegrees, settings.grab].join(':')
}

/** Réglages portés par un identifiant de figure personnalisée, bornés ; `null` si ce n'en est pas un. */
export function parseCustomTrick(id: string): CustomTrickSettings | null {
  const [prefix, flips, spinDegrees, grab] = id.split(':')
  if (prefix !== CUSTOM_TRICK_PREFIX) return null
  const flipCount = Number(flips)
  const degrees = Number(spinDegrees)
  if (!Number.isFinite(flipCount) || !Number.isFinite(degrees)) return null
  return {
    flips: clamp(Math.round(flipCount), CUSTOM_TRICK_LIMITS.flips),
    spinDegrees:
      Math.round(clamp(Math.abs(degrees), CUSTOM_TRICK_LIMITS.spinDegrees) / HALF_TURN_DEGREES) * HALF_TURN_DEGREES,
    grab: GRABS.find((kind) => kind === grab) ?? 'none',
  }
}

function customFamily(flips: number, spins: number): TrickFamily {
  if (flips === 0) return spins === 0 ? 'straight' : 'spin'
  if (spins === 0) return flips > 0 ? 'backflip' : 'frontflip'
  return flips > 0 ? 'cork' : 'misty'
}

function customLabel(family: TrickFamily, flips: number, spinDegrees: number, grab: GrabKind): string {
  const count = Math.abs(flips)
  const total = count * 360 + spinDegrees
  const named = (name: string): string => `${COUNT_NAMES[count] ?? `${count}× `}${name}`
  const capitalized = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1)
  const base: Readonly<Record<TrickFamily, string>> = {
    straight: 'Saut droit',
    spin: `${spinDegrees}`,
    backflip: count > 4 ? `${count} backflips` : capitalized(named('backflip')),
    frontflip: count > 4 ? `${count} frontflips` : capitalized(named('frontflip')),
    cork: `${capitalized(named('cork'))} ${total}`,
    misty: `${capitalized(named('misty'))} ${total}`,
    rodeo: `Rodeo ${total}`,
  }
  if (grab === 'none') return base[family]
  return family === 'straight' ? `${capitalized(grab)} grab` : `${base[family]} ${grab}`
}

function customTrick(id: string): Trick | null {
  const settings = parseCustomTrick(id)
  if (!settings) return null
  const { flips, spinDegrees, grab } = settings
  const spins = spinDegrees / 360
  const family = customFamily(flips, spins)
  const tucked = flips !== 0 || grab !== 'none'
  return {
    id: customTrickId(settings),
    label: customLabel(family, flips, spinDegrees, grab),
    family,
    flips,
    spins,
    tuckMax: tucked ? 1 : family === 'straight' ? 0.3 : 0.65,
    grab,
  }
}

/** Figure correspondant à un identifiant ; un identifiant inconnu donne le saut droit. */
export function getTrick(id: string | undefined): Trick {
  const key = id ?? DEFAULT_TRICK_ID
  return BY_ID.get(key) ?? customTrick(key) ?? TRICKS[0]
}

/** Nombre de tours annoncé par le nom de la figure : 360° par salto et par vrille. */
export function nominalTurns(trick: Trick): number {
  return Math.abs(trick.flips) + Math.abs(trick.spins)
}

/** Une demi-vrille en trop fait atterrir dans l'autre sens. */
export function landsOpposite(trick: Trick): boolean {
  return Math.abs((Math.abs(trick.spins) % 1) - 0.5) < 1e-9
}

/**
 * Sens de glisse le long de la ligne : `true` = en switch (en arrière). Le résultat donne le sens
 * avant chaque bosse, puis après la dernière ; il ne change qu'aux figures qui retournent le skieur.
 */
export function stancesAlong(tricks: readonly Trick[], startSwitch: boolean): boolean[] {
  return tricks.reduce<boolean[]>(
    (stances, trick) => [...stances, stances[stances.length - 1] !== landsOpposite(trick)],
    [startSwitch],
  )
}

export type TrickLevel = 'ok' | 'warn' | 'bad'
