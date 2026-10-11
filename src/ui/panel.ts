import { ENVIRONMENT_LIMITS, KICKER_LIMITS, MAX_KICKERS, RIDER_LIMITS, sanitizeLine, type Limit } from '../physics/constants'
import { KICKER_MODELS, SCENARIOS } from '../physics/presets'
import type { EnvironmentConfig, KickerConfig, LineConfig, RiderConfig } from '../physics/types'
import {
  CUSTOM_TRICK_LIMITS,
  CUSTOM_TRICK_PREFIX,
  GRABS,
  TRICKS,
  customTrickId,
  getTrick,
  hasDirection,
  isRightward,
  parseCustomTrick,
  withDirection,
  type CustomTrickSettings,
  type TrickFamily,
} from '../scene/tricks'
import { el } from './dom'
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

export interface PanelHandlers {
  readonly onChange: (config: LineConfig) => void
  readonly onTuneAll: () => void
  readonly onTuneKicker: (index: number) => void
  /** Charge un scénario complet ; la réponse revient par `setLine`. */
  readonly onScenario: (id: string) => void
}

export interface PanelLine {
  readonly config: LineConfig
  /** Gabarit de chaque bosse ; absent, les gabarits déjà affichés sont conservés. */
  readonly models?: readonly string[]
  readonly scenario?: string
}

export interface Panel {
  /** Remplace les valeurs affichées, par exemple après un réglage automatique ou un scénario. */
  readonly setLine: (line: PanelLine) => void
  /** Ligne affichée, avec le gabarit de chaque bosse et le scénario choisi. */
  readonly getLine: () => Required<PanelLine>
}

const KICKER_LABELS: Readonly<Record<keyof KickerConfig, string>> = {
  inrunAngleDeg: 'Pente de l’élan (°)',
  inrunLength: 'Longueur de l’élan (m)',
  flatLength: 'Plat avant le kick (m)',
  transitionRadius: 'Rayon de la courbe (m)',
  takeoffAngleDeg: 'Angle de sortie (°)',
  kickerHeight: 'Hauteur du kick (m)',
  deckDrop: 'Lèvre au-dessus de la table (m)',
  tableLength: 'Longueur de la table (m)',
  landingAngleDeg: 'Pente de réception (°)',
  landingLength: 'Longueur de réception (m)',
}

const RIDER_LABELS: Readonly<Record<keyof RiderConfig, string>> = {
  mass: 'Masse du skieur (kg)',
  equipmentMass: 'Équipement (kg)',
  friction: 'Frottement neige',
  dragArea: 'Prise à l’air en glisse (m²)',
  dragAreaAir: 'Prise à l’air en vol (m²)',
  popSpeed: 'Pop à la lèvre (m/s, − = absorbé)',
  startSpeed: 'Vitesse au départ (m/s)',
}

const ENVIRONMENT_LABELS: Readonly<Record<keyof EnvironmentConfig, string>> = {
  altitude: 'Altitude (m)',
  headwind: 'Vent de face (m/s)',
}

/** Réglages d'une bosse, rangés par partie de la bosse ; la première partie est ouverte d'office. */
const KICKER_SECTIONS: readonly (readonly [title: string, keys: readonly (keyof KickerConfig)[]])[] = [
  ['Élan', ['inrunAngleDeg', 'inrunLength', 'flatLength']],
  ['Kick', ['transitionRadius', 'takeoffAngleDeg', 'kickerHeight']],
  ['Table et réception', ['deckDrop', 'tableLength', 'landingAngleDeg', 'landingLength']],
]

const FAMILY_GROUPS: readonly (readonly [label: string, families: readonly TrickFamily[]])[] = [
  ['Sauts droits et grabs', ['straight']],
  ['Vrilles', ['spin']],
  ['Saltos', ['backflip', 'frontflip']],
  ['Désaxés', ['cork', 'rodeo', 'misty']],
]

const NEW_CUSTOM_TRICK: CustomTrickSettings = { flips: 1, spinDegrees: 0, grab: 'none' }
const CUSTOM_LABEL = 'Figure perso…'
const NO_GRAB_LABEL = 'Aucun'
const DRAWER_OPEN = 'open'
/** Sens d'une vrille, ou main qui attrape : à gauche d'office, à droite au choix. */
const DIRECTIONS: readonly (readonly [label: string, right: boolean])[] = [
  ['Vers la gauche', false],
  ['Vers la droite', true],
]

const option = (value: string, label: string, selected: boolean): HTMLOptionElement => {
  const item = el('option', { text: label, attributes: { value } })
  item.selected = selected
  return item
}

const button = (text: string, onClick: () => void, className = ''): HTMLButtonElement => {
  const item = el('button', { className, text, attributes: { type: 'button' } })
  item.addEventListener('click', onClick)
  return item
}

