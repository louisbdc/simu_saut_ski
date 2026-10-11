import { DEFAULT_LINE, ENVIRONMENT_LIMITS, KICKER_LIMITS, NEW_KICKER, NEW_TRICK, RIDER_LIMITS, sanitizeLine } from '../physics/constants'
import { DEFAULT_MODEL_ID, KICKER_MODELS, SCENARIOS } from '../physics/presets'
import type { EnvironmentConfig, KickerConfig, LineConfig, RiderConfig } from '../physics/types'

/**
 * Ligne de la piste libre telle qu'on l'enregistre ou qu'on la partage : ses réglages, le gabarit
 * de chaque bosse et le scénario dont elle part. Le texte produit tient dans une adresse.
 */
export interface SavedLine {
  readonly config: LineConfig
  readonly models: readonly string[]
  readonly scenario?: string
}

const VERSION = 'v1'
const STORAGE_KEY = 'simu-saut-ski:ligne'
/** Décimales gardées : assez pour que l'élan réglé, trouvé au millimètre, redonne les mêmes réceptions. */
const DECIMALS = 4

const KICKER_KEYS = Object.keys(KICKER_LIMITS) as (keyof KickerConfig)[]
const RIDER_KEYS = Object.keys(RIDER_LIMITS) as (keyof RiderConfig)[]
const ENVIRONMENT_KEYS = Object.keys(ENVIRONMENT_LIMITS) as (keyof EnvironmentConfig)[]
const MODEL_IDS: ReadonlySet<string> = new Set(KICKER_MODELS.map((model) => model.id))
const SCENARIO_IDS: ReadonlySet<string> = new Set(SCENARIOS.map((scenario) => scenario.id))

const rounded = (value: number): number => Number(value.toFixed(DECIMALS))

/** Valeurs d'un jeu de réglages, dans l'ordre de ses clés : plus court que de répéter leurs noms. */
function pack<T extends object>(values: T, keys: readonly (keyof T)[]): number[] {
  return keys.map((key) => rounded(Number(values[key])))
}

/** Jeu de réglages relu depuis une liste ; une valeur absente ou invalide prend celle par défaut. */
function unpack<T extends object>(list: unknown, keys: readonly (keyof T)[], fallback: T): T {
  const values = Array.isArray(list) ? list : []
  return Object.fromEntries(
    keys.map((key, index) => {
      const value: unknown = values[index]
      return [key, typeof value === 'number' && Number.isFinite(value) ? value : fallback[key]]
    }),
  ) as T
}

function toBase64Url(text: string): string {
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(text: string): string {
  return atob(text.replace(/-/g, '+').replace(/_/g, '/'))
}

export function encodeLine(line: SavedLine): string {
  const { config } = line
  const payload = {
    k: config.kickers.map((kicker) => pack(kicker, KICKER_KEYS)),
    t: config.tricks,
    s: config.startSwitch ? 1 : 0,
    r: pack(config.rider, RIDER_KEYS),
    e: pack(config.environment, ENVIRONMENT_KEYS),
    m: line.models,
    ...(line.scenario ? { c: line.scenario } : {}),
  }
  return `${VERSION}.${toBase64Url(JSON.stringify(payload))}`
}

/** Contenu d'une adresse ou du stockage : rien n'y est garanti. */
type Payload = Readonly<Record<string, unknown>>

function parsePayload(text: string): Payload | null {
  const [version, body, ...rest] = text.split('.')
  if (version !== VERSION || !body || rest.length > 0) return null
  try {
    const payload: unknown = JSON.parse(fromBase64Url(body))
    return typeof payload === 'object' && payload !== null ? (payload as Payload) : null
  } catch {
    // Texte tronqué ou trafiqué : ce n'est simplement pas une ligne.
    return null
  }
}

const strings = (list: unknown): readonly string[] => (Array.isArray(list) ? list.filter((item): item is string => typeof item === 'string') : [])

/**
 * Relit une ligne encodée. Le texte vient d'une adresse ou du stockage du navigateur : chaque
 * valeur est vérifiée, complétée par celle par défaut si elle manque, puis ramenée dans ses bornes.
 * Rend `null` si le texte n'est pas une ligne ou ne contient aucune bosse.
 */
export function decodeLine(text: string): SavedLine | null {
  const payload = parsePayload(text)
  if (!payload || !Array.isArray(payload.k) || payload.k.length === 0) return null
  const kickers = payload.k.map((kicker: unknown) => unpack(kicker, KICKER_KEYS, NEW_KICKER))
  const tricks = strings(payload.t)
  const config = sanitizeLine({
    kickers,
    tricks: kickers.map((_, index) => tricks[index] ?? NEW_TRICK),
    startSwitch: payload.s === 1,
    rider: unpack(payload.r, RIDER_KEYS, DEFAULT_LINE.rider),
    environment: unpack(payload.e, ENVIRONMENT_KEYS, DEFAULT_LINE.environment),
  })
  const models = strings(payload.m)
  const scenario = typeof payload.c === 'string' && SCENARIO_IDS.has(payload.c) ? payload.c : undefined
  return {
    config,
    models: config.kickers.map((_, index) => (MODEL_IDS.has(models[index]) ? models[index] : DEFAULT_MODEL_ID)),
    ...(scenario ? { scenario } : {}),
  }
}

type LineStorage = Pick<Storage, 'getItem' | 'setItem'>

/** Enregistre la ligne dans le navigateur. Un stockage plein ou refusé (navigation privée) est ignoré. */
export function storeLine(storage: LineStorage, line: SavedLine): void {
  try {
    storage.setItem(STORAGE_KEY, encodeLine(line))
  } catch {
    // Sans stockage, la ligne n'est pas retrouvée au prochain chargement : rien d'autre ne casse.
  }
}

/** Dernière ligne enregistrée dans le navigateur ; `null` s'il n'y en a pas ou si elle est illisible. */
export function readStoredLine(storage: LineStorage): SavedLine | null {
  try {
    const text = storage.getItem(STORAGE_KEY)
    return text ? decodeLine(text) : null
  } catch {
    return null
  }
}
