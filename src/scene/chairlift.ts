import * as THREE from 'three'
import { GATE_BACK, type LiftLine, RETURN_GAP, WHEEL_BACK, loopAt } from './liftLine'
import {
  BAR_GEOMETRY,
  BAR_PIVOT,
  BAR_UP_ANGLE,
  BYSTANDER_GEOMETRY,
  CABLE_GEOMETRY,
  CHAIR_GEOMETRY,
  COLUMN_GEOMETRY,
  GATE_ARM_GEOMETRY,
  GATE_ARM_HEIGHT,
  GATE_OPEN_ANGLE,
  HEAD_GEOMETRY,
  LANE_HALF_WIDTH,
  LIFT_MATERIAL,
  LOADING_GEOMETRY,
  PYLON_HEAD_RISE,
  RIDER_GEOMETRY,
  UNLOADING_GEOMETRY,
  WHEEL_GEOMETRY,
} from './liftParts'

/** Écart visé entre deux sièges le long du câble ; le nombre de sièges s'ajuste à la longueur de la boucle. */
const CHAIR_SPACING = 20
const MIN_CHAIRS = 4
/** Nombre de tronçons de câble autour de chaque poulie. */
const ARC_SEGMENTS = 14
/** Balancement d'un siège vide au fil de la ligne : amplitude en radians, et longueur d'onde le long du câble. */
const SWING_ANGLE = 0.05
const SWING_WAVELENGTH = 17
/** Un siège sur trois porte un passager, et certains un second : la ligne n'est pas déserte. */
const RIDER_EVERY = 3
const SECOND_RIDER_EVERY = 5
const RIDER_SEAT_OFFSET = 0.42
/** Les passagers embarquent et débarquent à cette distance des quais, et baissent leur garde-corps un peu plus loin. */
const RIDER_MARGIN = 1.2
const RIDER_BAR_MARGIN = 9
const JACKETS = [0xe5484d, 0x2fb36a, 0xf2a53a, 0x8e4ec6, 0x12a594, 0xe93d82, 0x3e63dd] as const

/** Badauds des gares : position par rapport au quai (vers l'aval, de côté) et cap, en radians. */
const LOADING_BYSTANDERS = [
  { x: GATE_BACK + 7.2, z: -2, yaw: 2.6 },
  { x: GATE_BACK + 8.4, z: -2.9, yaw: 3.4 },
  { x: GATE_BACK + 9.9, z: -1.9, yaw: 2.9 },
] as const
const UNLOADING_BYSTANDERS = [
  { x: -7.4, z: 2.3, yaw: -0.5 },
  { x: -8.6, z: 3.1, yaw: 0.3 },
] as const

/** Place d'un passager : le siège qui le porte et son décalage sur l'assise. */
interface RiderSeat {
  readonly chair: number
  readonly offset: number
}

/** Passagers de la ligne : jamais sur le siège du skieur, qui est le premier de la boucle. */
function riderSeats(chairCount: number): RiderSeat[] {
  return Array.from({ length: chairCount }, (_, chair) => chair).flatMap((chair) => {
    if (chair === 0 || chair % RIDER_EVERY !== 1) return []
    const first = { chair, offset: -RIDER_SEAT_OFFSET }
    return chair % SECOND_RIDER_EVERY === 1 ? [first, { chair, offset: RIDER_SEAT_OFFSET }] : [first]
  })
}

function bystanders(line: LiftLine): THREE.InstancedMesh {
  const spots = [
    ...LOADING_BYSTANDERS.map((spot) => ({ ...spot, x: line.bottom.x + spot.x, y: line.bottom.groundY })),
    ...UNLOADING_BYSTANDERS.map((spot) => ({ ...spot, x: line.top.x + spot.x, y: line.top.groundY })),
  ]
  const mesh = new THREE.InstancedMesh(BYSTANDER_GEOMETRY, LIFT_MATERIAL, spots.length)
  const transform = new THREE.Object3D()
  spots.forEach((spot, i) => {
    transform.position.set(spot.x, spot.y, line.z + spot.z)
    transform.rotation.y = spot.yaw
    transform.updateMatrix()
    mesh.setMatrixAt(i, transform.matrix)
    mesh.setColorAt(i, new THREE.Color(JACKETS[(i * 3 + 2) % JACKETS.length]))
  })
  mesh.castShadow = true
  return mesh
}

