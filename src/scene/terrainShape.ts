import { heightAt } from '../physics/terrain'
import { fbm } from './noise'
import type { Terrain, TerrainPoint } from '../physics/types'

/** Dénivelé entre la piste damée et le hors-piste qui la borde. */
export const SHOULDER_DROP = 1.2
/** Largeur du talus entre le bord de la piste et le hors-piste quand il n'y a pas de remblai. */
export const BANK_WIDTH = 6
/** Recul horizontal du talus par mètre de remblai : la neige poussée tient à environ 30°. */
const BANK_RUN = 1.7

/**
 * Plateforme de départ : la piste se prolonge en amont du départ, en pente douce vers lui. C'est là
 * qu'arrive le télésiège et que le skieur se laisse glisser jusqu'à la ligne de départ.
 */
export const START_DECK_LENGTH = 30
const START_DECK_SLOPE = Math.tan((5 * Math.PI) / 180)
const START_DECK_STEP = 5
/** Distance après le départ sur laquelle le talus de bord de piste reprend sa hauteur. */
const DECK_SHOULDER_BLEND = 10

/** Pas d'échantillonnage de la pente naturelle et rayon de lissage de ses ruptures, en mètres. */
const GROUND_STEP = 1
const GROUND_SMOOTHING_RADIUS = 8
const GROUND_SMOOTHING_PASSES = 2
/** Amplitude des ondulations du hors-piste, et distance au talus où elles atteignent leur pleine force. */
const RELIEF_AMPLITUDE = 2.2
const RELIEF_FADE_IN = 40
/** Loin de la piste, le relief se creuse : amplitude ajoutée, entre ces deux distances au bord. */
const FAR_RELIEF = 6
const FAR_RELIEF_FROM = 100
const FAR_RELIEF_TO = 300
/** Loin de la piste, les deux versants de la vallée se relèvent : la distance où ça commence, et leur raideur. */
const VALLEY_FLOOR = 120
const VALLEY_CURVE = 900

/** Taille des plus grandes formes du relief naturel, en mètres. */
const RELIEF_SCALE = 150
/** Bosses et creux des versants au-delà des bouts de piste : amplitude en haut et en bas, et distance où elle s'installe. */
const BACK_RELIEF = 7
const OUTRUN_RELIEF = 2.5
const APRON_RELIEF_FADE = 70
/** La roche affleure entre ces deux gains d'altitude, par plaques de cette taille, là où le bruit dépasse ces seuils. */
const ROCK_FROM = 40
const ROCK_FULL = 72
const ROCK_PATCH = 55
const ROCK_PATCH_FROM = 0.45
const ROCK_PATCH_FULL = 0.7

/** Longueur de terrain prolongé au-delà de chaque bout de la piste. */
export const APRON_LENGTH = 420
/** Derrière le départ, le versant se redresse de la pente de la plateforme jusqu'à cette pente, sur cette distance caractéristique. */
const BACK_SLOPE = Math.tan((22 * Math.PI) / 180)
const BACK_SLOPE_EASE = 40
/** Après l'arrivée, la vallée descend encore un peu puis remonte en face. */
const OUTRUN_SLOPE = 0.05
const OUTRUN_CURVE = 2400

const MIN_KICKER_HALF_WIDTH = 2
const MAX_KICKER_HALF_WIDTH = 6.5
/** Élargissement de la bosse par mètre de hauteur de lèvre. */
const KICKER_HALF_WIDTH_PER_METER = 0.45
const COURSE_TO_KICKER_WIDTH = 3.2
const MIN_COURSE_HALF_WIDTH = 11
/** Recul horizontal du flanc par mètre de hauteur : un talus taillé à un peu plus de 50°. */
const FLANK_RUN = 0.75
/** Part de la montée du kick à partir de laquelle la neige de côté commence à rejoindre la table. */
const TABLE_RAMP_START = 0.5

/** Emprise d'une bosse : du pied du kick au début de la table. */
export interface KickerShape {
  readonly kickStartX: number
  readonly lipX: number
  readonly lipY: number
  readonly deckStartX: number
  readonly baseY: number
  readonly deckY: number
  /** Demi-largeur du dessus de la bosse. */
  readonly halfWidth: number
}

/** Pente naturelle de la montagne sous la piste, échantillonnée à pas constant. */
export interface GroundProfile {
  readonly firstX: number
  readonly heights: readonly number[]
}

