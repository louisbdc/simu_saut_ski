import { DEFAULT_LINE } from './constants'
import type { KickerConfig, LineConfig } from './types'

/** Gabarit de bosse : un jeu complet de réglages auquel on peut revenir. */
export interface KickerModel {
  readonly id: string
  readonly label: string
  readonly kicker: KickerConfig
  /** Figure proposée pour ce gabarit. */
  readonly trick: string
}

export const KICKER_MODELS: readonly KickerModel[] = [
  {
    id: 'simple',
    label: 'Simple',
    trick: 'straight',
    kicker: {
      inrunAngleDeg: 15,
      inrunLength: 30,
      flatLength: 3,
      transitionRadius: 12,
      takeoffAngleDeg: 20,
      kickerHeight: 1.2,
      deckDrop: 0.3,
      tableLength: 4,
      landingAngleDeg: 22,
      landingLength: 10,
    },
  },
  {
    id: 'medium',
    label: 'Medium',
    trick: 'spin360',
    kicker: {
      inrunAngleDeg: 20,
      inrunLength: 40,
      flatLength: 4,
      transitionRadius: 16,
      takeoffAngleDeg: 25,
      kickerHeight: 2.5,
      deckDrop: 0.8,
      tableLength: 9,
      landingAngleDeg: 28,
      landingLength: 16,
    },
  },
  { id: 'hard', label: 'Hard', trick: 'backflip', kicker: DEFAULT_LINE.kickers[0] },
  {
    id: 'pro',
    label: 'Pro',
    trick: 'doubleCork1080',
    kicker: {
      inrunAngleDeg: 32,
      inrunLength: 80,
      flatLength: 8,
      transitionRadius: 30,
      takeoffAngleDeg: 35,
      kickerHeight: 6,
      deckDrop: 2,
      tableLength: 24,
      landingAngleDeg: 40,
      landingLength: 42,
    },
  },
  {
    id: 'wtf',
    label: 'WTF',
    trick: 'doubleCork1080',
    kicker: {
      inrunAngleDeg: 45,
      inrunLength: 200,
      flatLength: 10,
      transitionRadius: 55,
      takeoffAngleDeg: 30,
      kickerHeight: 11,
      deckDrop: 4,
      tableLength: 45,
      // Réception très raide : c'est elle qui rend un saut de cette taille encaissable.
      landingAngleDeg: 52,
      landingLength: 90,
    },
  },
]

export const DEFAULT_MODEL_ID = 'hard'

const MODELS_BY_ID: ReadonlyMap<string, KickerModel> = new Map(KICKER_MODELS.map((model) => [model.id, model]))

/** Gabarit correspondant à un identifiant ; un identifiant inconnu donne le gabarit par défaut. */
export function getKickerModel(id: string | undefined): KickerModel {
  const model = MODELS_BY_ID.get(id ?? DEFAULT_MODEL_ID) ?? MODELS_BY_ID.get(DEFAULT_MODEL_ID)
  if (!model) throw new Error(`Gabarit par défaut introuvable : ${DEFAULT_MODEL_ID}`)
  return model
}

interface ScenarioStep {
  readonly model: string
  readonly changes?: Partial<KickerConfig>
  readonly trick?: string
}

/**
 * Scénario : une ligne complète, bosse après bosse, à partir des gabarits. Les figures proposées sont
 * celles que le calcul de rotation fait arriver juste sur ces bosses, sans rattrapage en fin de vol.
 */
export interface Scenario {
  readonly id: string
  readonly label: string
  readonly steps: readonly ScenarioStep[]
}

/**
 * Une bosse qui en suit une autre garde un élan en pente douce : la réception précédente redonne
 * de la vitesse, mais le frottement et l'air en reprennent trop pour repartir à plat.
 */
const FOLLOWING: Partial<KickerConfig> = { inrunAngleDeg: 20, inrunLength: 25, flatLength: 4 }

export const SCENARIOS: readonly Scenario[] = [
  { id: 'simple', label: 'Simple : une petite bosse', steps: [{ model: 'simple' }] },
  {
    id: 'medium',
    label: 'Medium : deux bosses de park',
    steps: [
      { model: 'medium' },
      { model: 'medium', trick: 'spin360mute', changes: { ...FOLLOWING, kickerHeight: 3.2, tableLength: 12, landingLength: 20 } },
    ],
  },
  {
    id: 'hard',
    label: 'Hard : deux gros kickers',
    steps: [{ model: 'hard' }, { model: 'hard', trick: 'spin1080', changes: DEFAULT_LINE.kickers[1] }],
  },
  {
    id: 'pro',
    label: 'Pro : ligne de big air',
    steps: [
      { model: 'pro' },
      {
        model: 'pro',
        trick: 'doubleBackflip',
        changes: { ...FOLLOWING, inrunAngleDeg: 28, kickerHeight: 7.5, tableLength: 30, landingLength: 50 },
      },
      {
        model: 'pro',
        trick: 'cork720mute',
        changes: { ...FOLLOWING, inrunAngleDeg: 30, kickerHeight: 9, tableLength: 36, landingLength: 58 },
      },
    ],
  },
  {
    id: 'wtf',
    label: 'WTF : démesuré',
    steps: [
      { model: 'wtf' },
      {
        model: 'wtf',
        trick: 'cork1440',
        changes: { inrunAngleDeg: 34, inrunLength: 60, kickerHeight: 12, tableLength: 50, landingLength: 100 },
      },
    ],
  },
]

export const DEFAULT_SCENARIO_ID = 'hard'

export interface ScenarioLine {
  /** Ligne non réglée : les élans restent ceux des gabarits. */
  readonly config: LineConfig
  /** Gabarit de chaque bosse, dans l'ordre. */
  readonly models: readonly string[]
}

export function buildScenario(id: string): ScenarioLine {
  const scenario = SCENARIOS.find((candidate) => candidate.id === id)
  if (!scenario) throw new Error(`Scénario inconnu : ${id}`)
  const steps = scenario.steps.map((step) => ({ step, model: getKickerModel(step.model) }))
  return {
    config: {
      ...DEFAULT_LINE,
      kickers: steps.map(({ step, model }) => ({ ...model.kicker, ...step.changes })),
      tricks: steps.map(({ step, model }) => step.trick ?? model.trick),
    },
    models: steps.map(({ model }) => model.id),
  }
}
