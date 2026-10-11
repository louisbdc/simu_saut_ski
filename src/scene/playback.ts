import type { Sample } from '../physics/types'

export interface PlaybackState {
  readonly time: number
  readonly playing: boolean
  /** Vitesse de lecture : 1 = temps réel. */
  readonly rate: number
}

/** Durées de la boucle : la descente, puis la descente et la remontée en télésiège. */
export interface LoopTiming {
  readonly descent: number
  readonly total: number
}

/**
 * Avance la lecture. Le ralenti ne s'applique qu'à la descente : la remontée tourne au moins en
 * temps réel. Arrivée en haut, la lecture reboucle sur une nouvelle descente.
 */
export function advance(state: PlaybackState, elapsed: number, timing: LoopTiming): PlaybackState {
  if (!state.playing) return state
  const rate = state.time < timing.descent ? state.rate : Math.max(1, state.rate)
  const time = state.time + elapsed * rate
  return { ...state, time: time >= timing.total ? time % timing.total : time }
}

const mix = (from: number, to: number, ratio: number): number => from + (to - from) * ratio

/** État du skieur à l'instant t, interpolé entre les deux échantillons voisins. */
export function sampleAt(samples: readonly Sample[], time: number): Sample {
  if (samples.length === 0) throw new Error('Aucun échantillon à lire')
  const last = samples.length - 1
  if (time <= samples[0].t) return samples[0]
  if (time >= samples[last].t) return samples[last]

  let low = 0
  let high = last
  while (high - low > 1) {
    const middle = (low + high) >> 1
    if (samples[middle].t <= time) low = middle
    else high = middle
  }
  const a = samples[low]
  const b = samples[high]
  const span = b.t - a.t
  const ratio = span > 0 ? (time - a.t) / span : 0
  return {
    ...a,
    t: time,
    x: mix(a.x, b.x, ratio),
    y: mix(a.y, b.y, ratio),
    vx: mix(a.vx, b.vx, ratio),
    vy: mix(a.vy, b.vy, ratio),
    speed: mix(a.speed, b.speed, ratio),
    gLoad: mix(a.gLoad, b.gLoad, ratio),
    height: mix(a.height, b.height, ratio),
    tilt: mix(a.tilt, b.tilt, ratio),
    // Pas d'interpolation entre la fin d'un vol (1) et le sol (0) : la figure ne se rembobine pas.
    airProgress: a.kind === 'air' && b.kind === 'air' ? mix(a.airProgress, b.airProgress, ratio) : a.airProgress,
  }
}