export interface CourseShape {
  /** Profil de la piste, plateforme de départ comprise : il commence donc avant le départ de la descente. */
  readonly terrain: Terrain
  /** Abscisse du départ de la descente, au bout de la plateforme. */
  readonly startX: number
  readonly kickers: readonly KickerShape[]
  /** Demi-largeur de la piste damée. */
  readonly halfWidth: number
  readonly ground: GroundProfile
}

/** Coupe en travers de la piste à une abscisse donnée. */
export interface CrossSection {
  /** Hauteur sur le dessus de la bosse : le profil physique. */
  readonly centerY: number
  /** Hauteur de la neige de part et d'autre de la bosse. */
  readonly sideY: number
  readonly halfWidth: number
  /** Largeur au sol de chaque flanc. */
  readonly flankRun: number
}

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value))

function smoothstep(from: number, to: number, value: number): number {
  const ratio = clamp((value - from) / (to - from), 0, 1)
  return ratio * ratio * (3 - 2 * ratio)
}

function kickerShape(terrain: Terrain, index: number): KickerShape {
  const { points } = terrain
  const marks = terrain.kickers[index]
  const kickStart = points.find((point) => point.kicker === index && point.kind === 'transition' && point.angle > 0)
  const deckStart = points.slice(marks.lipIndex + 1).find((point) => point.kind !== 'face')
  const height = marks.lipY - marks.baseY
  return {
    kickStartX: kickStart?.x ?? marks.lipX,
    lipX: marks.lipX,
    lipY: marks.lipY,
    deckStartX: deckStart?.x ?? marks.lipX,
    baseY: marks.baseY,
    deckY: deckStart?.y ?? marks.lipY,
    halfWidth: clamp(
      MIN_KICKER_HALF_WIDTH + KICKER_HALF_WIDTH_PER_METER * height,
      MIN_KICKER_HALF_WIDTH,
      MAX_KICKER_HALF_WIDTH,
    ),
  }
}

/** Moyenne glissante, bords répétés : arrondit les ruptures de pente comme le ferait un versant. */
function smooth(heights: readonly number[], radius: number): number[] {
  const last = heights.length - 1
  return heights.map((_, i) => {
    let sum = 0
    for (let offset = -radius; offset <= radius; offset++) sum += heights[clamp(i + offset, 0, last)]
    return sum / (2 * radius + 1)
  })
}

/**
 * Pente naturelle sous la piste. L'élan et le plat suivent le versant ; du pied du kick au bas de
 * la réception, le versant file droit : bosse, table et réception sont un remblai posé dessus.
 */
function buildGround(terrain: Terrain, kickers: readonly KickerShape[]): GroundProfile {
  const firstX = terrain.points[0].x
  const lastX = terrain.points[terrain.points.length - 1].x
  const count = Math.max(1, Math.ceil((lastX - firstX) / GROUND_STEP))
  const raw = Array.from({ length: count + 1 }, (_, i) => {
    const x = Math.min(firstX + i * GROUND_STEP, lastX)
    const built = kickers.findIndex((kicker, index) => x > kicker.kickStartX && x < terrain.kickers[index].landingEndX)
    if (built < 0) return heightAt(terrain, x)
    const { kickStartX, baseY } = kickers[built]
    const { landingEndX } = terrain.kickers[built]
    const ratio = (x - kickStartX) / (landingEndX - kickStartX)
    return baseY + ratio * (heightAt(terrain, landingEndX) - baseY)
  })
  const radius = Math.round(GROUND_SMOOTHING_RADIUS / GROUND_STEP)
  const heights = Array.from({ length: GROUND_SMOOTHING_PASSES }).reduce<number[]>((current) => smooth(current, radius), raw)
  return { firstX, heights }
}

/**
 * Prolonge le profil physique par la plateforme de départ. Les repères des bosses sont décalés
 * d'autant de points : ils continuent de désigner la même lèvre.
 */
function withStartDeck(terrain: Terrain): Terrain {
  const start = terrain.points[0]
  const count = Math.round(START_DECK_LENGTH / START_DECK_STEP)
  const deck: TerrainPoint[] = Array.from({ length: count }, (_, i) => {
    const back = START_DECK_LENGTH - i * START_DECK_STEP
    return {
      x: start.x - back,
      y: start.y + back * START_DECK_SLOPE,
      s: start.s - back * Math.hypot(1, START_DECK_SLOPE),
      angle: -Math.atan(START_DECK_SLOPE),
      curvature: 0,
      kind: 'flat',
      kicker: start.kicker,
    }
  })
  const kickers = terrain.kickers.map((marks) => ({ ...marks, lipIndex: marks.lipIndex + count }))
  return {
    points: [...deck, ...terrain.points],
    kickers,
    lipIndices: new Set(kickers.map((marks) => marks.lipIndex)),
  }
}

