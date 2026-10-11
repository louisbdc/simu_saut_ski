import { describe, expect, test } from 'vitest'
import { fbm, valueNoise } from './noise'

const samples = Array.from({ length: 4000 }, (_, i) => [((i * 37) % 997) * 0.173 - 60, ((i * 91) % 883) * 0.211 - 70] as const)

describe('bruit naturel', () => {
  test('reste entre 0 et 1 et occupe bien cette plage', () => {
    const values = samples.map(([x, y]) => fbm(x, y))

    values.forEach((value) => {
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThanOrEqual(1)
    })
    expect(Math.min(...values)).toBeLessThan(0.25)
    expect(Math.max(...values)).toBeGreaterThan(0.75)
  })

  test('varie en douceur : deux points voisins ont presque la même valeur', () => {
    samples.slice(0, 500).forEach(([x, y]) => {
      expect(Math.abs(valueNoise(x + 0.01, y) - valueNoise(x, y))).toBeLessThan(0.03)
      expect(Math.abs(fbm(x, y + 0.01) - fbm(x, y))).toBeLessThan(0.05)
    })
  })

  test('donne toujours la même valeur au même endroit', () => {
    expect(fbm(12.3, -45.6)).toBe(fbm(12.3, -45.6))
    expect(valueNoise(-3.2, 8.9)).toBe(valueNoise(-3.2, 8.9))
  })

  test('ne se répète pas : pas de motif régulier comme une somme de sinus', () => {
    const row = Array.from({ length: 200 }, (_, i) => fbm(i * 0.37, 4.2))
    const repeats = [8, 16, 27, 50].map((period) =>
      row.slice(period).reduce((sum, value, i) => sum + Math.abs(value - row[i]), 0) / (row.length - period),
    )

    repeats.forEach((difference) => expect(difference).toBeGreaterThan(0.05))
  })

  test('ajoute du détail avec les octaves sans changer l’allure d’ensemble', () => {
    const coarse = samples.slice(0, 800).map(([x, y]) => fbm(x, y, 1))
    const fine = samples.slice(0, 800).map(([x, y]) => fbm(x, y, 4))
    const gap = coarse.reduce((sum, value, i) => sum + Math.abs(value - fine[i]), 0) / coarse.length

    expect(gap).toBeGreaterThan(0.01)
    expect(gap).toBeLessThan(0.25)
  })
})
