import {
  CRASH_DRAG_AREA,
  CRASH_FALL_HEIGHT,
  CRASH_FRICTION,
  CRASH_SPEED_KEPT,
  MAX_PHASES,
  MAX_POP_RATIO,
  airDensity,
  derivePhysics,
  totalMass,
} from './constants'
import { fly, resolveImpact, type Impact } from './flight'
import { rideGround, type GroundStart } from './ground'
import { buildTerrain, heightAt, locate } from './terrain'
import type {
  CrashReport,
  KickerReport,
  LandingReport,
  LandingZone,
  LineConfig,
  Sample,
  SegmentKind,
  SimulationOptions,
  SimulationResult,
  Terrain,
} from './types'

const APPROACH_KINDS: ReadonlySet<SegmentKind | 'air'> = new Set(['inrun', 'transition', 'flat', 'takeoff'])
const KICK_KINDS: ReadonlySet<SegmentKind | 'air'> = new Set(['transition', 'takeoff'])
const EXIT_KINDS: ReadonlySet<SegmentKind | 'air'> = new Set(['landing', 'runout'])

/** Un saut parti d'une lèvre. */
interface Jump {
  readonly kicker: number
  readonly lipSpeed: number
  readonly launchTime: number
  readonly launchAngle: number
  readonly landingAngle: number
  readonly launchX: number
  readonly landingTime: number
  readonly landingX: number
  readonly landingY: number
  readonly impactSpeed: number
  readonly maxHeight: number
  readonly impact: Impact
}

export function classifyLanding(terrain: Terrain, kicker: number, x: number): LandingZone {
  const marks = terrain.kickers[kicker]
  if (x < marks.knuckleStartX) return 'table'
  if (x < marks.landingStartX) return 'knuckle'
  if (x <= marks.idealEndX) return 'ideal'
  if (x <= marks.landingEndX) return 'long'
  return 'flat'
}

function landingReport(terrain: Terrain, jump: Jump, crashed: boolean): LandingReport {
  return {
    zone: classifyLanding(terrain, jump.kicker, jump.landingX),
    x: jump.landingX,
    y: jump.landingY,
    offsetFromTarget: jump.landingX - terrain.kickers[jump.kicker].targetX,
    impactSpeed: jump.impactSpeed,
    normalSpeed: jump.impact.normalSpeed,
    equivalentFallHeight: jump.impact.equivalentFallHeight,
    impactG: jump.impact.impactG,
    speedAfter: crashed ? jump.impact.speedAfter * CRASH_SPEED_KEPT : jump.impact.speedAfter,
    crashed,
  }
}

function kickerReport(
  terrain: Terrain,
  kicker: number,
  samples: readonly Sample[],
  jump: Jump | undefined,
  crashed: boolean,
): KickerReport {
  // Une seule passe sur les échantillons de la bosse : les maxima partent de 0, comme un cumul de Math.max.
  let approachSpeed = 0
  let maxG = 0
  let kickEntrySpeed = 0
  let exitSpeed = 0
  let enteredKick = false
  for (const s of samples) {
    if (s.kicker !== kicker) continue
    if (!jump || s.t <= jump.launchTime) {
      if (APPROACH_KINDS.has(s.kind)) approachSpeed = Math.max(approachSpeed, s.speed)
      // Le kick est la partie montante de la courbe ; la courbe du bas de l'élan n'en fait pas partie.
      if (KICK_KINDS.has(s.kind) && s.tilt > 0) {
        if (!enteredKick) kickEntrySpeed = s.speed
        enteredKick = true
        maxG = Math.max(maxG, s.gLoad)
      }
    }
    if (jump && s.t >= jump.landingTime && EXIT_KINDS.has(s.kind)) exitSpeed = Math.max(exitSpeed, s.speed)
  }

  if (!jump) {
    return {
      reached: false,
      approachSpeed,
      kickEntrySpeed,
      lipSpeed: 0,
      speedLostInKick: 0,
      maxG,
      flightDistance: 0,
      takeoffTime: 0,
      landingTime: 0,
      takeoffAngle: 0,
      landingAngle: 0,
      airTime: 0,
      maxHeight: 0,
      landing: null,
      exitSpeed: 0,
    }
  }
  return {
    reached: true,
    approachSpeed,
    kickEntrySpeed,
    lipSpeed: jump.lipSpeed,
    speedLostInKick: kickEntrySpeed - jump.lipSpeed,
    maxG,
    flightDistance: jump.landingX - jump.launchX,
    takeoffTime: jump.launchTime,
    landingTime: jump.landingTime,
    takeoffAngle: jump.launchAngle,
    landingAngle: jump.landingAngle,
    airTime: jump.landingTime - jump.launchTime,
    maxHeight: jump.maxHeight,
    landing: landingReport(terrain, jump, crashed),
    exitSpeed,
  }
}

/** En l'air, le skieur pivote progressivement de l'angle du kick vers celui de la réception. */
function withTilt(samples: readonly Sample[], fromAngle: number, toAngle: number, isJump: boolean): Sample[] {
  const start = samples[0].t
  const span = samples[samples.length - 1].t - start
  return samples.map((sample) => {
    const progress = span > 0 ? (sample.t - start) / span : 1
    return {
      ...sample,
      tilt: fromAngle + (toAngle - fromAngle) * progress,
      airProgress: isJump ? progress : 0,
    }
  })
}