/** État animé du télésiège à un instant donné. */
export interface LiftMotion {
  /** Distance parcourue par le siège du skieur depuis le quai aval ; négative tant qu'il n'y est pas arrivé. */
  readonly travel: number
  /** Ouverture du portillon d'embarquement, de 0 (fermé) à 1. */
  readonly gate: number
  /** Garde-corps du siège du skieur, de 0 (relevé) à 1 (baissé). */
  readonly bar: number
}

export interface Chairlift {
  readonly object: THREE.Group
  /** Anime l'installation : ne déplace que les sièges, les garde-corps et le portillon, sans rien reconstruire. */
  readonly update: (motion: LiftMotion) => void
}

const UP = new THREE.Vector3(0, 1, 0)

/** Distances des points où le câble change de direction, sur toute la boucle. */
function cableBreaks(line: LiftLine): number[] {
  const arc = (Math.PI * RETURN_GAP) / 2
  const up = line.cable.map((point) => point.distance)
  const topArc = line.length + WHEEL_BACK
  const down = topArc + arc + WHEEL_BACK
  const bottomArc = down + line.length + WHEEL_BACK
  const around = (start: number): number[] =>
    Array.from({ length: ARC_SEGMENTS + 1 }, (_, i) => start + (arc * i) / ARC_SEGMENTS)
  return [...up, ...around(topArc), ...[...up].reverse().map((distance) => down + line.length - distance), ...around(bottomArc), line.loopLength]
}

/** Câble porteur-tracteur : la boucle complète, poulies comprises, en tronçons d'un même maillage. */
function cable(line: LiftLine): THREE.InstancedMesh {
  const points = cableBreaks(line).map((distance) => {
    const point = loopAt(line, Math.min(distance, line.loopLength - 1e-6))
    return new THREE.Vector3(point.x, point.y, point.z)
  })
  const mesh = new THREE.InstancedMesh(CABLE_GEOMETRY, LIFT_MATERIAL, points.length - 1)
  const transform = new THREE.Object3D()
  const span = new THREE.Vector3()
  for (let i = 0; i < points.length - 1; i++) {
    span.subVectors(points[i + 1], points[i])
    const length = span.length()
    transform.position.copy(points[i])
    transform.scale.set(1, Math.max(length, 1e-4), 1)
    if (length > 1e-6) transform.quaternion.setFromUnitVectors(UP, span.divideScalar(length))
    transform.updateMatrix()
    mesh.setMatrixAt(i, transform.matrix)
  }
  return mesh
}

function pylons(line: LiftLine): THREE.InstancedMesh[] {
  const middle = (line.z + line.returnZ) / 2
  const columns = new THREE.InstancedMesh(COLUMN_GEOMETRY, LIFT_MATERIAL, line.pylons.length)
  const heads = new THREE.InstancedMesh(HEAD_GEOMETRY, LIFT_MATERIAL, line.pylons.length)
  const transform = new THREE.Object3D()
  line.pylons.forEach((pylon, i) => {
    transform.position.set(pylon.x, pylon.groundY, middle)
    transform.scale.set(1, pylon.topY + PYLON_HEAD_RISE - pylon.groundY, 1)
    transform.updateMatrix()
    columns.setMatrixAt(i, transform.matrix)
    transform.position.y = pylon.topY
    transform.scale.setScalar(1)
    transform.updateMatrix()
    heads.setMatrixAt(i, transform.matrix)
  })
  columns.castShadow = true
  heads.castShadow = true
  return [columns, heads]
}

/** Poulies des deux gares, chacune au bout de la ligne, tournée vers elle. */
function wheels(line: LiftLine): THREE.InstancedMesh {
  const middle = (line.z + line.returnZ) / 2
  const bottom = line.cable[0]
  const top = line.cable[line.cable.length - 1]
  const mesh = new THREE.InstancedMesh(WHEEL_GEOMETRY, LIFT_MATERIAL, 2)
  const transform = new THREE.Object3D()
  const ends = [
    { x: bottom.x + WHEEL_BACK, y: bottom.y, turn: 0 },
    { x: top.x - WHEEL_BACK, y: top.y, turn: Math.PI },
  ]
  ends.forEach((end, i) => {
    transform.position.set(end.x, end.y, middle)
    transform.rotation.y = end.turn
    transform.updateMatrix()
    mesh.setMatrixAt(i, transform.matrix)
  })
  mesh.castShadow = true
  return mesh
}

