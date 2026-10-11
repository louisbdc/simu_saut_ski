import * as THREE from 'three'
import { heightAt } from '../physics/terrain'
import { buildContactShadows } from './contactShadows'
import { fbm } from './noise'
import { CHAIR_HALF_WIDTH, type LiftLine } from './liftLine'
import { markShared } from './sharedAssets'
import { APRON_LENGTH, type CourseShape, bankWidthAt, crossSectionAt, rockinessAt, surfaceHeightAt } from './terrainShape'

/** Un emplacement de rocher possible tous les ROCK_SPACING mètres de piste ; les éboulis n'en gardent qu'une partie. */
const ROCK_SPACING = 1
/** Les éboulis débordent de cette distance au-delà des deux bouts de la piste. */
const SCATTER_OVERRUN = 140
/** Recul du premier rocher derrière le talus, puis profondeur de la bande semée. */
const ROCK_CLEARANCE = 2.5
const SCATTER_DEPTH = 120
/** Part des emplacements gardés hors des éboulis : quelques pierres isolées. */
const LOOSE_DENSITY = 0.1
/** Tailles, en mètres de rayon : pierres, blocs, et au-delà de BOULDER_SIZE la forme détaillée. */
const MIN_STONE = 0.4
const MAX_STONE = 0.95
const MAX_BOULDER = 3.8
const BOULDER_SHARE = 0.3
const BOULDER_SIZE = 1

/** Gros affleurements des flancs de la vallée : nombre, écart à la piste, taille. */
const OUTCROPS = 14
const OUTCROP_NEAR = 90
const OUTCROP_FAR = 300
const MIN_OUTCROP = 4
const MAX_OUTCROP = 10

/**
 * Affleurements d'altitude : des amas de rochers posés là où la roche perce la neige. Maille où l'on
 * tente un amas, seuil d'affleurement, nombre de rochers, rayon de l'amas, tailles.
 */
const CRAG_CELL = 45
const CRAG_HALF_WIDTH = 410
const CRAG_THRESHOLD = 0.35
const MIN_CRAGS = 2
const MAX_CRAGS = 7
const CRAG_SPREAD = 15
const MIN_CRAG = 1.4
const MAX_CRAG = 9

/** Part du rocher enterrée dans la neige. */
const SINK = 0.2
/** Marge gardée libre de part et d'autre des sièges du télésiège. */
const LIFT_MARGIN = 1.5

const ROCK_COLOR = new THREE.Color(0x6f7a8a)
const DARK_ROCK_COLOR = new THREE.Color(0x4f5866)
const ROCK_SNOW_COLOR = new THREE.Color(0xf2f6fb)
/** Une face assez tournée vers le ciel garde la neige. */
const SNOW_FACING = 0.74

/** Rocher posé dans le décor : son centre, enfoncé dans la neige, sa taille et son orientation. */
export interface RockSpot {
  readonly x: number
  readonly y: number
  readonly z: number
  /** Rayon approximatif, en mètres. */
  readonly size: number
  readonly yaw: number
  /** Écrasement vertical et étirement latéral : aucun rocher n'a la forme d'un autre. */
  readonly squash: number
  readonly stretch: number
  /** Pierre à peu de facettes, bloc détaillé vu de près, ou rocher d'un affleurement d'altitude. */
  readonly kind: RockKind
  /** Clarté de sa roche, autour de 1 : aucun rocher n'a tout à fait le gris d'un autre. */
  readonly tint: number
}

export type RockKind = 'stone' | 'boulder' | 'crag'

/** Générateur pseudo-aléatoire reproductible : les rochers ne bougent pas d'un réglage à l'autre. */
function seeded(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state)
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296
  }
}

/** Densité d'éboulis entre 0 et 1 : des coulées de pierres séparées par de la neige vierge. */
function screeDensity(x: number, z: number): number {
  const patch = THREE.MathUtils.smoothstep(fbm(x / 70 + 9, z / 70 - 4, 3), 0.42, 0.74)
  return LOOSE_DENSITY + (1 - LOOSE_DENSITY) * patch
}

/** Le rocher empiète-t-il sur le couloir des sièges, entre le brin montant et le brin descendant ? */
function blocksLift(lift: LiftLine | undefined, z: number, size: number): boolean {
  if (!lift) return false
  const inner = lift.z + CHAIR_HALF_WIDTH + LIFT_MARGIN
  const outer = lift.returnZ - CHAIR_HALF_WIDTH - LIFT_MARGIN
  return z - size < inner && z + size > outer
}

