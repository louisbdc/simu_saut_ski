import { OCCLUDERS_KEY, type Occluder } from './occlusion'
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { heightAt } from '../physics/terrain'
import type { Terrain } from '../physics/types'
import { buildDressing } from './dressing'
import { type ShadowCaster, buildContactShadows } from './contactShadows'
import { buildFarDecor, forestDensity, standAge } from './farDecor'
import { buildFences } from './fences'
import { type LiftLine, fencedRange } from './liftLine'
import { buildRocks } from './rocks'
import { buildAprons } from './snowMesh'
import { markShared } from './sharedAssets'
import { type CourseShape, bankWidthAt, buildCourseShape, crossSectionAt, offPisteHeight } from './terrainShape'

export const HORIZON_COLOR = 0xd6e6f4
const ZENITH_COLOR = 0x2c6db8
const SUN_COLOR = 0xfff3d6
const SKY_RADIUS = 4500

/** Un emplacement de sapin possible tous les TREE_SPACING mètres de piste ; les bosquets n'en gardent qu'une partie. */
const TREE_SPACING = 1.6
/** Recul des premiers sapins derrière le talus, puis profondeur de la forêt. */
export const TREE_CLEARANCE = 4
const FOREST_DEPTH = 95
/** Part des emplacements gardés hors des bosquets : quelques sapins isolés. */
const SPARSE_DENSITY = 0.06
const NEEDLE_COLOR = new THREE.Color(0x24523f)
const TREE_SNOW_COLOR = new THREE.Color(0xf4f8fc)
const TRUNK_COLOR = new THREE.Color(0x4b3a2c)
/** Étages d'un sapin, du bas vers le haut : rayon, hauteur et altitude de la base, en mètres. */
const TREE_TIERS = [
  { radius: 2, height: 3.4, base: 1.3 },
  { radius: 1.5, height: 3, base: 3.3 },
  { radius: 1, height: 2.6, base: 5.1 },
] as const
const TRUNK_HEIGHT = 2
/** Part de neige à la pointe de chaque étage ; elle s'efface vers le bas des branches. */
const TREE_SNOW_COVER = 0.9

const RANGE_SEGMENTS = 260
const RANGE_BASE_DROP = 160
const ROCK_COLOR = new THREE.Color(0x7f93b0)
const HAZE_COLOR = new THREE.Color(0xbccbe0)
const SUMMIT_SNOW_COLOR = new THREE.Color(0xf7fafd)
/** Part de la hauteur d'un sommet au-dessus de laquelle la roche disparaît sous la neige. */
const SNOW_LINE = 0.42
/** Coupe d'un massif, du pied vers l'arrière : recul depuis la crête et part de la hauteur de crête, pour chaque rang de sommets. */
const RANGE_PROFILE = [
  { inset: 1, rise: 0 },
  { inset: 0.72, rise: 0.16 },
  { inset: 0.45, rise: 0.46 },
  { inset: 0.2, rise: 0.8 },
  { inset: 0, rise: 1 },
  { inset: -0.3, rise: 0.55 },
] as const
/** Massifs, du plus proche au plus lointain : distance de la crête, hauteur des plus hauts sommets, profondeur, nombre de sommets. */
const RANGES = [
  { radius: 2900, height: 520, depth: 1100, peaks: 13, seed: 7 },
  { radius: 4000, height: 980, depth: 1300, peaks: 9, seed: 23 },
] as const

/** Générateur pseudo-aléatoire reproductible : le décor ne change pas à chaque réglage. */
function seeded(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state)
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296
  }
}

