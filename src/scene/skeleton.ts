/**
 * Squelette du skieur : à partir d'une posture, calcule la position de chaque articulation dans le
 * repère du skieur (x vers l'avant, y vers le haut, z sur le côté, origine sous les pieds).
 * Les deux corps affichables (capsules et modèle GLB) se contentent de suivre ces points.
 */
import * as THREE from 'three'
import type { ArmPreset, BodyPose } from './choreography'
import type { GrabKind } from './tricks'

/** Morphologie, en mètres. Debout, le skieur mesure environ 1,78 m. */
export const ANKLE_HEIGHT = 0.12
export const SHIN = 0.42
export const THIGH = 0.44
export const TORSO = 0.5
export const NECK = 0.21
export const UPPER_ARM = 0.29
export const FOREARM = 0.27
export const LEG_HALF_WIDTH = 0.15
/** Écart ajouté à chaque pied sur des appuis larges (lancer d'une vrille), en mètres. */
const WIDE_STANCE_SPREAD = 0.13
const HIP_HALF_WIDTH = 0.11
const SHOULDER_HALF_WIDTH = 0.21
/** Part de l'inclinaison du buste que la tête suit : elle reste plus droite que le dos. */
const HEAD_FOLLOW = 0.45

export const POLE_LENGTH = 1.1
/** Direction des bâtons depuis la main : vers l'arrière, vers le bas, un peu écartés. */
export const POLE_DIRECTION = [-0.82, -0.52, 0.16] as const

/** Côtés du corps : −1 à gauche (z négatif), +1 à droite. */
export const SIDES = [-1, 1] as const

const toRad = (degrees: number): number => (degrees * Math.PI) / 180

/** Inclinaison des segments par rapport à la verticale, de la posture droite au groupé complet. */
const STANDING = { shin: toRad(14), thigh: toRad(8), torso: toRad(18) }
const TUCKED = { shin: toRad(55), thigh: toRad(96), torso: toRad(72) }
/**
 * Groupé en l'air : les genoux remontent vers la poitrine, talons vers les fesses, et le buste reste
 * presque droit. Les tibias restent proches de la perpendiculaire aux skis, comme l'imposent les
 * chaussures. C'est la forme d'un grab, à ne pas confondre avec l'accroupi de glisse ci-dessus.
 */
const AIR_TUCK = { shin: toRad(22), thigh: toRad(125), torso: toRad(42) }
/**
 * Corps cambré du backflip « ouvert » : tibias perpendiculaires aux skis, genoux pliés, hanches
 * ouvertes, dos couché vers l'arrière et creusé. Le corps est presque droit des genoux aux épaules.
 */
const LAID_BACK = { shin: toRad(14), thigh: toRad(104), torso: toRad(-116) }

/**
 * Position des mains par rapport à l'épaule, dans le repère du buste :
 * [vers l'avant, le long du buste vers la tête, vers l'extérieur]. Les mains « knees » visent les
 * genoux et sont calculées à part.
 */
const HAND_OFFSETS: Readonly<Record<Exclude<ArmPreset, 'knees'>, readonly [number, number, number]>> = {
  ride: [0.3, -0.22, 0.1],
  forward: [0.46, -0.04, 0.06],
  up: [0.12, 0.5, 0.08],
  wide: [0.06, 0.04, 0.52],
  // Main libre d'un grab : bras tendu sur le côté, un peu en arrière et au-dessus de l'épaule.
  back: [-0.2, 0.14, 0.48],
  in: [0.2, -0.16, -0.1],
  // Mains basses le long des hanches, prêtes à être lancées vers le haut au pop.
  low: [-0.04, -0.46, 0.14],
}
/**
 * Point que la main droite attrape, dans le repère des skis :
 * - safety : carre extérieure du ski droit, juste devant la chaussure ;
 * - mute : avant du ski gauche, qui est passé devant le ski droit en se croisant ;
 * - japan : ski gauche derrière la chaussure, la main passant derrière la jambe droite.
 */
const GRAB_POINTS: Readonly<Record<Exclude<GrabKind, 'none'>, THREE.Vector3>> = {
  safety: new THREE.Vector3(0.22, 0.09, LEG_HALF_WIDTH + 0.07),
  mute: new THREE.Vector3(0.27, 0.11, 0.03),
  japan: new THREE.Vector3(-0.28, 0.1, -0.04),
}
/** Jeu de l'épaule : elle s'avance vers une cible un peu trop loin pour le bras seul. */
const SHOULDER_REACH = 0.07
/** Le ski droit passe par-dessus le gauche quand ils se croisent. */
const CROSSED_SKI_LIFT = 0.035

const SIDEWAYS = new THREE.Vector3(0, 0, 1)

