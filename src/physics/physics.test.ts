import { describe, expect, test } from 'vitest'
import {
  DEFAULT_LINE,
  ENVIRONMENT_LIMITS,
  GRAVITY,
  KICKER_LIMITS,
  RIDER_LIMITS,
  airDensity,
  derivePhysics,
  sanitizeLine,
} from './constants'
import { simulate } from './simulate'
import { fly, resolveImpact } from './flight'
import { rideGround } from './ground'
import { buildTerrain, heightAt, locate } from './terrain'
import type { KickerConfig, LineConfig, PhysicsParams } from './types'

const VACUUM: PhysicsParams = { friction: 0, drag: 0, flightDrag: 0, headwind: 0 }

const singleKicker: LineConfig = { ...DEFAULT_LINE, kickers: [DEFAULT_LINE.kickers[0]] }

describe('profil du terrain', () => {
  test('avance toujours vers la droite, sans trou entre deux points', () => {
    const { points } = buildTerrain(DEFAULT_LINE)

    const steps = points.slice(1).map((point, i) => ({
      dx: point.x - points[i].x,
      length: Math.hypot(point.x - points[i].x, point.y - points[i].y),
      kind: points[i].kind,
    }))

    expect(steps.every((step) => step.dx > 0)).toBe(true)
    expect(steps.filter((step) => step.kind !== 'face').every((step) => step.length <= 0.1001)).toBe(true)
  })

  test('place la lèvre à la hauteur de kicker demandée au-dessus du plat', () => {
    const kicker = singleKicker.kickers[0]

    const marks = buildTerrain(singleKicker).kickers[0]

    expect(marks.lipY - marks.baseY).toBeCloseTo(kicker.kickerHeight, 6)
  })

  test('place la cassure à la longueur de table demandée après la lèvre', () => {
    const kicker = singleKicker.kickers[0]

    const marks = buildTerrain(singleKicker).kickers[0]

    expect(marks.knuckleStartX - marks.lipX).toBeCloseTo(kicker.tableLength, 6)
  })

  test('donne à la réception la pente demandée', () => {
    const terrain = buildTerrain(singleKicker)
    const marks = terrain.kickers[0]

    const spot = locate(terrain, (marks.landingStartX + marks.landingEndX) / 2)

    expect((-spot.angle * 180) / Math.PI).toBeCloseTo(singleKicker.kickers[0].landingAngleDeg, 6)
  })

  test('prolonge le terrain à plat au-delà du profil', () => {
    const terrain = buildTerrain(singleKicker)
    const last = terrain.points[terrain.points.length - 1]

    expect(heightAt(terrain, last.x + 500)).toBe(last.y)
  })

  test('heightAt donne exactement l’altitude de locate, dans le profil comme au-delà', () => {
    const terrain = buildTerrain(DEFAULT_LINE)
    const first = terrain.points[0].x
    const last = terrain.points[terrain.points.length - 1].x
    const abscissas = [
      first - 10,
      first,
      first + 1e-9,
      (first + last) / 3,
      last / 2,
      last - 1e-9,
      last,
      last + 10,
      ...terrain.points.filter((_, i) => i % 37 === 0).flatMap((point) => [point.x, point.x + 0.0371]),
    ]

    const differences = abscissas.filter((x) => !Object.is(heightAt(terrain, x), locate(terrain, x).y))

    expect(differences).toEqual([])
  })
})

