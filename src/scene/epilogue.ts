import type { Sample } from '../physics/types'
import { GATE_BACK, HANG_LENGTH, LANE_LENGTH, type LiftLine, cableAt } from './liftLine'
import { type CourseShape, surfaceHeightAt } from './terrainShape'

/** Durée de la remontée, à peu près constante : le câble accélère d'autant plus que la piste est longue. */
export const RIDE_SECONDS = 12
/** Vitesse du câble hors remontée du skieur, en m/s : celle d'un télésiège en gare. */
const IDLE_CHAIR_SPEED = 2.5
/**
 * Freinage que tient un bon skieur en dérapage, en m/s² : il fixe la longueur de plat final dont il a
 * besoin pour s'arrêter au quai. Plus il arrive vite, plus il commence tôt.
 */
const BRAKE_DECELERATION = 7
const MIN_APPROACH_RUN = 22
const APPROACH_MARGIN = 8
/** Ligne droite gardée avant de jeter les skis en travers. */
const LEAD_IN = 6
const MIN_SKATE_SECONDS = 2.5
/** En dessous de cette vitesse, le skieur n'a plus assez d'élan pour déraper : il rejoint la gare en poussant. */
const GLIDE_SPEED = 6
const SKATE_SPEED = 5
const MAX_SKATE_SECONDS = 20
/** Attente au quai avant le passage du siège, puis temps pour s'asseoir de part et d'autre de ce passage. */
const GATE_WAIT_SECONDS = 0.5
/** Durée du battement du portillon, puis de l'avancée du skieur du portillon au quai. */
const GATE_SWING_SECONDS = 0.35
const ADVANCE_SECONDS = 1.6
/** Attente sur la ligne d'embarquement : le siège finit le tour de la poulie et arrive dans son dos. */
const SETTLE_SECONDS = 1.8
/** Le garde-corps se baisse peu après le départ et se relève peu avant l'arrivée. */
const BAR_DELAY_SECONDS = 0.7
const BAR_SWING_SECONDS = 0.9
const BAR_LIFT_BEFORE_SECONDS = 1.8
const SIT_LEAD = 0.2
const SIT_FOLLOW = 0.4
const STAND_SECONDS = 0.5
/** Vitesse de glisse de la gare amont au départ, et bornes de la durée de ce trajet. */
const UNLOAD_SPEED = 6
const MIN_UNLOAD_SECONDS = 3
const MAX_UNLOAD_SECONDS = 8
/**
 * Freinage en dérapage. Les skis passent en travers juste avant que la trajectoire ne s'incurve
 * (fractions de la courbe, la première négative = encore en ligne droite) et reviennent dans l'axe
 * quand il ne reste presque plus d'élan.
 */
const SLIDE_FROM = -0.04
const SLIDE_FULL = 0.1
const SLIDE_RELEASE = 0.2
const SLIDE_ANGLE = 1.4
/** Le demi-tour s'achève cette distance avant l'entrée du couloir, et les skis sont remis dans l'axe sur les derniers mètres de la courbe. */
const LANE_RUN_UP = 1.5
const SLIDE_RECOVERY = 4
/** Vitesse à laquelle il sort de son dérapage pour s'engager dans le couloir : au plus cette part de son élan, et pas plus vite que le pas. */
const LANE_SPEED_RATIO = 0.25
const MAX_LANE_SPEED = 5
/** Inclinaison maximale du corps vers l'intérieur du virage, en radians, et flexion ajoutée pour encaisser. */
const SLIDE_LEAN = 0.5
const SLIDE_CROUCH = 0.35
/** Part finale du débarquement où le skieur pivote face à la pente. */
const ALIGN_FROM = 0.6
const PATH_SAMPLES = 32
const SPEED_PROBE = 0.02

export type EpiloguePhase = 'approach' | 'boarding' | 'ride' | 'unload'

/** Position du bassin par rapport aux pieds en posture assise : vers l'avant et vers le haut, en mètres. */
export interface SeatOffset {
  readonly forward: number
  readonly up: number
}

interface PathPoint {
  readonly x: number
  readonly y: number
  readonly z: number
  readonly distance: number
}

/** Chemin au sol suivi skis aux pieds. */
interface Path {
  readonly points: readonly PathPoint[]
  readonly length: number
}

