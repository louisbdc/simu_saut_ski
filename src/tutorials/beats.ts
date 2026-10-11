import type { Vector } from './direction'
import { phaseAt, type PhaseId, type PhaseWindow } from './phases'

/**
 * Moments clés d'un saut : les instants précis où le skieur doit faire quelque chose (commencer à
 * pousser, lâcher la vrille, repérer la réception), chacun avec ce que fait chaque partie du corps
 * et où va le regard.
 */

/** Repère dans le saut auquel un moment clé est accroché. */
export type BeatAnchor =
  /** Tant de secondes avant (négatif) ou après le pied du kick, la lèvre ou l'impact. */
  | { readonly from: 'kick' | 'takeoff' | 'landing'; readonly seconds: number }
  /** Quand la vrille, ou le salto, a parcouru tant de degrés. */
  | { readonly spin: number }
  | { readonly flip: number }
  /** À cette part du vol, de 0 (la lèvre) à 1 (l'impact). */
  | { readonly air: number }

/** Où va le regard : la lèvre, l'horizon, par-dessus l'épaule, la réception, ou nulle part d'utile. */
export type GazeKind = 'lip' | 'horizon' | 'shoulder' | 'landing' | 'blind'

export type BodyPart = 'head' | 'chest' | 'hips' | 'knees' | 'hands' | 'skis'

export interface Callout {
  readonly part: BodyPart
  readonly text: string
}

export interface BeatSpec {
  readonly at: BeatAnchor
  readonly title: string
  /** Ce qu'il faut faire à cet instant, et pourquoi à cet instant. */
  readonly text: string
  readonly gaze: GazeKind
  readonly callouts: readonly Callout[]
}

/** Moment clé placé dans un saut simulé. */
export interface Beat extends BeatSpec {
  readonly time: number
  readonly phase: PhaseId
}

/** Orientation du corps à un instant : son axe (du bassin à la tête) et sa largeur (d'une épaule à l'autre). */
export interface PoseAxes {
  readonly axis: Vector
  readonly lateral: Vector
}

/** Degrés de vrille et de salto parcourus au fil du vol. */
export interface RotationTrack {
  readonly times: readonly number[]
  readonly spin: readonly number[]
  readonly flip: readonly number[]
}

export interface JumpTiming {
  readonly kickStart: number
  readonly takeoff: number
  readonly landing: number
  readonly track: RotationTrack
  readonly windows: readonly PhaseWindow[]
}

const DEGREES = 180 / Math.PI
/** En dessous de cet écart, un instant est « à » la lèvre ou « à » l'impact, en secondes. */
const SAME_INSTANT = 0.015

const dot = (a: Vector, b: Vector): number => a.x * b.x + a.y * b.y + a.z * b.z
const cross = (a: Vector, b: Vector): Vector => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x })

/** Angle, en degrés, dont un vecteur a tourné autour d'un axe entre deux poses. */
function turned(before: Vector, after: Vector, about: Vector): number {
  return Math.atan2(dot(cross(before, after), about), dot(before, after)) * DEGREES
}

/** Additionne, pose après pose, ce que le corps a tourné sur lui-même (vrille) et cul par-dessus tête (salto). */
export function rotationTrack(times: readonly number[], poses: readonly PoseAxes[]): RotationTrack {
  const totals = poses.reduce<{ spin: number[]; flip: number[] }>(
    (sums, pose, index) => {
      if (index === 0) return { spin: [0], flip: [0] }
      const previous = poses[index - 1]
      return {
        spin: [...sums.spin, sums.spin[index - 1] + turned(previous.lateral, pose.lateral, previous.axis)],
        flip: [...sums.flip, sums.flip[index - 1] + turned(previous.axis, pose.axis, previous.lateral)],
      }
    },
    { spin: [], flip: [] },
  )
  return { times, spin: totals.spin.map(Math.abs), flip: totals.flip.map(Math.abs) }
}

/** Instant où la rotation atteint un angle ; `null` si la figure ne va pas jusque-là. */
export function timeAtTurn(track: RotationTrack, kind: 'spin' | 'flip', degrees: number): number | null {
  const angles = track[kind]
  const reached = angles.findIndex((angle) => angle >= degrees)
  if (reached === -1) return null
  if (reached === 0) return track.times[0]
  const span = angles[reached] - angles[reached - 1]
  const ratio = span > 0 ? (degrees - angles[reached - 1]) / span : 0
  return track.times[reached - 1] + ratio * (track.times[reached] - track.times[reached - 1])
}

function anchorTime(at: BeatAnchor, timing: JumpTiming): number | null {
  if ('from' in at) {
    const origin = { kick: timing.kickStart, takeoff: timing.takeoff, landing: timing.landing }[at.from]
    return origin + at.seconds
  }
  if ('spin' in at) return timeAtTurn(timing.track, 'spin', at.spin)
  if ('flip' in at) return timeAtTurn(timing.track, 'flip', at.flip)
  return timing.takeoff + at.air * (timing.landing - timing.takeoff)
}

/** Place les moments clés dans un saut, dans l'ordre ; ceux que la figure n'atteint pas sont écartés. */
export function resolveBeats(specs: readonly BeatSpec[], timing: JumpTiming): readonly Beat[] {
  const first = timing.windows[0].start
  const last = timing.windows[timing.windows.length - 1].end
  return specs
    .flatMap((spec) => {
      const time = anchorTime(spec.at, timing)
      if (time === null) return []
      const clamped = Math.min(last, Math.max(first, time))
      return [{ ...spec, time: clamped, phase: phaseAt(timing.windows, clamped) }]
    })
    .sort((a, b) => a.time - b.time)
}

/** Premier moment clé franchi quand la lecture passe de `from` à `to`. */
export function crossedBeat(beats: readonly Beat[], from: number, to: number): Beat | null {
  return beats.find((beat) => beat.time > from && beat.time <= to) ?? null
}

const seconds = (value: number): string => `${value.toFixed(2).replace('.', ',')} s`

/** Dit quand tombe un instant, par rapport à la lèvre ou à l'impact : « 0,28 s avant la lèvre ». */
export function timingLabel(time: number, takeoff: number, landing: number): string {
  if (Math.abs(time - takeoff) < SAME_INSTANT) return 'À la lèvre'
  if (Math.abs(time - landing) < SAME_INSTANT) return 'À l’impact'
  if (time < takeoff) return `${seconds(takeoff - time)} avant la lèvre`
  if (time > landing) return `${seconds(time - landing)} après l’impact`
  const nearLanding = landing - time < time - takeoff
  return nearLanding ? `${seconds(landing - time)} avant l’impact` : `${seconds(time - takeoff)} après la lèvre`
}
