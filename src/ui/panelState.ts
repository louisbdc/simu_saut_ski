import { MAX_KICKERS, NEW_KICKER, NEW_TRICK } from '../physics/constants'
import { DEFAULT_MODEL_ID, getKickerModel } from '../physics/presets'
import type { EnvironmentConfig, KickerConfig, LineConfig, RiderConfig } from '../physics/types'

/** Ce que le panneau de la piste libre édite : la ligne, le gabarit de chaque bosse et le scénario choisi. */
export interface PanelState {
  readonly config: LineConfig
  readonly models: readonly string[]
  readonly scenario: string
}

/** Réglages d'élan : une bosse qui en suit une autre les garde quand on change son gabarit. */
const INRUN_KEYS = ['inrunAngleDeg', 'inrunLength', 'flatLength'] as const

const replaceAt = <T>(items: readonly T[], index: number, item: T): T[] => items.map((current, i) => (i === index ? item : current))

const withConfig = (state: PanelState, changes: Partial<LineConfig>): PanelState => ({ ...state, config: { ...state.config, ...changes } })

/** Gabarit d'une bosse ; une bosse dont on ne connaît pas le gabarit prend celui par défaut. */
export function modelOf(state: PanelState, index: number): string {
  return state.models[index] ?? DEFAULT_MODEL_ID
}

export function withKickerValue(state: PanelState, index: number, key: keyof KickerConfig, value: number): PanelState {
  return withConfig(state, { kickers: replaceAt(state.config.kickers, index, { ...state.config.kickers[index], [key]: value }) })
}

export function withRiderValue(state: PanelState, key: keyof RiderConfig, value: number): PanelState {
  return withConfig(state, { rider: { ...state.config.rider, [key]: value } })
}

export function withEnvironmentValue(state: PanelState, key: keyof EnvironmentConfig, value: number): PanelState {
  return withConfig(state, { environment: { ...state.config.environment, [key]: value } })
}

export function withTrick(state: PanelState, index: number, trick: string): PanelState {
  return withConfig(state, { tricks: replaceAt(state.config.tricks, index, trick) })
}

export function withStartSwitch(state: PanelState, startSwitch: boolean): PanelState {
  return withConfig(state, { startSwitch })
}

/** Applique un gabarit à une bosse : la première prend tous ses réglages, les suivantes gardent leur élan. */
export function withModel(state: PanelState, index: number, modelId: string): PanelState {
  const model = getKickerModel(modelId)
  const current = state.config.kickers[index]
  const kept = index === 0 ? {} : Object.fromEntries(INRUN_KEYS.map((key) => [key, current[key]]))
  return {
    ...withConfig(state, {
      kickers: replaceAt(state.config.kickers, index, { ...model.kicker, ...kept }),
      tricks: replaceAt(state.config.tricks, index, model.trick),
    }),
    models: state.config.kickers.map((_, i) => (i === index ? model.id : modelOf(state, i))),
  }
}

/** Ajoute une bosse en bout de ligne ; une ligne déjà pleine reste telle quelle. */
export function withNewKicker(state: PanelState): PanelState {
  if (state.config.kickers.length >= MAX_KICKERS) return state
  return {
    ...withConfig(state, { kickers: [...state.config.kickers, NEW_KICKER], tricks: [...state.config.tricks, NEW_TRICK] }),
    models: [...state.config.kickers.map((_, i) => modelOf(state, i)), DEFAULT_MODEL_ID],
  }
}

/** Retire une bosse, avec sa figure et son gabarit ; la dernière bosse ne se retire pas. */
export function withoutKicker(state: PanelState, index: number): PanelState {
  if (state.config.kickers.length <= 1) return state
  const keep = <T>(items: readonly T[]): T[] => items.filter((_, i) => i !== index)
  return {
    ...withConfig(state, { kickers: keep(state.config.kickers), tricks: keep(state.config.tricks) }),
    models: keep(state.config.kickers.map((_, i) => modelOf(state, i))),
  }
}
