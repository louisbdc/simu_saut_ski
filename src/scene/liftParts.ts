import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { GATE_BACK, HANG_LENGTH, LANE_LENGTH, RETURN_GAP, STATION_CABLE_HEIGHT } from './liftLine'
import { markShared } from './sharedAssets'

/**
 * Pièces du télésiège, modelées une fois pour toutes et partagées par toutes les reconstructions de
 * la piste : sièges, garde-corps, pylônes, poulies de gare, quai d'embarquement, cabanes.
 */

const STEEL = new THREE.Color(0xa3afbb)
const DARK = new THREE.Color(0x232b36)
const BLUE = new THREE.Color(0x1b5fc4)
const NAVY = new THREE.Color(0x163a7a)
const YELLOW = new THREE.Color(0xf0b400)
const RED = new THREE.Color(0xd8362f)
const WHITE = new THREE.Color(0xeef2f6)
const RUBBER = new THREE.Color(0x1d222b)
const GLASS = new THREE.Color(0x17324f)

const UP = new THREE.Vector3(0, 1, 0)
const TUBE_SIDES = 5
type Triple = readonly [number, number, number]

function tinted(geometry: THREE.BufferGeometry, color: THREE.Color): THREE.BufferGeometry {
  const plain = geometry.index ? geometry.toNonIndexed() : geometry
  const count = plain.getAttribute('position').count
  const colors = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) color.toArray(colors, i * 3)
  plain.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  plain.deleteAttribute('uv')
  return plain
}

/** Pavé de couleur unie. */
function box(size: Triple, center: Triple, color: THREE.Color): THREE.BufferGeometry {
  return tinted(new THREE.BoxGeometry(...size).translate(...center), color)
}

/** Tube entre deux points. */
function rod(from: Triple, to: Triple, radius: number, color: THREE.Color): THREE.BufferGeometry {
  const start = new THREE.Vector3(...from)
  const span = new THREE.Vector3(...to).sub(start)
  const geometry = new THREE.CylinderGeometry(radius, radius, span.length(), TUBE_SIDES, 1, true)
  geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, span.clone().normalize()))
  geometry.translate(start.x + span.x / 2, start.y + span.y / 2, start.z + span.z / 2)
  return tinted(geometry, color)
}

/** Galet ou poulie couché sur le côté : son axe est l'axe latéral. */
function roller(radius: number, width: number, center: Triple, color: THREE.Color): THREE.BufferGeometry {
  return tinted(new THREE.CylinderGeometry(radius, radius, width, 10).rotateX(Math.PI / 2).translate(...center), color)
}

const merged = (parts: THREE.BufferGeometry[]): THREE.BufferGeometry => markShared(mergeGeometries(parts))

export const SEAT_WIDTH = 1.7
const HALF_SEAT = SEAT_WIDTH / 2
const SEAT_Y = -HANG_LENGTH
const BACK_TOP = SEAT_Y + 0.78
const BACK_X = -0.4
const FRAME_TUBE = 0.028

/** Axe du garde-corps, en haut du dossier, dans le repère du siège. */
export const BAR_PIVOT: Triple = [BACK_X, BACK_TOP, 0]
/** Angle du garde-corps relevé au-dessus des têtes, en radians. */
export const BAR_UP_ANGLE = 1.9

/** Siège vu depuis sa pince sur le câble, à l'origine : il regarde vers +x et pend sous le câble. */
export const CHAIR_GEOMETRY = merged([
  box([0.32, 0.13, 0.15], [0, 0, 0], DARK),
  rod([0, -0.06, 0], [0, -0.95, 0], 0.035, STEEL),
  rod([0, -0.95, 0], [BACK_X, -1.4, 0], 0.035, STEEL),
  rod([BACK_X, -1.4, 0], [BACK_X, BACK_TOP, 0], 0.035, STEEL),
  rod([BACK_X, BACK_TOP, -HALF_SEAT], [BACK_X, BACK_TOP, HALF_SEAT], FRAME_TUBE, STEEL),
  ...[-HALF_SEAT, HALF_SEAT].flatMap((z) => [
    rod([BACK_X, BACK_TOP, z], [BACK_X + 0.04, SEAT_Y, z], FRAME_TUBE, STEEL),
    rod([BACK_X + 0.04, SEAT_Y, z], [0.3, SEAT_Y, z], FRAME_TUBE, STEEL),
  ]),
  ...[-0.24, -0.03, 0.18].map((x) => box([0.18, 0.04, SEAT_WIDTH - 0.08], [x, SEAT_Y + 0.02, 0], NAVY)),
  ...[0.3, 0.58].map((y) => box([0.04, 0.2, SEAT_WIDTH - 0.08], [BACK_X + 0.03, SEAT_Y + y, 0], NAVY)),
])

