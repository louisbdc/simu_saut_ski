import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { heightAt } from '../physics/terrain'
import type { TerrainPoint } from '../physics/types'
import { markShared } from './sharedAssets'
import { GROOMED_NORMALS, GROOMED_TILE, POWDER_NORMALS, POWDER_TILE } from './snowTextures'
import {
  APRON_LENGTH,
  type CourseShape,
  apronReliefAt,
  type CrossSection,
  type OffPisteSection,
  crossSectionAt,
  offPisteSection,
  rockinessAt,
  surfaceHeightAt,
} from './terrainShape'

export const SNOW_MESH_NAME = 'snow'
export const OFF_PISTE_MESH_NAME = 'off-piste'
export const APRON_MESH_NAME = 'apron'
/** Demi-largeur du monde : assez loin pour que les versants de la vallée cachent le bord. */
const OUTER_HALF_WIDTH = 420

/** Sur les courbes et les bosses, on garde un point du profil sur trois ; sur les droites, un tous les deux mètres. */
const CURVE_DECIMATION = 3
const STRAIGHT_SPACING = 2
/** Marge autour d'une bosse où le maillage reste dense, pour suivre la montée de la neige de côté. */
const KICKER_MARGIN = 0.5
/** Pas du hors-piste le long de la pente : son relief est doux, quelques mètres suffisent. */
const OFF_PISTE_SPACING = 2.5

/** Répartition des sommets sur un flanc, du bord du dessus (0) au pied (1). */
const FLANK_FRACTIONS = [0, 0.15, 0.8, 1] as const
/** Teinture qui bave du trait d'arête sur le haut de chaque flanc. */
const FLANK_TOP_TINTS = [0.85, 0.3, 0] as const
/** Sommets du talus, en fraction de sa largeur, puis du hors-piste, en fraction de ce qui reste jusqu'au bord. */
const BANK_FRACTIONS = [0.15, 0.3, 0.5, 0.7, 0.85, 1] as const
const FAR_FRACTIONS = [0.015, 0.04, 0.07, 0.11, 0.16, 0.22, 0.28, 0.35, 0.42, 0.5, 0.58, 0.66, 0.75, 0.83, 0.92, 1] as const
/** Rangées des prolongements au-delà des bouts de piste, en fraction de leur longueur : serrées près de la piste, larges au loin. */
const APRON_FRACTIONS = [
  0, 0.012, 0.03, 0.055, 0.085, 0.12, 0.16, 0.2, 0.25, 0.3, 0.35, 0.4, 0.46, 0.52, 0.58, 0.64, 0.7, 0.76, 0.82, 0.88, 0.94, 1,
] as const
/** Largeur du halo de teinture au pied des flancs, et hauteur de bosse où il atteint sa pleine force. */
const HAZE_WIDTH = 0.9
const HAZE_FULL_HEIGHT = 0.6
const HAZE_STRENGTH = 0.55

const SNOW_COLOR = new THREE.Color(0xf3f7fc)
const SHOULDER_COLOR = new THREE.Color(0xdde8f3)
export const DYE_COLOR = new THREE.Color(0x1f9df2)
/** Teinte du terrain là où la roche affleure sous la neige, et part maximale de cette teinte. */
const BEDROCK_COLOR = new THREE.Color(0x7d8794)
const BEDROCK_STRENGTH = 0.8

/** Couleur de la neige hors piste en un point : blanche, ou grisée par plaques là où la roche affleure. */
function wildSnowColor(shape: CourseShape, x: number, z: number): THREE.Color {
  const rock = rockinessAt(shape, x, z)
  return rock === 0 ? SHOULDER_COLOR : SHOULDER_COLOR.clone().lerp(BEDROCK_COLOR, rock * BEDROCK_STRENGTH)
}
// Teintes fixes calculées une fois : le maillage est refait à chaque réglage, autant ne rien réallouer.
const FLANK_COLORS = FLANK_TOP_TINTS.map((tint) => SNOW_COLOR.clone().lerp(DYE_COLOR, tint))
const BANK_COLORS = BANK_FRACTIONS.map((fraction) => SNOW_COLOR.clone().lerp(SHOULDER_COLOR, fraction))

const GROOMED_MATERIAL = markShared(
  new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.92,
    normalMap: GROOMED_NORMALS,
    normalScale: new THREE.Vector2(0.38, 0.38),
  }),
)
const POWDER_MATERIAL = markShared(
  new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 1,
    normalMap: POWDER_NORMALS,
    normalScale: new THREE.Vector2(0.8, 0.8),
  }),
)

