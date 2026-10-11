import type { KickerConfig, LineConfig, PhysicsParams } from './types'

export const GRAVITY = 9.81
export const SEA_LEVEL_AIR_DENSITY = 1.225
/** Gradient thermique rapporté à la température au niveau de la mer (0,0065 K/m ÷ 288,15 K), en 1/m. */
export const ISA_LAPSE_FACTOR = 2.25577e-5
/** Exposant de la masse volumique dans la troposphère standard : g·M / (R·L) − 1. */
export const ISA_DENSITY_EXPONENT = 4.25588

/** Pas d'échantillonnage du profil, en mètres. */
export const TERRAIN_STEP = 0.1
export const FLIGHT_TIME_STEP = 1 / 240
export const MAX_FLIGHT_TIME = 20
/** Garde-fou : nombre maximal de glisses et de vols enchaînés dans un parcours. */
export const MAX_PHASES = 2000

/** Part maximale de la vitesse horizontale que le pop peut annuler à la lèvre. */
export const MAX_POP_RATIO = 0.5
/** Écart au point visé en dessous duquel le calcul inverse est considéré comme abouti, en mètres. */
export const SOLVER_TOLERANCE = 0.25

/** Recul horizontal du mur sous la lèvre. */
export const FACE_RUN = 0.2
export const KNUCKLE_RADIUS = 5
export const RUNOUT_RADIUS = 30
export const FINAL_RUNOUT_LENGTH = 60

/** Point visé et fin de la zone idéale, en fraction de la longueur de réception. */
export const SWEET_SPOT_TARGET = 0.3
export const IDEAL_ZONE_END = 0.6

/** Course d'amorti des jambes utilisée pour estimer les G à l'impact. */
export const LANDING_ABSORPTION_DISTANCE = 0.6

/**
 * Repères issus de skijumpdesign (Levy et al.) : hauteur de chute équivalente visée,
 * et appui toléré dans la courbe du kick. Les seuils « durs » marquent l'alerte rouge.
 */
export const SAFE_FALL_HEIGHT = 0.5
export const HARD_FALL_HEIGHT = 1.5
export const COMFORT_KICK_G = 1.5
export const HARD_KICK_G = 3

/**
 * Chute. Au-delà de cette hauteur de chute équivalente, le skieur ne tient pas la réception : c'est
 * une estimation (les études visent 0,5 m et jugent 1,5 m déjà dur). Une fois à terre, il glisse
 * sur ses vêtements, bien plus freiné que sur ses skis, et offre plus de prise à l'air.
 */
export const CRASH_FALL_HEIGHT = 2.5
export const CRASH_FRICTION = 0.4
export const CRASH_DRAG_AREA = 0.7
/** Part de la vitesse le long de la pente qui reste après le choc d'une chute. */
export const CRASH_SPEED_KEPT = 0.7

export const MAX_KICKERS = 12

export interface Limit {
  readonly min: number
  readonly max: number
  readonly step: number
}

/**
 * Bornes de saisie, volontairement larges. Les seules imposées par la géométrie sont un angle
 * de sortie et un rayon de courbe strictement positifs ; les autres évitent seulement les
 * valeurs absurdes ou un profil trop lourd à afficher.
 */
export const KICKER_LIMITS: Readonly<Record<keyof KickerConfig, Limit>> = {
  inrunAngleDeg: { min: -15, max: 60, step: 0.5 },
  inrunLength: { min: 0, max: 600, step: 0.5 },
  flatLength: { min: 0, max: 150, step: 0.5 },
  transitionRadius: { min: 3, max: 150, step: 0.5 },
  takeoffAngleDeg: { min: 1, max: 75, step: 0.5 },
  kickerHeight: { min: 0.2, max: 30, step: 0.1 },
  deckDrop: { min: 0, max: 25, step: 0.1 },
  tableLength: { min: 0.5, max: 120, step: 0.5 },
  landingAngleDeg: { min: 0, max: 60, step: 0.5 },
  landingLength: { min: 2, max: 250, step: 0.5 },
}

export const RIDER_LIMITS = {
  mass: { min: 20, max: 200, step: 1 },
  equipmentMass: { min: 0, max: 40, step: 0.5 },
  friction: { min: 0, max: 0.5, step: 0.005 },
  dragArea: { min: 0, max: 2, step: 0.01 },
  dragAreaAir: { min: 0, max: 2, step: 0.01 },
  // Mesuré en Coupe du monde : de −2,3 (lèvre absorbée) à +2,2 m/s (Hoholm 2023).
  popSpeed: { min: -2.5, max: 2.5, step: 0.1 },
  startSpeed: { min: 0, max: 60, step: 0.5 },
} as const satisfies Record<string, Limit>