/** Dôme de ciel dégradé, du bleu profond au zénith à la brume claire sur l'horizon, avec le soleil et son halo. */
export function createSky(sunDirection: THREE.Vector3): THREE.Mesh {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      zenith: { value: new THREE.Color(ZENITH_COLOR) },
      horizon: { value: new THREE.Color(HORIZON_COLOR) },
      sunColor: { value: new THREE.Color(SUN_COLOR) },
      sunDirection: { value: sunDirection.clone().normalize() },
    },
    vertexShader: `
      varying vec3 vDirection;
      void main() {
        vDirection = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 zenith;
      uniform vec3 horizon;
      uniform vec3 sunColor;
      uniform vec3 sunDirection;
      varying vec3 vDirection;
      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      float noise(vec2 p) {
        vec2 cell = floor(p);
        vec2 f = fract(p);
        vec2 blend = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash(cell), hash(cell + vec2(1.0, 0.0)), blend.x),
          mix(hash(cell + vec2(0.0, 1.0)), hash(cell + vec2(1.0, 1.0)), blend.x),
          blend.y
        );
      }
      float clouds(vec2 p) {
        return 0.5 * noise(p) + 0.25 * noise(p * 2.1) + 0.125 * noise(p * 4.3) + 0.0625 * noise(p * 8.7) + 0.06;
      }
      void main() {
        vec3 direction = normalize(vDirection);
        float height = clamp(direction.y, 0.0, 1.0);
        float facing = max(dot(direction, sunDirection), 0.0);
        float disc = smoothstep(0.9994, 0.9998, facing);
        float halo = 0.45 * pow(facing, 220.0) + 0.16 * pow(facing, 14.0);
        vec3 sky = mix(horizon, zenith, pow(height, 0.5));
        // Nuages : un plafond lointain projeté sur le dôme, effacé près de l'horizon et au zénith.
        vec2 ceiling = direction.xz / max(direction.y, 0.06) * 0.55;
        float cover = smoothstep(0.52, 0.78, clouds(ceiling + vec2(3.1, 1.7)));
        float band = smoothstep(0.03, 0.2, direction.y) * (1.0 - smoothstep(0.55, 0.95, direction.y));
        sky = mix(sky, vec3(1.0), cover * band * 0.8);
        gl_FragColor = vec4(sky + sunColor * (disc + halo), 1.0);
      }`,
  })
  const sky = new THREE.Mesh(new THREE.SphereGeometry(SKY_RADIUS, 32, 16), material)
  sky.frustumCulled = false
  return sky
}

/** Colore tous les sommets d'une géométrie selon leur hauteur relative, de 0 (bas) à 1 (haut). */
function paintByHeight(geometry: THREE.BufferGeometry, colorAt: (ratio: number) => THREE.Color): THREE.BufferGeometry {
  geometry.computeBoundingBox()
  const box = geometry.boundingBox as THREE.Box3
  const positions = geometry.getAttribute('position')
  const colors = new Float32Array(positions.count * 3)
  for (let i = 0; i < positions.count; i++) {
    const ratio = (positions.getY(i) - box.min.y) / (box.max.y - box.min.y || 1)
    colorAt(ratio).toArray(colors, i * 3)
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return geometry
}

/** Sapin à trois étages, branches vertes et dessus enneigé, pied posé à l'origine. Un seul maillage. */
function treeGeometry(): THREE.BufferGeometry {
  const trunk = paintByHeight(
    new THREE.CylinderGeometry(0.2, 0.3, TRUNK_HEIGHT, 6).translate(0, TRUNK_HEIGHT / 2, 0),
    () => TRUNK_COLOR,
  )
  const tiers = TREE_TIERS.map((tier) =>
    paintByHeight(new THREE.ConeGeometry(tier.radius, tier.height, 7, 2).translate(0, tier.base + tier.height / 2, 0), (ratio) =>
      NEEDLE_COLOR.clone().lerp(TREE_SNOW_COLOR, TREE_SNOW_COVER * ratio * ratio),
    ),
  )
  // Bourrelet de neige au pied : sans lui le tronc semble planté dans une surface lisse.
  const drift = paintByHeight(new THREE.ConeGeometry(1.1, 0.5, 7).translate(0, 0.2, 0), () => TREE_SNOW_COLOR)
  return markShared(mergeGeometries([trunk, drift, ...tiers]))
}

const TREE_GEOMETRY = treeGeometry()
const TREE_MATERIAL = markShared(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }))

