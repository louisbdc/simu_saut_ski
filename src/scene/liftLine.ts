import { type CourseShape, surfaceHeightAt } from './terrainShape'

/**
 * Écart entre le bord de la piste et le câble montant, puis entre câble montant et câble descendant.
 * Ce second écart est aussi le diamètre des poulies de gare, que le câble contourne en demi-boucle.
 */
const LINE_OFFSET = 3.6
export const RETURN_GAP = 4.2
export const CHAIR_HALF_WIDTH = 0.9
/** Longueur de la suspente : distance entre le câble et l'assise du siège. */
export const HANG_LENGTH = 2.7
/** Recul des gares par rapport aux deux bouts de la piste ; en haut, la gare est sur la plateforme de départ. */
const BOTTOM_INSET = 30
const TOP_INSET = 12
/** Le filet de la piste s'arrête à cette distance en amont de la gare aval et en aval de la gare amont. */
const BOTTOM_GATE = 7
const TOP_GATE = 10
/** Distance entre un quai et l'axe de la poulie de sa gare, plus loin sur la ligne. */
export const WHEEL_BACK = 4
/** Distance entre le quai aval et le portillon où le skieur attend son tour, en aval de la poulie. */
export const GATE_BACK = 7.6
/** Longueur du couloir à barrières qui mène au portillon. */
export const LANE_LENGTH = 6
/** Longueur de câble à plat en gare, entre le quai et le portique de sortie. */
const STATION_FLAT = 3
/** Hauteur du câble en gare : l'assise passe alors à hauteur de genou. */
export const STATION_CABLE_HEIGHT = HANG_LENGTH + 0.65
const PYLON_HEIGHT = 9.5
/** Garde minimale entre le câble et la neige en pleine ligne. */
export const MIN_CLEARANCE = 5.5
/** Distance entre une gare et son premier pylône, où le câble monte de la gare à sa hauteur de ligne. */
const STATION_RAMP = 12
export const MAX_SPAN = 45
const MIN_SPAN = 6
const CLEARANCE_STEP = 2
/** Flèche du câble au milieu d'une portée, en fraction de sa longueur : il pend entre deux appuis. */
const SAG_RATIO = 0.014
/** Nombre de tronçons qui dessinent la courbe du câble sur une portée, et portée minimale pour qu'elle se voie. */
const SAG_SEGMENTS = 6
const MIN_SAGGING_SPAN = 8

/** Creux du câble sous la corde tendue entre ses deux appuis, à la fraction donnée de la portée. */
const sagAt = (span: number, fraction: number): number => 4 * SAG_RATIO * span * fraction * (1 - fraction)

export interface Station {
  readonly x: number
  /** Hauteur de la neige sous le câble montant, là où le skieur embarque ou débarque. */
  readonly groundY: number
}

export interface Pylon {
  readonly x: number
  readonly groundY: number
  readonly topY: number
}

export interface CablePoint {
  readonly x: number
  readonly y: number
  /** Distance parcourue le long du câble depuis le quai aval. */
  readonly distance: number
}

/** Tracé du télésiège : une ligne droite le long de la piste, du plat final jusqu'au départ. */
export interface LiftLine {
  /** Écart latéral du câble montant et du câble descendant. */
  readonly z: number
  readonly returnZ: number
  readonly bottom: Station
  readonly top: Station
  /** Pylônes de bas en haut. */
  readonly pylons: readonly Pylon[]
  /** Câble montant, du quai aval au quai amont. */
  readonly cable: readonly CablePoint[]
  readonly length: number
  /** Longueur de la boucle complète : les deux brins et le tour des deux poulies. */
  readonly loopLength: number
}

/**
 * Abscisses des pylônes entre deux appuis, de bas en haut. Une portée est recoupée en son milieu
 * tant qu'elle est trop longue ou que le câble tendu entre ses appuis frôle la neige.
 */
function pylonsBetween(from: number, to: number, top: (x: number) => number, ground: (x: number) => number): number[] {
  const span = from - to
  if (span < 2 * MIN_SPAN) return []
  const clears = (): boolean => {
    for (let x = to; x <= from; x += CLEARANCE_STEP) {
      const fraction = (x - to) / span
      const cableY = top(to) + fraction * (top(from) - top(to)) - sagAt(span, fraction)
      if (cableY - ground(x) < MIN_CLEARANCE) return false
    }
    return true
  }
  if (span <= MAX_SPAN && clears()) return []
  const middle = (from + to) / 2
  return [...pylonsBetween(from, middle, top, ground), middle, ...pylonsBetween(middle, to, top, ground)]
}

