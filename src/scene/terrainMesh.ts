import * as THREE from 'three'
import { heightAt } from '../physics/terrain'
import type { KickerLandmarks, Terrain } from '../physics/types'
import { markShared } from './sharedAssets'
import { DYE_COLOR, type Station, buildOffPiste, buildPiste, meshStations } from './snowMesh'
import { type KickerShape, buildCourseShape } from './terrainShape'

const BASE_DEPTH = 8
const RIBBON_LIFT = 0.05
const MARKER_HALF_LENGTH = 0.12
/** Débord du couloir de réception de part et d'autre de la bosse, et largeur de ses liserés. */
const ZONE_OVERHANG = 2.5
const ZONE_LINE_WIDTH = 0.3
/** Largeur des traits de teinture qui soulignent les arêtes. */
const DYE_WIDTH = 0.4
const DYE_INSET = 0.04

const paint = (color: THREE.ColorRepresentation): THREE.Material =>
  markShared(new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }))

const SHORT_ZONE_PAINT = paint(0xe5484d)
const IDEAL_ZONE_PAINT = paint(0x2fb36a)
const LONG_ZONE_PAINT = paint(0xf2a53a)
const TARGET_PAINT = paint(0x0b6b3a)
const DYE = markShared(
  new THREE.MeshStandardMaterial({
    color: DYE_COLOR,
    emissive: DYE_COLOR,
    emissiveIntensity: 0.25,
    roughness: 0.9,
    side: THREE.DoubleSide,
  }),
)

interface Band {
  readonly fromX: number
  readonly toX: number
  readonly fromZ: number
  readonly toZ: number
}

/** Tracé au sol sur la neige de la ligne : il en reprend les rangées pour épouser exactement la piste. */
interface Painter {
  readonly terrain: Terrain
  readonly stations: readonly Station[]
}

/** Bande posée sur la neige de la ligne, pour tracer un trait ou un repère. */
function ribbon(painter: Painter, band: Band, material: THREE.Material): THREE.Mesh {
  const { fromX, toX, fromZ, toZ } = band
  const inner = painter.stations.filter((station) => station.x > fromX && station.x < toX).map((station) => station.x)
  const xs = [fromX, ...inner, toX]
  const positions = xs.flatMap((x) => {
    const y = heightAt(painter.terrain, x) + RIBBON_LIFT
    return [x, y, fromZ, x, y, toZ]
  })
  const indices = xs.slice(1).flatMap((_, i) => {
    const a = i * 2
    return [a, a + 1, a + 2, a + 1, a + 3, a + 2]
  })

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  const mesh = new THREE.Mesh(geometry, material)
  mesh.receiveShadow = true
  return mesh
}

/** Teinture bleue des shapers : arêtes du dessus de la bosse, lèvre et cassure de la table. */
function dyeLines(painter: Painter, kicker: KickerShape, marks: KickerLandmarks, edge: number): THREE.Mesh[] {
  const outer = kicker.halfWidth - DYE_INSET
  const inner = outer - DYE_WIDTH
  const along = { fromX: kicker.kickStartX, toX: kicker.lipX }
  return [
    ribbon(painter, { ...along, fromZ: inner, toZ: outer }, DYE),
    ribbon(painter, { ...along, fromZ: -outer, toZ: -inner }, DYE),
    ribbon(painter, { fromX: kicker.lipX - DYE_WIDTH, toX: kicker.lipX, fromZ: -outer, toZ: outer }, DYE),
    ribbon(painter, { fromX: marks.knuckleStartX, toX: marks.knuckleStartX + DYE_WIDTH, fromZ: -edge, toZ: edge }, DYE),
  ]
}

/** Deux liserés de couleur qui bordent le couloir de réception entre deux abscisses. */
function zoneEdges(painter: Painter, fromX: number, toX: number, halfWidth: number, material: THREE.Material): THREE.Mesh[] {
  const inner = halfWidth - ZONE_LINE_WIDTH
  return [
    ribbon(painter, { fromX, toX, fromZ: inner, toZ: halfWidth }, material),
    ribbon(painter, { fromX, toX, fromZ: -halfWidth, toZ: -inner }, material),
  ]
}

/** Couloir de réception : liserés rouge (trop court), vert (idéal), orange (trop long), et point visé. */
function landingZones(painter: Painter, kicker: KickerShape, marks: KickerLandmarks): THREE.Mesh[] {
  const halfWidth = kicker.halfWidth + ZONE_OVERHANG
  const target = {
    fromX: marks.targetX - MARKER_HALF_LENGTH,
    toX: marks.targetX + MARKER_HALF_LENGTH,
    fromZ: -halfWidth,
    toZ: halfWidth,
  }
  return [
    ...zoneEdges(painter, kicker.deckStartX, marks.landingStartX, halfWidth, SHORT_ZONE_PAINT),
    ...zoneEdges(painter, marks.landingStartX, marks.idealEndX, halfWidth, IDEAL_ZONE_PAINT),
    ...zoneEdges(painter, marks.idealEndX, marks.landingEndX, halfWidth, LONG_ZONE_PAINT),
    ribbon(painter, target, TARGET_PAINT),
  ]
}

/** Construit la piste : neige sculptée, hors-piste, teinture des arêtes, couloir de réception. */
export function buildTerrainGroup(terrain: Terrain): THREE.Group {
  const group = new THREE.Group()
  const shape = buildCourseShape(terrain)
  const stations = meshStations(shape)
  const painter = { terrain, stations }
  const floorY = terrain.points.reduce((min, point) => Math.min(min, point.y), 0) - BASE_DEPTH

  group.add(buildPiste(shape, stations, floorY), buildOffPiste(shape, floorY))
  shape.kickers.forEach((kicker, index) => {
    const marks = terrain.kickers[index]
    group.add(...landingZones(painter, kicker, marks), ...dyeLines(painter, kicker, marks, shape.halfWidth))
  })
  return group
}