export interface SideJoints {
  readonly ankle: THREE.Vector3
  readonly knee: THREE.Vector3
  readonly hip: THREE.Vector3
  readonly shoulder: THREE.Vector3
  readonly elbow: THREE.Vector3
  readonly hand: THREE.Vector3
  /** Point visé par la main, même s'il est hors de portée du bras. */
  readonly handTarget: THREE.Vector3
  /** Rotation du ski autour de la verticale, en radians (skis croisés), et son décalage en hauteur. */
  readonly skiYaw: number
  readonly skiLift: number
}

export interface Joints {
  /** Centre du bassin. */
  readonly pelvis: THREE.Vector3
  /** Base du cou. */
  readonly neck: THREE.Vector3
  /** Centre de la tête. */
  readonly head: THREE.Vector3
  /** Direction du buste, du bassin vers le cou (vecteur unitaire). */
  readonly along: THREE.Vector3
  /** Rotation des épaules autour du buste, en radians. */
  readonly twist: number
  /** Centre de gravité approximatif : c'est autour de lui que tournent les figures. */
  readonly center: THREE.Vector3
  /** Orientation de la tête : angles d'Euler [x, y, z] dans le repère du skieur. */
  readonly headRotation: readonly [number, number, number]
  /** Articulations de chaque côté, dans l'ordre de `SIDES`. */
  readonly sides: readonly [SideJoints, SideJoints]
}

const lerp = (from: number, to: number, ratio: number): number => from + (to - from) * ratio
const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value))
/** Vecteur de longueur donnée dans le plan de profil, incliné de `angle` depuis la verticale vers l'avant. */
const leaning = (angle: number, length: number): THREE.Vector3 =>
  new THREE.Vector3(Math.sin(angle) * length, Math.cos(angle) * length, 0)

/**
 * Main et coude d'un bras à deux segments qui part de l'épaule vers une cible. Une cible hors de
 * portée est ramenée à bout de bras.
 */
function solveArm(shoulder: THREE.Vector3, target: THREE.Vector3, side: number): { elbow: THREE.Vector3; hand: THREE.Vector3 } {
  const reach = target.clone().sub(shoulder)
  const distance = clamp(reach.length(), 0.05, UPPER_ARM + FOREARM - 0.01)
  const direction = reach.normalize()
  const hand = shoulder.clone().addScaledVector(direction, distance)

  const along = (UPPER_ARM ** 2 - FOREARM ** 2 + distance ** 2) / (2 * distance)
  const offset = Math.sqrt(Math.max(0, UPPER_ARM ** 2 - along ** 2))
  // Le coude part vers l'extérieur et un peu vers l'arrière.
  const outward = new THREE.Vector3(-0.5, -0.15, side)
  outward.addScaledVector(direction, -outward.dot(direction)).normalize()
  return { elbow: shoulder.clone().addScaledVector(direction, along).addScaledVector(outward, offset), hand }
}

/**
 * De combien le genou rentre vers l'axe quand le pied s'écarte de `spread`. C'est la valeur qui
 * raccourcit du même facteur, vus de côté, le tibia et la cuisse : les deux gardent leur longueur.
 */
function kneeInsetFor(spread: number): number {
  const hipGap = LEG_HALF_WIDTH - HIP_HALF_WIDTH
  const reach = hipGap + spread
  const a = THIGH ** 2 - SHIN ** 2
  const b = 2 * reach * SHIN ** 2
  const c = -(SHIN ** 2) * (reach ** 2 - hipGap ** 2)
  return (-b + Math.sqrt(b ** 2 - 4 * a * c)) / (2 * a)
}

