import {
  FACE_RUN,
  FINAL_RUNOUT_LENGTH,
  IDEAL_ZONE_END,
  KNUCKLE_RADIUS,
  RUNOUT_RADIUS,
  SWEET_SPOT_TARGET,
  TERRAIN_STEP,
} from './constants'
import type { KickerLandmarks, LineConfig, SegmentKind, Terrain, TerrainPoint } from './types'

const MIN_PIECE_LENGTH = 1e-9

const toRad = (degrees: number): number => (degrees * Math.PI) / 180

interface Piece {
  readonly kind: SegmentKind
  readonly kicker: number
  readonly length: number
  readonly angle: number
  readonly curvature: number
}

interface Cursor {
  readonly x: number
  readonly y: number
}

type RawPoint = Omit<TerrainPoint, 's'>

function line(kind: SegmentKind, kicker: number, length: number, angle: number): Piece {
  return { kind, kicker, length, angle, curvature: 0 }
}

function arc(kind: SegmentKind, kicker: number, from: number, to: number, radius: number): Piece {
  const curvature = to === from ? 0 : Math.sign(to - from) / radius
  return { kind, kicker, length: radius * Math.abs(to - from), angle: from, curvature }
}

function positionAlong(piece: Piece, start: Cursor, distance: number): Cursor {
  const { angle, curvature } = piece
  if (curvature === 0) {
    return { x: start.x + distance * Math.cos(angle), y: start.y + distance * Math.sin(angle) }
  }
  const end = angle + curvature * distance
  return {
    x: start.x + (Math.sin(end) - Math.sin(angle)) / curvature,
    y: start.y - (Math.cos(end) - Math.cos(angle)) / curvature,
  }
}

/** Échantillonne une pièce et renvoie ses points (sans le point final) ainsi que la position d'arrivée. */
function samplePiece(piece: Piece, start: Cursor): { points: RawPoint[]; end: Cursor } {
  if (piece.length < MIN_PIECE_LENGTH) return { points: [], end: start }
  const count = Math.ceil(piece.length / TERRAIN_STEP)
  const step = piece.length / count
  const points: RawPoint[] = []
  for (let i = 0; i < count; i++) {
    const { x, y } = positionAlong(piece, start, i * step)
    points.push({
      x,
      y,
      angle: piece.angle + piece.curvature * (i + 0.5) * step,
      curvature: piece.curvature,
      kind: piece.kind,
      kicker: piece.kicker,
    })
  }
  return { points, end: positionAlong(piece, start, piece.length) }
}

function withArcLength(raw: readonly RawPoint[]): TerrainPoint[] {
  let s = 0
  return raw.map((point, i) => {
    if (i > 0) s += Math.hypot(point.x - raw[i - 1].x, point.y - raw[i - 1].y)
    return {
      x: point.x,
      y: point.y,
      angle: point.angle,
      curvature: point.curvature,
      kind: point.kind,
      kicker: point.kicker,
      s,
    }
  })
}

