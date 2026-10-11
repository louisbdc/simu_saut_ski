import { SILENCE, type SoundEvent, type SoundFrame } from './soundCues'

/**
 * Sons de la descente, synthétisés par le navigateur : aucun fichier audio. La glisse et le vent
 * sont du bruit filtré dont on règle le niveau ; les impacts sont de brèves impulsions.
 */
export interface Soundscape {
  /** À appeler sur un geste de l'utilisateur : un navigateur refuse tout son avant. */
  readonly unlock: () => void
  readonly isMuted: () => boolean
  readonly setMuted: (muted: boolean) => void
  /** Règle les sons continus et joue les événements de l'image. */
  readonly update: (frame: SoundFrame) => void
}

const STORAGE_KEY = 'simu-saut-ski:son'
const MUTED = 'coupé'
const MASTER_LEVEL = 0.5
const GLIDE_LEVEL = 0.34
const WIND_LEVEL = 0.5
/** Temps de réponse des niveaux, en secondes : assez court pour suivre le skieur, sans clic. */
const SMOOTHING = 0.06
const NOISE_SECONDS = 2

interface Graph {
  readonly context: AudioContext
  readonly master: GainNode
  readonly noise: AudioBuffer
  readonly source: AudioBufferSourceNode
  readonly glide: GainNode
  readonly wind: GainNode
}

function readMuted(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === MUTED
  } catch {
    // Sans stockage, le son repart activé à chaque visite.
    return false
  }
}

function writeMuted(muted: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, muted ? MUTED : '')
  } catch {
    // Le choix ne sera pas retenu, rien d'autre ne casse.
  }
}

function noiseBuffer(context: AudioContext): AudioBuffer {
  const buffer = context.createBuffer(1, context.sampleRate * NOISE_SECONDS, context.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  return buffer
}

function buildGraph(muted: boolean): Graph {
  const context = new AudioContext()
  const master = context.createGain()
  master.gain.value = muted ? 0 : MASTER_LEVEL
  master.connect(context.destination)
  const noise = noiseBuffer(context)
  const source = context.createBufferSource()
  source.buffer = noise
  source.loop = true
  const branch = (type: BiquadFilterType, frequency: number): GainNode => {
    const filter = context.createBiquadFilter()
    filter.type = type
    filter.frequency.value = frequency
    const gain = context.createGain()
    gain.gain.value = 0
    source.connect(filter).connect(gain).connect(master)
    return gain
  }
  // La glisse est un chuintement aigu ; le vent, un souffle grave.
  const glide = branch('bandpass', 2400)
  const wind = branch('lowpass', 520)
  source.start()
  return { context, master, noise, source, glide, wind }
}

/** Souffle bref : du bruit qui monte d'un coup puis s'éteint. */
function burst(graph: Graph, frequency: number, level: number, seconds: number): void {
  const { context } = graph
  const source = context.createBufferSource()
  source.buffer = graph.noise
  const filter = context.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.value = frequency
  const gain = context.createGain()
  gain.gain.setValueAtTime(level, context.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + seconds)
  source.connect(filter).connect(gain).connect(graph.master)
  source.start()
  source.stop(context.currentTime + seconds)
}

/** Choc sourd : une note grave qui tombe et s'éteint. */
function thump(graph: Graph, level: number, seconds: number): void {
  const { context } = graph
  const oscillator = context.createOscillator()
  oscillator.frequency.setValueAtTime(110, context.currentTime)
  oscillator.frequency.exponentialRampToValueAtTime(38, context.currentTime + seconds)
  const gain = context.createGain()
  gain.gain.setValueAtTime(level, context.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + seconds)
  oscillator.connect(gain).connect(graph.master)
  oscillator.start()
  oscillator.stop(context.currentTime + seconds)
}

function play(graph: Graph, event: SoundEvent): void {
  switch (event.kind) {
    case 'takeoff':
      burst(graph, 3200, 0.5 * event.strength, 0.18)
      return
    case 'landing':
      thump(graph, 0.9 * event.strength, 0.22)
      burst(graph, 1400, 0.7 * event.strength, 0.3)
      return
    case 'crash':
      thump(graph, 1, 0.4)
      burst(graph, 700, 0.9, 0.7)
  }
}

export function createSoundscape(): Soundscape {
  let graph: Graph | null = null
  let muted = readMuted()
  let last: SoundFrame = SILENCE

  return {
    unlock: () => {
      if (graph) {
        if (graph.context.state === 'suspended') void graph.context.resume()
        return
      }
      try {
        graph = buildGraph(muted)
      } catch {
        // Navigateur sans Web Audio : le site reste muet, sans rien d'autre de cassé.
        graph = null
      }
    },
    isMuted: () => muted,
    setMuted: (next) => {
      muted = next
      writeMuted(next)
      graph?.master.gain.setTargetAtTime(next ? 0 : MASTER_LEVEL, graph.context.currentTime, SMOOTHING)
    },
    update: (frame) => {
      if (!graph || (frame === SILENCE && last === SILENCE)) return
      last = frame
      const now = graph.context.currentTime
      graph.glide.gain.setTargetAtTime(frame.glide * GLIDE_LEVEL, now, SMOOTHING)
      graph.wind.gain.setTargetAtTime(frame.wind * WIND_LEVEL, now, SMOOTHING)
      graph.source.playbackRate.setTargetAtTime(frame.pitch, now, SMOOTHING)
      if (!muted) frame.events.forEach((event) => play(graph as Graph, event))
    },
  }
}