describe('glisse au sol', () => {
  test('sans frottement ni air, la vitesse suit v = √(2·g·h)', () => {
    const terrain = buildTerrain(singleKicker)

    const ride = rideGround(terrain, { index: 0, offset: 0, speed: 0, time: 0 }, VACUUM)

    expect(ride.end).toBe('lip')
    const worstError = ride.samples
      .filter((sample) => sample.y < -1)
      .map((sample) => Math.abs(sample.speed / Math.sqrt(2 * GRAVITY * -sample.y) - 1))
      .reduce((max, error) => Math.max(max, error), 0)
    expect(worstError).toBeLessThan(1e-6)
  })

  test("dans la courbe du kick, l'appui vaut cos(pente) + v²/(R·g)", () => {
    const terrain = buildTerrain(singleKicker)
    const radius = singleKicker.kickers[0].transitionRadius

    const ride = rideGround(terrain, { index: 0, offset: 0, speed: 0, time: 0 }, VACUUM)

    const inCurve = ride.samples.filter((sample) => sample.kind === 'transition')
    const sample = inCurve[Math.floor(inCurve.length / 2)]
    const expected = Math.cos(sample.tilt) + (sample.speed * sample.speed) / (radius * GRAVITY)
    expect(sample.gLoad).toBeCloseTo(expected, 6)
    expect(sample.gLoad).toBeGreaterThan(1.5)
  })

  test('le frottement et la traînée ralentissent le skieur', () => {
    const terrain = buildTerrain(singleKicker)
    const start = { index: 0, offset: 0, speed: 0, time: 0 }

    const ideal = rideGround(terrain, start, VACUUM)
    const real = rideGround(terrain, start, derivePhysics(singleKicker))

    expect(real.speed).toBeLessThan(ideal.speed)
    expect(real.speed).toBeGreaterThan(ideal.speed * 0.6)
  })

  test('un vent de face ralentit, un vent de dos accélère', () => {
    const terrain = buildTerrain(singleKicker)
    const start = { index: 0, offset: 0, speed: 0, time: 0 }
    const calm = derivePhysics(singleKicker)

    const still = rideGround(terrain, start, calm).speed
    const facing = rideGround(terrain, start, { ...calm, headwind: 8 }).speed
    const pushed = rideGround(terrain, start, { ...calm, headwind: -8 }).speed

    expect(facing).toBeLessThan(still)
    expect(pushed).toBeGreaterThan(still)
  })

  test("s'arrête quand la pente ne suffit pas à vaincre le frottement", () => {
    const flatInrun: LineConfig = {
      ...singleKicker,
      kickers: [{ ...singleKicker.kickers[0], inrunAngleDeg: 1 }],
    }

    const ride = rideGround(
      buildTerrain(flatInrun),
      { index: 0, offset: 0, speed: 0, time: 0 },
      derivePhysics(flatInrun),
    )

    expect(ride.end).toBe('stalled')
  })

  test("décolle sur une cassure quand l'appui s'annule", () => {
    const terrain = buildTerrain(singleKicker)
    const deckIndex = terrain.points.findIndex((point) => point.kind === 'deck')

    const ride = rideGround(terrain, { index: deckIndex, offset: 0, speed: 15, time: 0 }, VACUUM)

    expect(ride.end).toBe('detached')
    expect(terrain.points[ride.index].kind).toBe('knuckle')
  })
})

describe('vol', () => {
  const launch = { x: 0, y: 0, vx: 20 * Math.SQRT1_2, vy: 20 * Math.SQRT1_2, t: 0 }
  const flatGround = (): number => 0

  test('dans le vide, la portée à 45° vaut v²/g', () => {
    const flight = fly(launch, flatGround, VACUUM)

    expect(flight.landing.x).toBeCloseTo(400 / GRAVITY, 3)
    expect(flight.landing.t).toBeCloseTo((2 * launch.vy) / GRAVITY, 3)
    expect(flight.maxHeight).toBeCloseTo((launch.vy * launch.vy) / (2 * GRAVITY), 2)
  })

  test("la traînée de l'air raccourcit le saut", () => {
    const vacuum = fly(launch, flatGround, VACUUM)

    const withAir = fly(launch, flatGround, { friction: 0, drag: 0.003, flightDrag: 0.003, headwind: 0 })

    expect(withAir.landing.x).toBeLessThan(vacuum.landing.x)
    expect(withAir.landing.x).toBeGreaterThan(vacuum.landing.x * 0.8)
  })

  test('un vent de face raccourcit encore le saut', () => {
    const calm = fly(launch, flatGround, { friction: 0, drag: 0.003, flightDrag: 0.003, headwind: 0 })

    const windy = fly(launch, flatGround, { friction: 0, drag: 0.003, flightDrag: 0.003, headwind: 10 })

    expect(windy.landing.x).toBeLessThan(calm.landing.x)
  })
})