export function solveJoints(body: BodyPose): Joints {
  const flex = clamp(body.flex, 0, 1)
  const tuck = clamp(body.tuck, 0, 1)
  const layback = clamp(body.layback, 0, 1)
  // Les formes se superposent : accroupi de glisse, puis groupé en l'air, puis cambré.
  const segment = (part: 'shin' | 'thigh' | 'torso'): number =>
    lerp(lerp(lerp(STANDING[part], TUCKED[part], flex), AIR_TUCK[part], tuck), LAID_BACK[part], layback)
  const shinLean = segment('shin')
  const thighLean = segment('thigh')
  const torsoLean = segment('torso') + body.lean
  // Penché en avant, le skieur garde la tête relevée ; couché en arrière, elle suit le dos.
  const headLean = torsoLean > 0 ? torsoLean * HEAD_FOLLOW : torsoLean

  // Pieds écartés, les jambes partent en A : le bassin descend juste assez pour que tibias et
  // cuisses gardent leur longueur.
  const stance = clamp(body.stance, 0, 1)
  const spread = WIDE_STANCE_SPREAD * stance
  const kneeInset = spread > 0 ? kneeInsetFor(spread) : 0
  const legScale = Math.sqrt(1 - (kneeInset / SHIN) ** 2)
  const kneeOffset = leaning(shinLean, SHIN).multiplyScalar(legScale)
  const pelvis = new THREE.Vector3(0, ANKLE_HEIGHT, 0)
    .add(kneeOffset)
    .add(leaning(-thighLean, THIGH).multiplyScalar(legScale))
  const along = leaning(torsoLean, 1)
  const forward = new THREE.Vector3(along.y, -along.x, 0)
  const neck = pelvis.clone().addScaledVector(along, TORSO)
  // Les épaules tournent autour du buste quand le skieur arme ou lance une vrille.
  const twist = new THREE.Quaternion().setFromAxisAngle(along, body.twist)
  const inTorsoFrame = (ahead: number, up: number, out: number): THREE.Vector3 =>
    forward.clone().multiplyScalar(ahead).addScaledVector(along, up).addScaledVector(SIDEWAYS, out).applyQuaternion(twist)

  // Les bras balaient autour du buste au-delà des épaules quand le skieur arme ou lance une vrille.
  const sweep = new THREE.Quaternion().setFromAxisAngle(along, body.armSweep)
  const swept = (point: THREE.Vector3): THREE.Vector3 => point.sub(neck).applyQuaternion(sweep).add(neck)

  const solveSide = (side: number): SideJoints => {
    const ankle = new THREE.Vector3(0, ANKLE_HEIGHT, side * (LEG_HALF_WIDTH + spread))
    const knee = ankle.clone().add(kneeOffset).setZ(ankle.z - side * kneeInset)
    const restShoulder = neck.clone().add(inTorsoFrame(-0.02, -0.06, side * SHOULDER_HALF_WIDTH))
    const fromShoulder = ([ahead, up, out]: readonly [number, number, number]): THREE.Vector3 =>
      inTorsoFrame(ahead, up, side * out).add(restShoulder)

    const targets: Readonly<Record<ArmPreset, THREE.Vector3>> = {
      ride: fromShoulder(HAND_OFFSETS.ride),
      forward: fromShoulder(HAND_OFFSETS.forward),
      up: fromShoulder(HAND_OFFSETS.up),
      wide: fromShoulder(HAND_OFFSETS.wide),
      back: fromShoulder(HAND_OFFSETS.back),
      in: fromShoulder(HAND_OFFSETS.in),
      low: fromShoulder(HAND_OFFSETS.low),
      knees: knee.clone().add(new THREE.Vector3(0.06, 0.04, side * 0.04)),
    }
    const presets = Object.keys(targets) as ArmPreset[]
    const total = presets.reduce((sum, preset) => sum + body.arms[preset], 0)
    const freeTarget = swept(
      total > 0
        ? presets.reduce(
            (point, preset) => point.addScaledVector(targets[preset], body.arms[preset] / total),
            new THREE.Vector3(),
          )
        : targets.ride.clone(),
    )
    // C'est la main droite qui grabbe ; la gauche reste libre pour l'équilibre.
    const grabbing = side === 1 && body.grab !== 'none'
    // La main part de là où elle se trouve : aucun saut de position quand le grab commence.
    const handTarget = grabbing
      ? freeTarget.clone().lerp(GRAB_POINTS[body.grab], clamp(body.grabAmount, 0, 1))
      : freeTarget

    const toTarget = handTarget.clone().sub(restShoulder)
    const excess = toTarget.length() - (UPPER_ARM + FOREARM)
    const shoulder =
      excess > 0 ? restShoulder.clone().addScaledVector(toTarget.normalize(), Math.min(excess, SHOULDER_REACH)) : restShoulder
    const crossed = clamp(Math.abs(body.skiCross) / 0.3, 0, 1)

    return {
      ankle,
      knee,
      hip: pelvis.clone().setZ(side * HIP_HALF_WIDTH),
      shoulder,
      ...solveArm(shoulder, handTarget, side),
      handTarget,
      // Chaque spatule part vers l'autre ski : les skis se croisent devant les chaussures.
      skiYaw: side * body.skiCross,
      skiLift: side === 1 ? CROSSED_SKI_LIFT * crossed : 0,
    }
  }

  const head = neck.clone().add(leaning(headLean, NECK))
  // Répartition approximative des masses : bassin et buste dominent, puis cuisses, jambes et skis.
  const center = new THREE.Vector3()
    .addScaledVector(pelvis, 0.34)
    .addScaledVector(neck, 0.26)
    .addScaledVector(head, 0.08)
    .addScaledVector(kneeOffset.clone().setY(kneeOffset.y + ANKLE_HEIGHT), 0.18)
    .addScaledVector(new THREE.Vector3(0, ANKLE_HEIGHT, 0), 0.14)

  return {
    pelvis,
    neck,
    head,
    along,
    twist: body.twist,
    center,
    headRotation: [0, body.headYaw + body.twist * 0.5, body.headPitch - headLean],
    sides: [solveSide(SIDES[0]), solveSide(SIDES[1])],
  }
}
