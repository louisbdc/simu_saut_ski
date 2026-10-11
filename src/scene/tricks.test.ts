import { describe, expect, test } from 'vitest'
import {
  CUSTOM_TRICK_LIMITS,
  TRICKS,
  customTrickId,
  getTrick,
  landsOpposite,
  nominalTurns,
  parseCustomTrick,
  stancesAlong,
} from './tricks'


describe('catalogue des figures', () => {
  test('chaque figure a un identifiant et un nom uniques', () => {
    expect(new Set(TRICKS.map((trick) => trick.id)).size).toBe(TRICKS.length)
    expect(new Set(TRICKS.map((trick) => trick.label)).size).toBe(TRICKS.length)
  })

  test('le nom d’une figure additionne 360° par salto et par vrille', () => {
    const degrees = (id: string): number => nominalTurns(getTrick(id)) * 360

    expect(degrees('spin720')).toBe(720)
    expect(degrees('backflip')).toBe(360)
    expect(degrees('cork720')).toBe(720)
    expect(degrees('rodeo540')).toBe(540)
    expect(degrees('cork1440')).toBe(1440)
    expect(degrees('straight')).toBe(0)
  })

  test('les saltos se font en nombre entier, pour retomber sur ses skis', () => {
    TRICKS.forEach((trick) => expect(Number.isInteger(trick.flips)).toBe(true))
  })

  test('un identifiant inconnu ou absent donne le saut droit', () => {
    expect(getTrick('inconnue').id).toBe('straight')
    expect(getTrick(undefined).id).toBe('straight')
  })
})

describe('sens de glisse le long de la ligne', () => {
  const tricks = (...ids: string[]) => ids.map(getTrick)

  test('seules les figures à demi-vrille font atterrir dans l’autre sens', () => {
    const reversing = TRICKS.filter(landsOpposite).map((trick) => trick.id)

    expect(reversing).toEqual(['spin180', 'spin540', 'spin540mute', 'rodeo540', 'misty540'])
  })

  test('le skieur reste de face tant qu’aucune figure ne le retourne', () => {
    expect(stancesAlong(tricks('backflip', 'spin360', 'cork720'), false)).toEqual([false, false, false, false])
  })

  test('un 180 fait atterrir en switch, et le skieur le reste jusqu’au demi-tour suivant', () => {
    const stances = stancesAlong(tricks('spin180', 'spin360', 'spin540', 'backflip'), false)

    // Sens avant chaque bosse, puis après la dernière.
    expect(stances).toEqual([false, true, true, false, false])
  })

  test('parti en switch, un 180 remet le skieur de face', () => {
    expect(stancesAlong(tricks('spin360', 'spin180'), true)).toEqual([true, true, false])
  })

  test('sans bosse, il ne reste que le sens de départ', () => {
    expect(stancesAlong([], true)).toEqual([true])
  })
})

describe('figure personnalisée', () => {
  test('dix backflips : dix saltos arrière groupés, sans vrille', () => {
    const trick = getTrick(customTrickId({ flips: 10, spinDegrees: 0, grab: 'none' }))

    expect(trick.flips).toBe(10)
    expect(trick.spins).toBe(0)
    expect(trick.family).toBe('backflip')
    expect(trick.tuckMax).toBe(1)
    expect(trick.label).toBe('10 backflips')
  })

  test('une vrille est arrondie au demi-tour : on se pose de face ou en switch, jamais de travers', () => {
    const trick = getTrick(customTrickId({ flips: 0, spinDegrees: 20000, grab: 'mute' }))

    expect(trick.spins).toBe(55.5)
    expect(trick.family).toBe('spin')
    expect(trick.grab).toBe('mute')
    expect(trick.label).toBe('19980 mute')
    expect(landsOpposite(trick)).toBe(true)
  })

  test('saltos et vrille ensemble donnent un désaxé, vers l’arrière ou vers l’avant', () => {
    expect(getTrick(customTrickId({ flips: 3, spinDegrees: 720, grab: 'none' })).family).toBe('cork')
    expect(getTrick(customTrickId({ flips: -2, spinDegrees: 360, grab: 'none' })).family).toBe('misty')
    expect(getTrick(customTrickId({ flips: -2, spinDegrees: 0, grab: 'none' })).label).toBe('Double frontflip')
    expect(getTrick(customTrickId({ flips: 3, spinDegrees: 720, grab: 'none' })).label).toBe('Triple cork 1800')
  })

  test('les valeurs sont bornées et un identifiant abîmé retombe sur le saut droit', () => {
    expect(getTrick('custom:999:0:none').flips).toBe(CUSTOM_TRICK_LIMITS.flips)
    expect(getTrick('custom:abc:0:none').id).toBe('straight')
    expect(getTrick('custom:1:360:nimporte').grab).toBe('none')
  })

  test('relire un identifiant redonne les réglages choisis', () => {
    const settings = { flips: -3, spinDegrees: 540, grab: 'japan' } as const

    expect(parseCustomTrick(customTrickId(settings))).toEqual(settings)
    expect(parseCustomTrick('backflip')).toBeNull()
  })
})