interface SectionVertex {
  readonly z: number
  readonly y: number
  readonly color: THREE.Color
}

/** Bande de sommets en travers ; chaque bande a ses propres normales, d'où des arêtes franches. */
type Strip = readonly SectionVertex[]

interface Row {
  readonly x: number
  readonly strips: readonly Strip[]
}

/** Abscisse où poser une rangée de sommets. `crease` : arête franche, la rangée est doublée. */
export interface Station {
  readonly x: number
  readonly y: number
  readonly crease: boolean
}

const isFace = (point: TerrainPoint | undefined): boolean => point?.kind === 'face'

const mirror = (strip: Strip): Strip => strip.map((vertex) => ({ ...vertex, z: -vertex.z })).reverse()

/**
 * Rangées de la piste : denses là où le profil tourne ou porte une bosse, espacées sur les droites,
 * où deux points suffisent à décrire un plan. Les murs de lèvre gardent tous leurs points.
 */
export function meshStations(shape: CourseShape): Station[] {
  const { points } = shape.terrain
  const nearKicker = (x: number): boolean =>
    shape.kickers.some((kicker) => x >= kicker.kickStartX - KICKER_MARGIN && x <= kicker.deckStartX + KICKER_MARGIN)
  const stations: Station[] = []
  points.forEach((point, i) => {
    const previous = points[i - 1]
    const atEnd = i === 0 || i === points.length - 1
    const crease = atEnd || isFace(point) !== isFace(previous)
    const pieceStart = previous?.kind !== point.kind || previous?.curvature !== point.curvature
    const dense = point.curvature !== 0 || nearKicker(point.x)
    const lastX = stations[stations.length - 1]?.x ?? -Infinity
    const due = dense ? i % CURVE_DECIMATION === 0 : point.x - lastX >= STRAIGHT_SPACING
    if (crease || pieceStart || isFace(point) || isFace(previous) || due) {
      stations.push({ x: point.x, y: point.y, crease })
    }
  })
  return stations
}

/** Coupe de la piste damée, de gauche à droite : jupe, bord, flanc, dessus de bosse, flanc, bord, jupe. */
function pisteStrips(shape: CourseShape, section: CrossSection, floorY: number): Strip[] {
  const { centerY, sideY, halfWidth, flankRun } = section
  const edge = shape.halfWidth
  const bump = centerY - sideY
  const haze = bump > 0 ? SNOW_COLOR.clone().lerp(DYE_COLOR, HAZE_STRENGTH * Math.min(1, bump / HAZE_FULL_HEIGHT)) : SNOW_COLOR
  const footZ = Math.min(halfWidth + flankRun, edge)

  const flank = FLANK_FRACTIONS.map((fraction, i) => ({
    z: Math.min(halfWidth + fraction * flankRun, edge),
    y: centerY - fraction * bump,
    color: fraction === 1 ? haze : FLANK_COLORS[i],
  }))
  const apron = [
    { z: footZ, y: sideY, color: haze },
    { z: Math.min(footZ + HAZE_WIDTH, edge), y: sideY, color: SNOW_COLOR },
    { z: edge, y: sideY, color: SNOW_COLOR },
  ]
  // Jupe enterrée sous le bord : elle cache le raccord avec le hors-piste, maillé plus large.
  const skirt = [
    { z: edge, y: sideY, color: SNOW_COLOR },
    { z: edge, y: floorY, color: SNOW_COLOR },
  ]
  const top = [
    { z: -halfWidth, y: centerY, color: SNOW_COLOR },
    { z: halfWidth, y: centerY, color: SNOW_COLOR },
  ]
  return [mirror(skirt), mirror(apron), mirror(flank), top, flank, apron, skirt]
}