/** Simule le parcours complet de la ligne : glisse, sauts et réceptions enchaînés. */
export function simulate(
  config: LineConfig,
  terrain: Terrain = buildTerrain(config),
  options: SimulationOptions = {},
): SimulationResult {
  let physics = derivePhysics(config)
  let crash: Omit<CrashReport, 'slideDistance' | 'slideDuration' | 'stopped'> | null = null
  const groundHeight = (x: number): number => heightAt(terrain, x)
  const samples: Sample[] = []
  const jumps: Jump[] = []
  const lastPoint = terrain.points[terrain.points.length - 1]
  let stalled = false
  let start: GroundStart = { index: 0, offset: 0, speed: config.rider.startSpeed, time: 0 }

  for (let phase = 0; ; phase++) {
    if (phase >= MAX_PHASES) throw new Error('trop de rebonds, le parcours ne se termine pas')
    const ride = rideGround(terrain, start, physics)
    samples.push(...ride.samples)
    if (ride.end === 'stalled') {
      stalled = true
      break
    }
    if (ride.end === 'end') break

    const fromLip = ride.end === 'lip'
    // Le pop est borné pour ne jamais renvoyer le skieur en arrière à très basse vitesse.
    const pop = fromLip && !crash ? Math.min(config.rider.popSpeed, (MAX_POP_RATIO * ride.speed) / Math.tan(ride.angle)) : 0
    const kicker = fromLip ? terrain.points[ride.index - 1].kicker : terrain.points[ride.index].kicker
    const flight = fly(
      {
        x: ride.x,
        y: ride.y,
        vx: ride.speed * Math.cos(ride.angle) - pop * Math.sin(ride.angle),
        vy: ride.speed * Math.sin(ride.angle) + pop * Math.cos(ride.angle),
        t: ride.time,
      },
      groundHeight,
      physics,
      kicker,
    )
    const { landing } = flight
    const spot = locate(terrain, landing.x)
    const impact = resolveImpact(landing.vx, landing.vy, spot.angle, physics.friction)
    samples.push(...withTilt(flight.samples, ride.angle, spot.angle, fromLip))
    if (fromLip && !crash) {
      jumps.push({
        kicker,
        lipSpeed: ride.speed,
        launchTime: ride.time,
        launchAngle: ride.angle,
        landingAngle: spot.angle,
        launchX: ride.x,
        landingTime: landing.t,
        landingX: landing.x,
        landingY: landing.y,
        impactSpeed: Math.hypot(landing.vx, landing.vy),
        maxHeight: flight.maxHeight,
        impact,
      })
    }
    // Atterrissage au-delà du profil : le parcours s'arrête là, sans revenir au dernier point.
    if (landing.x >= lastPoint.x) break

    // Chute : choc trop violent, ou figure pas bouclée. Le skieur perd ses skis et ne fait plus
    // que glisser, freiné par la neige sur ses vêtements.
    const hardImpact = impact.equivalentFallHeight > CRASH_FALL_HEIGHT
    const falls: boolean = fromLip && !crash && (hardImpact || options.failedKicker === kicker)
    const speedAfter: number = falls ? impact.speedAfter * CRASH_SPEED_KEPT : impact.speedAfter
    if (falls) {
      crash = {
        kicker,
        cause: hardImpact ? 'impact' : 'figure',
        time: landing.t,
        x: landing.x,
        y: landing.y,
        impactSpeed: Math.hypot(landing.vx, landing.vy),
        slideSpeed: speedAfter,
        equivalentFallHeight: impact.equivalentFallHeight,
      }
      physics = {
        ...physics,
        friction: CRASH_FRICTION,
        drag: (airDensity(config.environment.altitude) * CRASH_DRAG_AREA) / (2 * totalMass(config)),
      }
    }
    start = { index: spot.index, offset: spot.offset, speed: speedAfter, time: landing.t }
    if (fromLip && kicker === options.stopAfterKicker) break
  }

  const duration = samples.length > 0 ? samples[samples.length - 1].t : 0
  const fallen = crash
  const crashTime = fallen ? fallen.time : Infinity
  const afterCrash = samples.filter((sample) => sample.t >= crashTime)
  const slideDistance = afterCrash
    .slice(1)
    .reduce((sum, sample, i) => sum + Math.hypot(sample.x - afterCrash[i].x, sample.y - afterCrash[i].y), 0)

  return {
    terrain,
    samples,
    reports: config.kickers.map((_, index) =>
      kickerReport(
        terrain,
        index,
        samples,
        jumps.find((jump) => jump.kicker === index),
        fallen?.kicker === index,
      ),
    ),
    outcome: fallen ? 'crashed' : stalled ? 'stopped' : 'finished',
    crash: fallen ? { ...fallen, slideDistance, slideDuration: duration - fallen.time, stopped: stalled } : null,
    duration,
  }
}
