import { describe, expect, test } from 'vitest'
import type { Sample } from '../physics/types'
import { soundFrame, type SoundInput } from './soundCues'

const sample = (changes: Partial<Sample> = {}): Sample => ({
  t: 5,
  x: 40,
  y: 10,
  vx: 15,
  vy: 0,
  speed: 15,
  gLoad: 1,
  height: 0,
  tilt: 0,
  airProgress: 0,
  kind: 'inrun',
  kicker: 0,
  ...changes,
})

const input = (changes: Partial<SoundInput> = {}): SoundInput => ({
  previous: sample({ t: 4.98 }),
  current: sample(),
  playing: true,
  rate: 1,
  fallen: false,
  wasFallen: false,
  landingImpact: 0.5,
  ...changes,
})

const kinds = (changes: Partial<SoundInput>): string[] => soundFrame(input(changes)).events.map((event) => event.kind)

describe('sons de la descente', () => {
  test('sur la neige, on entend la glisse, d’autant plus fort que le skieur va vite', () => {
    const slow = soundFrame(input({ current: sample({ speed: 5 }) }))
    const fast = soundFrame(input({ current: sample({ speed: 20 }) }))

    expect(slow.glide).toBeGreaterThan(0)
    expect(fast.glide).toBeGreaterThan(slow.glide)
    expect(fast.glide).toBeLessThanOrEqual(1)
  })

  test('en l’air, la glisse se tait et le vent prend le relais', () => {
    const air = soundFrame(input({ previous: sample({ t: 4.98, kind: 'air' }), current: sample({ kind: 'air', height: 3 }) }))
    const ground = soundFrame(input())

    expect(air.glide).toBe(0)
    expect(air.wind).toBeGreaterThan(ground.wind)
  })

  test('en pause, tout se tait', () => {
    const frame = soundFrame(input({ playing: false }))

    expect(frame).toMatchObject({ glide: 0, wind: 0, events: [] })
  })

  test('quitter la lèvre et retrouver la neige se signalent une seule fois', () => {
    expect(kinds({ previous: sample({ t: 4.98, kind: 'takeoff' }), current: sample({ kind: 'air' }) })).toEqual(['takeoff'])
    expect(kinds({ previous: sample({ t: 4.98, kind: 'air' }), current: sample({ kind: 'landing' }) })).toEqual(['landing'])
    expect(kinds({ previous: sample({ t: 4.98, kind: 'air' }), current: sample({ kind: 'air' }) })).toEqual([])
    expect(kinds({})).toEqual([])
  })

  test('une réception dure s’entend plus fort qu’une réception douce', () => {
    const landing = (landingImpact: number): number =>
      soundFrame(input({ previous: sample({ t: 4.98, kind: 'air' }), current: sample({ kind: 'landing' }), landingImpact })).events[0].strength

    expect(landing(1.6)).toBeGreaterThan(landing(0.3))
    expect(landing(9)).toBeLessThanOrEqual(1)
  })

  test('une chute remplace le bruit de la réception', () => {
    expect(kinds({ previous: sample({ t: 4.98, kind: 'air' }), current: sample({ kind: 'landing' }), fallen: true })).toEqual(['crash'])
  })

  test('une fois à terre, plus de bruit de chute à chaque image', () => {
    expect(kinds({ fallen: true, wasFallen: true })).toEqual([])
  })

  test('un saut dans la lecture (boucle, curseur) ne déclenche aucun événement', () => {
    expect(kinds({ previous: sample({ t: 1, kind: 'air' }), current: sample({ kind: 'landing' }) })).toEqual([])
    expect(kinds({ previous: null, current: sample({ kind: 'air' }) })).toEqual([])
  })

  test('au ralenti, les sons descendent dans le grave', () => {
    expect(soundFrame(input({ rate: 0.25 })).pitch).toBeLessThan(soundFrame(input({ rate: 1 })).pitch)
    expect(soundFrame(input({ rate: 0.1 })).pitch).toBeGreaterThan(0)
  })
})