/** Garde-corps avec repose-pieds, en position baissée, à l'origine sur son axe. */
export const BAR_GEOMETRY = merged([
  ...[-HALF_SEAT, HALF_SEAT].map((z) => rod([0, 0, z], [0.72, -0.34, z], FRAME_TUBE, DARK)),
  rod([0.72, -0.34, -HALF_SEAT], [0.72, -0.34, HALF_SEAT], FRAME_TUBE, DARK),
  ...[-0.3, 0.3].map((z) => rod([0.72, -0.34, z], [0.82, -1.25, z], FRAME_TUBE, DARK)),
  rod([0.82, -1.25, -0.6], [0.82, -1.25, 0.6], FRAME_TUBE, DARK),
])

/** Dépassement du fût au-dessus du câble, jusqu'à la traverse. */
export const PYLON_HEAD_RISE = 0.42
const REACH = RETURN_GAP / 2

/** Fût de pylône de hauteur 1, pied à l'origine, avec les montants de son échelle : il est étiré à la hauteur voulue. */
export const COLUMN_GEOMETRY = merged([
  tinted(new THREE.CylinderGeometry(0.22, 0.4, 1, 10).translate(0, 0.5, 0), STEEL),
  ...[-0.17, 0.17].map((z) => box([0.035, 1, 0.035], [0.44, 0.5, z], DARK)),
])

/** Tête de pylône, origine à hauteur de câble entre les deux brins : traverse, potence, balanciers à galets. */
export const HEAD_GEOMETRY = merged([
  box([0.46, 0.4, 0.46], [0, 0.22, 0], STEEL),
  box([0.28, 0.26, RETURN_GAP + 1], [0, PYLON_HEAD_RISE + 0.13, 0], STEEL),
  ...[-REACH * 0.5, REACH * 0.5].map((z) => rod([0, PYLON_HEAD_RISE + 0.26, z], [0, 1.5, z], 0.05, STEEL)),
  rod([0, 1.5, -REACH * 0.5], [0, 1.5, REACH * 0.5], 0.05, STEEL),
  box([0.05, 0.42, 0.5], [0.3, -1.3, 0], YELLOW),
  ...[-REACH, REACH].flatMap((z) => [
    rod([0, PYLON_HEAD_RISE, z], [0, -0.14, z], 0.05, STEEL),
    box([2.3, 0.1, 0.1], [0, -0.19, z], DARK),
    ...[-0.86, -0.29, 0.29, 0.86].map((x) => roller(0.17, 0.09, [x, -0.19, z + 0.1], DARK)),
  ]),
])

/** Portée des jambes du portique de gare de part et d'autre de l'axe : les sièges passent entre elles. */
const PORTAL_REACH = REACH + 1.35
const PORTAL_X = -5.7
const CARRIAGE_Y = 0.66

/**
 * Gare, origine au centre de la poulie à hauteur de câble, la ligne partant vers -x : grande poulie
 * sur son mât, poutre porteuse, carter du groupe moteur, portique à galets au départ de la ligne.
 */
