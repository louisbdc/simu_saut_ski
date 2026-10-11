import { describe, expect, test } from 'vitest'
import { getTrick } from '../scene/tricks'
import { crossedBeat, resolveBeats, rotationTrack, timeAtTurn, timingLabel, type BeatSpec, type JumpTiming, type PoseAxes } from './beats'
import { getBeats } from './content/beats'
import { LESSONS } from './lessons'
import { PHASE_IDS, type PhaseWindow } from './phases'

const UP = { x: 0, y: 1, z: 0 }
const SIDE = { x: 0, y: 0, z: 1 }
const radians = (degrees: number): number => (degrees * Math.PI) / 180

/** Corps debout qui a tourné sur lui-même de `degrees`. */
const spun = (degrees: number): PoseAxes => ({ axis: UP, lateral: { x: Math.sin(radians(degrees)), y: 0, z: Math.cos(radians(degrees)) } })
/** Corps qui a basculé cul par-dessus tête de `degrees`. */
const flipped = (degrees: number): PoseAxes => ({ axis: { x: -Math.sin(radians(degrees)), y: Math.cos(radians(degrees)), z: 0 }, lateral: SIDE })

const steps = Array.from({ length: 41 }, (_, index) => index / 40)

/** Saut type : pied du kick à 9 s, lèvre à 10 s, impact à 12 s, rotation régulière sur tout le vol. */
function timing(spins: number, flips: number): JumpTiming {
  const bounds = [6.5, 9, 9.7, 10.25, 11.6, 12, 13.4]
  const windows: PhaseWindow[] = PHASE_IDS.map((id, index) => ({ id, start: bounds[index], end: bounds[index + 1] }))
  const times = steps.map((share) => 10 + 2 * share)
  const degrees = steps.map((share) => 360 * share)
  return {
    kickStart: 9,
    takeoff: 10,
    landing: 12,
    windows,
    track: { times, spin: degrees.map((angle) => angle * Math.abs(spins)), flip: degrees.map((angle) => angle * Math.abs(flips)) },
  }
}

const spec = (at: BeatSpec['at']): BeatSpec => ({ at, title: 'Moment', text: 'Texte', gaze: 'horizon', callouts: [] })

describe('rotation au fil du vol', () => {
  test('une vrille se compte en degrés, sans compter de salto', () => {
    const track = rotationTrack(steps, steps.map((share) => spun(360 * share)))

    expect(track.spin[40]).toBeCloseTo(360, 6)
    expect(track.flip[40]).toBeCloseTo(0, 6)
  })

  test('un salto se compte en degrés, dans un sens comme dans l’autre', () => {
    const back = rotationTrack(steps, steps.map((share) => flipped(360 * share)))
    const front = rotationTrack(steps, steps.map((share) => flipped(-360 * share)))

    expect(back.flip[40]).toBeCloseTo(360, 6)
    expect(front.flip[40]).toBeCloseTo(360, 6)
    expect(back.spin[40]).toBeCloseTo(0, 6)
  })

  test('on retrouve l’instant où la rotation atteint un angle', () => {
    const { track } = timing(1, 0)

    expect(timeAtTurn(track, 'spin', 270)).toBeCloseTo(11.5, 6)
    expect(timeAtTurn(track, 'spin', 0)).toBe(10)
    expect(timeAtTurn(track, 'spin', 400)).toBeNull()
    expect(timeAtTurn(track, 'flip', 90)).toBeNull()
  })
})

describe('moments clés', () => {
  test('chaque repère tombe à son instant', () => {
    const beats = resolveBeats(
      [spec({ from: 'landing', seconds: -0.4 }), spec({ from: 'takeoff', seconds: -0.28 }), spec({ spin: 180 }), spec({ air: 0.25 }), spec({ from: 'kick', seconds: 0 })],
      timing(1, 0),
    )

    expect(beats.map((beat) => Number(beat.time.toFixed(2)))).toEqual([9, 9.72, 10.5, 11, 11.6])
    expect(beats.map((beat) => beat.phase)).toEqual(['compression', 'pop', 'air', 'air', 'spot'])
  })

  test('un angle que la figure n’atteint pas est écarté', () => {
    expect(resolveBeats([spec({ spin: 540 }), spec({ flip: 90 })], timing(1, 0))).toHaveLength(0)
  })

  test('un moment ne sort jamais de la partie du saut qui est montrée', () => {
    const [early] = resolveBeats([spec({ from: 'kick', seconds: -60 })], timing(0, 0))

    expect(early.time).toBe(6.5)
  })

  test('la lecture s’arrête sur le premier moment franchi', () => {
    const beats = resolveBeats([spec({ from: 'takeoff', seconds: 0 }), spec({ air: 0.5 })], timing(0, 0))

    expect(crossedBeat(beats, 9.9, 10.02)?.time).toBe(10)
    expect(crossedBeat(beats, 10, 10.5)).toBeNull()
    expect(crossedBeat(beats, 9, 11.5)?.time).toBe(10)
  })

  test('un instant se dit par rapport à la lèvre ou à l’impact', () => {
    expect(timingLabel(9.72, 10, 12)).toBe('0,28 s avant la lèvre')
    expect(timingLabel(10, 10, 12)).toBe('À la lèvre')
    expect(timingLabel(10.5, 10, 12)).toBe('0,50 s après la lèvre')
    expect(timingLabel(11.6, 10, 12)).toBe('0,40 s avant l’impact')
    expect(timingLabel(12, 10, 12)).toBe('À l’impact')
    expect(timingLabel(12.3, 10, 12)).toBe('0,30 s après l’impact')
  })
})

describe('moments clés des leçons', () => {
  test.each(LESSONS.map((lesson) => lesson.id))('%s : tous ses moments se placent, dans l’ordre, avec des consignes', (id) => {
    const trick = getTrick(id)
    const specs = getBeats(id)

    const beats = resolveBeats(specs, timing(trick.spins, trick.flips))

    expect(specs.length).toBeGreaterThanOrEqual(5)
    expect(beats).toHaveLength(specs.length)
    expect(new Set(beats.map((beat) => beat.time.toFixed(3))).size).toBe(beats.length)
    beats.forEach((beat) => {
      expect(beat.text.length, beat.title).toBeGreaterThan(20)
      expect(beat.callouts.length, beat.title).toBeGreaterThanOrEqual(2)
    })
    // Un moment clé au moins dit quand pousser, et un autre quand on touche la neige.
    expect(beats.some((beat) => Math.abs(beat.time - 10) < 1e-9)).toBe(true)
    expect(beats.some((beat) => Math.abs(beat.time - 12) < 1e-9)).toBe(true)
  })
})