/** Coupe du hors-piste d'un côté : talus depuis le bord de la piste, versant, puis jupe du bord du monde. */
function offPisteSide(
  shape: CourseShape,
  x: number,
  section: OffPisteSection,
  sideY: number,
  floorY: number,
  side: 1 | -1,
): Strip[] {
  const edge = shape.halfWidth
  const { bankWidth } = section
  const farWidth = OUTER_HALF_WIDTH - edge - bankWidth
  const vertex = (distance: number, color: THREE.Color): SectionVertex => {
    const z = side * (edge + distance)
    return { z, y: section.heightAt(z), color }
  }
  const slope = [
    { z: side * edge, y: sideY, color: SNOW_COLOR },
    ...BANK_FRACTIONS.map((fraction, i) => vertex(fraction * bankWidth, BANK_COLORS[i])),
    ...FAR_FRACTIONS.map((fraction) => {
      const distance = bankWidth + fraction * farWidth
      return vertex(distance, wildSnowColor(shape, x, side * (edge + distance)))
    }),
  ]
  const rim = slope[slope.length - 1]
  const skirt = [rim, { ...rim, y: floorY }]
  return side === 1 ? [slope, skirt] : [[...skirt].reverse(), [...slope].reverse()]
}

const sunk = (row: Row, floorY: number): Row => ({
  x: row.x,
  strips: row.strips.map((strip) => strip.map((vertex) => ({ ...vertex, y: floorY }))),
})

/**
 * Rangées d'un maillage. Celles qui portent une arête sont doublées — la jumelle ne partage pas ses
 * normales, l'arête reste nette — et les deux bouts sont refermés jusqu'au socle.
 */
function buildRows(stations: readonly Station[], stripsAt: (station: Station) => Strip[], floorY: number): Row[] {
  const rows = stations.flatMap((station) => {
    const row = { x: station.x, strips: stripsAt(station) }
    return station.crease ? [row, row] : [row]
  })
  return [sunk(rows[0], floorY), ...rows, sunk(rows[rows.length - 1], floorY)]
}

/** Assemble les rangées en une surface, avec couleurs par sommet et UV en mètres pour le grain de la neige. */
function gridGeometry(rows: readonly Row[], tile: number): THREE.BufferGeometry {
  const stripSizes = rows[0].strips.map((strip) => strip.length)
  const vertexCount = stripSizes.reduce((sum, columns) => sum + columns, 0) * rows.length
  const quadCount = stripSizes.reduce((sum, columns) => sum + columns - 1, 0) * (rows.length - 1)
  const positions = new Float32Array(vertexCount * 3)
  const colors = new Float32Array(vertexCount * 3)
  const uvs = new Float32Array(vertexCount * 2)
  const indices = new Uint32Array(quadCount * 6)
  let vertexIndex = 0
  let indexOffset = 0

  stripSizes.forEach((columns, stripIndex) => {
    const base = vertexIndex
    // Écritures directes : un tableau temporaire par sommet et par quad coûtait plus que le calcul lui-même.
    for (const row of rows) {
      for (const vertex of row.strips[stripIndex]) {
        const at = vertexIndex * 3
        positions[at] = row.x
        positions[at + 1] = vertex.y
        positions[at + 2] = vertex.z
        colors[at] = vertex.color.r
        colors[at + 1] = vertex.color.g
        colors[at + 2] = vertex.color.b
        uvs[vertexIndex * 2] = row.x / tile
        uvs[vertexIndex * 2 + 1] = vertex.z / tile
        vertexIndex++
      }
    }
    for (let rowIndex = 0; rowIndex < rows.length - 1; rowIndex++) {
      for (let column = 0; column < columns - 1; column++) {
        const a = base + rowIndex * columns + column
        const c = a + columns
        indices[indexOffset] = a
        indices[indexOffset + 1] = a + 1
        indices[indexOffset + 2] = c
        indices[indexOffset + 3] = a + 1
        indices[indexOffset + 4] = c + 1
        indices[indexOffset + 5] = c
        indexOffset += 6
      }
    }
  })

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  geometry.setIndex(new THREE.BufferAttribute(indices, 1))
  geometry.computeVertexNormals()
  return geometry
}

/** Neige damée de la piste : dessus et flancs des bosses, tables, réceptions. Seule à projeter une ombre. */
export function buildPiste(shape: CourseShape, stations: readonly Station[], floorY: number): THREE.Mesh {
  const rows = buildRows(
    stations,
    (station) => pisteStrips(shape, crossSectionAt(shape, station.x, station.y), floorY),
    floorY,
  )
  const mesh = new THREE.Mesh(gridGeometry(rows, GROOMED_TILE), GROOMED_MATERIAL)
  mesh.name = SNOW_MESH_NAME
  mesh.receiveShadow = true
  mesh.castShadow = true
  return mesh
}

