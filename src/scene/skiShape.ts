/** Forme d'un ski à doubles spatules : contour vu de dessus, relevé des spatules et maillage. */
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { markShared } from './sharedAssets'
import { SKIER_STYLE } from './skierStyle'

const THICKNESS = 0.024
/** Le ski dépasse plus devant la chaussure que derrière : avancée de la spatule et du talon, en mètres. */
const TIP_AHEAD = 0.08
const TAIL_AHEAD = 0.04
/** Part de la demi-longueur qui reste à plat sur la neige. */
const FLAT_SHARE = 0.7
/** Le talon se relève un peu moins que la spatule. */
const TAIL_RISE_SHARE = 0.8

/** Lignes de cotes, rapportées à la largeur de `skierStyle.ts` : spatule, patin, talon. */
const TIP_WIDTH = 1.06
const WAIST_WIDTH = 0.84
const TAIL_WIDTH = 1
/** Où se trouve le patin le long du ski, et part de la longueur prise par chaque bout arrondi. */
const WAIST_AT = 0.47
const END_CAP = 0.05
/** L'arrondi s'arrête juste avant la pointe : un bout de largeur nulle n'aurait pas de face à éclairer. */
const CAP_REACH = 0.99998
/** Rondeur des bouts : 2 donne une ellipse, davantage un bout plus carré, comme une spatule de freestyle. */
const CAP_BLUNTNESS = 3

const CAP_STEPS = 12
const BODY_STEPS = 36

/** Une coupe du ski : sa place du talon (0) à la spatule (1), sa demi-largeur et son relevé. */
export interface SkiStation {
  readonly along: number
  readonly x: number
  readonly halfWidth: number
  readonly rise: number
}

/** Coupes resserrées dans les bouts, pour que l'arrondi soit lisse, et régulières entre les deux. */
function stationFractions(): number[] {
  const cap = Array.from({ length: CAP_STEPS + 1 }, (_, step) => END_CAP * (1 - Math.cos((step / CAP_STEPS) * (Math.PI / 2))))
  const body = Array.from({ length: BODY_STEPS - 1 }, (_, step) => END_CAP + ((step + 1) / BODY_STEPS) * (1 - 2 * END_CAP))
  return [...cap, ...body, ...cap.map((along) => 1 - along).reverse()]
}

/** Largeur à cet endroit, rapportée à la largeur de référence : ligne de cotes puis bout arrondi. */
function widthShare(along: number): number {
  const front = along >= WAIST_AT
  const widest = front ? 1 - END_CAP : END_CAP
  const endWidth = front ? TIP_WIDTH : TAIL_WIDTH
  const towardEnd = (along - WAIST_AT) / (widest - WAIST_AT)
  if (towardEnd <= 1) return WAIST_WIDTH + (endWidth - WAIST_WIDTH) * towardEnd ** 2
  const intoCap = Math.min(CAP_REACH, Math.abs(along - widest) / END_CAP)
  return endWidth * (1 - intoCap ** CAP_BLUNTNESS) ** (1 / CAP_BLUNTNESS)
}

export function skiOutline(): SkiStation[] {
  const { length, width, tipRise } = SKIER_STYLE.ski
  const half = length / 2
  const tail = TAIL_AHEAD - half
  const tip = TIP_AHEAD + half
  const flatBack = TAIL_AHEAD - half * FLAT_SHARE
  const flatFront = TAIL_AHEAD + half * FLAT_SHARE
  const rise = (x: number): number => {
    if (x > flatFront) return tipRise * ((x - flatFront) / (tip - flatFront)) ** 2
    if (x < flatBack) return tipRise * TAIL_RISE_SHARE * ((flatBack - x) / (flatBack - tail)) ** 2
    return 0
  }
  return stationFractions().map((along) => {
    const x = tail + along * (tip - tail)
    return { along, x, halfWidth: (widthShare(along) * width) / 2, rise: rise(x) }
  })
}

/** Barreau d'un ruban : ses deux bords et leurs coordonnées de texture. */
interface Rung {
  readonly a: THREE.Vector3
  readonly b: THREE.Vector3
  readonly u: number
  readonly va: number
  readonly vb: number
}

/** Ruban tendu de barreau en barreau. Sa face visible est celle d'où le bord `b` est à droite en avançant. */
function ribbon(rungs: readonly Rung[]): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(rungs.flatMap(({ a, b }) => [a.x, a.y, a.z, b.x, b.y, b.z]), 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(rungs.flatMap(({ u, va, vb }) => [u, va, u, vb]), 2))
  geometry.setIndex(
    rungs.slice(1).flatMap((_, index) => {
      const first = index * 2
      return [first, first + 1, first + 2, first + 1, first + 3, first + 2]
    }),
  )
  geometry.computeVertexNormals()
  return geometry
}

export interface SkiGeometry {
  /** Dessus du ski, déplié sur la texture du décor : `u` du talon à la spatule, `v` de gauche à droite. */
  readonly top: THREE.BufferGeometry
  /** Semelle, dépliée de la même façon sur son propre décor, vu de dessous. */
  readonly sole: THREE.BufferGeometry
  /** Chants. */
  readonly edges: THREE.BufferGeometry
}

function buildSkiGeometry(): SkiGeometry {
  const outline = skiOutline()
  const widest = Math.max(...outline.map((station) => station.halfWidth))
  const corner = (station: SkiStation, height: number, side: number) =>
    new THREE.Vector3(station.x, station.rise + height, side * station.halfWidth)
  const plain = { va: 0, vb: 1 }
  // Le décor n'est pas pincé dans les bouts ni au patin : le contour le découpe.
  const sheet = (heightOf: number, firstSide: number): THREE.BufferGeometry =>
    ribbon(
      outline.map((station) => {
        const reach = (0.5 * station.halfWidth) / widest
        return {
          a: corner(station, heightOf, firstSide),
          b: corner(station, heightOf, -firstSide),
          u: station.along,
          va: 0.5 - reach,
          vb: 0.5 + reach,
        }
      }),
    )
  const leftEdge = ribbon(outline.map((station) => ({ a: corner(station, 0, -1), b: corner(station, THICKNESS, -1), u: station.along, ...plain })))
  const rightEdge = ribbon(outline.map((station) => ({ a: corner(station, THICKNESS, 1), b: corner(station, 0, 1), u: station.along, ...plain })))
  const edges = mergeGeometries([leftEdge, rightEdge])
  if (!edges) throw new Error('Maillage du ski impossible à assembler : les deux chants sont incompatibles.')
  return { top: markShared(sheet(THICKNESS, -1)), sole: markShared(sheet(0, 1)), edges: markShared(edges) }
}

/** Maillage commun aux quatre skis : les deux aux pieds et les deux qui se déchaussent dans une chute. */
export const SKI_GEOMETRY = buildSkiGeometry()