/** Écart latéral à partir duquel le hors-piste commence vraiment, talus franchi, à l'abscisse x. */
function clearOfPiste(shape: CourseShape, x: number): number {
  const { points } = shape.terrain
  const inside = Math.min(Math.max(x, points[0].x), points[points.length - 1].x)
  const { sideY } = crossSectionAt(shape, inside, heightAt(shape.terrain, inside))
  return shape.halfWidth + bankWidthAt(shape, inside, sideY) + ROCK_CLEARANCE
}

function spotAt(shape: CourseShape, x: number, z: number, size: number, random: () => number): RockSpot {
  return {
    x,
    y: surfaceHeightAt(shape, x, z) - size * SINK,
    z,
    size,
    yaw: random() * Math.PI * 2,
    squash: 0.55 + 0.4 * random(),
    stretch: 0.75 + 0.6 * random(),
    kind: size >= BOULDER_SIZE ? 'boulder' : 'stone',
    tint: 0.82 + 0.36 * random(),
  }
}

/** Tirage reproductible attaché à une cellule de la grille des affleurements. */
const cellSeed = (column: number, row: number): number => (Math.imul(column, 73856093) ^ Math.imul(row, 19349663)) >>> 0

/**
 * Affleurements d'altitude : là où la roche perce la neige, un amas de quelques rochers de tailles
 * mêlées, tournés au hasard. Ils suivent les plaques de roche du terrain au lieu de s'aligner.
 */
function cragClusters(shape: CourseShape, lift: LiftLine | undefined): RockSpot[] {
  const { points } = shape.terrain
  const fromColumn = Math.floor((points[0].x - APRON_LENGTH) / CRAG_CELL)
  const toColumn = Math.ceil((points[points.length - 1].x + SCATTER_OVERRUN) / CRAG_CELL)
  const rows = Math.ceil(CRAG_HALF_WIDTH / CRAG_CELL)
  const spots: RockSpot[] = []

  for (let column = fromColumn; column <= toColumn; column++) {
    for (let row = -rows; row < rows; row++) {
      const random = seeded(cellSeed(column, row))
      const centerX = (column + random()) * CRAG_CELL
      const centerZ = (row + random()) * CRAG_CELL
      const rock = rockinessAt(shape, centerX, centerZ)
      if (rock < CRAG_THRESHOLD) continue
      // Plus la roche affleure, plus l'amas est fourni ; son plus gros rocher est au milieu.
      const count = MIN_CRAGS + Math.floor(random() * (MAX_CRAGS - MIN_CRAGS + 1) * rock)
      for (let i = 0; i < count; i++) {
        const reach = i === 0 ? 0 : CRAG_SPREAD * Math.sqrt(random())
        const bearing = random() * Math.PI * 2
        const x = centerX + Math.cos(bearing) * reach
        const z = centerZ + Math.sin(bearing) * reach
        const size = i === 0 ? MAX_CRAG * (0.45 + 0.55 * random()) : MIN_CRAG + (MAX_CRAG * 0.55 - MIN_CRAG) * random() ** 2
        if (rockinessAt(shape, x, z) === 0 || blocksLift(lift, z, size)) continue
        spots.push({
          x,
          y: surfaceHeightAt(shape, x, z) - size * SINK,
          z,
          size,
          yaw: random() * Math.PI * 2,
          squash: 0.6 + 0.75 * random(),
          stretch: 0.8 + 0.95 * random(),
          kind: 'crag',
          tint: 0.78 + 0.4 * random(),
        })
      }
    }
  }
  return spots
}

/**
 * Emplacements des rochers : des éboulis de pierres et de blocs le long de la piste, hors du talus et
 * du couloir du télésiège, et de gros affleurements sur les flancs de la vallée.
 */
export function rockSpots(shape: CourseShape, lift?: LiftLine): RockSpot[] {
  const { points } = shape.terrain
  const from = points[0].x - SCATTER_OVERRUN
  const to = points[points.length - 1].x + SCATTER_OVERRUN
  const slots = Math.floor((to - from) / ROCK_SPACING)
  const spots: RockSpot[] = []

  for (let i = 0; i < slots; i++) {
    const random = seeded(i * 7 + 3)
    const x = from + (i + random()) * ROCK_SPACING
    const side = random() < 0.5 ? -1 : 1
    const size =
      random() < BOULDER_SHARE
        ? BOULDER_SIZE + (MAX_BOULDER - BOULDER_SIZE) * random() ** 2
        : MIN_STONE + (MAX_STONE - MIN_STONE) * random()
    const z = side * (clearOfPiste(shape, x) + size + random() * SCATTER_DEPTH)
    if (random() > screeDensity(x, z) || blocksLift(lift, z, size)) continue
    spots.push(spotAt(shape, x, z, size, random))
  }

  const random = seeded(101)
  for (let i = 0; i < OUTCROPS; i++) {
    const x = from + random() * (to - from)
    const side = i % 2 === 0 ? -1 : 1
    const size = MIN_OUTCROP + (MAX_OUTCROP - MIN_OUTCROP) * random()
    const z = side * (OUTCROP_NEAR + size + random() * (OUTCROP_FAR - OUTCROP_NEAR))
    spots.push(spotAt(shape, x, z, size, random))
  }
  return [...spots, ...cragClusters(shape, lift)]
}

