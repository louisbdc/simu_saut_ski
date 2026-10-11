import * as THREE from 'three'
import type { Sample, SimulationResult } from '../physics/types'
import { type Chairlift, buildChairlift } from './chairlift'
import { type BodyPose, ridePose } from './choreography'
import {
  type EpiloguePhase,
  type EpiloguePlan,
  type EpilogueState,
  type SeatOffset,
  epilogueAt,
  planEpilogue,
} from './epilogue'
import { type LiftLine, buildLiftLine } from './liftLine'
import { revealable } from './reveal'
import { markShared } from './sharedAssets'
import { solveJoints } from './skeleton'
import { buildCourseShape } from './terrainShape'

/** Flexion du skieur debout hors de la descente, quand il glisse tranquillement vers une gare. */
const CRUISE_FLEX = 0.2
/** Assis : cuisses à l'horizontale, tibias pendants, buste redressé, mains sur les genoux. */
const SEATED_TUCK = 0.72
const SEATED_LEAN = -0.38
/** Hauteur du bassin au-dessus de la planche du siège. */
const SEAT_PADDING = 0.14

/** Marque laissée par le dérapage : pas de temps du relevé, seuil de dérapage, largeur dans l'axe et skis en travers. */
const SKID_STEP = 0.03
const SKID_THRESHOLD = 0.2
const SKID_NARROW = 0.3
const SKID_WIDE = 1.7
const SKID_LIFT = 0.04
const SKID_MATERIAL = markShared(new THREE.MeshBasicMaterial({ color: 0xbfcee2, side: THREE.DoubleSide }))

/**
 * Vitesse affichée pendant la montée, en m/s : celle d'un vrai télésiège. La montée est un accéléré
 * (toujours une douzaine de secondes), afficher la vitesse du plan n'aurait aucun sens.
 */
export const LIFT_DISPLAY_SPEED = 5

const EPILOGUE_LABELS: Readonly<Record<EpiloguePhase, string>> = {
  approach: 'Retour vers le télésiège',
  boarding: 'Embarquement',
  ride: 'Télésiège',
  unload: 'Retour au départ',
}

/** Remontée de la piste affichée : sa chronologie et le télésiège qui la porte. */
export interface LiftRide {
  readonly line: LiftLine
  readonly plan: EpiloguePlan
  readonly chairlift: Chairlift
  /** Neige raclée par le dérapage de freinage ; absente quand le skieur arrive sans élan. */
  readonly skid: THREE.Mesh | null
}

/**
 * Posture du skieur entre debout sur ses skis (0) et assis sur le siège (1). `crouch` ajoute la
 * flexion d'un freinage en dérapage : il s'écrase sur ses jambes pour encaisser.
 */
export function seatedPosture(seated: number, crouch = 0): BodyPose {
  const standing = ridePose((CRUISE_FLEX + crouch) * (1 - seated))
  return {
    ...standing,
    tuck: SEATED_TUCK * seated,
    lean: SEATED_LEAN * seated,
    arms: { ...standing.arms, ride: 1 - seated, knees: seated },
  }
}

/** Où tombe le bassin du skieur assis par rapport à ses pieds : c'est lui qu'on pose sur le siège. */
export function seatOffset(): SeatOffset {
  const { pelvis } = solveJoints(seatedPosture(1))
  return { forward: pelvis.x, up: pelvis.y - SEAT_PADDING }
}

/** Construit le télésiège de la piste simulée et prépare la remontée qui suit la descente. */
export function buildLiftRide(result: SimulationResult): LiftRide {
  const shape = buildCourseShape(result.terrain)
  const line = buildLiftLine(shape)
  const plan = planEpilogue(shape, line, result.samples, seatOffset())
  const chairlift = buildChairlift(line)
  const skid = skidMark(plan)
  if (skid) chairlift.object.add(skid)
  return { line, plan, chairlift, skid }
}

/**
 * Marque du dérapage : un ruban qui suit la trajectoire du freinage, d'autant plus large que les skis
 * sont en travers. Il se dévoile au passage du skieur, au temps compté depuis la fin de la descente.
 */
function skidMark(plan: EpiloguePlan): THREE.Mesh | null {
  const count = Math.ceil(plan.approachEnd / SKID_STEP)
  const states = Array.from({ length: count + 1 }, (_, i) => {
    const time = Math.min(i * SKID_STEP, plan.approachEnd)
    return { time, state: epilogueAt(plan, time) }
  }).filter(({ state }) => state.slide > SKID_THRESHOLD)
  if (states.length < 2) return null

  const positions = states.flatMap(({ state }) => {
    const half = (SKID_NARROW + (SKID_WIDE - SKID_NARROW) * state.slide) / 2
    // Le ruban s'étale de part et d'autre de la trajectoire, perpendiculairement à la glisse.
    const acrossX = Math.sin(state.heading) * half
    const acrossZ = Math.cos(state.heading) * half
    const y = state.y + SKID_LIFT
    return [state.x - acrossX, y, state.z - acrossZ, state.x + acrossX, y, state.z + acrossZ]
  })
  const indices = states.slice(1).flatMap((_, i) => {
    const a = i * 2
    return [a, a + 1, a + 2, a + 1, a + 3, a + 2]
  })
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  return revealable(
    new THREE.Mesh(geometry, SKID_MATERIAL),
    states.map(({ time }) => time),
    6,
  )
}

/** Ce que fait le skieur à cet instant de la remontée, pour le compteur. */
export function liftLabel(state: EpilogueState): string {
  if (state.phase !== 'ride') return EPILOGUE_LABELS[state.phase]
  const factor = Math.round(state.speed / LIFT_DISPLAY_SPEED)
  return factor > 1 ? `${EPILOGUE_LABELS.ride}, accéléré ×${factor}` : EPILOGUE_LABELS.ride
}

/** Échantillon équivalent à l'état de la remontée, pour le skieur et le compteur qui lisent des échantillons. */
export function liftSample(state: EpilogueState, time: number, kicker: number): Sample {
  const speed = state.phase === 'ride' ? LIFT_DISPLAY_SPEED : state.speed
  return {
    t: time,
    x: state.x,
    y: state.y,
    vx: speed * Math.cos(state.yaw),
    vy: 0,
    speed,
    gLoad: 1,
    height: state.height,
    tilt: state.tilt,
    airProgress: 0,
    kind: 'runout',
    kicker,
  }
}