export const WHEEL_GEOMETRY = merged([
  tinted(new THREE.CylinderGeometry(REACH - 0.06, REACH - 0.06, 0.07, 30), YELLOW),
  tinted(new THREE.TorusGeometry(REACH, 0.075, 6, 30).rotateX(Math.PI / 2), DARK),
  tinted(new THREE.CylinderGeometry(0.34, 0.34, 0.5, 12), DARK),
  ...[0, 1, 2].map((i) =>
    tinted(new THREE.BoxGeometry(REACH * 1.9, 0.09, 0.14).rotateY((i * Math.PI) / 3).translate(0, 0.06, 0), DARK),
  ),
  tinted(
    new THREE.CylinderGeometry(0.3, 0.44, STATION_CABLE_HEIGHT, 10).translate(0, -STATION_CABLE_HEIGHT / 2 - 0.2, 0),
    STEEL,
  ),
  box([1.5, 0.3, 1.5], [0, -STATION_CABLE_HEIGHT + 0.15, 0], DARK),
  box([7.4, 0.34, 0.5], [-2.5, CARRIAGE_Y, 0], STEEL),
  box([2.5, 1, 1.8], [-0.1, CARRIAGE_Y + 0.67, 0], BLUE),
  box([2.7, 0.09, 2], [-0.1, CARRIAGE_Y + 1.21, 0], DARK),
  box([0.9, 0.5, 1.84], [-0.5, CARRIAGE_Y + 0.6, 0], DARK),
  rod([1.1, CARRIAGE_Y, 0], [2.7, -STATION_CABLE_HEIGHT, 0], 0.09, STEEL),
  box([0.3, 0.3, PORTAL_REACH * 2 + 0.3], [PORTAL_X, CARRIAGE_Y, 0], STEEL),
  ...[-PORTAL_REACH, PORTAL_REACH].map((z) =>
    box([0.26, STATION_CABLE_HEIGHT + CARRIAGE_Y, 0.26], [PORTAL_X, (CARRIAGE_Y - STATION_CABLE_HEIGHT) / 2, z], STEEL),
  ),
  ...[-REACH, REACH].flatMap((z) => [
    rod([PORTAL_X, CARRIAGE_Y, z], [PORTAL_X, 0.3, z], 0.05, STEEL),
    box([1.5, 0.1, 0.1], [PORTAL_X, 0.24, z], DARK),
    ...[-0.5, 0, 0.5].map((x) => roller(0.16, 0.09, [PORTAL_X + x, 0.19, z + 0.1], DARK)),
  ]),
])

/** Demi-largeur du couloir d'embarquement, entre ses barrières. */
export const LANE_HALF_WIDTH = 1.3
const HUT_Z = -RETURN_GAP - 0.2

function hut(x: number, z: number): THREE.BufferGeometry[] {
  return [
    box([2.5, 0.18, 2.5], [x, 0.09, z], DARK),
    box([2.3, 2.2, 2.3], [x, 1.28, z], WHITE),
    box([2.34, 0.75, 2.34], [x, 1.62, z], GLASS),
    box([3, 0.16, 3], [x, 2.46, z], BLUE),
  ]
}

/**
 * Quai d'embarquement, origine sur la ligne d'embarquement au sol, la montée vers -x : tapis, lignes
 * d'attente et d'embarquement, poteaux du portillon, couloir, portique d'entrée, cabane du perchman.
 */
export const LOADING_GEOMETRY = merged([
  box([GATE_BACK + 2.6, 0.05, LANE_HALF_WIDTH * 2 - 0.1], [(GATE_BACK - 0.6) / 2, 0.025, 0], RUBBER),
  box([0.16, 0.06, LANE_HALF_WIDTH * 2 - 0.1], [0, 0.03, 0], YELLOW),
  box([0.16, 0.06, LANE_HALF_WIDTH * 2 - 0.1], [GATE_BACK - 0.55, 0.03, 0], RED),
  ...[-LANE_HALF_WIDTH, LANE_HALF_WIDTH].flatMap((z) => [
    box([0.24, 1.15, 0.24], [GATE_BACK, 0.575, z], BLUE),
    box([0.28, 0.14, 0.28], [GATE_BACK, 1.22, z], DARK),
    rod([GATE_BACK + 0.3, 0.95, z], [GATE_BACK + LANE_LENGTH, 0.95, z], 0.035, BLUE),
    rod([GATE_BACK + 0.3, 0.5, z], [GATE_BACK + LANE_LENGTH, 0.5, z], 0.03, BLUE),
    ...[2, 4, 6].map((along) => rod([GATE_BACK + along, 0, z], [GATE_BACK + along, 0.98, z], 0.04, BLUE)),
    rod([GATE_BACK + LANE_LENGTH, 0, z * 1.15], [GATE_BACK + LANE_LENGTH, 3.3, z * 1.15], 0.07, STEEL),
  ]),
  box([0.12, 0.75, LANE_HALF_WIDTH * 2.5], [GATE_BACK + LANE_LENGTH, 2.95, 0], BLUE),
  box([0.13, 0.14, LANE_HALF_WIDTH * 2.5], [GATE_BACK + LANE_LENGTH, 2.72, 0], WHITE),
  ...hut(10.6, HUT_Z),
])