/**
 * Forme de rocher de rayon 1 : un polyèdre cabossé, à facettes, dont les faces tournées vers le ciel
 * sont couvertes de neige. `detail` règle le nombre de facettes.
 */
function rockGeometry(base: THREE.BufferGeometry, seed: number): THREE.BufferGeometry {
  const geometry = base.index ? base.toNonIndexed() : base
  const positions = geometry.getAttribute('position')
  const point = new THREE.Vector3()
  for (let i = 0; i < positions.count; i++) {
    point.fromBufferAttribute(positions, i)
    // Les sommets d'un même coin sont dupliqués : le cabossage dépend de leur position, pas de leur rang.
    const key = Math.round(point.x * 31) * 73856093 + Math.round(point.y * 31) * 19349663 + Math.round(point.z * 31) * 83492791
    const bump = 0.72 + 0.5 * seeded(key + seed)()
    point.multiplyScalar(bump)
    positions.setXYZ(i, point.x, Math.max(point.y, -0.45), point.z)
  }
  geometry.computeVertexNormals()

  const normals = geometry.getAttribute('normal')
  const colors = new Float32Array(positions.count * 3)
  const face = new THREE.Vector3()
  for (let i = 0; i < positions.count; i += 3) {
    face.set(0, 0, 0)
    for (let corner = 0; corner < 3; corner++) face.add(point.fromBufferAttribute(normals, i + corner))
    const snowy = face.normalize().y > SNOW_FACING
    const rock = seeded(i + seed)() < 0.5 ? ROCK_COLOR : DARK_ROCK_COLOR
    for (let corner = 0; corner < 3; corner++) (snowy ? ROCK_SNOW_COLOR : rock).toArray(colors, (i + corner) * 3)
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geometry.deleteAttribute('uv')
  return markShared(geometry)
}

const ROCK_GEOMETRIES: Readonly<Record<RockKind, THREE.BufferGeometry>> = {
  stone: rockGeometry(new THREE.IcosahedronGeometry(1, 0), 11),
  boulder: rockGeometry(new THREE.IcosahedronGeometry(1, 1), 29),
  crag: rockGeometry(new THREE.DodecahedronGeometry(1, 0), 47),
}
const ROCK_MATERIAL = markShared(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }))

function rockMesh(geometry: THREE.BufferGeometry, spots: readonly RockSpot[]): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, ROCK_MATERIAL, spots.length)
  const transform = new THREE.Object3D()
  const tint = new THREE.Color()
  spots.forEach((spot, i) => {
    transform.position.set(spot.x, spot.y, spot.z)
    transform.rotation.y = spot.yaw
    transform.scale.set(spot.size, spot.size * spot.squash, spot.size * spot.stretch)
    transform.updateMatrix()
    mesh.setMatrixAt(i, transform.matrix)
    // Gris un peu plus chaud ou plus froid, plus clair ou plus sombre, d'un rocher à l'autre.
    mesh.setColorAt(i, tint.setRGB(spot.tint * 1.03, spot.tint, spot.tint * (1.9 - spot.tint)))
  })
  mesh.receiveShadow = true
  return mesh
}

/** Rochers du hors-piste : une forme et un maillage par famille, pierres, blocs et affleurements. */
export function buildRocks(shape: CourseShape, lift?: LiftLine): THREE.Group {
  const spots = rockSpots(shape, lift)
  const group = new THREE.Group()
  // Les pierres sont trop petites pour qu'on voie leur ombre : seuls les blocs et les affleurements en ont une.
  const shadows = buildContactShadows(
    shape,
    spots
      .filter((spot) => spot.kind !== 'stone')
      .map((spot) => ({
        x: spot.x,
        z: spot.z,
        groundY: spot.y + spot.size * SINK,
        height: spot.size * spot.squash * 1.3,
        radius: spot.size * Math.max(1, spot.stretch) * 0.95,
      })),
  )
  group.add(
    shadows,
    ...(Object.keys(ROCK_GEOMETRIES) as RockKind[]).map((kind) =>
      rockMesh(
        ROCK_GEOMETRIES[kind],
        spots.filter((spot) => spot.kind === kind),
      ),
    ),
  )
  return group
}
