import GUI from 'lil-gui'
import {
  ENVIRONMENT_LIMITS,
  KICKER_LIMITS,
  MAX_KICKERS,
  NEW_KICKER,
  NEW_TRICK,
  RIDER_LIMITS,
  sanitizeLine,
  type Limit,
} from '../physics/constants'
import { DEFAULT_MODEL_ID, KICKER_MODELS, SCENARIOS, getKickerModel } from '../physics/presets'
import type { EnvironmentConfig, KickerConfig, LineConfig, RiderConfig } from '../physics/types'
import {
  CUSTOM_TRICK_LIMITS,
  CUSTOM_TRICK_PREFIX,
  GRABS,
  TRICKS,
  customTrickId,
  parseCustomTrick,
  type CustomTrickSettings,
} from '../scene/tricks'

type Mutable<T> = { -readonly [K in keyof T]: T[K] }

/** Copie modifiable de la config, que lil-gui édite en place avant qu'on en émette une copie propre. */
interface Draft {
  kickers: Mutable<KickerConfig>[]
  tricks: string[]
  startSwitch: boolean
  rider: Mutable<RiderConfig>
  environment: Mutable<EnvironmentConfig>
}

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
}

const KICKER_LABELS: Readonly<Record<keyof KickerConfig, string>> = {
  inrunAngleDeg: "Pente de l'élan (°)",
  inrunLength: "Longueur de l'élan (m)",
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
  dragArea: "Prise à l'air en glisse (m²)",
  dragAreaAir: "Prise à l'air en vol (m²)",
  popSpeed: 'Pop à la lèvre (m/s, − = absorbé)',
  startSpeed: 'Vitesse au départ (m/s)',
}

const ENVIRONMENT_LABELS: Readonly<Record<keyof EnvironmentConfig, string>> = {
  altitude: 'Altitude (m)',
  headwind: 'Vent de face (m/s)',
}

/** Réglages d'élan : une bosse qui en suit une autre les garde quand on change son gabarit. */
const INRUN_KEYS = ['inrunAngleDeg', 'inrunLength', 'flatLength'] as const

const toOptions = (items: readonly { id: string; label: string }[]): Record<string, string> =>
  Object.fromEntries(items.map((item) => [item.label, item.id]))

const SCENARIO_OPTIONS = toOptions(SCENARIOS)
const MODEL_OPTIONS = toOptions(KICKER_MODELS)
/** Dernière entrée de la liste : ouvre les réglages d'une figure composée à la main. */
const TRICK_OPTIONS = { ...toOptions(TRICKS), 'Figure perso…': CUSTOM_TRICK_PREFIX }
const NEW_CUSTOM_TRICK: CustomTrickSettings = { flips: 1, spinDegrees: 0, grab: 'none' }
const GRAB_OPTIONS = Object.fromEntries(GRABS.map((grab) => [grab === 'none' ? 'Aucun' : grab, grab]))

function toDraft(config: LineConfig): Draft {
  return {
    kickers: config.kickers.map((kicker) => ({ ...kicker })),
    tricks: config.kickers.map((_, index) => config.tricks[index] ?? NEW_TRICK),
    startSwitch: config.startSwitch,
    rider: { ...config.rider },
    environment: { ...config.environment },
  }
}

/** Réglages du gabarit pour la bosse `index` : la première les prend tous, les suivantes gardent leur élan. */
function modelKicker(modelId: string, index: number, current: KickerConfig): Mutable<KickerConfig> {
  const model = { ...getKickerModel(modelId).kicker }
  if (index === 0) return model
  return { ...model, ...Object.fromEntries(INRUN_KEYS.map((key) => [key, current[key]])) }
}

function addSliders<T extends object>(
  folder: GUI,
  values: T,
  limits: Readonly<Record<keyof T, Limit>>,
  labels: Readonly<Record<keyof T, string>>,
  onChange: () => void,
): void {
  for (const key of Object.keys(labels) as (keyof T & string)[]) {
    const { min, max, step } = limits[key]
    folder.add(values, key, min, max, step).name(labels[key]).onChange(onChange)
  }
}

