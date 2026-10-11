import { describe, expect, test } from 'vitest'
import { DEFAULT_LINE } from '../physics/constants'
import { buildScenario } from '../physics/presets'
import { simulate } from '../physics/simulate'
import { tuneLine } from '../physics/solver'
import type { LineConfig } from '../physics/types'
import { RIDE_SECONDS, barDownAt, chairTravelAt, epilogueAt, gateOpenAt, planEpilogue } from './epilogue'
import { GATE_BACK, HANG_LENGTH, LANE_LENGTH, buildLiftLine, cableAt, fencedRange, loopAt } from './liftLine'
import { buildCourseShape, surfaceHeightAt } from './terrainShape'

const SEAT = { forward: 0.35, up: 0.5 }

function epilogueFor(config: LineConfig) {
  const result = simulate(config)
  const shape = buildCourseShape(result.terrain)
  const lift = buildLiftLine(shape)
  return { result, shape, lift, plan: planEpilogue(shape, lift, result.samples, SEAT) }
}

const hard = epilogueFor(tuneLine(DEFAULT_LINE))
const wtf = epilogueFor(tuneLine(buildScenario('wtf').config))
/** Élan presque nul : le skieur s'arrête avant la première lèvre. */
const stalled = epilogueFor({
  ...DEFAULT_LINE,
  kickers: [{ ...DEFAULT_LINE.kickers[0], inrunLength: 2, inrunAngleDeg: 2 }],
  rider: { ...DEFAULT_LINE.rider, startSpeed: 0.5 },
})

