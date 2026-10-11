import * as THREE from 'three'
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { heightAt } from '../physics/terrain'
import type { Terrain } from '../physics/types'
import type { GazeKind } from '../tutorials/beats'
import { PHASE_SHOTS, cuesFor, ease, nearestTurn, shotOffset, type CueKind } from '../tutorials/direction'
import type { PhaseId } from '../tutorials/phases'
import type { RagdollPoints } from './ragdoll'

/** Ce que la figure fait tourner, et dans quel sens le skieur du moteur tourne. */
export interface StageTrick {
  readonly spins: number
  readonly flips: number
  readonly spinSign: 1 | -1
  readonly flipSign: 1 | -1
}

export interface StageFrame {
  readonly phase: PhaseId
  readonly playing: boolean
  /** La caméra de tuto a la main ; sinon seuls les repères sont mis à jour. */
  readonly cinematic: boolean
  /** Temps réel écoulé depuis l'image précédente, en secondes. */
  readonly elapsed: number
  readonly points: RagdollPoints | null
  readonly camera: THREE.PerspectiveCamera
  readonly controls: OrbitControls
  readonly terrain: Terrain
  /** Où va le regard à cet instant ; `null` : celui que l'étape montre par défaut. */
  readonly gaze: GazeKind | null
  /** Part de la largeur de l'écran masquée à droite par le panneau d'explications. */
  readonly sideShare: number
}

export interface TutorialStage {
  /** Repères à ajouter à la scène. */
  readonly object: THREE.Group
  readonly setTrick: (trick: StageTrick) => void
  /** Cache les repères et oublie le plan en cours : la prochaine image recadre d'un coup. */
  readonly reset: () => void
  readonly frame: (frame: StageFrame) => void
}

const COLORS: Readonly<Record<'spin' | 'flip' | 'push' | 'load' | 'gaze', number>> = {
  spin: 0xffc93c,
  flip: 0xff7a1a,
  push: 0x2fbf71,
  load: 0x3d9bff,
  gaze: 0xff3d8b,
}
const Y_AXIS = new THREE.Vector3(0, 1, 0)
const Z_AXIS = new THREE.Vector3(0, 0, 1)
/** Les flèches de rotation couvrent trois quarts de tour et défilent dans le sens de la rotation. */
const ARC = 1.5 * Math.PI
const ARC_FLOW = 2.4
const SPIN_RADIUS = 0.8
const FLIP_RADIUS = 1.15
const TUBE = 0.045
/** Flèches droites : longueur de la tige, amplitude et cadence du va-et-vient. */
const SHAFT = 0.6
const BOUNCE = 0.22
const BOUNCE_RATE = 6
const TARGET_RADIUS = 0.7
const GAZE_RADIUS = 0.02
/** Longueur de la ligne de regard quand elle ne vise pas un point de la piste, en mètres. */
const GAZE_REACH = 5
/** Réactivité de la caméra : changement de plan, puis suivi du skieur. */
const SHOT_RATE = 2.4
const FOCUS_RATE = 14
const FIELD_OF_VIEW = 42
/** La caméra reste au moins à cette hauteur au-dessus de la neige. */
const GROUND_CLEARANCE = 0.8

const material = (color: number, opacity = 1): THREE.MeshBasicMaterial =>
  new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, fog: false })

function cone(color: number): THREE.Mesh {
  return new THREE.Mesh(new THREE.ConeGeometry(TUBE * 3.2, TUBE * 8, 14), material(color))
}

/** Flèche courbe autour de l'axe z, dans le sens direct. */
function arcArrow(radius: number, color: number): THREE.Group {
  const tip = cone(color)
  tip.position.set(Math.cos(ARC) * radius, Math.sin(ARC) * radius, 0)
  tip.rotation.z = ARC
  return new THREE.Group().add(new THREE.Mesh(new THREE.TorusGeometry(radius, TUBE, 8, 48, ARC), material(color)), tip)
}

/** Flèche droite le long de l'axe y, la pointe en haut. */
function straightArrow(color: number): THREE.Group {
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(TUBE, TUBE, SHAFT, 10), material(color))
  shaft.position.y = SHAFT / 2
  const tip = cone(color)
  tip.position.y = SHAFT + TUBE * 4
  return new THREE.Group().add(shaft, tip)
}