/** Abscisses régulièrement espacées d'un bout à l'autre de la piste. */
export function evenStations(shape: CourseShape, spacing: number): number[] {
  const { points } = shape.terrain
  const first = points[0].x
  const last = points[points.length - 1].x
  const count = Math.max(1, Math.round((last - first) / spacing))
  return Array.from({ length: count + 1 }, (_, i) => first + ((last - first) * i) / count)
}

/** Talus et versant naturel des deux côtés de la piste, maillés large : leur relief est doux. */
export function buildOffPiste(shape: CourseShape, floorY: number): THREE.Mesh {
  const xs = evenStations(shape, OFF_PISTE_SPACING)
  const stations = xs.map((x, i) => ({ x, y: heightAt(shape.terrain, x), crease: i === 0 || i === xs.length - 1 }))
  const rows = buildRows(
    stations,
    (station) => {
      const { sideY } = crossSectionAt(shape, station.x, station.y)
      const section = offPisteSection(shape, station.x, sideY)
      return [
        ...offPisteSide(shape, station.x, section, sideY, floorY, -1),
        ...offPisteSide(shape, station.x, section, sideY, floorY, 1),
      ]
    },
    floorY,
  )
  const mesh = new THREE.Mesh(gridGeometry(rows, POWDER_TILE), POWDER_MATERIAL)
  mesh.name = OFF_PISTE_MESH_NAME
  mesh.receiveShadow = true
  return mesh
}

/** Écarts latéraux des colonnes d'un prolongement : la piste, son talus, puis le versant jusqu'au bord du monde. */
function apronColumns(shape: CourseShape, edgeX: number): number[] {
  const edge = shape.halfWidth
  const { sideY } = crossSectionAt(shape, edgeX, heightAt(shape.terrain, edgeX))
  const { bankWidth } = offPisteSection(shape, edgeX, sideY)
  const farWidth = OUTER_HALF_WIDTH - edge - bankWidth
  const outward = [
    edge / 2,
    edge,
    ...BANK_FRACTIONS.map((fraction) => edge + fraction * bankWidth),
    ...FAR_FRACTIONS.map((fraction) => edge + bankWidth + fraction * farWidth),
  ]
  return [...outward.map((z) => -z).reverse(), 0, ...outward]
}

/**
 * Terrain au-delà des deux bouts de la piste : le versant qui monte derrière le départ et la vallée
 * qui se prolonge après l'arrivée. Sans eux, la piste finirait sur deux falaises.
 */
export function buildAprons(shape: CourseShape): THREE.Mesh {
  const { points } = shape.terrain
  const ends = [
    { edgeX: points[0].x, direction: -1 },
    { edgeX: points[points.length - 1].x, direction: 1 },
  ]
  const geometries = ends.map(({ edgeX, direction }) => {
    const columns = apronColumns(shape, edgeX)
    // Au-delà du bout de piste, le terrain garde la coupe en travers du bout, monte ou descend d'un bloc,
    // puis se bosselle : la coupe se calcule une fois par colonne, la montée une fois par rangée.
    const edgeHeights = columns.map((z) => surfaceHeightAt(shape, edgeX, z))
    const axisHeight = surfaceHeightAt(shape, edgeX, 0)
    // Rangées dans le sens des x croissants, comme le reste du terrain : la neige regarde le ciel.
    const fractions = direction === 1 ? APRON_FRACTIONS : [...APRON_FRACTIONS].reverse()
    const rows = fractions.map((fraction) => {
      const x = edgeX + direction * fraction * APRON_LENGTH
      const rise = fraction === 0 ? 0 : surfaceHeightAt(shape, x, 0) - axisHeight - apronReliefAt(shape, x, 0)
      const tint = SNOW_COLOR.clone().lerp(SHOULDER_COLOR, Math.min(1, fraction * 12))
      return {
        x,
        strips: [
          columns.map((z, column) => ({
            z,
            y: edgeHeights[column] + rise + apronReliefAt(shape, x, z),
            color: Math.abs(z) <= shape.halfWidth && fraction < 0.1 ? tint : wildSnowColor(shape, x, z),
          })),
        ],
      }
    })
    return gridGeometry(rows, POWDER_TILE)
  })
  const mesh = new THREE.Mesh(mergeGeometries(geometries), POWDER_MATERIAL)
  mesh.name = APRON_MESH_NAME
  mesh.receiveShadow = true
  return mesh
}