export interface EpiloguePlan {
  readonly shape: CourseShape
  readonly line: LiftLine
  readonly seat: SeatOffset
  /** Instant de la descente où l'épilogue prend la main. */
  readonly handover: number
  readonly approachEnd: number
  readonly rideStart: number
  readonly rideEnd: number
  readonly duration: number
  /** Vitesse du câble en gare, et sa vitesse de pointe au milieu de la remontée. */
  readonly idleSpeed: number
  readonly peakSpeed: number
  readonly approach: Path
  /** Part du chemin de sortie parcourue tout droit, avant le dérapage. */
  readonly leadLength: number
  /** Distance, sur le chemin de sortie, où finit le demi-tour : au-delà, il file droit dans le couloir. */
  readonly turnEnd: number
  /** Vitesse qu'il lui reste à la fin du dérapage, à l'entrée du couloir. */
  readonly laneSpeed: number
  readonly unload: Path
  readonly unloadSeconds: number
  readonly entrySpeed: number
  /** Inclinaison du skieur au départ de la descente, qu'il retrouve en fin de débarquement. */
  readonly startTilt: number
}

export interface EpilogueState {
  readonly phase: EpiloguePhase
  /** Position des pieds du skieur. */
  readonly x: number
  readonly y: number
  readonly z: number
  /** Cap autour de la verticale : 0 = face à la pente, π = face à la montée. */
  readonly yaw: number
  readonly tilt: number
  /** Cap de son déplacement : en dérapage, il n'est plus celui des skis. */
  readonly heading: number
  /** De 0 (skis dans l'axe) à 1 (skis en travers, en plein dérapage). */
  readonly slide: number
  /** Inclinaison latérale du corps en radians, vers l'intérieur du virage pendant le dérapage. */
  readonly lean: number
  /** Flexion ajoutée pour encaisser le freinage, de 0 à 1. */
  readonly crouch: number
  /** Force de la gerbe de neige soulevée par les carres, de 0 à 1. */
  readonly spray: number
  /** De 0 (debout sur ses skis) à 1 (assis sur le siège). */
  readonly seated: number
  readonly speed: number
  readonly height: number
  /** Avancement de la remontée, de 0 à 1. */
  readonly rideProgress: number
}

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value))
const mix = (from: number, to: number, ratio: number): number => from + (to - from) * ratio

function smoothstep(ratio: number): number {
  const x = clamp(ratio, 0, 1)
  return x * x * (3 - 2 * x)
}

/** Interpole entre deux caps par le plus court chemin. */
function mixAngle(from: number, to: number, ratio: number): number {
  const turn = Math.atan2(Math.sin(to - from), Math.cos(to - from))
  return from + turn * ratio
}

type Flat = readonly [x: number, z: number]

/** Courbe de Bézier cubique vue de dessus, échantillonnée d'un bout à l'autre. */
function bezier([start, pull, push, end]: readonly [Flat, Flat, Flat, Flat]): Flat[] {
  return Array.from({ length: PATH_SAMPLES + 1 }, (_, i) => {
    const t = i / PATH_SAMPLES
    const weights = [(1 - t) ** 3, 3 * (1 - t) ** 2 * t, 3 * (1 - t) * t * t, t ** 3]
    const at = (axis: 0 | 1): number =>
      weights[0] * start[axis] + weights[1] * pull[axis] + weights[2] * push[axis] + weights[3] * end[axis]
    return [at(0), at(1)]
  })
}

/** Tracé vu de dessus, posé sur la neige et mesuré en distance parcourue. */
function groundPath(shape: CourseShape, flats: readonly Flat[]): Path {
  let distance = 0
  const points: PathPoint[] = []
  flats.forEach(([x, z]) => {
    const y = surfaceHeightAt(shape, x, z)
    const previous = points[points.length - 1]
    if (previous) distance += Math.hypot(x - previous.x, y - previous.y, z - previous.z)
    points.push({ x, y, z, distance })
  })
  return { points, length: distance }
}

/** Point d'un chemin et cap de sa tangente, à une distance donnée de son début. */
function alongPath(path: Path, distance: number): { x: number; y: number; z: number; yaw: number } {
  const { points } = path
  const clamped = clamp(distance, 0, path.length)
  const next = Math.max(1, points.findIndex((point) => point.distance >= clamped))
  const a = points[next - 1]
  const b = points[next]
  const ratio = (clamped - a.distance) / (b.distance - a.distance || 1)
  return {
    x: mix(a.x, b.x, ratio),
    y: mix(a.y, b.y, ratio),
    z: mix(a.z, b.z, ratio),
    yaw: Math.atan2(-(b.z - a.z), b.x - a.x),
  }
}

/**
 * Échantillon où l'épilogue prend la main : assez tôt dans le plat final pour que le skieur ait la
 * place de s'arrêter en dérapage, tant qu'il y est au sol. S'il s'est arrêté avant, c'est son point d'arrêt.
 */