/** Caméra de tuto et repères 3D : flèches de rotation, de poussée, de flexion, et ligne de regard. */
export function createTutorialStage(): TutorialStage {
  const spinArrow = arcArrow(SPIN_RADIUS, COLORS.spin)
  const flipArrow = arcArrow(FLIP_RADIUS, COLORS.flip)
  const pushArrow = straightArrow(COLORS.push)
  const loadArrow = straightArrow(COLORS.load)
  const gaze = new THREE.Mesh(new THREE.CylinderGeometry(GAZE_RADIUS, GAZE_RADIUS, 1, 6), material(COLORS.gaze, 0.75))
  const target = new THREE.Mesh(new THREE.TorusGeometry(TARGET_RADIUS, TUBE, 8, 40).rotateX(Math.PI / 2), material(COLORS.gaze, 0.9))
  const object = new THREE.Group().add(spinArrow, flipArrow, pushArrow, loadArrow, gaze, target)
  object.visible = false

  let trick: StageTrick = { spins: 0, flips: 0, spinSign: 1, flipSign: 1 }
  let clock = 0
  let shotPhase: PhaseId | null = null
  let orbit = 0
  let yaw = 0
  let pitch = 0
  let distance = 0
  const focus = new THREE.Vector3()

  const placeArc = (arrow: THREE.Group, center: THREE.Vector3, normal: THREE.Vector3): void => {
    arrow.position.copy(center)
    arrow.quaternion.setFromUnitVectors(Z_AXIS, normal).multiply(new THREE.Quaternion().setFromAxisAngle(Z_AXIS, clock * ARC_FLOW))
  }

  const placeStraight = (arrow: THREE.Group, base: THREE.Vector3, direction: THREE.Vector3): void => {
    const bounce = BOUNCE * Math.abs(Math.sin(clock * BOUNCE_RATE))
    arrow.position.copy(base).addScaledVector(direction, bounce)
    arrow.quaternion.setFromUnitVectors(Y_AXIS, direction)
  }

  /** Ligne du regard, de la tête jusqu'au point visé. */
  const placeSight = (head: THREE.Vector3, aim: THREE.Vector3): void => {
    const span = aim.clone().sub(head)
    const length = span.length()
    gaze.position.copy(head).addScaledVector(span, 0.5)
    gaze.scale.set(1, length, 1)
    gaze.quaternion.setFromUnitVectors(Y_AXIS, span.divideScalar(length || 1))
  }

  /** Ligne du regard jusqu'à un point de la piste, et cercle posé sur la neige à cet endroit. */
  const placeGaze = (head: THREE.Vector3, aimX: number, terrain: Terrain): void => {
    const aim = new THREE.Vector3(aimX, heightAt(terrain, aimX), 0)
    placeSight(head, aim)
    const slope = Math.atan2(heightAt(terrain, aimX + 0.5) - heightAt(terrain, aimX - 0.5), 1)
    target.position.copy(aim).setY(aim.y + 0.06)
    target.rotation.set(0, 0, slope)
    target.scale.setScalar(1 + 0.12 * Math.sin(clock * BOUNCE_RATE))
  }

  /** Regard d'un moment clé : vers la piste, l'horizon ou par-dessus l'épaule ; rien quand le skieur est aveugle. */
  const placeBeatGaze = (kind: GazeKind, frame: StageFrame, points: RagdollPoints, axis: THREE.Vector3, lateral: THREE.Vector3): void => {
    const kicker = frame.terrain.kickers[0]
    const onPiste = (kind === 'lip' || kind === 'landing') && kicker !== undefined
    gaze.visible = kind !== 'blind'
    target.visible = onPiste
    if (onPiste) placeGaze(points.head, kind === 'lip' ? kicker.lipX : kicker.targetX, frame.terrain)
    if (onPiste || kind === 'blind') return
    // Devant le skieur ; par-dessus l'épaule, le regard part dans le sens de la rotation.
    const ahead = axis.clone().cross(lateral)
    const direction = kind === 'shoulder' ? axis.clone().cross(ahead).multiplyScalar(trick.spinSign).addScaledVector(ahead, 0.25) : ahead.setY(0)
    placeSight(points.head, points.head.clone().addScaledVector(direction.normalize(), GAZE_REACH))
  }

  const placeCues = (frame: StageFrame, points: RagdollPoints): void => {
    const shown = new Set<CueKind>(cuesFor(frame.phase, trick))
    const axis = points.head.clone().sub(points.pelvis).normalize()
    const lateral = points.shoulderR.clone().sub(points.shoulderL).normalize()
    const chest = points.neck.clone().add(points.pelvis).multiplyScalar(0.5)
    const feet = points.ankleL.clone().add(points.ankleR).multiplyScalar(0.5)
    const kicker = frame.terrain.kickers[0]

    spinArrow.visible = shown.has('spin')
    flipArrow.visible = shown.has('flip')
    pushArrow.visible = shown.has('push')
    loadArrow.visible = shown.has('load')
    if (frame.gaze) placeBeatGaze(frame.gaze, frame, points, axis, lateral)
    else gaze.visible = target.visible = shown.has('gazeLip') || shown.has('gazeLanding')
    if (spinArrow.visible) placeArc(spinArrow, chest, axis.clone().multiplyScalar(trick.spinSign))
    if (flipArrow.visible) placeArc(flipArrow, chest, lateral.clone().multiplyScalar(trick.flipSign))
    if (pushArrow.visible) placeStraight(pushArrow, feet.addScaledVector(lateral, 0.55), axis)
    if (loadArrow.visible) placeStraight(loadArrow, points.head.clone().addScaledVector(axis, SHAFT + 0.6), axis.clone().negate())
    if (!frame.gaze && gaze.visible && kicker) placeGaze(points.head, shown.has('gazeLip') ? kicker.lipX : kicker.targetX, frame.terrain)
  }

  const placeCamera = (frame: StageFrame, subject: THREE.Vector3): void => {
    const shot = PHASE_SHOTS[frame.phase]
    const snap = shotPhase === null
    if (shotPhase !== frame.phase || (frame.playing && shot.orbit === 0)) orbit = 0
    shotPhase = frame.phase
    // En pause, la caméra ne bouge plus : on lit les étiquettes sur une image fixe.
    if (frame.playing) orbit += shot.orbit * frame.elapsed
    const aimedYaw = nearestTurn(yaw, shot.yaw + orbit)
    yaw = snap ? aimedYaw : ease(yaw, aimedYaw, SHOT_RATE, frame.elapsed)
    pitch = snap ? shot.pitch : ease(pitch, shot.pitch, SHOT_RATE, frame.elapsed)
    distance = snap ? shot.distance : ease(distance, shot.distance, SHOT_RATE, frame.elapsed)
    if (snap) focus.copy(subject)
    else focus.lerp(subject, 1 - Math.exp(-FOCUS_RATE * frame.elapsed))

    const { camera, controls } = frame
    const offset = shotOffset(yaw, pitch, distance)
    camera.position.set(focus.x + offset.x, focus.y + offset.y, focus.z + offset.z)
    camera.position.y = Math.max(camera.position.y, heightAt(frame.terrain, camera.position.x) + GROUND_CLEARANCE)
    if (camera.fov !== FIELD_OF_VIEW) {
      camera.fov = FIELD_OF_VIEW
      camera.updateProjectionMatrix()
    }
    // Le panneau masque la droite de l'écran : on vise à droite du skieur pour le recentrer dans ce qui reste.
    const right = new THREE.Vector3(Math.cos(yaw * (Math.PI / 180)), 0, -Math.sin(yaw * (Math.PI / 180)))
    const shift = frame.sideShare * distance * Math.tan((FIELD_OF_VIEW * Math.PI) / 360) * camera.aspect
    controls.target.copy(focus).addScaledVector(right, shift)
    camera.lookAt(controls.target)
  }

  return {
    object,
    setTrick: (next) => {
      trick = next
    },
    reset: () => {
      object.visible = false
      shotPhase = null
    },
    frame: (frame) => {
      clock += frame.elapsed
      object.visible = frame.points !== null
      if (!frame.points) return
      placeCues(frame, frame.points)
      if (frame.cinematic) placeCamera(frame, frame.points.pelvis)
      else shotPhase = null
    },
  }
}
