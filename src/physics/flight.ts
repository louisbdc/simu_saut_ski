import { FLIGHT_TIME_STEP, GRAVITY, LANDING_ABSORPTION_DISTANCE, MAX_FLIGHT_TIME } from './constants'
import type { PhysicsParams, Sample } from './types'

export interface FlightState {
  readonly x: number
  readonly y: number
  readonly vx: number
  readonly vy: number
  readonly t: number
}

export interface FlightResult {
  readonly samples: readonly Sample[]
  readonly landing: FlightState
  readonly maxHeight: number
}

type Derivative = readonly [number, number, number, number]

/** Dérivée de (x, y, vx, vy) : gravité et traînée quadratique sur la vitesse relative à l'air. */
function derivative(vx: number, vy: number, p: PhysicsParams): Derivative {
  const relativeX = vx + p.headwind
  const relativeSpeed = Math.hypot(relativeX, vy)
  return [vx, vy, -p.flightDrag * relativeSpeed * relativeX, -GRAVITY - p.flightDrag * relativeSpeed * vy]
}

function rk4Step(state: FlightState, dt: number, p: PhysicsParams): FlightState {
  const k1 = derivative(state.vx, state.vy, p)
  const k2 = derivative(state.vx + (k1[2] * dt) / 2, state.vy + (k1[3] * dt) / 2, p)
  const k3 = derivative(state.vx + (k2[2] * dt) / 2, state.vy + (k2[3] * dt) / 2, p)
  const k4 = derivative(state.vx + k3[2] * dt, state.vy + k3[3] * dt, p)
  const blend = (i: number): number => ((k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]) * dt) / 6
  return {
    x: state.x + blend(0),
    y: state.y + blend(1),
    vx: state.vx + blend(2),
    vy: state.vy + blend(3),
    t: state.t + dt,
  }
}

function interpolate(a: FlightState, b: FlightState, ratio: number): FlightState {
  const mix = (from: number, to: number): number => from + (to - from) * ratio
  return { x: mix(a.x, b.x), y: mix(a.y, b.y), vx: mix(a.vx, b.vx), vy: mix(a.vy, b.vy), t: mix(a.t, b.t) }
}

function toSample(state: FlightState, height: number, kicker: number): Sample {
  return {
    ...state,
    speed: Math.hypot(state.vx, state.vy),
    gLoad: 0,
    height,
    tilt: 0,
    airProgress: 0,
    kind: 'air',
    kicker,
  }
}

/** Intègre le vol jusqu'à ce que la trajectoire recoupe la neige. */
export function fly(
  start: FlightState,
  groundHeight: (x: number) => number,
  p: PhysicsParams,
  kicker = 0,
): FlightResult {
  const samples: Sample[] = [toSample(start, 0, kicker)]
  let state = start
  let height = Math.max(0, start.y - groundHeight(start.x))
  let maxHeight = height

  while (state.t - start.t < MAX_FLIGHT_TIME) {
    const next = rk4Step(state, FLIGHT_TIME_STEP, p)
    const nextHeight = next.y - groundHeight(next.x)
    if (nextHeight <= 0) {
      const touch = interpolate(state, next, height / (height - nextHeight))
      const landing = { ...touch, y: groundHeight(touch.x) }
      samples.push(toSample(landing, 0, kicker))
      return { samples, landing, maxHeight }
    }
    state = next
    height = nextHeight
    maxHeight = Math.max(maxHeight, height)
    samples.push(toSample(state, height, kicker))
  }
  return { samples, landing: state, maxHeight }
}

export interface Impact {
  /** Vitesse perpendiculaire à la pente, absorbée par le skieur. */
  readonly normalSpeed: number
  readonly equivalentFallHeight: number
  readonly impactG: number
  /** Vitesse conservée le long de la pente après la réception. */
  readonly speedAfter: number
}

/** Décompose la vitesse d'arrivée selon la pente de réception. */
export function resolveImpact(vx: number, vy: number, slopeAngle: number, friction: number): Impact {
  const tangentSpeed = vx * Math.cos(slopeAngle) + vy * Math.sin(slopeAngle)
  const normalSpeed = Math.max(0, vx * Math.sin(slopeAngle) - vy * Math.cos(slopeAngle))
  const equivalentFallHeight = (normalSpeed * normalSpeed) / (2 * GRAVITY)
  return {
    normalSpeed,
    equivalentFallHeight,
    impactG: 1 + equivalentFallHeight / LANDING_ABSORPTION_DISTANCE,
    speedAfter: Math.max(0, tangentSpeed - friction * normalSpeed),
  }
}
