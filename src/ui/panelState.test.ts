import { describe, expect, test } from 'vitest'
import { DEFAULT_LINE, MAX_KICKERS, NEW_KICKER, NEW_TRICK } from '../physics/constants'
import { DEFAULT_MODEL_ID, getKickerModel } from '../physics/presets'
import {
  modelOf,
  withEnvironmentValue,
  withKickerValue,
  withModel,
  withNewKicker,
  withRiderValue,
  withStartSwitch,
  withTrick,
  withoutKicker,
  type PanelState,
} from './panelState'

const state: PanelState = { config: DEFAULT_LINE, models: ['hard', 'hard'], scenario: 'hard' }

describe('édition de la ligne', () => {
  test('un curseur ne change que sa valeur, sur sa bosse, sans toucher à l’état d’origine', () => {
    const next = withKickerValue(state, 1, 'kickerHeight', 3)

    expect(next.config.kickers[1].kickerHeight).toBe(3)
    expect(next.config.kickers[0]).toBe(state.config.kickers[0])
    expect(state.config.kickers[1].kickerHeight).toBe(DEFAULT_LINE.kickers[1].kickerHeight)
  })

  test('le skieur, les conditions, la figure et le départ en switch se règlent de la même façon', () => {
    expect(withRiderValue(state, 'mass', 60).config.rider.mass).toBe(60)
    expect(withEnvironmentValue(state, 'headwind', 4).config.environment.headwind).toBe(4)
    expect(withTrick(state, 0, 'spin360').config.tricks).toEqual(['spin360', DEFAULT_LINE.tricks[1]])
    expect(withStartSwitch(state, true).config.startSwitch).toBe(true)
  })

  test('sur la première bosse, un gabarit remplace tous les réglages et propose sa figure', () => {
    const next = withModel(state, 0, 'simple')
    const simple = getKickerModel('simple')

    expect(next.config.kickers[0]).toEqual(simple.kicker)
    expect(next.config.tricks[0]).toBe(simple.trick)
    expect(next.models).toEqual(['simple', 'hard'])
  })

  test('une bosse qui en suit une autre garde son élan quand elle change de gabarit', () => {
    const next = withModel(state, 1, 'simple')
    const before = state.config.kickers[1]

    expect(next.config.kickers[1].inrunAngleDeg).toBe(before.inrunAngleDeg)
    expect(next.config.kickers[1].inrunLength).toBe(before.inrunLength)
    expect(next.config.kickers[1].flatLength).toBe(before.flatLength)
    expect(next.config.kickers[1].kickerHeight).toBe(getKickerModel('simple').kicker.kickerHeight)
  })

  test('une bosse ajoutée arrive en bout de ligne, avec le gabarit et la figure par défaut', () => {
    const next = withNewKicker(state)

    expect(next.config.kickers).toHaveLength(3)
    expect(next.config.kickers[2]).toEqual(NEW_KICKER)
    expect(next.config.tricks[2]).toBe(NEW_TRICK)
    expect(next.models[2]).toBe(DEFAULT_MODEL_ID)
  })

  test('la ligne ne dépasse jamais le nombre maximal de bosses', () => {
    const full = Array.from({ length: MAX_KICKERS }).reduce<PanelState>((current) => withNewKicker(current), state)

    expect(full.config.kickers).toHaveLength(MAX_KICKERS)
    expect(withNewKicker(full)).toBe(full)
  })

  test('supprimer une bosse retire aussi sa figure et son gabarit', () => {
    const next = withoutKicker({ ...state, models: ['simple', 'pro'] }, 0)

    expect(next.config.kickers).toEqual([state.config.kickers[1]])
    expect(next.config.tricks).toEqual([state.config.tricks[1]])
    expect(next.models).toEqual(['pro'])
  })

  test('la dernière bosse ne se supprime pas', () => {
    const single = withoutKicker(state, 0)

    expect(withoutKicker(single, 0)).toBe(single)
  })

  test('une bosse sans gabarit connu est traitée comme le gabarit par défaut', () => {
    expect(modelOf({ ...state, models: [] }, 1)).toBe(DEFAULT_MODEL_ID)
  })
})