/** Construit le profil complet de la ligne, du haut du premier élan au plat final. */
export function buildTerrain(config: LineConfig): Terrain {
  const raw: RawPoint[] = []
  const landmarks: KickerLandmarks[] = []
  let cursor: Cursor = { x: 0, y: 0 }
  const add = (piece: Piece): void => {
    const sampled = samplePiece(piece, cursor)
    raw.push(...sampled.points)
    cursor = sampled.end
  }

  config.kickers.forEach((kicker, index) => {
    const inrun = -toRad(kicker.inrunAngleDeg)
    const takeoff = toRad(kicker.takeoffAngleDeg)
    const landing = -toRad(kicker.landingAngleDeg)
    const radius = kicker.transitionRadius
    const next = config.kickers[index + 1]
    const exitAngle = next ? -toRad(next.inrunAngleDeg) : 0

    add(line('inrun', index, kicker.inrunLength, inrun))
    add(arc('transition', index, inrun, 0, radius))
    add(line('flat', index, kicker.flatLength, 0))
    const baseY = cursor.y
    add(arc('transition', index, 0, takeoff, radius))
    const arcRise = radius * (1 - Math.cos(takeoff))
    add(line('takeoff', index, Math.max(0, kicker.kickerHeight - arcRise) / Math.sin(takeoff), takeoff))

    const lipIndex = raw.length
    const lip = cursor
    add(line('face', index, Math.hypot(FACE_RUN, kicker.deckDrop), Math.atan2(-kicker.deckDrop, FACE_RUN)))
    add(line('deck', index, Math.max(0, kicker.tableLength - FACE_RUN), 0))
    const knuckleStartX = cursor.x
    add(arc('knuckle', index, 0, landing, KNUCKLE_RADIUS))
    const landingStartX = cursor.x
    add(line('landing', index, kicker.landingLength, landing))
    const landingEndX = cursor.x
    add(arc('runout', index, landing, exitAngle, RUNOUT_RADIUS))
    if (!next) add(line('runout', index, FINAL_RUNOUT_LENGTH, 0))

    const landingRun = landingEndX - landingStartX
    landmarks.push({
      lipIndex,
      lipX: lip.x,
      lipY: lip.y,
      baseY,
      knuckleStartX,
      landingStartX,
      landingEndX,
      targetX: landingStartX + SWEET_SPOT_TARGET * landingRun,
      idealEndX: landingStartX + IDEAL_ZONE_END * landingRun,
    })
  })

  const last = raw[raw.length - 1]
  if (last) raw.push({ ...last, ...cursor })

  return {
    points: withArcLength(raw),
    kickers: landmarks,
    lipIndices: new Set(landmarks.map((landmark) => landmark.lipIndex)),
  }
}

export interface TerrainLocation {
  /** Indice du segment contenant x. */
  readonly index: number
  /** Distance déjà parcourue sur ce segment. */
  readonly offset: number
  readonly y: number
  readonly angle: number
}

/** Indice du dernier point qui précède x ; x doit être strictement à l'intérieur du profil. */
function segmentStart(points: readonly TerrainPoint[], x: number): number {
  let low = 0
  let high = points.length - 1
  while (high - low > 1) {
    const middle = (low + high) >> 1
    if (points[middle].x <= x) low = middle
    else high = middle
  }
  return low
}

/** Situe une abscisse sur le profil. Hors du profil, le terrain est prolongé à plat. */
export function locate(terrain: Terrain, x: number): TerrainLocation {
  const { points } = terrain
  const lastIndex = points.length - 1
  if (x <= points[0].x) return { index: 0, offset: 0, y: points[0].y, angle: 0 }
  if (x >= points[lastIndex].x) return { index: lastIndex, offset: 0, y: points[lastIndex].y, angle: 0 }

  const low = segmentStart(points, x)
  const a = points[low]
  const b = points[low + 1]
  const ratio = (x - a.x) / (b.x - a.x)
  const length = Math.hypot(b.x - a.x, b.y - a.y)
  return {
    index: low,
    offset: ratio * length,
    y: a.y + ratio * (b.y - a.y),
    angle: Math.atan2(b.y - a.y, b.x - a.x),
  }
}

/**
 * Altitude du profil à l'abscisse x : même résultat que `locate(terrain, x).y`, sans calculer
 * la longueur du segment, sa pente ni l'objet de retour. Elle est appelée des milliers de fois
 * par seconde simulée (vol, chute articulée), d'où ce chemin court.
 */
export function heightAt(terrain: Terrain, x: number): number {
  const { points } = terrain
  const lastIndex = points.length - 1
  if (x <= points[0].x) return points[0].y
  if (x >= points[lastIndex].x) return points[lastIndex].y

  const low = segmentStart(points, x)
  const a = points[low]
  const b = points[low + 1]
  const ratio = (x - a.x) / (b.x - a.x)
  return a.y + ratio * (b.y - a.y)
}