/** Curseur et champ chiffré liés : on règle à la main ou on tape la valeur exacte. */
function slider(label: string, value: number, limit: Limit, onInput: (value: number) => void): HTMLElement {
  const range = el('input', { attributes: { type: 'range', min: String(limit.min), max: String(limit.max), step: String(limit.step), 'aria-label': label } })
  const exact = el('input', { attributes: { type: 'number', min: String(limit.min), max: String(limit.max), step: String(limit.step), 'aria-label': `${label}, valeur exacte` } })
  range.value = exact.value = String(value)
  const emit = (source: HTMLInputElement, mirror: HTMLInputElement): void => {
    const typed = Number(source.value)
    if (source.value === '' || !Number.isFinite(typed)) return
    const bounded = Math.min(limit.max, Math.max(limit.min, typed))
    mirror.value = String(bounded)
    onInput(bounded)
  }
  range.addEventListener('input', () => emit(range, exact))
  exact.addEventListener('input', () => emit(exact, range))
  return el('div', { className: 'slider' }, [el('span', { className: 'slider-name', text: label }), exact, range])
}

/** Panneau de réglages de la piste libre : scénario, bosses en onglets, skieur et conditions. */
export function createPanel(initial: PanelLine, handlers: PanelHandlers): Panel {
  let state: PanelState = { config: initial.config, models: [...(initial.models ?? [])], scenario: initial.scenario ?? SCENARIOS[0].id }
  let active = 0
  const openSections = new Set<string>([KICKER_SECTIONS[0][0]])
  const root = el('aside', { attributes: { id: 'panel', 'aria-label': 'Réglages de la ligne' } })
  const toggle = button('Réglages', () => {
    const open = document.body.dataset.panel !== DRAWER_OPEN
    document.body.dataset.panel = open ? DRAWER_OPEN : ''
    toggle.setAttribute('aria-expanded', String(open))
  })
  toggle.id = 'panel-toggle'
  toggle.setAttribute('aria-controls', 'panel')
  toggle.setAttribute('aria-expanded', 'false')
  document.body.append(toggle, root)

  const emit = (): void => handlers.onChange(sanitizeLine(state.config))
  /** Un curseur change une valeur sans rien redessiner ; le reste refait le panneau. */
  const nudge = (next: PanelState): void => {
    state = next
    emit()
  }
  const change = (next: PanelState): void => {
    if (next === state) return
    state = next
    active = Math.min(active, state.config.kickers.length - 1)
    render()
    emit()
  }

  const section = (title: string, content: readonly Node[]): HTMLDetailsElement => {
    const details = el('details', { className: 'panel-section' }, [el('summary', { text: title }), ...content])
    details.open = openSections.has(title)
    details.addEventListener('toggle', () => (details.open ? openSections.add(title) : openSections.delete(title)))
    return details
  }

  const sliders = <T extends object>(
    values: T,
    keys: readonly (keyof T & string)[],
    limits: Readonly<Record<keyof T, Limit>>,
    labels: Readonly<Record<keyof T, string>>,
    apply: (key: keyof T & string, value: number) => PanelState,
  ): HTMLElement[] => keys.map((key) => slider(labels[key], Number(values[key]), limits[key], (value) => nudge(apply(key, value))))

  const header = (): HTMLElement => {
    const scenario = el('select', { attributes: { 'aria-label': 'Scénario' } }, SCENARIOS.map((item) => option(item.id, item.label, item.id === state.scenario)))
    scenario.addEventListener('change', () => {
      state = { ...state, scenario: scenario.value }
      handlers.onScenario(scenario.value)
    })
    return el('header', { className: 'panel-head' }, [
      el('h2', { text: 'Ta ligne' }),
      el('label', { className: 'panel-field', text: 'Scénario ' }, [scenario]),
      el('div', { className: 'panel-actions' }, [
        button('Recharger', () => handlers.onScenario(state.scenario)),
        button('Régler tous les élans', handlers.onTuneAll, 'primary'),
      ]),
    ])
  }

  const tabs = (): HTMLElement => {
    const items = state.config.kickers.map((_, index) => {
      const tab = button(String(index + 1), () => {
        active = index
        render()
      })
      tab.setAttribute('aria-pressed', String(index === active))
      tab.setAttribute('aria-label', `Bosse ${index + 1}`)
      return tab
    })
    const add = button('+', () => {
      const next = withNewKicker(state)
      active = next.config.kickers.length - 1
      change(next)
    })
    add.setAttribute('aria-label', 'Ajouter une bosse')
    const full = state.config.kickers.length >= MAX_KICKERS
    return el('div', { className: 'bump-tabs', attributes: { role: 'group', 'aria-label': 'Bosses' } }, full ? items : [...items, add])
  }

  /** Choix de la figure : le catalogue rangé par famille, ou une figure composée à la main. */
  const trickPicker = (index: number): HTMLElement => {
    const current = state.config.tricks[index]
    const custom = parseCustomTrick(current)
    // La liste montre la figure ; son sens se choisit à côté.
    const picked = custom ? CUSTOM_TRICK_PREFIX : withDirection(current, false)
    const right = isRightward(current)
    const groups = FAMILY_GROUPS.map(([label, families]) => {
      const tricks = TRICKS.filter((trick) => families.includes(trick.family))
      const group = el('optgroup', {}, tricks.map((trick) => option(trick.id, trick.label, trick.id === picked)))
      group.label = label
      return group
    })
    const select = el('select', { attributes: { 'aria-label': 'Figure' } }, [...groups, option(CUSTOM_TRICK_PREFIX, CUSTOM_LABEL, picked === CUSTOM_TRICK_PREFIX)])
    select.addEventListener('change', () =>
      change(withTrick(state, index, select.value === CUSTOM_TRICK_PREFIX ? customTrickId(custom ?? NEW_CUSTOM_TRICK) : withDirection(select.value, right))),
    )
    const picker = el('label', { className: 'panel-field', text: 'Figure ' }, [select])
    const sides = el('div', { className: 'chips', attributes: { role: 'group', 'aria-label': 'Sens de rotation' } }, DIRECTIONS.map(([label, toRight]) => {
      const chip = button(label, () => change(withTrick(state, index, withDirection(current, toRight))))
      chip.setAttribute('aria-pressed', String(toRight === right))
      return chip
    }))
    // Un saut droit ou un salto pur n'ont ni gauche ni droite.
    const field = hasDirection(getTrick(current)) ? el('div', { className: 'custom-trick' }, [picker, sides]) : picker
    if (!custom) return field
    const setCustom = (changes: Partial<CustomTrickSettings>): void => change(withTrick(state, index, customTrickId({ ...custom, ...changes })))
    const grab = el('select', { attributes: { 'aria-label': 'Grab' } }, GRABS.map((kind) => option(kind, kind === 'none' ? NO_GRAB_LABEL : kind, kind === custom.grab)))
    grab.addEventListener('change', () => setCustom({ grab: GRABS.find((kind) => kind === grab.value) ?? 'none' }))
    return el('div', { className: 'custom-trick' }, [
      field,
      slider('Saltos (− = avant)', custom.flips, { min: -CUSTOM_TRICK_LIMITS.flips, max: CUSTOM_TRICK_LIMITS.flips, step: 1 }, (flips) => setCustom({ flips })),
      slider('Vrille (°)', custom.spinDegrees, { min: 0, max: CUSTOM_TRICK_LIMITS.spinDegrees, step: 180 }, (spinDegrees) => setCustom({ spinDegrees })),
      el('label', { className: 'panel-field', text: 'Grab ' }, [grab]),
    ])
  }

  const bump = (index: number): HTMLElement => {
    const kicker = state.config.kickers[index]
    const models = el('div', { className: 'chips', attributes: { role: 'group', 'aria-label': 'Gabarit' } }, KICKER_MODELS.map((model) => {
      const chip = button(model.label, () => change(withModel(state, index, model.id)))
      chip.setAttribute('aria-pressed', String(model.id === modelOf(state, index)))
      return chip
    }))
    const groups = KICKER_SECTIONS.map(([title, keys]) =>
      section(title, sliders(kicker, keys, KICKER_LIMITS, KICKER_LABELS, (key, value) => withKickerValue(state, index, key, value))),
    )
    const actions = [
      button('Régler l’élan', () => handlers.onTuneKicker(index), 'primary'),
      button('Réinitialiser', () => change(withModel(state, index, modelOf(state, index)))),
      ...(state.config.kickers.length > 1 ? [button('Supprimer', () => change(withoutKicker(state, index)), 'danger')] : []),
    ]
    return el('section', { className: 'bump-editor', attributes: { 'aria-label': `Bosse ${index + 1}` } }, [
      el('h3', { text: `Bosse ${index + 1}` }),
      models,
      trickPicker(index),
      ...groups,
      el('div', { className: 'panel-actions' }, actions),
    ])
  }

  const rider = (): HTMLElement => {
    const start = el('input', { attributes: { type: 'checkbox' } })
    start.checked = state.config.startSwitch
    start.addEventListener('change', () => change(withStartSwitch(state, start.checked)))
    const keys = Object.keys(RIDER_LABELS) as (keyof RiderConfig)[]
    return section('Skieur', [
      el('label', { className: 'panel-check' }, [start, document.createTextNode(' Départ en switch (en arrière)')]),
      ...sliders(state.config.rider, keys, RIDER_LIMITS, RIDER_LABELS, (key, value) => withRiderValue(state, key, value)),
    ])
  }

  const conditions = (): HTMLElement => {
    const keys = Object.keys(ENVIRONMENT_LABELS) as (keyof EnvironmentConfig)[]
    return section('Conditions', sliders(state.config.environment, keys, ENVIRONMENT_LIMITS, ENVIRONMENT_LABELS, (key, value) => withEnvironmentValue(state, key, value)))
  }

  function render(): void {
    const scroll = root.scrollTop
    root.replaceChildren(header(), tabs(), bump(active), rider(), conditions())
    root.scrollTop = scroll
  }

  render()
  return {
    getLine: () => ({ config: sanitizeLine(state.config), models: state.config.kickers.map((_, index) => modelOf(state, index)), scenario: state.scenario }),
    setLine: (line: PanelLine): void => {
      state = { config: line.config, models: line.models ? [...line.models] : state.models, scenario: line.scenario ?? state.scenario }
      active = Math.min(active, state.config.kickers.length - 1)
      render()
    },
  }
}