/** Barre du portillon, origine sur sa charnière : elle barre le couloir vers +z et se relève pour ouvrir. */
export const GATE_ARM_GEOMETRY = merged([
  box([0.07, 0.1, LANE_HALF_WIDTH * 2 - 0.2], [0, 0, LANE_HALF_WIDTH - 0.1], RED),
  ...[0.5, 1.3, 2.1].map((z) => box([0.075, 0.105, 0.3], [0, 0, z], WHITE)),
])
export const GATE_ARM_HEIGHT = 0.95
/** Angle de la barre du portillon grand ouvert, en radians. */
export const GATE_OPEN_ANGLE = 1.4

/** Quai de débarquement, origine sur la ligne de sortie au sol, la poulie amont vers -x : ligne, portique, cabane. */
export const UNLOADING_GEOMETRY = merged([
  box([0.16, 0.06, 2.6], [0, 0.03, 0], YELLOW),
  ...[-1.5, 1.5].map((z) => rod([2.6, 0, z], [2.6, 3.3, z], 0.07, STEEL)),
  box([0.12, 0.75, 3.2], [2.6, 2.95, 0], BLUE),
  box([0.13, 0.14, 3.2], [2.6, 2.72, 0], WHITE),
  ...hut(-10.6, HUT_Z),
])

const PANTS = new THREE.Color(0x3a3f4a)
const HELMET = new THREE.Color(0x2b2f38)
const SKI = new THREE.Color(0x4a4f5a)

/**
 * Passager assis, à l'origine sur la pince de son siège, regard vers +x. Sa veste est blanche : c'est
 * la couleur de chaque exemplaire qui la teinte.
 */
export const RIDER_GEOMETRY = merged([
  box([0.26, 0.56, 0.42], [-0.1, SEAT_Y + 0.42, 0], WHITE),
  box([0.3, 0.1, 0.5], [0.06, SEAT_Y + 0.4, 0], WHITE),
  tinted(new THREE.SphereGeometry(0.13, 8, 6).translate(-0.07, SEAT_Y + 0.86, 0), HELMET),
  box([0.46, 0.15, 0.36], [0.12, SEAT_Y + 0.12, 0], PANTS),
  box([0.14, 0.46, 0.34], [0.33, SEAT_Y - 0.14, 0], PANTS),
  ...[-0.11, 0.11].map((z) => box([1.5, 0.03, 0.09], [0.5, SEAT_Y - 0.4, z], SKI)),
])

/** Skieur debout sur ses skis, pieds à l'origine, regard vers +x : ceux qui attendent ou regardent aux gares. */
export const BYSTANDER_GEOMETRY = merged([
  box([0.24, 0.58, 0.42], [0, 1.22, 0], WHITE),
  ...[-0.26, 0.26].map((z) => box([0.1, 0.55, 0.1], [0.04, 1.16, z], WHITE)),
  tinted(new THREE.SphereGeometry(0.13, 8, 6).translate(0.02, 1.67, 0), HELMET),
  ...[-0.1, 0.1].map((z) => box([0.16, 0.9, 0.15], [0, 0.48, z], PANTS)),
  ...[-0.11, 0.11].map((z) => box([1.6, 0.03, 0.09], [0.1, 0.02, z], SKI)),
  ...[-0.33, 0.33].map((z) => rod([0.12, 0.02, z], [0.06, 1.05, z], 0.012, DARK)),
])

/** Tronçon de câble de longueur 1 dressé à l'origine : il est étiré et couché entre deux points de la boucle. */
export const CABLE_GEOMETRY = markShared(
  tinted(new THREE.CylinderGeometry(0.03, 0.03, 1, 5, 1, true).translate(0, 0.5, 0), DARK),
)

export const LIFT_MATERIAL = markShared(
  new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.2, side: THREE.DoubleSide }),
)