export const ENVIRONMENT_LIMITS = {
  altitude: { min: 0, max: 6000, step: 50 },
  headwind: { min: -30, max: 30, step: 0.5 },
} as const satisfies Record<string, Limit>

const BIG_KICKER: KickerConfig = {
  inrunAngleDeg: 25,
  inrunLength: 60,
  flatLength: 6,
  transitionRadius: 22,
  takeoffAngleDeg: 30,
  kickerHeight: 4.5,
  deckDrop: 1.5,
  tableLength: 18,
  landingAngleDeg: 36,
  landingLength: 28,
}

/**
 * Plus gros que le premier pour absorber la vitesse regagnée dans sa réception. Son élan reste en
 * pente : avec un frottement et une prise à l'air réalistes, un raccord presque plat ferait perdre
 * au skieur la vitesse dont il a besoin.
 */
const FOLLOWING_KICKER: KickerConfig = {
  ...BIG_KICKER,
  inrunAngleDeg: 22,
  inrunLength: 25,
  flatLength: 4,
  takeoffAngleDeg: 32,
  kickerHeight: 6.5,
  tableLength: 26,
  landingLength: 34,
}

export const DEFAULT_LINE: LineConfig = {
  kickers: [BIG_KICKER, FOLLOWING_KICKER],
  tricks: ['backflip', 'spin1080'],
  startSwitch: false,
  /**
   * Valeurs mesurées sur des freeskieurs : prise à l'air 0,63 m² en posture de glisse courante et
   * 0,44 m² en vol (Wolfsperger 2021, soufflerie), frottement moyen 0,05 sur 214 descentes
   * (Wolfsperger 2021 ; 0,023 à 0,139 selon la neige), équipement 16,7 kg (Löfquist 2020).
   */
  rider: {
    mass: 75,
    equipmentMass: 16.7,
    friction: 0.05,
    dragArea: 0.63,
    dragAreaAir: 0.44,
    popSpeed: 0,
    startSpeed: 0,
  },
  environment: { altitude: 2000, headwind: 0 },
}

/** Kicker ajouté par le bouton « Ajouter une bosse ». */
export const NEW_KICKER: KickerConfig = FOLLOWING_KICKER
/** Figure attribuée à une bosse qui n'en a pas : le saut droit. */
export const NEW_TRICK = 'straight'

function clamp(value: number, limit: Limit): number {
  if (!Number.isFinite(value)) return limit.min
  return Math.min(limit.max, Math.max(limit.min, value))
}

function clampRecord<T extends object>(values: T, limits: Record<keyof T, Limit>): T {
  const keys = Object.keys(limits) as (keyof T)[]
  return Object.fromEntries(keys.map((key) => [key, clamp(Number(values[key]), limits[key])])) as T
}

/** Ramène toutes les valeurs saisies dans leurs bornes. */
export function sanitizeLine(config: LineConfig): LineConfig {
  const kickers = config.kickers.slice(0, MAX_KICKERS)
  return {
    kickers: kickers.map((kicker) => clampRecord(kicker, KICKER_LIMITS)),
    startSwitch: config.startSwitch === true,
    tricks: kickers.map((_, index) => {
      const trick: unknown = config.tricks?.[index]
      return typeof trick === 'string' ? trick : NEW_TRICK
    }),
    rider: clampRecord(config.rider, RIDER_LIMITS),
    environment: clampRecord(config.environment, ENVIRONMENT_LIMITS),
  }
}

/** Masse volumique de l'air selon l'atmosphère standard internationale (troposphère). */
export function airDensity(altitude: number): number {
  return SEA_LEVEL_AIR_DENSITY * (1 - ISA_LAPSE_FACTOR * altitude) ** ISA_DENSITY_EXPONENT
}

/** Masse en mouvement : le skieur et tout ce qu'il porte. */
export function totalMass(config: LineConfig): number {
  return config.rider.mass + config.rider.equipmentMass
}

export function derivePhysics(config: LineConfig): PhysicsParams {
  const { rider, environment } = config
  const perArea = airDensity(environment.altitude) / (2 * totalMass(config))
  return {
    friction: rider.friction,
    drag: perArea * rider.dragArea,
    flightDrag: perArea * rider.dragAreaAir,
    headwind: environment.headwind,
  }
}
