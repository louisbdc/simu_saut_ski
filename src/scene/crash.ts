/**
 * Déroulé visuel d'une chute. La physique (choc, vitesse, glissade freinée jusqu'à l'arrêt) vient
 * de la simulation ; ce module en tire ce qu'on voit : le corps qui roule sur lui-même puis glisse
 * sur le dos, et les deux skis déchaussés qui filent chacun de leur côté.
 */
import * as THREE from 'three'
import { rideGround } from '../physics/ground'
import { heightAt, locate } from '../physics/terrain'
import type { PhysicsParams, Sample, SimulationResult } from '../physics/types'
import { sampleAt } from './playback'
import { simulateRagdoll, type RagdollStart, type RagdollTrack } from './ragdoll'

/** Rayon d'un corps roulé en boule : à cette distance parcourue correspond un tour sur soi-même. */
const TUMBLE_RADIUS = 0.45
/** Le roulé-boulé s'épuise : passé ce temps, le corps glisse surtout sans tourner. */
const TUMBLE_SECONDS = 1.3
/** En dessous de cette vitesse le skieur est considéré comme immobile, en m/s. */
const REST_SPEED = 3
/** Position finale : couché sur le dos, tête vers l'amont. */
const LYING_ANGLE = (3 * Math.PI) / 2

/** Un ski déchaussé glisse bien mieux qu'un corps : il part loin devant. */
const SKI_PHYSICS: readonly PhysicsParams[] = [
  { friction: 0.09, drag: 0.004, flightDrag: 0.004, headwind: 0 },
  { friction: 0.16, drag: 0.004, flightDrag: 0.004, headwind: 0 },
]
/** Part de la vitesse du skieur que garde chaque ski en se détachant. */
const SKI_SPEED_KEPT = [1.1, 0.75] as const
const SKI_DRIFT = 2.2
const SKI_DRIFT_SECONDS = 1.4
const SKI_SPIN = 2.6
const SKI_SPIN_SECONDS = 0.7
const SKI_LIFT = 0.03

const UP = new THREE.Vector3(0, 1, 0)
const LATERAL = new THREE.Vector3(0, 0, 1)

export interface LooseSki {
  readonly position: THREE.Vector3
  readonly quaternion: THREE.Quaternion
}

export interface CrashScene {
  /** Instant de la chute dans le parcours. */
  readonly time: number
  /** Angle dont le corps a roulé vers l'avant depuis la chute, en radians. */
  readonly tumbleAt: (time: number) => number
  /** De 0 (en plein roulé-boulé) à 1 (immobile, couché sur la neige). */
  readonly settledAt: (time: number) => number
  /**
   * Chute simulée en corps articulé, quand l'état du skieur à l'impact est connu. Elle remplace
   * alors le roulé-boulé ci-dessus.
   */
  readonly ragdoll: RagdollTrack | null
  /** Position et orientation d'un ski déchaussé : 0 à gauche, 1 à droite. */
  readonly skiAt: (index: number, time: number) => LooseSki
}

const smooth = (ratio: number): number => {
  const x = Math.min(1, Math.max(0, ratio))
  return x * x * (3 - 2 * x)
}

/** Cumul du roulé-boulé le long de la glissade : le corps roule tant qu'il va vite, puis glisse. */
function tumbleTrack(slide: readonly Sample[], crashTime: number): { times: number[]; angles: number[] } {
  const times = slide.map((sample) => sample.t)
  const rolled = slide.reduce<number[]>((angles, sample, i) => {
    if (i === 0) return [0]
    const previous = slide[i - 1]
    const rolling = Math.exp(-(previous.t - crashTime) / TUMBLE_SECONDS)
    const distance = Math.hypot(sample.x - previous.x, sample.y - previous.y)
    return [...angles, angles[i - 1] + (distance / TUMBLE_RADIUS) * rolling]
  }, [])
  // Le corps finit couché sur le dos : on complète le dernier tour progressivement.
  const last = rolled[rolled.length - 1]
  const turns = Math.ceil((last - LYING_ANGLE) / (2 * Math.PI))
  const extra = LYING_ANGLE + Math.max(0, turns) * 2 * Math.PI - last
  const span = times[times.length - 1] - crashTime
  const angles = rolled.map((angle, i) => angle + extra * (span > 0 ? smooth((times[i] - crashTime) / span) : 1))
  return { times, angles }
}

function interpolate(times: readonly number[], values: readonly number[], time: number): number {
  if (time <= times[0]) return values[0]
  const last = times.length - 1
  if (time >= times[last]) return values[last]
  let low = 0
  let high = last
  while (high - low > 1) {
    const middle = (low + high) >> 1
    if (times[middle] <= time) low = middle
    else high = middle
  }
  const span = times[high] - times[low]
  return values[low] + (values[high] - values[low]) * (span > 0 ? (time - times[low]) / span : 0)
}

/** Glissade d'un ski déchaussé à partir du point de chute, jusqu'à l'arrêt ou jusqu'à une lèvre. */
function skiRun(result: SimulationResult, index: number, crashSample: Sample): readonly Sample[] {
  const spot = locate(result.terrain, crashSample.x)
  const ride = rideGround(
    result.terrain,
    { index: spot.index, offset: spot.offset, speed: crashSample.speed * SKI_SPEED_KEPT[index], time: crashSample.t },
    SKI_PHYSICS[index],
  )
  return ride.samples.length > 0 ? ride.samples : [crashSample]
}

/** Prépare la chute d'un parcours ; `null` si le skieur ne tombe pas. */
export function buildCrashScene(result: SimulationResult, start?: RagdollStart): CrashScene | null {
  const { crash } = result
  if (!crash) return null
  const slide = result.samples.filter((sample) => sample.t >= crash.time)
  if (slide.length === 0) return null

  const tumble = tumbleTrack(slide, crash.time)
  const atCrash: Sample = { ...slide[0], speed: crash.slideSpeed }
  const runs = [0, 1].map((index) => skiRun(result, index, atCrash))

  return {
    time: crash.time,
    ragdoll: start ? simulateRagdoll(start, (x) => heightAt(result.terrain, x)) : null,
    tumbleAt: (time) => interpolate(tumble.times, tumble.angles, time),
    settledAt: (time) => {
      if (time <= crash.time) return 0
      // Au bout de la glissade, le corps est à l'arrêt même si le dernier échantillon bouge encore un peu.
      if (time >= slide[slide.length - 1].t) return 1
      return 1 - Math.min(1, sampleAt(slide, time).speed / REST_SPEED)
    },
    skiAt: (index, time) => {
      const side = index === 0 ? -1 : 1
      const sample = sampleAt(runs[index], Math.max(time, crash.time))
      const elapsed = Math.max(0, time - crash.time)
      // Le ski s'écarte de la trace et tourne sur lui-même en se détachant, puis file droit.
      const drift = side * (0.15 + SKI_DRIFT * (1 - Math.exp(-elapsed / SKI_DRIFT_SECONDS)))
      const spin = side * SKI_SPIN * (1 - Math.exp(-elapsed / SKI_SPIN_SECONDS))
      return {
        position: new THREE.Vector3(sample.x, sample.y + SKI_LIFT, drift),
        quaternion: new THREE.Quaternion()
          .setFromAxisAngle(LATERAL, sample.tilt)
          .multiply(new THREE.Quaternion().setFromAxisAngle(UP, spin)),
      }
    },
  }
}
