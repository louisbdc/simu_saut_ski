/**
 * Répartition des masses du skieur équipé. Chaque segment du corps est remplacé par quelques masses
 * ponctuelles qui reproduisent sa masse, son centre et son étalement : on en tire le centre de
 * gravité et le tenseur d'inertie de n'importe quelle posture.
 *
 * Parts de masse des segments d'après de Leva (1996), pour un skieur de 75 kg ; l'équipement
 * (chaussures, skis et fixations, bâtons, casque) s'y ajoute, soit environ 86 kg en tout.
 */
import * as THREE from 'three'
import { POLE_DIRECTION, POLE_LENGTH, SIDES, type Joints } from './skeleton'

/** Masses en kilogrammes. Les membres sont donnés pour un seul côté. */
const MASS = {
  /** Tête et cou (5,2 kg) avec le casque. */
  head: 5.7,
  trunk: 32.6,
  upperArm: 2.0,
  /** Avant-bras et main gantée. */
  forearm: 1.65,
  thigh: 10.6,
  shank: 3.2,
  /** Pied et chaussure de ski. */
  boot: 3.0,
  /** Ski et fixation. */
  ski: 3.0,
  pole: 0.25,
}

/** Demi-largeur d'étalement des masses du tronc de part et d'autre de la colonne, en mètres. */
const TRUNK_HALF_WIDTH = 0.11
const SKI_LENGTH = 1.7
/** Le centre du ski est un peu en avant de la chaussure, au ras de la neige. */
const SKI_CENTER_AHEAD = 0.05
const SKI_HEIGHT = 0.02
const BOOT_BELOW_ANKLE = 0.03
/**
 * Une tige uniforme de longueur L a le même étalement que deux masses égales placées à
 * L/√12 de son centre.
 */
const ROD_SPREAD = 1 / Math.sqrt(12)

export interface MassPoint {
  readonly mass: number
  readonly position: THREE.Vector3
}

export interface MassProperties {
  readonly mass: number
  /** Centre de gravité, dans le repère du skieur. */
  readonly center: THREE.Vector3
  /** Tenseur d'inertie autour du centre de gravité, en kg·m². */
  readonly inertia: THREE.Matrix3
}

/**
 * Segment allongé entre deux articulations, vu comme une tige uniforme : deux masses égales de part
 * et d'autre de son milieu, ajoutées à `points`. Elle est appelée des centaines de fois par figure
 * planifiée, d'où le calcul direct sur les composantes plutôt que sur des vecteurs temporaires.
 */
function pushRod(
  points: MassPoint[],
  mass: number,
  from: { readonly x: number; readonly y: number; readonly z: number },
  to: { readonly x: number; readonly y: number; readonly z: number },
): void {
  const middleX = (from.x + to.x) * 0.5
  const middleY = (from.y + to.y) * 0.5
  const middleZ = (from.z + to.z) * 0.5
  const halfX = (to.x - from.x) * ROD_SPREAD
  const halfY = (to.y - from.y) * ROD_SPREAD
  const halfZ = (to.z - from.z) * ROD_SPREAD
  points.push(
    { mass: mass / 2, position: new THREE.Vector3(middleX + halfX, middleY + halfY, middleZ + halfZ) },
    { mass: mass / 2, position: new THREE.Vector3(middleX - halfX, middleY - halfY, middleZ - halfZ) },
  )
}

/** Direction des bâtons depuis la main, ramenée à la demi-longueur d'un bâton : elle ne dépend que du côté. */
const POLE_HALF_OFFSETS = SIDES.map((sign) =>
  new THREE.Vector3(POLE_DIRECTION[0], POLE_DIRECTION[1], sign * POLE_DIRECTION[2]).setLength(POLE_LENGTH / 2),
)

/** Masses ponctuelles du skieur dans une posture. L'ordre des points est toujours le même. */
export function massPoints(joints: Joints): MassPoint[] {
  const trunkMiddle = joints.pelvis.clone().add(joints.neck).multiplyScalar(0.5)
  const trunkHalf = joints.neck.clone().sub(joints.pelvis).multiplyScalar(ROD_SPREAD)
  const trunk = [-1, 1].flatMap((end) =>
    [-1, 1].map((side) => ({
      mass: MASS.trunk / 4,
      position: trunkMiddle
        .clone()
        .addScaledVector(trunkHalf, end)
        .add(new THREE.Vector3(0, 0, side * TRUNK_HALF_WIDTH)),
    })),
  )

  const points: MassPoint[] = [{ mass: MASS.head, position: joints.head.clone() }, ...trunk]
  joints.sides.forEach((side, index) => {
    // Le ski tourne autour de la verticale quand les skis se croisent, et bascule autour de la cheville
    // pour un tail ou un nose grab : son axe gagne alors une composante verticale.
    const level = Math.cos(side.skiPitch)
    const axisX = Math.cos(side.skiYaw) * level
    const axisY = Math.sin(side.skiPitch)
    const axisZ = -Math.sin(side.skiYaw) * level
    const baseY = SKI_HEIGHT + side.skiLift
    const along = (distance: number) => ({ x: side.ankle.x + axisX * distance, y: baseY + axisY * distance, z: side.ankle.z + axisZ * distance })
    const tail = along(SKI_CENTER_AHEAD - SKI_LENGTH / 2)
    const tip = along(SKI_CENTER_AHEAD + SKI_LENGTH / 2)

    pushRod(points, MASS.thigh, side.hip, side.knee)
    pushRod(points, MASS.shank, side.knee, side.ankle)
    points.push({ mass: MASS.boot, position: side.ankle.clone().setY(side.ankle.y - BOOT_BELOW_ANKLE) })
    pushRod(points, MASS.ski, tail, tip)
    pushRod(points, MASS.upperArm, side.shoulder, side.elbow)
    pushRod(points, MASS.forearm, side.elbow, side.hand)
    points.push({ mass: MASS.pole, position: POLE_HALF_OFFSETS[index].clone().add(side.hand) })
  })
  return points
}

/** Masse totale, centre de gravité et tenseur d'inertie autour de ce centre. */
export function massProperties(points: readonly MassPoint[]): MassProperties {
  const mass = points.reduce((sum, point) => sum + point.mass, 0)
  const center = points
    .reduce((sum, point) => sum.addScaledVector(point.position, point.mass), new THREE.Vector3())
    .multiplyScalar(1 / mass)

  // I = Σ m·(|d|²·1 − d·dᵀ), d étant la position par rapport au centre de gravité.
  let xx = 0
  let yy = 0
  let zz = 0
  let xy = 0
  let xz = 0
  let yz = 0
  for (const point of points) {
    const dx = point.position.x - center.x
    const dy = point.position.y - center.y
    const dz = point.position.z - center.z
    xx = xx + point.mass * (dy * dy + dz * dz)
    yy = yy + point.mass * (dx * dx + dz * dz)
    zz = zz + point.mass * (dx * dx + dy * dy)
    xy = xy - point.mass * dx * dy
    xz = xz - point.mass * dx * dz
    yz = yz - point.mass * dy * dz
  }
  const inertia = new THREE.Matrix3().set(xx, xy, xz, xy, yy, yz, xz, yz, zz)
  return { mass, center, inertia }
}