/** Déduit le tracé du télésiège de la forme de la piste : il la suit quand elle s'allonge ou change. */
export function buildLiftLine(shape: CourseShape): LiftLine {
  const { points } = shape.terrain
  const firstX = points[0].x
  const lastX = points[points.length - 1].x
  const z = -(shape.halfWidth + LINE_OFFSET)
  const returnZ = z - RETURN_GAP
  const ground = (x: number): number => surfaceHeightAt(shape, x, z)
  const pylonTop = (x: number): number => ground(x) + PYLON_HEIGHT

  const bottomX = lastX - BOTTOM_INSET
  const topX = Math.min(firstX + TOP_INSET, bottomX - 2 * MIN_SPAN)
  const flat = Math.min(STATION_FLAT, (bottomX - topX) / 8)
  const ramp = Math.min(STATION_RAMP, (bottomX - topX) / 3 - flat)
  const lowest = bottomX - flat - ramp
  const highest = topX + flat + ramp
  const pylonXs = [lowest, ...pylonsBetween(lowest, highest, pylonTop, ground), highest]
  const pylons = pylonXs.map((x) => ({
    x,
    groundY: surfaceHeightAt(shape, x, (z + returnZ) / 2),
    topY: pylonTop(x),
  }))

  const bottomY = ground(bottomX) + STATION_CABLE_HEIGHT
  const topY = ground(topX) + STATION_CABLE_HEIGHT
  const supports = [
    { x: bottomX, y: bottomY },
    { x: bottomX - flat, y: bottomY },
    ...pylons.map((pylon) => ({ x: pylon.x, y: pylon.topY })),
    { x: topX + flat, y: topY },
    { x: topX, y: topY },
  ]
  // Entre deux appuis, le câble suit une courbe : chaque portée est découpée en tronçons qui pendent.
  const curve = supports.flatMap((support, i) => {
    const next = supports[i + 1]
    const span = next ? support.x - next.x : 0
    if (!next || span < MIN_SAGGING_SPAN) return [support]
    return Array.from({ length: SAG_SEGMENTS }, (_, step) => {
      const fraction = step / SAG_SEGMENTS
      return {
        x: support.x - fraction * span,
        y: support.y + fraction * (next.y - support.y) - sagAt(span, fraction),
      }
    })
  })
  let distance = 0
  const cable = curve.map((point, i) => {
    if (i > 0) distance += Math.hypot(point.x - curve[i - 1].x, point.y - curve[i - 1].y)
    return { ...point, distance }
  })

  return {
    z,
    returnZ,
    bottom: { x: bottomX, groundY: ground(bottomX) },
    top: { x: topX, groundY: ground(topX) },
    pylons,
    cable,
    length: distance,
    loopLength: 2 * distance + 4 * WHEEL_BACK + Math.PI * RETURN_GAP,
  }
}

/** Position d'un siège sur la boucle et cap de sa marche (0 = vers l'aval, π = vers l'amont). */
export interface LoopPoint {
  readonly x: number
  readonly y: number
  readonly z: number
  readonly yaw: number
}

/**
 * Point de la boucle des sièges à une distance donnée du quai aval, dans le sens de la marche : brin
 * montant, tour de la poulie amont, brin descendant, tour de la poulie aval, retour au quai. Une
 * distance négative désigne donc un siège qui arrive dans le dos du skieur.
 */
export function loopAt(line: LiftLine, distance: number): LoopPoint {
  const radius = RETURN_GAP / 2
  const arc = Math.PI * radius
  const middleZ = (line.z + line.returnZ) / 2
  const bottom = line.cable[0]
  const top = line.cable[line.cable.length - 1]
  let d = ((distance % line.loopLength) + line.loopLength) % line.loopLength

  if (d < line.length) return { ...cableAt(line, d), z: line.z, yaw: Math.PI }
  d -= line.length
  if (d < WHEEL_BACK) return { x: top.x - d, y: top.y, z: line.z, yaw: Math.PI }
  d -= WHEEL_BACK
  if (d < arc) {
    const angle = d / radius
    return {
      x: top.x - WHEEL_BACK - radius * Math.sin(angle),
      y: top.y,
      z: middleZ + radius * Math.cos(angle),
      // Il tourne avec la poulie : son cap passe de l'amont à l'aval.
      yaw: Math.PI - angle,
    }
  }
  d -= arc
  if (d < WHEEL_BACK) return { x: top.x - WHEEL_BACK + d, y: top.y, z: line.returnZ, yaw: 0 }
  d -= WHEEL_BACK
  if (d < line.length) return { ...cableAt(line, line.length - d), z: line.returnZ, yaw: 0 }
  d -= line.length
  if (d < WHEEL_BACK) return { x: bottom.x + d, y: bottom.y, z: line.returnZ, yaw: 0 }
  d -= WHEEL_BACK
  if (d < arc) {
    const angle = d / radius
    return {
      x: bottom.x + WHEEL_BACK + radius * Math.sin(angle),
      y: bottom.y,
      z: middleZ - radius * Math.cos(angle),
      yaw: -angle,
    }
  }
  d -= arc
  return { x: bottom.x + WHEEL_BACK - d, y: bottom.y, z: line.z, yaw: Math.PI }
}

/** Point du câble montant à une distance donnée du quai aval ; hors du câble, on reste au quai. */
export function cableAt(line: LiftLine, distance: number): { x: number; y: number } {
  const { cable } = line
  const clamped = Math.min(Math.max(distance, 0), line.length)
  const next = Math.max(1, cable.findIndex((point) => point.distance >= clamped))
  const a = cable[next - 1]
  const b = cable[next]
  const ratio = (clamped - a.distance) / (b.distance - a.distance || 1)
  return { x: a.x + ratio * (b.x - a.x), y: a.y + ratio * (b.y - a.y) }
}

/** Hauteur du câble montant à l'aplomb de l'abscisse x. */
export function cableHeightAtX(line: LiftLine, x: number): number {
  const { cable } = line
  const next = Math.max(1, cable.findIndex((point) => point.x <= x))
  const a = cable[next - 1]
  const b = cable[next]
  return a.y + ((x - a.x) / (b.x - a.x || 1)) * (b.y - a.y)
}

/** Portion du bord de piste où le filet reste fermé, entre les passages des deux gares. */
export function fencedRange(line: LiftLine): { fromX: number; toX: number } {
  return { fromX: line.top.x + TOP_GATE, toX: line.bottom.x - BOTTOM_GATE }
}