/** Hauteur et rayon au sol d'un sapin proche de taille 1, pour son ombre. */
const TREE_HEIGHT = 7.7
const TREE_RADIUS = 2
/** Part du rayon au sol d'un sapin qui cache vraiment ce qui est derrière lui. */
const TREE_SIGHT_SHARE = 0.6

/**
 * Sapins détaillés du bord de piste, avec leurs ombres. Ils suivent les mêmes massifs et les mêmes
 * peuplements que la forêt lointaine : la lisière passe de l'une à l'autre sans rupture.
 */
function buildTrees(shape: CourseShape): THREE.Group {
  const { terrain } = shape
  const first = terrain.points[0].x
  const last = terrain.points[terrain.points.length - 1].x
  const slots = Math.max(1, Math.floor((last - first) / TREE_SPACING))
  const transform = new THREE.Object3D()
  const tint = new THREE.Color()
  const matrices: THREE.Matrix4[] = []
  const tints: THREE.Color[] = []
  const casters: ShadowCaster[] = []

  for (let i = 0; i < slots; i++) {
    const random = seeded(i + 1)
    const x = first + (i + random()) * TREE_SPACING
    const side = random() < 0.5 ? -1 : 1
    const { sideY } = crossSectionAt(shape, x, heightAt(terrain, x))
    const nearest = shape.halfWidth + bankWidthAt(shape, x, sideY) + TREE_CLEARANCE
    const z = side * (nearest + random() * FOREST_DEPTH)
    if (random() > SPARSE_DENSITY + (1 - SPARSE_DENSITY) * forestDensity(x, z)) continue

    const age = standAge(x, z)
    const scale = 0.5 + 0.85 * age + 0.35 * random()
    const groundY = offPisteHeight(shape, x, sideY, z)
    transform.position.set(x, groundY, z)
    transform.rotation.y = random() * Math.PI * 2
    transform.scale.setScalar(scale)
    transform.updateMatrix()
    matrices.push(transform.matrix.clone())
    // Vieux sapins sombres, jeunes sapins clairs, et chacun sa nuance.
    const shade = 1 - age + 0.5 * (random() - 0.5)
    tints.push(tint.clone().setRGB(0.7 + 0.5 * shade, 0.78 + 0.4 * shade, 0.8 + 0.28 * shade))
    casters.push({ x, z, groundY, height: TREE_HEIGHT * scale, radius: TREE_RADIUS * scale })
  }

  const trees = new THREE.InstancedMesh(TREE_GEOMETRY, TREE_MATERIAL, matrices.length)
  matrices.forEach((matrix, i) => {
    trees.setMatrixAt(i, matrix)
    trees.setColorAt(i, tints[i])
  })
  // Un sapin est un cône : à mi-hauteur, il n'occupe plus qu'une part de son rayon au sol.
  const occluders: Occluder[] = casters.map((caster, instance) => ({
    x: caster.x,
    y: caster.groundY,
    z: caster.z,
    radius: caster.radius * TREE_SIGHT_SHARE,
    height: caster.height,
    instance,
  }))
  trees.userData[OCCLUDERS_KEY] = occluders
  const group = new THREE.Group()
  group.add(buildContactShadows(shape, casters), trees)
  return group
}

interface Summit {
  readonly angle: number
  readonly height: number
  readonly width: number
}

/** Écart entre deux directions autour de l'horizon, par le plus court chemin. */
const around = (a: number, b: number): number => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)))

/**
 * Un massif : des sommets distincts reliés par des cols, vus tout autour de la piste. La roche
 * affleure sur les pentes basses, la neige couvre les hauts, le pied se perd dans la brume.
 */
