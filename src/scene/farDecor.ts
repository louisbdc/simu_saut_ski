import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { buildContactShadows } from './contactShadows'
import { CHAIR_HALF_WIDTH, type LiftLine } from './liftLine'
import { fbm } from './noise'
import { markShared } from './sharedAssets'
import { APRON_LENGTH, type CourseShape, elevationGainAt, surfaceHeightAt } from './terrainShape'

/**
 * Décor lointain : la forêt des flancs de la vallée et du versant derrière le départ, les
 * paravalanches et les refuges. Tout ce qui se voit de loin est modelé en peu de facettes et tient
 * dans quelques maillages partagés.
 */

/** Maille de la grille où l'on tente de planter un sapin, en mètres. */
const TREE_CELL = 10
const FOREST_HALF_WIDTH = 400
const FOREST_BEYOND_END = 260
/** Près de la piste, c'est la forêt détaillée qui prend le relais : la forêt lointaine commence à cet écart du bord. */
const NEAR_FOREST = 80
/** Couloir gardé nu dans l'axe de la piste, au-delà de ses deux bouts, sur cette distance. */
const OPEN_FACE_HALF_WIDTH = 9
const OPEN_FACE_LENGTH = 70
/** Limite des arbres : pleine forêt sous le premier gain d'altitude, plus rien au-dessus du second. */
const TREE_LINE_START = 28
const TREE_LINE_END = 60
/** Part des cellules plantées hors des massifs forestiers, et enfouissement du pied dans la neige. */
const OPEN_DENSITY = 0.07
/** La lisière haute monte et descend de cette hauteur selon l'endroit : la limite des arbres n'est pas une ligne. */
const TREE_LINE_WOBBLE = 26
const TREE_SINK = 0.5
const LIFT_MARGIN = 2
const REFUGE_CLEARING = 11

const NEEDLE_COLOR = new THREE.Color(0x214a39)
const SNOWY_COLOR = new THREE.Color(0xeef3f8)
const WOOD_COLOR = new THREE.Color(0x6b4a33)
const STONE_COLOR = new THREE.Color(0x7c8591)
const STEEL_COLOR = new THREE.Color(0x4d4640)
const DOOR_COLOR = new THREE.Color(0x2c2018)

/** Rangées de paravalanches : distance derrière le départ, demi-largeur de la rangée, pas, part de trous. */
const BARRIER_ROWS = [130, 165, 200] as const
const BARRIER_HALF_SPAN = 62
/** Les rangées épousent le terrain : elles ondulent de cette amplitude au lieu d'être tirées à la règle. */
const BARRIER_WANDER = 9
const BARRIER_STEP = 9.5
const BARRIER_GAPS = 0.22
const BARRIER_WIDTH = 8

export interface FarSpot {
  readonly x: number
  readonly y: number
  readonly z: number
  readonly scale: number
  readonly yaw: number
  /** Nuance entre 0 (sombre) et 1 (claire) : un sapin sombre de vieille futaie, un jeune sapin clair. */
  readonly tint: number
}

/** Tirage reproductible attaché à une cellule de la grille : la forêt ne bouge pas d'un réglage à l'autre. */
function cellRandom(column: number, row: number): () => number {
  let state = (Math.imul(column, 73856093) ^ Math.imul(row, 19349663)) >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state)
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296
  }
}

/** Densité de forêt entre 0 et 1 : de grands massifs séparés par des clairières et des couloirs. */
export function forestDensity(x: number, z: number): number {
  const massif = THREE.MathUtils.smoothstep(fbm(x / 130, z / 130, 3), 0.3, 0.68)
  return OPEN_DENSITY + (1 - OPEN_DENSITY) * massif
}

/** Âge du peuplement entre 0 et 1 : de vieilles futaies hautes et sombres, des reboisements bas et clairs. */
export const standAge = (x: number, z: number): number => fbm(x / 85 - 3, z / 85 + 11, 2)

/** Hauteur et rayon au sol d'un sapin lointain de taille 1, pour son ombre. */
const FAR_TREE_HEIGHT = 8.4
const FAR_TREE_RADIUS = 2.2

/** Refuges : un sur chaque flanc, bien visibles depuis le départ. */
export function refugeSpots(shape: CourseShape): FarSpot[] {
  const startX = shape.startX
  const spots = [
    { x: startX + 38, z: -(shape.halfWidth + 150), yaw: 0.4 },
    { x: startX - 95, z: shape.halfWidth + 75, yaw: -0.7 },
  ]
  return spots.map((spot) => ({ ...spot, y: surfaceHeightAt(shape, spot.x, spot.z) - 0.3, scale: 1, tint: 0.5 }))
}