describe('réception', () => {
  test('une arrivée parallèle à la pente ne donne aucun choc', () => {
    const slope = (-30 * Math.PI) / 180

    const impact = resolveImpact(20 * Math.cos(slope), 20 * Math.sin(slope), slope, 0.05)

    expect(impact.equivalentFallHeight).toBeCloseTo(0, 9)
    expect(impact.speedAfter).toBeCloseTo(20, 9)
  })

  test('une chute verticale sur du plat équivaut à sa propre hauteur de chute', () => {
    const fallHeight = 3
    const speed = Math.sqrt(2 * GRAVITY * fallHeight)

    const impact = resolveImpact(0, -speed, 0, 0.05)

    expect(impact.equivalentFallHeight).toBeCloseTo(fallHeight, 9)
    expect(impact.speedAfter).toBe(0)
    expect(impact.impactG).toBeGreaterThan(5)
  })
})

describe('réglages', () => {
  test("l'air est moins dense en altitude", () => {
    expect(airDensity(0)).toBeCloseTo(1.225, 6)
    // Valeurs tabulées de l'atmosphère standard internationale.
    expect(airDensity(2000)).toBeCloseTo(1.0065, 3)
    expect(airDensity(3000)).toBeCloseTo(0.9091, 3)
    expect(airDensity(3000)).toBeLessThan(airDensity(1000))
  })

  test('ramène les valeurs hors bornes ou invalides dans leurs limites', () => {
    const wild: LineConfig = {
      ...singleKicker,
      kickers: [{ ...singleKicker.kickers[0], takeoffAngleDeg: 500, tableLength: Number.NaN }],
      rider: { ...singleKicker.rider, mass: -4 },
    }

    const safe = sanitizeLine(wild)

    expect(safe.kickers[0].takeoffAngleDeg).toBe(KICKER_LIMITS.takeoffAngleDeg.max)
    expect(safe.kickers[0].tableLength).toBe(KICKER_LIMITS.tableLength.min)
    expect(safe.rider.mass).toBe(RIDER_LIMITS.mass.min)
  })

  test('toute configuration dans les bornes se simule sans erreur ni valeur invalide', () => {
    // Tirage reproductible de configurations couvrant toute l'étendue des curseurs.
    let seed = 12345
    const random = (): number => {
      seed = (seed * 1664525 + 1013904223) >>> 0
      return seed / 4294967296
    }
    const pick = <T extends object>(limits: Record<keyof T, { min: number; max: number }>): T =>
      Object.fromEntries(
        Object.entries<{ min: number; max: number }>(limits).map(([key, { min, max }]) => [
          key,
          min + random() * (max - min),
        ]),
      ) as T

    const failures = Array.from({ length: 300 }, () => ({
      kickers: Array.from({ length: 1 + Math.floor(random() * 3) }, () => pick<KickerConfig>(KICKER_LIMITS)),
      tricks: [],
      startSwitch: false,
      rider: pick<LineConfig['rider']>(RIDER_LIMITS),
      environment: pick<LineConfig['environment']>(ENVIRONMENT_LIMITS),
    })).filter((config) => {
      const { samples } = simulate(config)
      const finite = samples.every((s) => [s.t, s.x, s.y, s.speed, s.gLoad, s.height].every(Number.isFinite))
      // Sur la neige, le skieur ne recule jamais ; en l'air, un vent de face violent peut le repousser.
      const forward = samples
        .slice(1)
        .every((s, i) => s.t >= samples[i].t && (s.kind === 'air' || s.x >= samples[i].x - 1e-9))
      return !finite || !forward
    })

    expect(failures).toEqual([])
  })
})