function handoverSample(samples: readonly Sample[], lastX: number): Sample {
  let index = samples.length - 1
  const stopping = samples[index].speed ** 2 / (2 * BRAKE_DECELERATION)
  const run = Math.max(MIN_APPROACH_RUN, stopping + LEAD_IN + APPROACH_MARGIN)
  while (index > 0 && samples[index - 1].kind !== 'air' && samples[index - 1].x >= lastX - run) index--
  return samples[index]
}

/**
 * Prépare la remontée : virage du plat final vers la gare aval, attente du siège, montée, puis
 * glisse de la gare amont jusqu'au départ. Tout se déduit de la piste et de la descente simulée.
 */
export function planEpilogue(
  shape: CourseShape,
  line: LiftLine,
  samples: readonly Sample[],
  seat: SeatOffset,
): EpiloguePlan {
  const first = samples[0]
  const lastX = shape.terrain.points[shape.terrain.points.length - 1].x
  const entry = handoverSample(samples, lastX)

  const gliding = entry.speed > GLIDE_SPEED
  // Avec de l'élan, il file droit puis dérape : la courbe ne commence qu'après la ligne droite.
  // Le portillon est en aval de la gare : il dépasse la gare, fait demi-tour et s'y présente face à la montée.
  const gateX = line.bottom.x + GATE_BACK
  // Le demi-tour finit avant l'entrée du couloir : il s'y engage droit, entre les barrières.
  const laneX = gateX + LANE_LENGTH + LANE_RUN_UP
  const curveX = gliding ? Math.min(entry.x + LEAD_IN, laneX) : entry.x
  const curve = bezier([
    [curveX, 0],
    [Math.max(curveX + 2, laneX + 5), 0],
    [Math.min(laneX + 6, lastX - 2), line.z],
    [laneX, line.z],
  ])
  const flats: Flat[] = [...(gliding ? [[entry.x, 0] as const] : []), ...curve, [gateX, line.z]]
  const approach = groundPath(shape, flats)
  const leadLength = gliding ? approach.points[1].distance : 0
  const turnEnd = approach.points[approach.points.length - 2].distance
  // La gare amont est sur la plateforme, au-dessus du départ : il en sort en travers et se laisse glisser.
  const unload = groundPath(
    shape,
    bezier([
      [line.top.x, line.z],
      [line.top.x + 1, line.z * 0.55],
      [mix(line.top.x, first.x, 0.55), 0],
      [first.x, 0],
    ]),
  )
  const unloadSeconds = clamp(unload.length / UNLOAD_SPEED, MIN_UNLOAD_SECONDS, MAX_UNLOAD_SECONDS)

  // Ligne droite à pleine vitesse, gros freinage en dérapage jusqu'au couloir, puis il s'y laisse mourir.
  const laneSpeed = Math.min(entry.speed * LANE_SPEED_RATIO, MAX_LANE_SPEED)
  const approachSeconds = gliding
    ? leadLength / entry.speed +
      (2 * (turnEnd - leadLength)) / (entry.speed + laneSpeed) +
      (2 * (approach.length - turnEnd)) / laneSpeed
    : clamp(approach.length / SKATE_SPEED, MIN_SKATE_SECONDS, MAX_SKATE_SECONDS)
  const idleSpeed = Math.min(IDLE_CHAIR_SPEED, line.length / RIDE_SECONDS)
  const rideStart = approachSeconds + GATE_WAIT_SECONDS + ADVANCE_SECONDS + SETTLE_SECONDS
  const rideEnd = rideStart + RIDE_SECONDS

  return {
    shape,
    line,
    seat,
    handover: entry.t,
    approachEnd: approachSeconds,
    rideStart,
    rideEnd,
    duration: rideEnd + unloadSeconds,
    idleSpeed,
    peakSpeed: Math.max(entry.speed, idleSpeed + (2 * (line.length - idleSpeed * RIDE_SECONDS)) / RIDE_SECONDS),
    approach,
    leadLength,
    turnEnd,
    laneSpeed,
    unload,
    unloadSeconds,
    entrySpeed: gliding ? entry.speed : 0,
    startTilt: first.tilt,
  }
}

/**
 * Distance parcourue sur le câble par le siège du skieur : nulle à l'embarquement, égale à la longueur
 * de la ligne à l'arrivée. Hors remontée, le câble tourne au ralenti ; pendant, il accélère puis ralentit.
 */