describe('remontée en télésiège', () => {
  test('reprend le skieur là où la descente le laisse, dans le plat final', () => {
    const { result, plan } = hard
    const last = result.samples[result.samples.length - 1]
    const start = epilogueAt(plan, 0)

    expect(plan.handover).toBeLessThan(result.duration)
    expect(plan.handover).toBeGreaterThan(result.duration * 0.7)
    expect(start.x).toBeLessThan(last.x)
    expect(start.z).toBeCloseTo(0)
    expect(start.seated).toBe(0)
    expect(start.yaw).toBeCloseTo(0, 1)
    // Il reprend la descente à la vitesse où elle le laisse, sans à-coup.
    expect(start.speed).toBeCloseTo(plan.entrySpeed, 0)
  })

  test('enchaîne sortie, embarquement, remontée et débarquement sans jamais téléporter le skieur', () => {
    ;[hard, wtf, stalled].forEach(({ plan }) => {
      const step = 0.01
      const reach = plan.peakSpeed * step * 1.25 + 0.08
      let previous = epilogueAt(plan, 0)
      for (let t = step; t <= plan.duration; t += step) {
        const current = epilogueAt(plan, t)
        const moved = Math.hypot(current.x - previous.x, current.y - previous.y, current.z - previous.z)
        expect(moved, `saut à t=${t.toFixed(2)} (${current.phase})`).toBeLessThan(reach)
        previous = current
      }
    })
  })

  test('passe par les quatre phases dans l’ordre', () => {
    const { plan } = hard
    const phases = Array.from({ length: 400 }, (_, i) => epilogueAt(plan, (i / 399) * plan.duration).phase)
    const order = phases.filter((phase, i) => phase !== phases[i - 1])

    expect(order).toEqual(['approach', 'boarding', 'ride', 'unload'])
  })

  test('amène un siège au quai à l’instant de l’embarquement', () => {
    ;[hard, wtf].forEach(({ plan }) => {
      expect(chairTravelAt(plan, plan.rideStart)).toBeCloseTo(0, 6)
      expect(chairTravelAt(plan, plan.rideEnd)).toBeCloseTo(plan.line.length, 4)
      expect(chairTravelAt(plan, plan.rideStart - 2)).toBeLessThan(0)
    })
  })

  test('dure une douzaine de secondes de remontée, que la piste soit courte ou longue', () => {
    ;[hard, wtf].forEach(({ plan }) => expect(plan.rideEnd - plan.rideStart).toBeCloseTo(RIDE_SECONDS))
    expect(wtf.plan.line.length).toBeGreaterThan(hard.plan.line.length * 1.5)
  })

  test('assoit le skieur sur le siège pendant la remontée : son bassin suit l’assise', () => {
    const { plan, lift } = hard
    const middle = (plan.rideStart + plan.rideEnd) / 2
    const state = epilogueAt(plan, middle)
    const seat = cableAt(lift, chairTravelAt(plan, middle))

    expect(state.seated).toBe(1)
    expect(state.z).toBeCloseTo(lift.z)
    expect(Math.cos(state.yaw)).toBeCloseTo(-1)
    expect(state.y + SEAT.up).toBeCloseTo(seat.y - HANG_LENGTH)
    expect(state.x - SEAT.forward).toBeCloseTo(seat.x)
  })

  test('garde le skieur au-dessus de la neige pendant toute la remontée', () => {
    ;[hard, wtf].forEach(({ plan, shape }) => {
      // En gare, le câble est à plat et le siège rase la neige : on ne juge que la pleine ligne.
      for (let t = plan.rideStart + 3; t < plan.rideEnd - 3; t += 0.05) {
        const state = epilogueAt(plan, t)
        expect(state.y - surfaceHeightAt(shape, state.x, state.z)).toBeGreaterThan(1)
      }
    })
  })

  test('repose le skieur exactement au départ, debout, face à la pente', () => {
    ;[hard, wtf, stalled].forEach(({ plan, result }) => {
      const first = result.samples[0]
      const end = epilogueAt(plan, plan.duration)

      expect(end.x).toBeCloseTo(first.x, 3)
      expect(end.y).toBeCloseTo(first.y, 3)
      expect(end.z).toBeCloseTo(0, 3)
      expect(end.seated).toBe(0)
      expect(Math.cos(end.yaw)).toBeCloseTo(1, 3)
      expect(end.tilt).toBeCloseTo(first.tilt, 3)
    })
  })

  test('repart du point d’arrêt quand le skieur n’a pas fini la descente', () => {
    const { plan, result } = stalled
    const last = result.samples[result.samples.length - 1]
    const start = epilogueAt(plan, 0)

    expect(result.outcome).toBe('stopped')
    expect(plan.handover).toBeCloseTo(result.duration)
    expect(start.x).toBeCloseTo(last.x)
    expect(start.y).toBeCloseTo(last.y, 1)
  })

  test('pose le skieur sur la neige pendant la sortie et le débarquement', () => {
    const { plan, shape } = hard
    ;[plan.approachEnd * 0.5, plan.rideEnd + 2].forEach((t) => {
      const state = epilogueAt(plan, t)
      expect(state.y).toBeCloseTo(surfaceHeightAt(shape, state.x, state.z), 1)
    })
  })

  test('descend de la gare amont jusqu’au départ sans jamais remonter la pente', () => {
    ;[hard, wtf].forEach(({ plan }) => {
      let previous = epilogueAt(plan, plan.rideEnd + 0.6)
      for (let t = plan.rideEnd + 0.65; t <= plan.duration; t += 0.05) {
        const current = epilogueAt(plan, t)
        expect(current.y, `remonte à t=${t.toFixed(2)}`).toBeLessThanOrEqual(previous.y + 0.02)
        previous = current
      }
    })
  })

  test('freine en dérapage avant le quai : skis en travers, corps penché vers l’intérieur', () => {
    const { plan } = hard
    const states = Array.from({ length: 200 }, (_, i) => epilogueAt(plan, (i / 199) * plan.approachEnd))
    const sideways = states.reduce((best, state) => (state.slide > best.slide ? state : best))
    const across = Math.abs(Math.atan2(Math.sin(sideways.yaw - sideways.heading), Math.cos(sideways.yaw - sideways.heading)))

    expect(sideways.slide).toBeGreaterThan(0.95)
    expect(across).toBeGreaterThan(1)
    expect(Math.abs(sideways.lean)).toBeGreaterThan(0.25)
    expect(sideways.crouch).toBeGreaterThan(0.2)
    expect(sideways.spray).toBeGreaterThan(0.2)
  })

  test('se redresse avant d’arriver au quai, skis de nouveau dans l’axe', () => {
    const { plan } = hard
    const arrived = epilogueAt(plan, plan.approachEnd)

    expect(arrived.slide).toBeCloseTo(0)
    expect(arrived.lean).toBeCloseTo(0)
    expect(arrived.spray).toBeCloseTo(0)
  })

  test('n’a pas à freiner quand il arrive sans élan', () => {
    const { plan } = stalled
    for (let t = 0; t <= plan.approachEnd; t += 0.1) expect(epilogueAt(plan, t).slide).toBe(0)
  })

  test('ne dérape ni sur le siège ni au débarquement', () => {
    const { plan } = hard
    ;[plan.rideStart + 3, plan.rideEnd + 1.5].forEach((t) => {
      const state = epilogueAt(plan, t)
      expect(state.slide).toBe(0)
      expect(state.spray).toBe(0)
    })
  })

  test('arrive tout droit et sans freiner tant qu’il n’a pas mis ses skis en travers', () => {
    ;[hard, wtf].forEach(({ plan }) => {
      const states = Array.from({ length: 1500 }, (_, i) => epilogueAt(plan, (i / 1499) * plan.approachEnd))
      const straight = states.slice(0, states.findIndex((state) => state.slide >= 0.02))

      expect(straight.length).toBeGreaterThan(5)
      straight.forEach((state) => {
        expect(Math.abs(state.z)).toBeLessThan(0.05)
        expect(Math.abs(Math.sin(state.heading))).toBeLessThan(0.02)
        expect(state.speed).toBeGreaterThan(states[0].speed * 0.93)
      })
    })
  })

  test('c’est le dérapage qui le freine et le fait tourner vers la gare', () => {
    const { plan } = hard
    const states = Array.from({ length: 800 }, (_, i) => epilogueAt(plan, (i / 799) * plan.approachEnd))
    const entry = states[0]
    const slideStart = states.findIndex((state) => state.slide > 0.5)
    const slideEnd = states.findIndex((state, i) => i > slideStart && state.slide < 0.5)
    const firstTurned = states.findIndex((state) => Math.abs(state.z) > 1)

    // Il ne quitte sa ligne droite qu'une fois les skis en travers…
    expect(firstTurned).toBeGreaterThan(slideStart)
    // … et c'est skis en travers qu'il perd l'essentiel de sa vitesse et fait son demi-tour.
    expect(states[slideStart].speed).toBeGreaterThan(entry.speed * 0.9)
    expect(states[slideEnd].speed).toBeLessThan(entry.speed * 0.55)
    expect(Math.cos(states[slideEnd].heading)).toBeLessThan(-0.6)
  })

  test('garde un freinage tenable quand la place ne manque pas', () => {
    const { plan } = hard
    const step = 0.05
    let previous = epilogueAt(plan, 0)
    for (let t = step; t < plan.approachEnd; t += step) {
      const current = epilogueAt(plan, t)
      expect((previous.speed - current.speed) / step, `freinage à t=${t.toFixed(2)}`).toBeLessThan(11)
      previous = current
    }
  })

  test('commence à déraper d’autant plus tôt qu’il arrive vite', () => {
    const lastX = (run: typeof hard): number => run.result.samples[run.result.samples.length - 1].x
    const room = (run: typeof hard): number => lastX(run) - epilogueAt(run.plan, 0).x

    expect(epilogueAt(wtf.plan, 0).speed).toBeGreaterThan(epilogueAt(hard.plan, 0).speed)
    expect(room(wtf)).toBeGreaterThan(room(hard) + 5)
  })

  test('s’arrête au portillon, dans l’axe du télésiège, face à la montée', () => {
    ;[hard, wtf, stalled].forEach(({ plan, lift }) => {
      const waiting = epilogueAt(plan, plan.approachEnd)

      expect(waiting.x).toBeCloseTo(lift.bottom.x + GATE_BACK, 1)
      expect(waiting.z).toBeCloseTo(lift.z, 1)
      expect(Math.cos(waiting.yaw)).toBeCloseTo(-1, 1)
      expect(waiting.speed).toBeLessThan(1.5)
    })
  })

  test('n’ouvre le portillon que pour laisser passer le skieur', () => {
    const { plan } = hard

    expect(gateOpenAt(plan, -3)).toBe(0)
    expect(gateOpenAt(plan, plan.approachEnd * 0.5)).toBe(0)
    expect(gateOpenAt(plan, plan.rideStart + 4)).toBe(0)
    const opened = Array.from({ length: 200 }, (_, i) => plan.approachEnd + (i / 199) * (plan.rideStart - plan.approachEnd)).filter(
      (t) => gateOpenAt(plan, t) > 0.99,
    )
    expect(opened.length).toBeGreaterThan(10)
    // Tant qu'il n'est pas grand ouvert, le skieur n'a pas bougé du portillon.
    for (let t = plan.approachEnd; t < opened[0]; t += 0.02) {
      expect(epilogueAt(plan, t).x).toBeCloseTo(plan.line.bottom.x + GATE_BACK, 1)
    }
  })

  test('avance jusqu’au quai avant que le siège n’arrive dans son dos', () => {
    ;[hard, wtf].forEach(({ plan, lift }) => {
      for (let t = plan.approachEnd; t < plan.rideStart - 0.6; t += 0.02) {
        const skier = epilogueAt(plan, t)
        const chair = loopAt(lift, chairTravelAt(plan, t))
        expect(Math.hypot(skier.x - chair.x, skier.z - chair.z), `siège trop près à t=${t.toFixed(2)}`).toBeGreaterThan(1.2)
      }
      const ready = epilogueAt(plan, plan.rideStart - 0.5)
      expect(ready.x).toBeCloseTo(lift.bottom.x, 1)
      expect(ready.seated).toBeLessThan(0.05)
    })
  })

  test('baisse le garde-corps une fois assis et le relève avant l’arrivée', () => {
    const { plan } = hard

    expect(barDownAt(plan, plan.rideStart)).toBe(0)
    expect(barDownAt(plan, (plan.rideStart + plan.rideEnd) / 2)).toBe(1)
    expect(barDownAt(plan, plan.rideEnd)).toBe(0)
    expect(barDownAt(plan, plan.approachEnd)).toBe(0)
  })

  test('s’engage droit dans le couloir d’embarquement, skis dans l’axe, sans toucher ses barrières', () => {
    ;[hard, wtf, stalled].forEach(({ plan, lift }) => {
      const gateX = lift.bottom.x + GATE_BACK
      const inLane = Array.from({ length: 2000 }, (_, i) => epilogueAt(plan, (i / 1999) * plan.approachEnd)).filter(
        (state) => state.x <= gateX + LANE_LENGTH + 0.5 && Math.abs(state.z - lift.z) < 4,
      )

      expect(inLane.length).toBeGreaterThan(5)
      inLane.forEach((state) => {
        expect(Math.abs(state.z - lift.z), `écart dans le couloir à x=${state.x.toFixed(1)}`).toBeLessThan(0.35)
        expect(state.slide).toBeLessThan(0.05)
        expect(Math.cos(state.yaw)).toBeLessThan(-0.95)
      })
    })
  })

  test('ne traverse pas le filet de la piste : il n’en sort que par l’ouverture de la gare', () => {
    ;[hard, wtf, stalled].forEach(({ plan, lift, shape }) => {
      const fenced = fencedRange(lift)
      for (let t = 0; t <= plan.approachEnd; t += 0.01) {
        const state = epilogueAt(plan, t)
        if (state.x < fenced.toX) expect(Math.abs(state.z), `hors piste à x=${state.x.toFixed(1)}`).toBeLessThan(shape.halfWidth - 1)
      }
    })
  })

  test('a presque tout freiné en dérapage : il entre dans le couloir au pas', () => {
    const { plan, lift } = hard
    const entering = Array.from({ length: 2000 }, (_, i) => epilogueAt(plan, (i / 1999) * plan.approachEnd)).find(
      (state) => state.x <= lift.bottom.x + GATE_BACK + LANE_LENGTH && Math.abs(state.z - lift.z) < 1,
    )

    expect(entering).toBeDefined()
    expect(entering?.speed).toBeLessThan(6.5)
    expect(entering?.speed).toBeGreaterThan(1)
  })
})