/** Le point est-il à dégager : piste et ses abords, face nue dans son axe, télésiège, abords d'un refuge ? */
function keptClear(shape: CourseShape, lift: LiftLine | undefined, refuges: readonly FarSpot[], x: number, z: number): boolean {
  const { points } = shape.terrain
  const first = points[0].x
  const last = points[points.length - 1].x
  const offset = Math.abs(z)
  if (x > first - 20 && x < last + 20) {
    if (offset < shape.halfWidth + NEAR_FOREST) return true
  } else {
    const away = x < first ? first - x : x - last
    if (away < OPEN_FACE_LENGTH && offset < shape.halfWidth + OPEN_FACE_HALF_WIDTH) return true
  }
  if (lift && x > lift.top.x - 20 && x < lift.bottom.x + 25) {
    if (z < lift.z + CHAIR_HALF_WIDTH + LIFT_MARGIN && z > lift.returnZ - CHAIR_HALF_WIDTH - LIFT_MARGIN) return true
  }
  return refuges.some((refuge) => Math.hypot(refuge.x - x, refuge.z - z) < REFUGE_CLEARING)
}

/**
 * Sapins de la forêt lointaine. Chaque cellule d'une grille fixe tente sa chance : la forêt est donc
 * la même d'un réglage à l'autre, seule sa hauteur suit le terrain.
 */
export function farTreeSpots(shape: CourseShape, lift?: LiftLine): FarSpot[] {
  const { points } = shape.terrain
  const refuges = refugeSpots(shape)
  const fromColumn = Math.floor((points[0].x - APRON_LENGTH) / TREE_CELL)
  const toColumn = Math.ceil((points[points.length - 1].x + FOREST_BEYOND_END) / TREE_CELL)
  const rows = Math.ceil(FOREST_HALF_WIDTH / TREE_CELL)
  const spots: FarSpot[] = []

  for (let column = fromColumn; column <= toColumn; column++) {
    for (let row = -rows; row < rows; row++) {
      const random = cellRandom(column, row)
      const x = (column + random()) * TREE_CELL
      const z = (row + random()) * TREE_CELL
      if (keptClear(shape, lift, refuges, x, z)) continue
      // La lisière haute suit le relief : elle grimpe dans les combes abritées, recule sur les croupes.
      const gain = elevationGainAt(shape, x, z) + TREE_LINE_WOBBLE * (fbm(x / 48 + 7, z / 48, 2) - 0.5)
      if (gain >= TREE_LINE_END) continue
      // En approchant de la limite des arbres, la forêt s'éclaircit et les sapins rapetissent.
      const thinning = 1 - THREE.MathUtils.smoothstep(gain, TREE_LINE_START, TREE_LINE_END)
      if (random() > forestDensity(x, z) * thinning) continue
      const age = standAge(x, z)
      spots.push({
        x,
        y: surfaceHeightAt(shape, x, z) - TREE_SINK,
        z,
        scale: (0.42 + 1.05 * age + 0.4 * random()) * (0.5 + 0.5 * thinning),
        yaw: random() * Math.PI * 2,
        tint: Math.min(1, Math.max(0, 1 - age + 0.5 * (random() - 0.5))),
      })
    }
  }
  return spots
}

/** Paravalanches : des rangées de râteliers posées en travers du versant, au-dessus du départ. */
export function barrierSpots(shape: CourseShape): FarSpot[] {
  const firstX = shape.terrain.points[0].x
  return BARRIER_ROWS.flatMap((back, rowIndex) => {
    const count = Math.floor((2 * BARRIER_HALF_SPAN) / BARRIER_STEP)
    return Array.from({ length: count }, (_, i) => i).flatMap((i) => {
      if (cellRandom(i + 500, rowIndex)() < BARRIER_GAPS) return []
      const z = -BARRIER_HALF_SPAN + (i + 0.5) * BARRIER_STEP
      const wander = (offset: number): number => BARRIER_WANDER * (fbm((z + offset) / 55, rowIndex * 3.7, 2) - 0.5) * 2
      const x = firstX - back + wander(0)
      // Chaque râtelier se tourne dans le sens de sa rangée, qui serpente avec le terrain.
      const yaw = Math.atan2(wander(BARRIER_STEP / 2) - wander(-BARRIER_STEP / 2), BARRIER_STEP)
      return [{ x, y: surfaceHeightAt(shape, x, z), z, scale: 1, yaw, tint: 0.5 }]
    })
  })
}

function tinted(geometry: THREE.BufferGeometry, colorAt: (y: number) => THREE.Color): THREE.BufferGeometry {
  const plain = geometry.index ? geometry.toNonIndexed() : geometry
  const positions = plain.getAttribute('position')
  const colors = new Float32Array(positions.count * 3)
  for (let i = 0; i < positions.count; i++) colorAt(positions.getY(i)).toArray(colors, i * 3)
  plain.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  plain.deleteAttribute('uv')
  return plain
}

const box = (size: readonly [number, number, number], center: readonly [number, number, number], color: THREE.Color): THREE.BufferGeometry =>
  tinted(new THREE.BoxGeometry(...size).translate(...center), () => color)