export function chairTravelAt(plan: EpiloguePlan, t: number): number {
  const { rideStart, rideEnd, idleSpeed, line } = plan
  if (t <= rideStart) return idleSpeed * (t - rideStart)
  if (t >= rideEnd) return line.length + idleSpeed * (t - rideEnd)
  const progress = (t - rideStart) / RIDE_SECONDS
  const cruise = idleSpeed * RIDE_SECONDS
  return cruise * progress + (line.length - cruise) * (progress - Math.sin(2 * Math.PI * progress) / (2 * Math.PI))
}

/** Où en est la sortie à l'instant t : distance parcourue et part de l'élan d'arrivée qu'il reste. */
function approachProgress(plan: EpiloguePlan, time: number): { distance: number; momentum: number } {
  const t = clamp(time, 0, plan.approachEnd)
  const { length } = plan.approach
  if (plan.entrySpeed === 0) return { distance: length * smoothstep(t / plan.approachEnd), momentum: 0 }
  // Tout droit sans perdre de vitesse ; le dérapage dissipe l'essentiel de l'élan ; le reste meurt dans le couloir.
  const { entrySpeed, laneSpeed, leadLength, turnEnd } = plan
  const straightSeconds = leadLength / entrySpeed
  if (t <= straightSeconds) return { distance: entrySpeed * t, momentum: 1 }
  const slideSeconds = (2 * (turnEnd - leadLength)) / (entrySpeed + laneSpeed)
  const sliding = t - straightSeconds
  if (sliding <= slideSeconds) {
    const speed = entrySpeed + (laneSpeed - entrySpeed) * (sliding / slideSeconds)
    return { distance: leadLength + ((entrySpeed + speed) / 2) * sliding, momentum: speed / entrySpeed }
  }
  const laneSeconds = plan.approachEnd - straightSeconds - slideSeconds
  const coasting = sliding - slideSeconds
  const speed = laneSpeed * (1 - coasting / laneSeconds)
  return { distance: turnEnd + ((laneSpeed + speed) / 2) * coasting, momentum: speed / entrySpeed }
}

interface Placement {
  readonly x: number
  readonly y: number
  readonly z: number
  readonly yaw: number
  readonly tilt: number
  readonly heading: number
  readonly slide: number
  readonly lean: number
  readonly crouch: number
  readonly spray: number
}

const NO_SLIDE = { slide: 0, lean: 0, crouch: 0, spray: 0 }

/**
 * Part des skis en travers à cet instant de la sortie. Le dérapage commence à la fin de la ligne
 * droite — c'est lui qui incurve la trajectoire — et se relâche quand l'élan est presque dissipé.
 */
function slideAmount(plan: EpiloguePlan, distance: number, momentum: number): number {
  if (plan.entrySpeed === 0) return 0
  const curveProgress = (distance - plan.leadLength) / (plan.turnEnd - plan.leadLength)
  const recovered = smoothstep((distance - (plan.turnEnd - SLIDE_RECOVERY)) / SLIDE_RECOVERY)
  return (
    smoothstep((curveProgress - SLIDE_FROM) / (SLIDE_FULL - SLIDE_FROM)) * smoothstep(momentum / SLIDE_RELEASE) * (1 - recovered)
  )
}

/** Du portillon au quai : il attend l'ouverture, pousse jusqu'à la ligne d'embarquement et s'y tient prêt. */
function atPlatform(plan: EpiloguePlan, t: number): Placement {
  const advanced = smoothstep((t - plan.approachEnd - GATE_WAIT_SECONDS) / ADVANCE_SECONDS)
  const x = mix(plan.line.bottom.x + GATE_BACK, plan.line.bottom.x, advanced)
  const z = plan.line.z
  return { x, y: surfaceHeightAt(plan.shape, x, z), z, yaw: Math.PI, heading: Math.PI, tilt: 0, ...NO_SLIDE }
}

/** Ouverture du portillon d'embarquement, de 0 (fermé) à 1 : il ne s'ouvre que pour laisser passer le skieur. */
export function gateOpenAt(plan: EpiloguePlan, t: number): number {
  const opensAt = plan.approachEnd + GATE_WAIT_SECONDS - GATE_SWING_SECONDS
  const closesAt = plan.approachEnd + GATE_WAIT_SECONDS + ADVANCE_SECONDS
  return smoothstep((t - opensAt) / GATE_SWING_SECONDS) * (1 - smoothstep((t - closesAt) / GATE_SWING_SECONDS))
}

/** Garde-corps du siège du skieur, de 0 (relevé) à 1 (baissé) : baissé pendant la montée seulement. */
export function barDownAt(plan: EpiloguePlan, t: number): number {
  const lowered = smoothstep((t - plan.rideStart - BAR_DELAY_SECONDS) / BAR_SWING_SECONDS)
  const raised = smoothstep((t - (plan.rideEnd - BAR_LIFT_BEFORE_SECONDS)) / BAR_SWING_SECONDS)
  return lowered * (1 - raised)
}

