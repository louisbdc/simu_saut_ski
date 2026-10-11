import * as THREE from 'three'
import type { Sample } from '../physics/types'
import { massPoints, massProperties } from './bodyMass'
import { bodyPose, crashPose, ridePose, switchLookAmount, withSwitchLook, type BodyPose } from './choreography'
import type { CrashScene } from './crash'
import type { TrickPlan } from './flightPlan'
import { PARTS, type RagdollPoints } from './ragdoll'
import {
  ANKLE_HEIGHT,
  LEG_HALF_WIDTH,
  POLE_DIRECTION,
  POLE_LENGTH,
  SIDES,
  solveJoints,
  type Joints,
} from './skeleton'
import { loadModelBody } from './skierModel'
import {
  SKI_NAME,
  type BodyPoints,
  createCapsuleBody,
  createOutfit,
  createFoot,
  createPole,
  createSki,
  placeBetween,
  type SkierBody,
} from './skierParts'

/** Flexion de glisse, de 0 (debout) à 1 (groupé), selon l'appui dans les compressions. */
const GROUND_FLEX = 0.24
const FLEX_PER_G = 0.2
const MIN_GROUND_FLEX = 0.14
const MAX_GROUND_FLEX = 0.62
const FLEX_RATE = 10
/** Après une réception en switch ou sous-tournée, le skieur se remet dans l'axe en ce temps. */
const REVERT_SECONDS = 0.6
/** Hauteur du centre de gravité au-dessus de la neige quand le corps roule ou glisse à terre. */
const BODY_ON_SNOW = 0.3
/** Durée caractéristique du pivot des skis sur la neige avant la lèvre, en secondes. */
const PIVOT_SECONDS = 0.12

/** Longueur de poignée qui dépasse au-dessus du poing, en mètres. */
const POLE_HANDLE_ABOVE = 0.05
const UP = new THREE.Vector3(0, 1, 0)
const LATERAL = new THREE.Vector3(0, 0, 1)
const FORWARD = new THREE.Vector3(1, 0, 0)

/** Saut en cours autour de l'instant affiché : sa figure planifiée et le temps écoulé depuis la lèvre. */
export interface JumpContext {
  readonly plan: TrickPlan
  /** Négatif pendant l'élan, nul à la lèvre, supérieur au temps de vol après la réception. */
  readonly timeFromTakeoff: number
  /** Sens de glisse avant et après ce saut : `true` = en switch (en arrière). */
  readonly switchBefore: boolean
  readonly switchAfter: boolean
}

/** Posture, cap et écart latéral imposés au skieur hors de la descente : sur le télésiège et autour des gares. */
export interface SeatPose {
  readonly posture: BodyPose
  /** Cap autour de la verticale : 0 = face à la pente. */
  readonly yaw: number
  /** Inclinaison latérale du corps, en radians : il se couche vers l'intérieur d'un dérapage. */
  readonly lean: number
  readonly z: number
}

/** Chute en cours : son déroulé et l'instant affiché. */
export interface CrashState {
  readonly scene: CrashScene
  readonly time: number
}

export interface Skier {
  readonly object: THREE.Group
  /**
   * Position dans le monde de chaque articulation telle que la dernière pose l'a placée ; `null`
   * avant toute pose. Sert à lancer la chute articulée depuis l'état exact du skieur.
   */
  readonly worldPoints: () => RagdollPoints | null
  /** Skis déchaussés lors d'une chute : à ajouter à la scène, ils vivent leur vie sur la piste. */
  readonly looseSkis: THREE.Group
  /** Place le skieur et règle sa posture et l'avancement de sa figure pour cet instant. */
  readonly pose: (
    sample: Sample,
    jump: JumpContext | null,
    ridingSwitch: boolean,
    crash: CrashState | null,
    elapsed: number,
    seat?: SeatPose,
  ) => void
}

const lerp = (from: number, to: number, ratio: number): number => from + (to - from) * ratio
const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value))
const smooth = (ratio: number): number => {
  const x = clamp(ratio, 0, 1)
  return x * x * (3 - 2 * x)
}

