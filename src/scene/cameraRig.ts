import * as THREE from 'three'
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { heightAt } from '../physics/terrain'
import type { Sample, Terrain } from '../physics/types'

/**
 * side : accompagne le skieur de profil, l'utilisateur peut tourner autour.
 * chase : derrière le skieur. tv : trépied fixe par bosse, avec zoom. free : caméra laissée à l'utilisateur.
 */
export type CameraMode = 'side' | 'chase' | 'tv' | 'free'

export const DEFAULT_FOV = 45

const FOCUS_HEIGHT = 1
/** Au-delà de cet écart (retour au départ, saut dans la frise), on recadre d'un coup au lieu de glisser. */
const SNAP_DISTANCE = 45

const SIDE_OFFSET = new THREE.Vector3(-10, 9, 46)
const SIDE_LOOKAHEAD_SECONDS = 0.25
const SIDE_RATE = 5

const CHASE_BACK = 13
const CHASE_UP = 5
const CHASE_SIDE = 3.5
const CHASE_AHEAD = 3
const CHASE_CLEARANCE = 2.2
const CHASE_RATE = 4
const HEADING_RATE = 3

const TV_DISTANCE = 32
const TV_HEIGHT = 5
const TV_BEFORE_KNUCKLE = 3
/** Demi-hauteur de scène gardée autour du skieur, en mètres : fixe le zoom du trépied. */
const TV_FRAME = 8
const TV_MIN_FOV = 9
const TV_MAX_FOV = 50
const TV_RATE = 6
const ZOOM_RATE = 2.5

/** Plans de la remontée en télésiège : au quai côté piste, puis un drone qui tourne autour du siège. */
const DOCK_OFFSET = new THREE.Vector3(-6, 3.5, 12)
const ARRIVAL_OFFSET = new THREE.Vector3(15, 5, 13)
/**
 * Azimut du drone autour de la verticale. Il part devant le siège côté piste, vient se placer
 * au-dessus de la ligne à mi-montée, puis revient côté piste. Il ne passe jamais côté forêt : les
 * pylônes et le brin descendant y défileraient devant le skieur.
 */
const DRONE_AZIMUTH_BASE = 2
const DRONE_AZIMUTH_SWING = Math.PI - DRONE_AZIMUTH_BASE
const DRONE_NEAR = 11
const DRONE_FAR = 19
const DRONE_LOW = 4
const DRONE_HIGH = 9.5
const SCENIC_RATE = 2.2
/** Durée du travelling qui ramène la caméra télé de la gare amont à son trépied, quand la descente repart. */
const HANDOFF_SECONDS = 1.8

/** Ce que la caméra doit suivre pendant la remontée en télésiège. */
export interface ScenicView {
  readonly focus: THREE.Vector3
  readonly phase: 'approach' | 'boarding' | 'ride' | 'unload'
  /** Avancement de la montée, de 0 à 1. */
  readonly rideProgress: number
}

/** Position de la caméra par rapport au skieur pendant la remontée, selon la phase. */
export function scenicOffset(
  phase: ScenicView['phase'],
  rideProgress: number,
  arrival: THREE.Vector3 = ARRIVAL_OFFSET,
): THREE.Vector3 {
  if (phase === 'unload') return arrival.clone()
  if (phase !== 'ride') return DOCK_OFFSET.clone()
  // Le drone s'éloigne et s'élève jusqu'à mi-parcours, puis revient cueillir l'arrivée en gare.
  const swell = Math.sin(Math.PI * rideProgress)
  const azimuth = DRONE_AZIMUTH_BASE + DRONE_AZIMUTH_SWING * swell
  const radius = THREE.MathUtils.lerp(DRONE_NEAR, DRONE_FAR, swell)
  return new THREE.Vector3(
    Math.cos(azimuth) * radius,
    THREE.MathUtils.lerp(DRONE_LOW, DRONE_HIGH, swell),
    Math.sin(azimuth) * radius,
  )
}

/** Rapproche une valeur de sa cible avec un lissage exponentiel indépendant de la cadence d'images. */
export function damp(current: number, target: number, rate: number, elapsed: number): number {
  return current + (target - current) * dampFactor(rate, elapsed)
}

/** Part du chemin vers la cible parcourue pendant `elapsed` secondes. */
export function dampFactor(rate: number, elapsed: number): number {
  return 1 - Math.exp(-rate * Math.max(0, elapsed))
}

/** Angle de champ vertical qui garde `halfHeight` mètres visibles autour d'un sujet à `distance`. */
export function fovToFrame(halfHeight: number, distance: number): number {
  const fov = THREE.MathUtils.radToDeg(2 * Math.atan(halfHeight / Math.max(distance, 1e-6)))
  return THREE.MathUtils.clamp(fov, TV_MIN_FOV, TV_MAX_FOV)
}

export interface CameraRig {
  readonly getMode: () => CameraMode
  readonly setMode: (mode: CameraMode) => void
  readonly update: (sample: Sample, terrain: Terrain, elapsed: number) => void
  /** Cadre la remontée en télésiège. En caméra libre, laisse la main à l'utilisateur. */
  readonly updateScenic: (view: ScenicView, elapsed: number) => void
}