export function createPanel(initial: PanelLine, handlers: PanelHandlers): Panel {
  let draft = toDraft(initial.config)
  let models = [...(initial.models ?? [])]
  let scenario = initial.scenario ?? SCENARIOS[0].id
  let gui: GUI | null = null
  const openFolders = new Map<string, boolean>([['Bosse 1', true]])

  const emit = (): void => handlers.onChange(sanitizeLine(draft))
  const modelOf = (index: number): string => models[index] ?? DEFAULT_MODEL_ID

  const addFolder = (parent: GUI, title: string): GUI => {
    const folder = parent.addFolder(title)
    if (!openFolders.get(title)) folder.close()
    folder.onOpenClose((changed) => {
      if (changed === folder) openFolders.set(title, !folder._closed)
    })
    return folder
  }

  const applyModel = (index: number, modelId: string): void => {
    const model = getKickerModel(modelId)
    models = draft.kickers.map((_, i) => (i === index ? model.id : modelOf(i)))
    draft = {
      ...draft,
      kickers: draft.kickers.map((kicker, i) => (i === index ? modelKicker(model.id, index, kicker) : kicker)),
      tricks: draft.tricks.map((trick, i) => (i === index ? model.trick : trick)),
    }
    rebuild()
    emit()
  }

  const addKickerFolder = (root: GUI, kicker: Mutable<KickerConfig>, index: number): void => {
    const folder = addFolder(root, `Bosse ${index + 1}`)
    const choices = {
      model: modelOf(index),
      trick: parseCustomTrick(draft.tricks[index]) ? CUSTOM_TRICK_PREFIX : draft.tricks[index],
      ...(parseCustomTrick(draft.tricks[index]) ?? NEW_CUSTOM_TRICK),
      reset: (): void => applyModel(index, modelOf(index)),
      tune: (): void => handlers.onTuneKicker(index),
      remove: (): void => {
        draft = {
          ...draft,
          kickers: draft.kickers.filter((_, i) => i !== index),
          tricks: draft.tricks.filter((_, i) => i !== index),
        }
        models = models.filter((_, i) => i !== index)
        rebuild()
        emit()
      },
    }
    folder
      .add(choices, 'model', MODEL_OPTIONS)
      .name('Gabarit')
      .onChange((id: string) => applyModel(index, id))
    folder
      .add(choices, 'trick', TRICK_OPTIONS)
      .name('Figure')
      .onChange((id: string) => {
        const custom = id === CUSTOM_TRICK_PREFIX
        customControls.forEach((control) => control.show(custom))
        setTrick(custom ? customTrickId(choices) : id)
      })
    const setTrick = (id: string): void => {
      draft = { ...draft, tricks: draft.tricks.map((trick, i) => (i === index ? id : trick)) }
      emit()
    }
    const setCustomTrick = (): void => setTrick(customTrickId(choices))
    const { flips, spinDegrees } = CUSTOM_TRICK_LIMITS
    const customControls = [
      folder.add(choices, 'flips', -flips, flips, 1).name('Saltos (− = avant)').onChange(setCustomTrick),
      folder.add(choices, 'spinDegrees', 0, spinDegrees, 180).name('Vrille (°)').onChange(setCustomTrick),
      folder.add(choices, 'grab', GRAB_OPTIONS).name('Grab').onChange(setCustomTrick),
    ]
    customControls.forEach((control) => control.show(choices.trick === CUSTOM_TRICK_PREFIX))
    addSliders(folder, kicker, KICKER_LIMITS, KICKER_LABELS, emit)
    folder.add(choices, 'tune').name("Régler l'élan de cette bosse")
    folder.add(choices, 'reset').name('Réinitialiser cette bosse à son gabarit')
    if (draft.kickers.length > 1) folder.add(choices, 'remove').name('Supprimer cette bosse')
  }

  const rebuild = (): void => {
    gui?.destroy()
    const root = new GUI({ title: 'Réglages de la ligne', width: 330 })
    gui = root

    const actions = {
      scenario,
      reload: (): void => handlers.onScenario(scenario),
      tuneAll: handlers.onTuneAll,
      addKicker: (): void => {
        draft = { ...draft, kickers: [...draft.kickers, { ...NEW_KICKER }], tricks: [...draft.tricks, NEW_TRICK] }
        models = [...draft.kickers.slice(0, -1).map((_, i) => modelOf(i)), DEFAULT_MODEL_ID]
        openFolders.set(`Bosse ${draft.kickers.length}`, true)
        rebuild()
        emit()
      },
    }
    root
      .add(actions, 'scenario', SCENARIO_OPTIONS)
      .name('Scénario')
      .onChange((id: string) => handlers.onScenario(id))
    root.add(actions, 'reload').name('Recharger ce scénario')
    root.add(actions, 'tuneAll').name('Régler tous les élans automatiquement')
    if (draft.kickers.length < MAX_KICKERS) root.add(actions, 'addKicker').name('Ajouter une bosse')

    draft.kickers.forEach((kicker, index) => addKickerFolder(root, kicker, index))

    const riderFolder = addFolder(root, 'Skieur')
    riderFolder
      .add({ startSwitch: draft.startSwitch }, 'startSwitch')
      .name('Départ en switch (en arrière)')
      .onChange((startSwitch: boolean) => {
        draft = { ...draft, startSwitch }
        emit()
      })
    addSliders(riderFolder, draft.rider, RIDER_LIMITS, RIDER_LABELS, emit)
    addSliders(addFolder(root, 'Conditions'), draft.environment, ENVIRONMENT_LIMITS, ENVIRONMENT_LABELS, emit)
  }

  rebuild()
  return {
    setLine: (line: PanelLine): void => {
      draft = toDraft(line.config)
      if (line.models) models = [...line.models]
      if (line.scenario) scenario = line.scenario
      rebuild()
    },
  }
}