/** Le skieur est-il tourné dos à la pente à cet instant ? En vol, il garde le sens de son décollage. */
function facesBackward(jump: JumpContext | null, ridingSwitch: boolean): boolean {
  if (!jump) return ridingSwitch
  return jump.timeFromTakeoff < jump.plan.airTime ? jump.switchBefore : jump.switchAfter
}

function pointsFromJoints(joints: Joints): RagdollPoints {
  const [left, right] = joints.sides
  return {
    head: joints.head,
    neck: joints.neck,
    pelvis: joints.pelvis,
    shoulderL: left.shoulder,
    shoulderR: right.shoulder,
    elbowL: left.elbow,
    elbowR: right.elbow,
    handL: left.hand,
    handR: right.hand,
    hipL: left.hip,
    hipR: right.hip,
    kneeL: left.knee,
    kneeR: right.knee,
    ankleL: left.ankle,
    ankleR: right.ankle,
  }
}

/** Articulations du squelette à partir des masses de la chute articulée. */
function jointsFromPoints(points: RagdollPoints): Joints {
  const side = (suffix: 'L' | 'R'): Joints['sides'][number] => ({
    ankle: points[`ankle${suffix}`],
    knee: points[`knee${suffix}`],
    hip: points[`hip${suffix}`],
    shoulder: points[`shoulder${suffix}`],
    elbow: points[`elbow${suffix}`],
    hand: points[`hand${suffix}`],
    handTarget: points[`hand${suffix}`],
    skiYaw: 0,
    skiLift: 0,
  })
  const toHead = points.head.clone().sub(points.neck)
  return {
    pelvis: points.pelvis,
    neck: points.neck,
    head: points.head,
    along: points.neck.clone().sub(points.pelvis).normalize(),
    twist: 0,
    center: points.pelvis.clone().lerp(points.neck, 0.4),
    headRotation: [0, 0, -Math.atan2(toHead.x, toHead.y)],
    sides: [side('L'), side('R')],
  }
}

function disposeBody(body: SkierBody): void {
  body.object.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    object.geometry.dispose()
    const materials: THREE.Material[] = Array.isArray(object.material) ? object.material : [object.material]
    materials.forEach((material) => material.dispose())
  })
}

/**
 * Crée le skieur. Il apparaît d'abord avec un corps simplifié, remplacé par le mannequin dès que
 * celui-ci est chargé ; si le chargement échoue, le corps simplifié reste en place.
 */