/** Déduit du profil la forme en travers : largeur des bosses, largeur de la piste, pente naturelle. */
export function buildCourseShape(physical: Terrain): CourseShape {
  const terrain = withStartDeck(physical)
  const kickers = terrain.kickers.map((_, index) => kickerShape(terrain, index))
  const widest = kickers.reduce((max, kicker) => Math.max(max, kicker.halfWidth), 0)
  return {
    terrain,
    startX: physical.points[0].x,
    kickers,
    halfWidth: Math.max(MIN_COURSE_HALF_WIDTH, widest * COURSE_TO_KICKER_WIDTH),
    ground: buildGround(terrain, kickers),
  }
}

/** Hauteur de la pente naturelle à l'abscisse x, sans bosse ni remblai. */
export function naturalHeightAt(shape: CourseShape, x: number): number {
  const { firstX, heights } = shape.ground
  const position = clamp((x - firstX) / GROUND_STEP, 0, heights.length - 1)
  const index = Math.min(Math.floor(position), heights.length - 2)
  if (index < 0) return heights[0]
  return heights[index] + (position - index) * (heights[index + 1] - heights[index])
}

/** Ondulations du hors-piste, entre -1 et 1 : quelques houles superposées, fixes d'un réglage à l'autre. */
function relief(x: number, z: number): number {
  return fbm(x / RELIEF_SCALE, z / RELIEF_SCALE, 3) * 2 - 1
}

/** Dénivelé du talus de bord de piste : nul le long de la plateforme de départ, qui est de plain-pied. */
function shoulderDropAt(shape: CourseShape, x: number): number {
  return SHOULDER_DROP * smoothstep(shape.startX, shape.startX + DECK_SHOULDER_BLEND, x)
}

/** Largeur du talus à l'abscisse x : plus le remblai est haut au-dessus du versant, plus il s'étale. */
export function bankWidthAt(shape: CourseShape, x: number, sideY: number): number {
  // Raccord en hypoténuse plutôt qu'un max : la largeur grandit sans à-coup, donc sans pli dans le talus.
  return offPisteSection(shape, x, sideY).bankWidth
}

/** Coupe du hors-piste à une abscisse : ce qui ne dépend pas de l'écart latéral est calculé une seule fois. */
export interface OffPisteSection {
  readonly bankWidth: number
  /** Hauteur à l'écart latéral z, au-delà du bord de la piste. */
  readonly heightAt: (z: number) => number
}

/** Prépare la coupe du hors-piste à l'abscisse x : le talus descend du bord damé jusqu'au versant, qui ondule ensuite. */
export function offPisteSection(shape: CourseShape, x: number, sideY: number): OffPisteSection {
  const versant = naturalHeightAt(shape, x) - shoulderDropAt(shape, x)
  const bankWidth = Math.hypot(BANK_WIDTH, Math.abs(sideY - versant) * BANK_RUN)
  return {
    bankWidth,
    heightAt: (z: number): number => {
      const distance = Math.abs(z) - shape.halfWidth
      const amplitude = RELIEF_AMPLITUDE + FAR_RELIEF * smoothstep(FAR_RELIEF_FROM, FAR_RELIEF_TO, distance)
      const waves = amplitude * relief(x, z) * smoothstep(0, RELIEF_FADE_IN, distance - bankWidth)
      return sideY + (versant + waves - sideY) * smoothstep(0, bankWidth, distance) + valleyRise(distance)
    },
  }
}

/** Hauteur hors de la piste en un point isolé. */
export function offPisteHeight(shape: CourseShape, x: number, sideY: number, z: number): number {
  return offPisteSection(shape, x, sideY).heightAt(z)
}

/**
 * Neige de côté le long d'une bosse : elle reste au niveau du plat au pied du kick, puis rejoint
 * le niveau de la table à la lèvre, sans jamais dépasser le dessus de la bosse.
 */
function sideHeight(kicker: KickerShape, x: number, centerY: number): number {
  if (x <= kicker.kickStartX || x >= kicker.deckStartX) return centerY
  if (x >= kicker.lipX) return Math.min(centerY, kicker.deckY)
  const progress = (x - kicker.kickStartX) / (kicker.lipX - kicker.kickStartX)
  const ramp = smoothstep(TABLE_RAMP_START, 1, progress)
  return Math.min(centerY, kicker.baseY + (kicker.deckY - kicker.baseY) * ramp)
}

