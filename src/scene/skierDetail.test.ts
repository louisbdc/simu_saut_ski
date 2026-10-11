import { describe, expect, test } from 'vitest'
import { FAR_VIEW_FROM, NEAR_VIEW_UNDER, isFarView } from './skierDetail'

describe('niveau de détail du skieur', () => {
  test('de près, on voit le mannequin', () => {
    expect(isFarView(false, 6)).toBe(false)
    expect(isFarView(true, 6)).toBe(false)
  })

  test('de loin, le corps simplifié suffit', () => {
    expect(isFarView(false, 46)).toBe(true)
    expect(isFarView(true, 46)).toBe(true)
  })

  test('entre les deux seuils, le skieur garde le niveau qu’il avait', () => {
    const between = (FAR_VIEW_FROM + NEAR_VIEW_UNDER) / 2

    expect(isFarView(false, between)).toBe(false)
    expect(isFarView(true, between)).toBe(true)
  })
})