function rangeGeometry(range: (typeof RANGES)[number]): THREE.BufferGeometry {
  const random = seeded(range.seed)
  const summits: Summit[] = Array.from({ length: range.peaks }, (_, i) => ({
    angle: ((i + random() * 0.7) / range.peaks) * Math.PI * 2,
    height: range.height * (0.5 + 0.5 * random()),
    width: 0.13 + 0.16 * random(),
  }))
  /** Ligne de crête : le plus haut des sommets voisins, chacun en pointe, sur un socle de cols. */
  const crestAt = (angle: number): number =>
    summits.reduce(
      (crest, summit) => Math.max(crest, summit.height * Math.max(0, 1 - around(angle, summit.angle) / summit.width) ** 1.5),
      range.height * 0.22,
    )

  const positions: number[] = []
  const colors: number[] = []
  const indices: number[] = []
  for (let i = 0; i < RANGE_SEGMENTS; i++) {
    const angle = (i / RANGE_SEGMENTS) * Math.PI * 2
    const crest = crestAt(angle) * (0.94 + 0.12 * random())
    RANGE_PROFILE.forEach((ring) => {
      const radius = range.radius - ring.inset * range.depth + (ring.rise > 0 ? (random() - 0.5) * 90 : 0)
      const height = crest * ring.rise * (ring.rise === 1 ? 1 : 0.85 + 0.3 * random())
      positions.push(Math.cos(angle) * radius, height, Math.sin(angle) * radius)
      const altitude = height / range.height
      const snow = THREE.MathUtils.smoothstep(altitude, SNOW_LINE * 0.6, SNOW_LINE * 1.3)
      const color = HAZE_COLOR.clone().lerp(ROCK_COLOR, THREE.MathUtils.smoothstep(altitude, 0, 0.18)).lerp(SUMMIT_SNOW_COLOR, snow)
      colors.push(color.r, color.g, color.b)
    })
    const a = i * RANGE_PROFILE.length
    const b = ((i + 1) % RANGE_SEGMENTS) * RANGE_PROFILE.length
    for (let ring = 0; ring < RANGE_PROFILE.length - 1; ring++) {
      indices.push(a + ring, a + ring + 1, b + ring, a + ring + 1, b + ring + 1, b + ring)
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

/** Tous les massifs en un seul maillage, construit une fois : ils ne dépendent d'aucun réglage. */
const RANGE_GEOMETRY = markShared(mergeGeometries(RANGES.map(rangeGeometry)))
// Les massifs portent déjà leur propre brume dans leurs couleurs : celle de la scène les effacerait.
const RANGE_MATERIAL = markShared(
  new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true, side: THREE.DoubleSide, fog: false }),
)

function buildRanges(terrain: Terrain): THREE.Mesh {
  const first = terrain.points[0]
  const last = terrain.points[terrain.points.length - 1]
  const ranges = new THREE.Mesh(RANGE_GEOMETRY, RANGE_MATERIAL)
  ranges.position.set((first.x + last.x) / 2, Math.min(first.y, last.y) - RANGE_BASE_DROP, 0)
  return ranges
}

/**
 * Décor lointain : terrain au-delà des bouts de piste, rochers, forêt des flancs, paravalanches,
 * refuges. Il coûte plus cher à poser que le reste et bouge à peine d'un réglage à l'autre : on ne le
 * refait que quand le réglage est stabilisé.
 */
export function buildFarSurroundings(terrain: Terrain, lift?: LiftLine): THREE.Group {
  const shape = buildCourseShape(terrain)
  const group = new THREE.Group()
  group.add(buildAprons(shape), buildRocks(shape, lift), buildFarDecor(shape, lift))
  return group
}

/** Décor proche de la piste : massifs au loin, bosquets de sapins, filets, oriflammes, arche et numéros des bosses. */
export function buildSurroundings(terrain: Terrain, lift?: LiftLine): THREE.Group {
  const shape = buildCourseShape(terrain)
  const group = new THREE.Group()
  group.add(buildRanges(terrain), buildTrees(shape), buildFences(shape, lift && fencedRange(lift)), buildDressing(shape))
  return group
}