/** Sapin vu de loin, pied à l'origine : deux cônes ouverts à cinq pans, neige sur les pointes. Dix triangles. */
function farTreeGeometry(): THREE.BufferGeometry {
  const tiers = [
    { radius: 2.2, height: 5.2, base: 0.6 },
    { radius: 1.45, height: 4.4, base: 4 },
  ]
  return markShared(
    mergeGeometries(
      tiers.map((tier) =>
        tinted(new THREE.ConeGeometry(tier.radius, tier.height, 5, 1, true).translate(0, tier.base + tier.height / 2, 0), (y) =>
          NEEDLE_COLOR.clone().lerp(SNOWY_COLOR, 0.85 * THREE.MathUtils.smoothstep(y, tier.base, tier.base + tier.height) ** 2),
        ),
      ),
    ),
  )
}

/** Râtelier de paravalanche, pied à l'origine, en travers de la pente : poteaux inclinés vers l'amont et lisses. */
function barrierGeometry(): THREE.BufferGeometry {
  const lean = -0.38
  const posts = [-BARRIER_WIDTH / 2 + 0.4, 0, BARRIER_WIDTH / 2 - 0.4].map((z) => box([0.14, 2.6, 0.14], [0, 1.3, z], STEEL_COLOR))
  const rails = [0.5, 1, 1.5, 2, 2.5].map((y) => box([0.07, 0.17, BARRIER_WIDTH], [0.09, y, 0], STEEL_COLOR))
  const struts = [-BARRIER_WIDTH / 2 + 0.4, BARRIER_WIDTH / 2 - 0.4].map((z) => box([1.6, 0.1, 0.1], [0.8, 0.9, z], STEEL_COLOR))
  return markShared(mergeGeometries([...posts, ...rails].map((part) => part.rotateZ(lean)).concat(struts)))
}

/** Refuge, pied à l'origine : soubassement de pierre, murs de bois, toit à deux pans chargé de neige, cheminée. */
function refugeGeometry(): THREE.BufferGeometry {
  const pitch = 0.62
  const slope = (side: number): THREE.BufferGeometry =>
    tinted(new THREE.BoxGeometry(9, 0.45, 4.2).rotateX(side * pitch).translate(0, 5.05, side * 1.55), () => SNOWY_COLOR)
  return markShared(
    mergeGeometries([
      box([8, 1.1, 6], [0, 0.55, 0], STONE_COLOR),
      box([7.6, 2.7, 5.6], [0, 2.45, 0], WOOD_COLOR),
      tinted(new THREE.CylinderGeometry(0.01, 2.95, 2.1, 4, 1).rotateY(Math.PI / 4).scale(1.32, 1, 1).translate(0, 4.85, 0), () => WOOD_COLOR),
      slope(-1),
      slope(1),
      box([0.7, 1.6, 0.7], [2.4, 5.9, 0.9], STONE_COLOR),
      box([0.1, 1.9, 1.1], [3.82, 2.05, 0], DOOR_COLOR),
      ...[-1.6, 1.6].map((x) => box([1, 0.8, 0.1], [x, 2.8, 2.82], DOOR_COLOR)),
    ]),
  )
}

const FAR_TREE_GEOMETRY = farTreeGeometry()
const BARRIER_GEOMETRY = barrierGeometry()
const REFUGE_GEOMETRY = refugeGeometry()
const FAR_MATERIAL = markShared(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }))

function instances(geometry: THREE.BufferGeometry, spots: readonly FarSpot[]): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, FAR_MATERIAL, spots.length)
  const transform = new THREE.Object3D()
  const color = new THREE.Color()
  spots.forEach((spot, i) => {
    transform.position.set(spot.x, spot.y, spot.z)
    transform.rotation.y = spot.yaw
    transform.scale.setScalar(spot.scale)
    transform.updateMatrix()
    mesh.setMatrixAt(i, transform.matrix)
    // Du vert sombre et froid des vieux sapins au vert plus clair et plus chaud des jeunes.
    mesh.setColorAt(i, color.setRGB(0.66 + 0.62 * spot.tint, 0.74 + 0.5 * spot.tint, 0.78 + 0.3 * spot.tint))
  })
  return mesh
}

/** Forêt lointaine et ses ombres, paravalanches et refuges : quatre maillages pour tout l'arrière-plan proche. */
export function buildFarDecor(shape: CourseShape, lift?: LiftLine): THREE.Group {
  const group = new THREE.Group()
  const trees = farTreeSpots(shape, lift)
  const shadows = buildContactShadows(
    shape,
    trees.map((tree) => ({
      x: tree.x,
      z: tree.z,
      groundY: tree.y + TREE_SINK,
      height: FAR_TREE_HEIGHT * tree.scale,
      radius: FAR_TREE_RADIUS * tree.scale,
    })),
  )
  group.add(
    shadows,
    instances(FAR_TREE_GEOMETRY, trees),
    instances(BARRIER_GEOMETRY, barrierSpots(shape)),
    instances(REFUGE_GEOMETRY, refugeSpots(shape)),
  )
  return group
}