/** Où se tiendrait le skieur skis aux pieds à cet instant : sur le chemin de sortie, au quai, ou en haut. */
function standing(plan: EpiloguePlan, t: number): Placement {
  // Pendant la montée, ce repère ne sert qu'aux transitions : quai aval d'abord, quai amont ensuite.
  if (t < (plan.rideStart + plan.rideEnd) / 2) {
    if (t >= plan.approachEnd) return atPlatform(plan, t)
    const { distance, momentum } = approachProgress(plan, t)
    const spot = alongPath(plan.approach, distance)
    const slide = slideAmount(plan, distance, momentum)
    return {
      ...spot,
      heading: spot.yaw,
      // Le virage part vers le télésiège : les skis pivotent du même côté, le corps se couche à l'intérieur.
      yaw: spot.yaw + SLIDE_ANGLE * slide,
      tilt: 0,
      slide,
      // Négatif : il se couche à l'opposé de sa glisse, sur ses carres amont.
      lean: -SLIDE_LEAN * slide * Math.sqrt(momentum),
      crouch: SLIDE_CROUCH * slide,
      spray: slide * momentum,
    }
  }
  const progress = clamp((t - plan.rideEnd) / plan.unloadSeconds, 0, 1)
  const spot = alongPath(plan.unload, plan.unload.length * smoothstep(progress))
  const aligned = smoothstep((progress - ALIGN_FROM) / (1 - ALIGN_FROM))
  return { ...spot, ...NO_SLIDE, heading: spot.yaw, yaw: mixAngle(spot.yaw, 0, aligned), tilt: plan.startTilt * aligned }
}

/** Où sont les pieds du skieur assis : sous le siège, bassin sur l'assise, face à la montée. */
function sitting(plan: EpiloguePlan, t: number): Placement {
  const cable = cableAt(plan.line, chairTravelAt(plan, t))
  return {
    x: cable.x + plan.seat.forward,
    y: cable.y - HANG_LENGTH - plan.seat.up,
    z: plan.line.z,
    yaw: Math.PI,
    tilt: 0,
    heading: Math.PI,
    ...NO_SLIDE,
  }
}

function seatedAmount(plan: EpiloguePlan, t: number): number {
  const sitDown = smoothstep((t - (plan.rideStart - SIT_LEAD)) / (SIT_LEAD + SIT_FOLLOW))
  const standUp = 1 - smoothstep((t - plan.rideEnd) / STAND_SECONDS)
  return Math.min(sitDown, standUp)
}

function placement(plan: EpiloguePlan, t: number): Placement & { seated: number } {
  const seated = seatedAmount(plan, t)
  const feet = standing(plan, t)
  if (seated === 0) return { ...feet, seated }
  const seat = sitting(plan, t)
  return {
    x: mix(feet.x, seat.x, seated),
    y: mix(feet.y, seat.y, seated),
    z: mix(feet.z, seat.z, seated),
    yaw: mixAngle(feet.yaw, seat.yaw, seated),
    tilt: mix(feet.tilt, seat.tilt, seated),
    heading: mixAngle(feet.heading, seat.heading, seated),
    ...NO_SLIDE,
    seated,
  }
}

function phaseAt(plan: EpiloguePlan, t: number): EpiloguePhase {
  if (t < plan.approachEnd) return 'approach'
  if (t < plan.rideStart) return 'boarding'
  return t < plan.rideEnd ? 'ride' : 'unload'
}

/** État du skieur t secondes après la fin de la descente. Fonction pure du temps : pause et reprise sont gratuites. */
export function epilogueAt(plan: EpiloguePlan, time: number): EpilogueState {
  const t = clamp(time, 0, plan.duration)
  const now = placement(plan, t)
  // Aux deux bouts de l'épilogue, la fenêtre de mesure est tronquée : on divise par sa durée réelle.
  const from = Math.max(0, t - SPEED_PROBE)
  const to = Math.min(plan.duration, t + SPEED_PROBE)
  const before = placement(plan, from)
  const after = placement(plan, to)
  const moved = Math.hypot(after.x - before.x, after.y - before.y, after.z - before.z)
  return {
    ...now,
    phase: phaseAt(plan, t),
    speed: moved / (to - from),
    height: Math.max(0, now.y - surfaceHeightAt(plan.shape, now.x, now.z)),
    rideProgress: clamp((t - plan.rideStart) / RIDE_SECONDS, 0, 1),
  }
}