export function createCameraRig(camera: THREE.PerspectiveCamera, controls: OrbitControls): CameraRig {
  let mode: CameraMode = 'side'
  let needsSnap = true
  let activeTripod = -1
  let scenic = false
  /** Écart caméra-skieur pendant la remontée : c'est lui qu'on lisse, pas la position de la caméra. */
  const scenicArm = new THREE.Vector3()
  /** Travelling de raccord après une remontée : d'où part la caméra et depuis combien de temps. */
  const handoffFrom = new THREE.Vector3()
  let handoffClock = Infinity
  const heading = new THREE.Vector3(1, 0, 0)
  const look = new THREE.Vector3()

  const setFov = (fov: number): void => {
    if (Math.abs(camera.fov - fov) < 1e-3) return
    camera.fov = fov
    camera.updateProjectionMatrix()
  }

  const updateSide = (focus: THREE.Vector3, sample: Sample, elapsed: number): void => {
    const desired = focus
      .clone()
      .add(new THREE.Vector3(sample.vx, sample.vy, 0).multiplyScalar(SIDE_LOOKAHEAD_SECONDS))
    const shift = desired.sub(controls.target)
    if (needsSnap) {
      controls.target.add(shift)
      camera.position.copy(controls.target).add(SIDE_OFFSET)
      return
    }
    if (shift.length() < SNAP_DISTANCE) shift.multiplyScalar(dampFactor(SIDE_RATE, elapsed))
    controls.target.add(shift)
    camera.position.add(shift)
  }

  const updateChase = (focus: THREE.Vector3, sample: Sample, terrain: Terrain, elapsed: number): void => {
    const direction =
      sample.speed > 1
        ? new THREE.Vector3(sample.vx, sample.vy, 0).normalize()
        : new THREE.Vector3(Math.cos(sample.tilt), Math.sin(sample.tilt), 0)
    const snap = needsSnap || camera.position.distanceTo(focus) > SNAP_DISTANCE
    heading.lerp(direction, snap ? 1 : dampFactor(HEADING_RATE, elapsed)).normalize()

    const desired = new THREE.Vector3(
      focus.x - heading.x * CHASE_BACK,
      focus.y + CHASE_UP - heading.y * CHASE_BACK * 0.4,
      CHASE_SIDE,
    )
    desired.y = Math.max(desired.y, heightAt(terrain, desired.x) + CHASE_CLEARANCE)
    const ahead = focus.clone().addScaledVector(heading, CHASE_AHEAD)

    camera.position.lerp(desired, snap ? 1 : dampFactor(CHASE_RATE, elapsed))
    look.lerp(ahead, snap ? 1 : dampFactor(CHASE_RATE, elapsed))
    camera.lookAt(look)
    controls.target.copy(look)
  }

  const updateTv = (focus: THREE.Vector3, sample: Sample, terrain: Terrain, elapsed: number): void => {
    const marks = terrain.kickers[sample.kicker]
    if (!marks) return
    // Au retour d'une remontée, pas de coupe : la caméra rejoint son trépied en travelling.
    const returning = handoffClock < HANDOFF_SECONDS
    const cut = !returning && (needsSnap || activeTripod !== sample.kicker)
    activeTripod = sample.kicker
    if (cut) look.copy(focus)
    // Le trépied est recalé à chaque image : il suit la bosse quand on en change la géométrie.
    camera.position.set(marks.knuckleStartX - TV_BEFORE_KNUCKLE, marks.lipY + TV_HEIGHT, TV_DISTANCE)
    if (returning) camera.position.lerpVectors(handoffFrom, camera.position, THREE.MathUtils.smootherstep(handoffClock, 0, HANDOFF_SECONDS))
    look.lerp(focus, dampFactor(TV_RATE, elapsed))
    camera.lookAt(look)
    controls.target.copy(look)

    const target = fovToFrame(TV_FRAME, camera.position.distanceTo(focus))
    setFov(cut ? target : damp(camera.fov, target, ZOOM_RATE, elapsed))
  }

  /** Écart caméra-skieur que prendra la caméra active au départ de la descente. */
  const arrivalArm = (): THREE.Vector3 => {
    if (mode === 'side') return SIDE_OFFSET
    if (mode === 'chase') return new THREE.Vector3(-CHASE_BACK, CHASE_UP, CHASE_SIDE)
    return ARRIVAL_OFFSET
  }

  return {
    getMode: () => mode,
    setMode: (next: CameraMode): void => {
      if (next === mode) return
      mode = next
      needsSnap = true
      activeTripod = -1
      handoffClock = Infinity
      controls.enabled = next === 'side' || next === 'free'
      if (next !== 'tv') setFov(DEFAULT_FOV)
    },
    updateScenic: (view: ScenicView, elapsed: number): void => {
      if (mode === 'free') return
      // La caméra est attachée au skieur : seul son écart à lui est lissé. Lisser sa position ferait
      // traîner la caméra loin derrière dès que le siège va vite, sur une longue ligne.
      if (!scenic) scenicArm.subVectors(camera.position, view.focus)
      scenic = true
      setFov(damp(camera.fov, DEFAULT_FOV, ZOOM_RATE, elapsed))
      // Au débarquement, la caméra vient se placer là où la descente la reprendra : le raccord est invisible.
      scenicArm.lerp(scenicOffset(view.phase, view.rideProgress, arrivalArm()), dampFactor(SCENIC_RATE, elapsed))
      camera.position.copy(view.focus).add(scenicArm)
      camera.lookAt(view.focus)
      look.copy(view.focus)
      controls.target.copy(view.focus)
    },
    update: (sample: Sample, terrain: Terrain, elapsed: number): void => {
      // Au retour d'une remontée, aucune coupe : chaque caméra enchaîne depuis là où le débarquement l'a laissée.
      if (scenic) {
        scenic = false
        handoffFrom.copy(camera.position)
        handoffClock = 0
      }
      handoffClock += elapsed
      if (mode === 'free') return
      const focus = new THREE.Vector3(sample.x, sample.y + FOCUS_HEIGHT, 0)
      if (mode === 'side') updateSide(focus, sample, elapsed)
      else if (mode === 'chase') updateChase(focus, sample, terrain, elapsed)
      else updateTv(focus, sample, terrain, elapsed)
      needsSnap = false
    },
  }
}