/** Coupe en travers à l'abscisse x, connaissant la hauteur du profil à cet endroit. */
export function crossSectionAt(shape: CourseShape, x: number, centerY: number): CrossSection {
  const kicker = shape.kickers.find((candidate) => x < candidate.deckStartX) ?? shape.kickers[shape.kickers.length - 1]
  if (!kicker) return { centerY, sideY: centerY, halfWidth: MIN_KICKER_HALF_WIDTH, flankRun: 0 }
  const sideY = sideHeight(kicker, x, centerY)
  return { centerY, sideY, halfWidth: kicker.halfWidth, flankRun: (centerY - sideY) * FLANK_RUN }
}

/** Remontée des flancs de la vallée, à une distance donnée du bord de la piste. */
const valleyRise = (distance: number): number => Math.max(0, distance - VALLEY_FLOOR) ** 2 / VALLEY_CURVE

/** Montée du versant derrière le départ, à une distance donnée du bout de la plateforme. */
function backRise(back: number): number {
  const eased = back - BACK_SLOPE_EASE * (1 - Math.exp(-back / BACK_SLOPE_EASE))
  return START_DECK_SLOPE * back + (BACK_SLOPE - START_DECK_SLOPE) * eased
}

/** Profil de la vallée après l'arrivée : elle descend encore un peu, puis remonte en face. */
const outrunRise = (beyond: number): number => -OUTRUN_SLOPE * beyond + beyond ** 2 / OUTRUN_CURVE

/**
 * Bosses et creux propres aux versants au-delà des deux bouts de la piste : nuls au bout de piste,
 * ils s'installent en s'éloignant. Sans eux, ces versants seraient des plans inclinés.
 */
export function apronReliefAt(shape: CourseShape, x: number, z: number): number {
  const { points } = shape.terrain
  const back = points[0].x - x
  const beyond = x - points[points.length - 1].x
  if (back <= 0 && beyond <= 0) return 0
  const amplitude = back > 0 ? BACK_RELIEF : OUTRUN_RELIEF
  return amplitude * smoothstep(0, APRON_RELIEF_FADE, Math.max(back, beyond)) * relief(x + 311, z - 173)
}

/**
 * Part de roche qui affleure sous la neige, de 0 à 1 : nulle en bas, elle apparaît par plaques au-dessus
 * de la limite des arbres. Elle teinte le terrain et attire les amas de rochers.
 */
export function rockinessAt(shape: CourseShape, x: number, z: number): number {
  const altitude = smoothstep(ROCK_FROM, ROCK_FULL, elevationGainAt(shape, x, z))
  if (altitude === 0) return 0
  return altitude * smoothstep(ROCK_PATCH_FROM, ROCK_PATCH_FULL, fbm(x / ROCK_PATCH + 40, z / ROCK_PATCH - 25, 3))
}

/**
 * Altitude gagnée par rapport à la piste voisine, en un point du décor : celle des flancs de la vallée
 * et du versant derrière le départ. C'est elle qui fixe la limite des arbres.
 */
export function elevationGainAt(shape: CourseShape, x: number, z: number): number {
  const { points } = shape.terrain
  const back = Math.max(0, points[0].x - x)
  const beyond = Math.max(0, x - points[points.length - 1].x)
  return valleyRise(Math.abs(z) - shape.halfWidth) + backRise(back) + Math.max(0, outrunRise(beyond))
}

/**
 * Hauteur de la neige en un point quelconque, z étant l'écart latéral à la ligne. Au-delà des deux
 * bouts de la piste, le terrain continue : le versant monte derrière le départ, la vallée se
 * prolonge après l'arrivée puis remonte en face.
 */
export function surfaceHeightAt(shape: CourseShape, x: number, z: number): number {
  const { points } = shape.terrain
  const firstX = points[0].x
  const lastX = points[points.length - 1].x
  if (x < firstX) {
    return courseHeightAt(shape, firstX, z) + backRise(firstX - x) + apronReliefAt(shape, x, z)
  }
  if (x > lastX) return courseHeightAt(shape, lastX, z) + outrunRise(x - lastX) + apronReliefAt(shape, x, z)
  return courseHeightAt(shape, x, z)
}

/** Hauteur de la neige le long de la piste, entre ses deux bouts. */
function courseHeightAt(shape: CourseShape, x: number, z: number): number {
  const section = crossSectionAt(shape, x, heightAt(shape.terrain, x))
  const offset = Math.abs(z)
  if (offset >= shape.halfWidth) return offPisteHeight(shape, x, section.sideY, z)
  const fromEdge = offset - section.halfWidth
  if (fromEdge <= 0) return section.centerY
  if (fromEdge >= section.flankRun) return section.sideY
  return section.centerY - fromEdge / FLANK_RUN
}