/** Télésiège complet le long de la piste : gares, quais, portillon, pylônes, câble et sièges en mouvement. */
export function buildChairlift(line: LiftLine): Chairlift {
  const count = Math.max(MIN_CHAIRS, Math.round(line.loopLength / CHAIR_SPACING))
  const spacing = line.loopLength / count
  const chairs = new THREE.InstancedMesh(CHAIR_GEOMETRY, LIFT_MATERIAL, count)
  const bars = new THREE.InstancedMesh(BAR_GEOMETRY, LIFT_MATERIAL, count)
  chairs.castShadow = true
  // Sièges et garde-corps circulent sur toute la ligne : pas de tri par boîte englobante figée.
  chairs.frustumCulled = false
  bars.frustumCulled = false

  const loading = new THREE.Mesh(LOADING_GEOMETRY, LIFT_MATERIAL)
  loading.position.set(line.bottom.x, line.bottom.groundY, line.z)
  loading.castShadow = true
  const unloading = new THREE.Mesh(UNLOADING_GEOMETRY, LIFT_MATERIAL)
  unloading.position.set(line.top.x, line.top.groundY, line.z)
  unloading.castShadow = true
  const gateArm = new THREE.Mesh(GATE_ARM_GEOMETRY, LIFT_MATERIAL)
  gateArm.position.set(line.bottom.x + GATE_BACK, line.bottom.groundY + GATE_ARM_HEIGHT, line.z - LANE_HALF_WIDTH + 0.1)

  const seats = riderSeats(count)
  const riders = new THREE.InstancedMesh(RIDER_GEOMETRY, LIFT_MATERIAL, seats.length)
  riders.frustumCulled = false
  seats.forEach((_, i) => riders.setColorAt(i, new THREE.Color(JACKETS[i % JACKETS.length])))
  const occupied = new Set(seats.map((seat) => seat.chair))

  const chair = new THREE.Object3D()
  const bar = new THREE.Object3D()
  const rider = new THREE.Object3D()
  chair.add(bar, rider)
  bar.position.set(...BAR_PIVOT)
  /** Balancement d'un siège à cet endroit de la boucle ; celui du skieur reste d'aplomb, il est posé dessus. */
  const swingOf = (index: number, along: number): number =>
    index === 0 ? 0 : SWING_ANGLE * Math.sin((along / SWING_WAVELENGTH) * Math.PI * 2 + index * 1.7)
  /** Distance d'un siège au quai aval le long du brin montant, ou -1 s'il n'y est pas. */
  const climbed = (along: number): number => {
    const around = ((along % line.loopLength) + line.loopLength) % line.loopLength
    return around < line.length ? around : -1
  }

  const update = (motion: LiftMotion): void => {
    for (let i = 0; i < count; i++) {
      const along = motion.travel + i * spacing
      const point = loopAt(line, along)
      chair.position.set(point.x, point.y, point.z)
      chair.rotation.y = point.yaw
      chair.rotation.z = swingOf(i, along)
      // Garde-corps baissé sous le skieur et sous les passagers en pleine ligne ; relevé sur les sièges vides.
      const up = climbed(along)
      const lowered = occupied.has(i) && up > RIDER_BAR_MARGIN && up < line.length - RIDER_BAR_MARGIN
      bar.rotation.z = BAR_UP_ANGLE * (i === 0 ? 1 - motion.bar : lowered ? 0 : 1)
      chair.updateMatrixWorld(true)
      chairs.setMatrixAt(i, chair.matrixWorld)
      bars.setMatrixAt(i, bar.matrixWorld)
    }
    seats.forEach((seat, i) => {
      const along = motion.travel + seat.chair * spacing
      const point = loopAt(line, along)
      const up = climbed(along)
      // Les passagers ne montent que sur le brin montant : ils embarquent en bas et débarquent en haut.
      const aboard = up > RIDER_MARGIN && up < line.length - RIDER_MARGIN
      chair.position.set(point.x, point.y, point.z)
      chair.rotation.set(0, point.yaw, swingOf(seat.chair, along))
      rider.position.z = seat.offset
      rider.scale.setScalar(aboard ? 1 : 0)
      chair.updateMatrixWorld(true)
      riders.setMatrixAt(i, rider.matrixWorld)
    })
    chairs.instanceMatrix.needsUpdate = true
    bars.instanceMatrix.needsUpdate = true
    riders.instanceMatrix.needsUpdate = true
    gateArm.rotation.x = -GATE_OPEN_ANGLE * motion.gate
  }
  update({ travel: 0, gate: 0, bar: 0 })

  const object = new THREE.Group()
  object.add(cable(line), ...pylons(line), wheels(line), loading, unloading, gateArm, chairs, bars, riders, bystanders(line))
  return { object, update }
}