export function createSkier(): Skier {
  const root = new THREE.Group()
  const rig = new THREE.Group()
  root.add(rig)

  const poles = SIDES.map(() => createPole())
  const feet = SIDES.map(createFoot)
  rig.add(...feet, ...poles)
  let body = createCapsuleBody()
  rig.add(body.object)
  const outfit = createOutfit()
  rig.add(outfit.object)
  /** Met le corps et ses vêtements dans la même posture ; renvoie la position des mains. */
  const dress = (joints: Joints): BodyPoints => {
    const points = body.apply(joints, rig)
    outfit.apply(points)
    return points
  }

  loadModelBody()
    .then((model) => {
      rig.remove(body.object)
      disposeBody(body)
      body = model
      rig.add(model.object)
    })
    .catch((error: unknown) => {
      const reason = error instanceof Error ? error.message : String(error)
      console.warn(`Modèle du skieur indisponible, corps simplifié conservé : ${reason}`)
    })

  const looseSkis = new THREE.Group()
  const loose = SIDES.map((side) => createSki(side))
  looseSkis.add(...loose)
  looseSkis.visible = false
  const attachedSkis = feet.map((foot) => foot.getObjectByName(SKI_NAME))

  /** Chute en corps articulé : le mannequin suit les articulations simulées, données dans le monde. */
  const poseRagdoll = (points: RagdollPoints): void => {
    root.position.set(0, 0, 0)
    root.quaternion.identity()
    const joints = jointsFromPoints(points)
    joints.sides.forEach((side, index) => {
      // La chaussure reste au bout de la jambe, dans l'axe du tibia.
      const shin = side.knee.clone().sub(side.ankle).normalize()
      feet[index].quaternion.setFromUnitVectors(UP, shin)
      feet[index].position.copy(side.ankle).addScaledVector(shin, -ANKLE_HEIGHT)
    })
    dress(joints)
  }

  /** Chute : le corps roule sur la neige autour de son centre de gravité, skis déchaussés. */
  const poseCrash = (sample: Sample, crash: CrashState): void => {
    SIDES.forEach((_, index) => {
      const ski = crash.scene.skiAt(index, crash.time)
      loose[index].position.copy(ski.position)
      loose[index].quaternion.copy(ski.quaternion)
    })
    if (crash.scene.ragdoll) {
      poseRagdoll(crash.scene.ragdoll.frameAt(crash.time - crash.scene.time))
      return
    }
    const tumble = crash.scene.tumbleAt(crash.time)
    const joints = solveJoints(crashPose(tumble, crash.scene.settledAt(crash.time)))
    const center = massProperties(massPoints(joints)).center
    const slope = new THREE.Quaternion().setFromAxisAngle(LATERAL, sample.tilt)
    // Roulé-boulé vers l'avant, dans le sens de la pente.
    const rolled = slope.clone().multiply(new THREE.Quaternion().setFromAxisAngle(LATERAL, -tumble))
    const centerInWorld = new THREE.Vector3(sample.x, sample.y, 0).add(
      new THREE.Vector3(0, BODY_ON_SNOW, 0).applyQuaternion(slope),
    )
    root.position.copy(centerInWorld).sub(center.clone().applyQuaternion(rolled))
    root.quaternion.copy(rolled)
    joints.sides.forEach((_, index) => {
      feet[index].rotation.set(0, 0, 0)
      feet[index].position.set(0, 0, SIDES[index] * LEG_HALF_WIDTH)
    })
    dress(joints)
  }

  const placePoles = (points: BodyPoints): void => {
    SIDES.forEach((side, index) => {
      const [back, down, out] = POLE_DIRECTION
      const { grip } = points.sides[index]
      const direction = new THREE.Vector3(back, down, side * out).normalize()
      // La poignée dépasse un peu au-dessus du poing ; le reste du bâton part vers la pointe.
      const top = grip.clone().addScaledVector(direction, -POLE_HANDLE_ABOVE)
      placeBetween(poles[index], grip.clone().addScaledVector(direction, POLE_LENGTH - POLE_HANDLE_ABOVE), top)
    })
  }

  let lastJoints: Joints | null = null
  const stance = new THREE.Quaternion()
  const orientation = new THREE.Quaternion()
  const leftover = new THREE.Quaternion()
  const roll = new THREE.Quaternion()
  let rideFlex = GROUND_FLEX

  return {
    object: root,
    looseSkis,
    worldPoints: (): RagdollPoints | null => {
      if (!lastJoints) return null
      const local = pointsFromJoints(lastJoints)
      return Object.fromEntries(
        PARTS.map((part) => [part, local[part].clone().applyQuaternion(root.quaternion).add(root.position)]),
      ) as RagdollPoints
    },
    pose: (
      sample: Sample,
      jump: JumpContext | null,
      ridingSwitch: boolean,
      crash: CrashState | null,
      elapsed: number,
      seat?: SeatPose,
    ): void => {
      const fallen = crash !== null && crash.time >= crash.scene.time
      looseSkis.visible = fallen
      // Dans une chute, le skieur lâche ses bâtons.
      poles.forEach((pole) => {
        pole.visible = !fallen
      })
      attachedSkis.forEach((ski) => {
        if (ski) ski.visible = !fallen
      })
      if (crash && fallen) {
        poseCrash(sample, crash)
        return
      }

      if (sample.kind !== 'air') {
        const target = clamp(GROUND_FLEX + FLEX_PER_G * (sample.gLoad - 1), MIN_GROUND_FLEX, MAX_GROUND_FLEX)
        rideFlex = lerp(rideFlex, target, 1 - Math.exp(-FLEX_RATE * Math.max(0, elapsed)))
      }
      const look = jump
        ? switchLookAmount(jump.switchBefore, jump.switchAfter, jump.timeFromTakeoff, jump.plan.airTime)
        : Number(ridingSwitch)
      const posture =
        seat?.posture ??
        withSwitchLook(jump ? bodyPose(jump.plan, jump.timeFromTakeoff, rideFlex) : ridePose(rideFlex), look)

      const joints = solveJoints(posture)
      const center = massProperties(massPoints(joints)).center
      const slope = new THREE.Quaternion()

      if (jump && jump.timeFromTakeoff > 0 && jump.timeFromTakeoff < jump.plan.airTime) {
        // En vol : l'orientation vient de la dynamique du corps, et c'est le centre de gravité,
        // non les pieds, qui suit la trajectoire du saut.
        const { plan, timeFromTakeoff } = jump
        const { takeoffTilt, landingTilt } = plan.conditions
        slope.setFromAxisAngle(LATERAL, takeoffTilt)
        orientation.copy(slope).multiply(plan.orientationAt(timeFromTakeoff))
        const fromFeetAtTakeoff = plan.centerAtTakeoff
          .clone()
          .applyQuaternion(stance.setFromAxisAngle(UP, jump.switchBefore ? Math.PI : 0))
          .applyQuaternion(slope)
        const fromFeetAtLanding = plan.centerAtLanding
          .clone()
          .applyQuaternion(stance.setFromAxisAngle(UP, jump.switchAfter ? Math.PI : 0))
          .applyQuaternion(slope.setFromAxisAngle(LATERAL, landingTilt))
        const centerInWorld = new THREE.Vector3(sample.x, sample.y, 0).add(
          fromFeetAtTakeoff.lerp(fromFeetAtLanding, timeFromTakeoff / plan.airTime),
        )
        root.position.copy(centerInWorld).sub(center.clone().applyQuaternion(orientation))
      } else {
        // Au sol : skis dans la pente. Après une figure sous-tournée, le skieur rattrape l'angle
        // qui lui manque en pivotant autour de son centre de gravité.
        slope.setFromAxisAngle(LATERAL, sample.tilt)
        stance.setFromAxisAngle(UP, seat?.yaw ?? (facesBackward(jump, ridingSwitch) ? Math.PI : 0))
        if (seat) stance.multiply(roll.setFromAxisAngle(FORWARD, seat.lean))
        const sinceLanding = jump ? jump.timeFromTakeoff - jump.plan.airTime : -1
        leftover.identity()
        if (jump && sinceLanding >= 0) {
          leftover.slerp(jump.plan.landingResidual, 1 - smooth(sinceLanding / REVERT_SECONDS))
        }
        // Avant la lèvre, les skis pivotent sur leurs carres : léger contre-pivot, puis passage dans
        // l'axe à la vitesse exacte qu'ils garderont en l'air. La vrille part donc sur la neige.
        if (jump && jump.timeFromTakeoff <= 0) {
          const lead = jump.timeFromTakeoff * Math.exp(jump.timeFromTakeoff / PIVOT_SECONDS)
          stance.multiply(leftover.setFromAxisAngle(UP, jump.plan.takeoffPivotRate * lead))
          // Même chose pour la prise de carre : les skis roulent sur la carre avant de décoller.
          stance.multiply(leftover.setFromAxisAngle(FORWARD, jump.plan.takeoffEdgeRate * lead))
          leftover.identity()
        }
        orientation.copy(slope).multiply(stance).multiply(leftover)
        const pivot = center.clone().sub(center.clone().applyQuaternion(leftover))
        root.position.set(sample.x, sample.y, seat?.z ?? 0).add(pivot.applyQuaternion(stance).applyQuaternion(slope))
      }
      root.quaternion.copy(orientation)

      joints.sides.forEach((side, index) => {
        feet[index].rotation.set(0, side.skiYaw, 0)
        feet[index].position.set(0, side.skiLift, side.ankle.z)
      })
      lastJoints = joints
      placePoles(dress(joints))
    },
  }
}
