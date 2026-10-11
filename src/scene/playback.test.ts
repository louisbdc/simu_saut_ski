import { describe, expect, test } from 'vitest'
import type { Sample } from '../physics/types'
import { advance, loopWithin, sampleAt } from './playback'

const sample = (t: number, x: number, speed: number): Sample => ({
  t,
  x,
  y: 0,
  vx: speed,
  vy: 0,
  speed,
  gLoad: 1,
  height: 0,
  tilt: 0,
  airProgress: 0,
  kind: 'inrun',
  kicker: 0,
})

const samples = [sample(0, 0, 0), sample(1, 10, 20), sample(3, 50, 20)]

describe('lecture du parcours', () => {
  test('interpole la position entre deux échantillons', () => {
    const middle = sampleAt(samples, 0.5)

    expect(middle.x).toBeCloseTo(5)
    expect(middle.speed).toBeCloseTo(10)
  })

  test('reste sur le premier et le dernier échantillon hors du parcours', () => {
    expect(sampleAt(samples, -2).x).toBe(0)
    expect(sampleAt(samples, 99).x).toBe(50)
  })

  test('refuse un parcours vide', () => {
    expect(() => sampleAt([], 0)).toThrow('Aucun échantillon')
  })

  test('avance au rythme choisi pendant la descente', () => {
    const next = advance({ time: 1, playing: true, rate: 0.25 }, 2, { descent: 10, total: 30 })

    expect(next.time).toBeCloseTo(1.5)
    expect(next.playing).toBe(true)
  })

  test('ne ralentit pas la remontée : le ralenti ne vaut que pour la descente', () => {
    const next = advance({ time: 12, playing: true, rate: 0.25 }, 2, { descent: 10, total: 30 })

    expect(next.time).toBeCloseTo(14)
  })

  test('garde une lecture accélérée pendant la remontée', () => {
    const next = advance({ time: 12, playing: true, rate: 2 }, 2, { descent: 10, total: 30 })

    expect(next.time).toBeCloseTo(16)
  })

  test('reboucle au départ après la remontée, sans se mettre en pause', () => {
    const next = advance({ time: 29.5, playing: true, rate: 1 }, 1, { descent: 10, total: 30 })

    expect(next.time).toBeCloseTo(0.5)
    expect(next.playing).toBe(true)
  })

  test('ne bouge pas en pause', () => {
    const paused = { time: 4, playing: false, rate: 1 }

    expect(advance(paused, 1, { descent: 10, total: 30 })).toBe(paused)
  })
})

describe('lecture en boucle sur une tranche', () => {
  const window = { start: 2, end: 3 }

  test('laisse la lecture avancer à l’intérieur de la tranche', () => {
    const state = { time: 2.4, playing: true, rate: 1 }

    expect(loopWithin(state, window)).toBe(state)
  })

  test('revient au début une fois la fin dépassée', () => {
    expect(loopWithin({ time: 3.02, playing: true, rate: 1 }, window).time).toBe(2)
  })

  test('ramène dans la tranche une lecture partie d’ailleurs', () => {
    expect(loopWithin({ time: 0.5, playing: true, rate: 1 }, window).time).toBe(2)
  })

  test('en pause, on peut s’arrêter où l’on veut', () => {
    const state = { time: 9, playing: false, rate: 1 }

    expect(loopWithin(state, window)).toBe(state)
  })
})
