import type { Sample } from '../physics/types'

/**
 * Ce qu'on doit entendre à une image de la descente : le niveau de la glisse et du vent, et les
 * événements ponctuels (décollage, réception, chute). Aucun son n'est produit ici : ce module
 * décide, `soundscape.ts` joue.
 */
export interface SoundInput {
  /** Échantillon de l'image précédente ; `null` à la première image. */
  readonly previous: Sample | null
  readonly current: Sample
  readonly playing: boolean
  /** Vitesse de lecture : 1 = temps réel. */
  readonly rate: number
  /** Le skieur est à terre à cette image, et l'était-il déjà à la précédente. */
  readonly fallen: boolean
  readonly wasFallen: boolean
  /** Dureté de la réception de la bosse en cours : hauteur de chute équivalente, en mètres. */
  readonly landingImpact: number
}

export interface SoundEvent {
  readonly kind: 'takeoff' | 'landing' | 'crash'
  /** Force du son, de 0 à 1. */
  readonly strength: number
}

export interface SoundFrame {
  /** Niveau du frottement des skis sur la neige, de 0 à 1. */
  readonly glide: number
  /** Niveau du vent, de 0 à 1. */
  readonly wind: number
  /** Hauteur des sons : 1 en temps réel, plus grave au ralenti. */
  readonly pitch: number
  readonly events: readonly SoundEvent[]
}

export const SILENCE: SoundFrame = { glide: 0, wind: 0, pitch: 1, events: [] }

/** Vitesses, en m/s, auxquelles la glisse et le vent sont à plein volume. */
const FULL_GLIDE_SPEED = 26
const FULL_WIND_SPEED = 30
/** Sur la neige, le vent est couvert par la glisse : il ne garde que cette part de son niveau. */
const GROUND_WIND_SHARE = 0.4
/** À terre, le corps frotte sur ses vêtements : plus sourd que des skis. */
const SLIDE_GLIDE_SHARE = 0.5
/** Hauteur de chute équivalente, en mètres, qui donne une réception à plein volume. */
const FULL_IMPACT = 2
const MIN_IMPACT_STRENGTH = 0.25
/** Écart de temps au-delà duquel deux images ne se suivent pas : la lecture a sauté. */
const MAX_FRAME_GAP = 0.3
/** Le ralenti baisse la hauteur des sons, sans descendre sous ce plancher. */
const MIN_PITCH = 0.45

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value))

function eventsOf(input: SoundInput): readonly SoundEvent[] {
  const { previous, current } = input
  if (!previous || Math.abs(current.t - previous.t) > MAX_FRAME_GAP) return []
  const wasAirborne = previous.kind === 'air'
  const airborne = current.kind === 'air'
  if (input.fallen && !input.wasFallen) return [{ kind: 'crash', strength: 1 }]
  if (!wasAirborne && airborne) return [{ kind: 'takeoff', strength: clamp01(current.speed / FULL_GLIDE_SPEED) }]
  if (wasAirborne && !airborne && !input.fallen) {
    return [{ kind: 'landing', strength: Math.max(MIN_IMPACT_STRENGTH, clamp01(input.landingImpact / FULL_IMPACT)) }]
  }
  return []
}

/** Sons d'une image de la descente. En pause, tout se tait. */
export function soundFrame(input: SoundInput): SoundFrame {
  if (!input.playing) return SILENCE
  const { current } = input
  const airborne = current.kind === 'air'
  const glideLevel = clamp01(current.speed / FULL_GLIDE_SPEED)
  const windLevel = clamp01(current.speed / FULL_WIND_SPEED) ** 2
  return {
    glide: airborne ? 0 : glideLevel * (input.fallen ? SLIDE_GLIDE_SHARE : 1),
    wind: windLevel * (airborne ? 1 : GROUND_WIND_SHARE),
    pitch: Math.max(MIN_PITCH, Math.sqrt(clamp01(input.rate))),
    events: eventsOf(input),
  }
}
