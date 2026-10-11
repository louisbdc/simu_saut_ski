import { describe, expect, test } from 'vitest'
import { DEFAULT_LINE, GRAVITY, sanitizeLine } from './constants'
import { KICKER_MODELS, SCENARIOS, buildScenario, getKickerModel } from './presets'
import { classifyLanding, simulate } from './simulate'
import { solveInrunLength, tuneLine } from './solver'
import { buildTerrain, locate } from './terrain'
import type { KickerConfig, LineConfig } from './types'

const withFirstKicker = (changes: Partial<KickerConfig>): LineConfig => ({
  ...DEFAULT_LINE,
  kickers: [{ ...DEFAULT_LINE.kickers[0], ...changes }],
})

describe('simulation de la ligne', () => {
  test('le temps ne recule jamais et le skieur reste au-dessus de la neige', () => {
    const { samples } = simulate(DEFAULT_LINE)

    const timeGoesForward = samples.slice(1).every((sample, i) => sample.t >= samples[i].t)

    expect(timeGoesForward).toBe(true)
    expect(samples.every((sample) => sample.height >= 0)).toBe(true)
  })

  test('le kick fait perdre de la vitesse et comprime le skieur', () => {
    const report = simulate(withFirstKicker({})).reports[0]

    expect(report.reached).toBe(true)
    expect(report.speedLostInKick).toBeGreaterThan(0.5)
    expect(report.lipSpeed).toBeLessThan(report.approachSpeed)
    expect(report.maxG).toBeGreaterThan(1.5)
  })

  test('la réception redonne de la vitesse après le saut', () => {
    const report = simulate(tuneLine(withFirstKicker({}))).reports[0]

    expect(report.landing).not.toBeNull()
    expect(report.exitSpeed).toBeGreaterThan(report.landing!.speedAfter)
  })

  test("signale un kicker non atteint quand l'élan est trop court", () => {
    const result = simulate(withFirstKicker({ inrunLength: 3 }))

    expect(result.outcome).toBe('stopped')
    expect(result.reports[0].reached).toBe(false)
    expect(result.reports[0].landing).toBeNull()
  })

  test('un élan trop court fait retomber sur la table', () => {
    const tuned = tuneLine(withFirstKicker({}))
    const shorter = withFirstKicker({ inrunLength: tuned.kickers[0].inrunLength * 0.7 })

    const report = simulate(shorter).reports[0]

    expect(report.landing?.zone).toBe('table')
    expect(report.landing!.equivalentFallHeight).toBeGreaterThan(1)
  })

  test('après une réception courte mais douce sur la table, le skieur repart par la cassure et continue', () => {
    const medium = buildScenario('medium').config
    const shortFirstInrun: LineConfig = {
      ...medium,
      kickers: [{ ...medium.kickers[0], inrunLength: 24 }, medium.kickers[1]],
    }

    const result = simulate(shortFirstInrun)

    expect(result.reports[0].landing?.zone).toBe('table')
    expect(result.crash).toBeNull()
    expect(result.reports[1].approachSpeed).toBeGreaterThan(5)
  })

  test('une ligne mal lancée finit par faire tomber : trop court sur la première, choc sur la seconde', () => {
    const shortFirstInrun: LineConfig = {
      ...DEFAULT_LINE,
      kickers: [{ ...DEFAULT_LINE.kickers[0], inrunLength: 20 }, DEFAULT_LINE.kickers[1]],
    }

    const result = simulate(shortFirstInrun)

    expect(result.reports[0].landing?.zone).toBe('table')
    expect(result.crash).toMatchObject({ kicker: 1, cause: 'impact' })
  })

  test("un élan trop long fait dépasser la zone idéale et durcit l'impact", () => {
    const tuned = tuneLine(withFirstKicker({}))
    const ideal = simulate(tuned).reports[0].landing!
    const longer = withFirstKicker({ inrunLength: tuned.kickers[0].inrunLength * 1.6 })

    const landing = simulate(longer).reports[0].landing!

    expect(['long', 'flat']).toContain(landing.zone)
    expect(landing.offsetFromTarget).toBeGreaterThan(ideal.offsetFromTarget)
  })

  test('un pop à la lèvre allonge le saut', () => {
    const calm = simulate(withFirstKicker({})).reports[0]
    const popped: LineConfig = {
      ...withFirstKicker({}),
      rider: { ...DEFAULT_LINE.rider, popSpeed: 2 },
    }

    const report = simulate(popped).reports[0]

    expect(report.flightDistance).toBeGreaterThan(calm.flightDistance)
  })

  test('un pop fort à très basse vitesse ne renvoie jamais le skieur en arrière', () => {
    // Élans juste assez longs pour franchir la lèvre : c'est là que le skieur y arrive presque arrêté.
    const inrunLengths = Array.from({ length: 80 }, (_, i) => 14 + i * 0.25)

    const runs = inrunLengths.map((inrunLength) =>
      simulate({
        ...withFirstKicker({ inrunLength, takeoffAngleDeg: 50 }),
        rider: { ...DEFAULT_LINE.rider, popSpeed: 2.5 },
      }),
    )

    const slowJumps = runs.filter((run) => run.reports[0].reached && run.reports[0].lipSpeed < 4)
    expect(slowJumps.length).toBeGreaterThan(0)
    const neverGoesBack = runs.every((run) =>
      run.samples.slice(1).every((sample, i) => sample.x >= run.samples[i].x),
    )
    expect(neverGoesBack).toBe(true)
  })

  test('un saut qui dépasse le bout de la piste ne ramène pas le skieur en arrière', () => {
    const huge: LineConfig = {
      ...withFirstKicker({ inrunLength: 250, inrunAngleDeg: 45, landingLength: 5 }),
      rider: { ...DEFAULT_LINE.rider, friction: 0, dragArea: 0, dragAreaAir: 0 },
    }

    const { samples } = simulate(huge)

    expect(samples.slice(1).every((sample, i) => sample.x >= samples[i].x)).toBe(true)
  })

  test('classe les zones de réception dans l’ordre le long de la bosse', () => {
    const terrain = buildTerrain(withFirstKicker({}))
    const marks = terrain.kickers[0]

    const zones = [
      marks.lipX + 1,
      marks.knuckleStartX + 0.5,
      marks.targetX,
      marks.landingEndX - 0.5,
      marks.landingEndX + 5,
    ].map((x) => classifyLanding(terrain, 0, x))

    expect(zones).toEqual(['table', 'knuckle', 'ideal', 'long', 'flat'])
  })
})

describe('chutes', () => {
  const tuned = tuneLine(DEFAULT_LINE)

  test('une ligne bien réglée ne fait pas tomber le skieur', () => {
    const result = simulate(tuned)

    expect(result.crash).toBeNull()
    expect(result.outcome).toBe('finished')
    expect(result.reports.every((report) => report.landing?.crashed === false)).toBe(true)
  })

  test('une réception beaucoup trop longue, à plat, fait tomber sur le choc', () => {
    const overshoot: LineConfig = {
      ...tuned,
      kickers: [{ ...tuned.kickers[0], inrunLength: tuned.kickers[0].inrunLength * 3 }, tuned.kickers[1]],
    }

    const result = simulate(overshoot)

    expect(result.outcome).toBe('crashed')
    expect(result.crash).toMatchObject({ kicker: 0, cause: 'impact' })
    expect(result.crash!.equivalentFallHeight).toBeGreaterThan(2.5)
    expect(result.reports[0].landing!.crashed).toBe(true)
  })

  test('une figure pas bouclée fait tomber à la réception, même sur un bon saut', () => {
    const result = simulate(tuned, undefined, { failedKicker: 0 })

    expect(result.crash).toMatchObject({ kicker: 0, cause: 'figure' })
    expect(result.crash!.time).toBeCloseTo(result.reports[0].landingTime, 9)
  })

  test('le choc fait perdre de la vitesse, puis le skieur dévale la pente', () => {
    const { crash } = simulate(tuned, undefined, { failedKicker: 0 })
    const landing = simulate(tuned).reports[0].landing!

    expect(crash!.slideSpeed).toBeLessThan(landing.speedAfter)
    expect(crash!.slideDistance).toBeGreaterThan(5)
    expect(crash!.slideDuration).toBeGreaterThan(1)
  })

  test('à terre, il est bien plus freiné que sur ses skis et finit par s’arrêter', () => {
    const skiing = simulate(tuned)
    const fallen = simulate(tuned, undefined, { failedKicker: 0 })
    const lastX = (result: typeof skiing): number => result.samples[result.samples.length - 1].x

    expect(fallen.crash!.stopped).toBe(true)
    expect(lastX(fallen)).toBeLessThan(lastX(skiing))
  })

  test('une fois tombé, le skieur ne saute plus les bosses suivantes', () => {
    const result = simulate(tuned, undefined, { failedKicker: 0 })

    expect(result.reports[1].reached).toBe(false)
    expect(result.reports[1].landing).toBeNull()
  })

  test('une seule chute par parcours, et le temps ne recule jamais pendant la glissade', () => {
    const result = simulate(tuned, undefined, { failedKicker: 1 })

    expect(result.crash!.kicker).toBe(1)
    expect(result.reports[0].landing!.crashed).toBe(false)
    expect(result.samples.slice(1).every((sample, i) => sample.t >= result.samples[i].t)).toBe(true)
  })

  test('une bosse jamais atteinte ne peut pas faire tomber', () => {
    const result = simulate(withFirstKicker({ inrunLength: 3 }), undefined, { failedKicker: 0 })

    expect(result.crash).toBeNull()
    expect(result.outcome).toBe('stopped')
  })
})

describe('gabarits et scénarios', () => {
  test.each(SCENARIOS.map((scenario) => scenario.id))('le scénario %s réglé passe en entier', (id) => {
    const { config, models } = buildScenario(id)

    const reports = simulate(tuneLine(config)).reports

    expect(models).toHaveLength(config.kickers.length)
    expect(config.tricks).toHaveLength(config.kickers.length)
    expect(reports.map((report) => report.landing?.zone)).toEqual(config.kickers.map(() => 'ideal'))
  })

  test('chaque gabarit respecte les bornes des réglages', () => {
    KICKER_MODELS.forEach((model) => {
      const line: LineConfig = { ...DEFAULT_LINE, kickers: [model.kicker], tricks: [model.trick] }

      expect(sanitizeLine(line).kickers[0]).toEqual(model.kicker)
    })
  })

  test('un gabarit inconnu donne le gabarit par défaut, un scénario inconnu est refusé', () => {
    expect(getKickerModel('inconnu').id).toBe('hard')
    expect(() => buildScenario('inconnu')).toThrow('Scénario inconnu')
  })
})

describe('cohérence du rapport avec la trajectoire', () => {
  const result = simulate(tuneLine(DEFAULT_LINE))
  const { samples, reports, terrain } = result
  const firstAir = samples.findIndex((sample) => sample.kind === 'air')
  const lastAir = samples.findIndex((sample, i) => i > firstAir && sample.kind !== 'air') - 1
  const report = reports[0]

  test('la vitesse à la lèvre est celle du dernier point au sol avant le vol', () => {
    expect(report.lipSpeed).toBeCloseTo(samples[firstAir - 1].speed, 9)
    expect(samples[firstAir - 1].x).toBeCloseTo(terrain.kickers[0].lipX, 9)
  })

  test('distance, durée et hauteur du vol se retrouvent dans les échantillons', () => {
    const flight = samples.slice(firstAir, lastAir + 1)

    expect(report.flightDistance).toBeCloseTo(samples[lastAir].x - samples[firstAir].x, 9)
    expect(report.airTime).toBeCloseTo(samples[lastAir].t - samples[firstAir].t, 9)
    expect(report.maxHeight).toBeCloseTo(Math.max(...flight.map((sample) => sample.height)), 9)
  })

  test("la hauteur de chute équivalente vient de la vitesse perpendiculaire à la pente d'arrivée", () => {
    const touch = samples[lastAir]
    const slope = locate(terrain, touch.x).angle
    // Produit vectoriel vitesse × direction de la pente : composante perpendiculaire à la neige.
    const perpendicular = touch.vx * Math.sin(slope) - touch.vy * Math.cos(slope)

    expect(report.landing!.equivalentFallHeight).toBeCloseTo(perpendicular ** 2 / (2 * GRAVITY), 9)
    expect(report.landing!.impactSpeed).toBeCloseTo(Math.hypot(touch.vx, touch.vy), 9)
  })

  test("sans frottement ni air, l'énergie ne se perd qu'à la réception, de ½·v⊥² exactement", () => {
    const lossless: LineConfig = {
      ...withFirstKicker({}),
      rider: { ...DEFAULT_LINE.rider, friction: 0, dragArea: 0, dragAreaAir: 0 },
    }
    const run = simulate(tuneLine(lossless))
    const energy = (sample: { speed: number; y: number }): number => sample.speed ** 2 / 2 + GRAVITY * sample.y
    const landing = run.reports[0].landing!

    const atStart = energy(run.samples[0])
    const atEnd = energy(run.samples[run.samples.length - 1])

    expect(atStart - atEnd).toBeCloseTo(landing.normalSpeed ** 2 / 2, 2)
  })
})

describe('calcul inverse', () => {
  test("trouve la longueur d'élan qui fait atterrir au point visé", () => {
    const config = withFirstKicker({})

    const solution = solveInrunLength(config, 0)

    expect(solution.status).toBe('ok')
    const tuned = withFirstKicker({ inrunLength: solution.inrunLength })
    const report = simulate(tuned).reports[0]
    expect(Math.abs(report.landing!.offsetFromTarget)).toBeLessThan(0.05)
    expect(report.lipSpeed).toBeCloseTo(solution.lipSpeed, 6)
    expect(report.landing!.zone).toBe('ideal')
  })

  test('annonce une table hors de portée quand même le plus long élan ne suffit pas', () => {
    const config = withFirstKicker({ inrunAngleDeg: 6, tableLength: 45, takeoffAngleDeg: 15 })

    const solution = solveInrunLength(config, 0)

    expect(solution.status).toBe('tooSlow')
  })

  test('règle toute la ligne par défaut pour atterrir en zone idéale sur chaque bosse', () => {
    const tuned = tuneLine(DEFAULT_LINE)

    const zones = simulate(tuned).reports.map((report) => report.landing?.zone)

    expect(zones).toEqual(['ideal', 'ideal'])
  })

  test('ne modifie pas la configuration reçue', () => {
    const before = JSON.stringify(DEFAULT_LINE)

    tuneLine(DEFAULT_LINE)

    expect(JSON.stringify(DEFAULT_LINE)).toBe(before)
  })
})

describe('simulation arrêtée après une bosse', () => {
  // Ligne réglée : le skieur atteint et réussit les trois bosses.
  const line = tuneLine(buildScenario('pro').config)

  test('donne pour cette bosse le même saut que la simulation complète', () => {
    line.kickers.forEach((_, index) => {
      const complete = simulate(line).reports[index]

      const stopped = simulate(line, undefined, { stopAfterKicker: index }).reports[index]

      // La vitesse de sortie se lit après la réception : seule elle manque à la simulation tronquée.
      expect({ ...stopped, exitSpeed: 0 }).toEqual({ ...complete, exitSpeed: 0 })
      expect(stopped.exitSpeed).toBe(0)
    })
  })

  test('laisse les bosses suivantes non atteintes et s’arrête avant la fin de la ligne', () => {
    const complete = simulate(line)

    const stopped = simulate(line, undefined, { stopAfterKicker: 0 })

    expect(stopped.reports.map((report) => report.reached)).toEqual([true, false, false])
    expect(stopped.samples.length).toBeLessThan(complete.samples.length)
    expect(stopped.samples).toEqual(complete.samples.slice(0, stopped.samples.length))
  })

  test('donne, pour tout élan essayé par le calcul inverse, la même erreur et la même vitesse à la lèvre', () => {
    const index = 1
    const inrunLengths = [4, 20, 33.3, 47.1, 90, 250, 600]

    inrunLengths.forEach((inrunLength) => {
      const trial = {
        ...line,
        kickers: line.kickers.map((kicker, i) => (i === index ? { ...kicker, inrunLength } : kicker)),
      }

      const complete = simulate(trial).reports[index]
      const stopped = simulate(trial, undefined, { stopAfterKicker: index }).reports[index]

      expect(stopped.lipSpeed).toBe(complete.lipSpeed)
      expect(stopped.landing?.offsetFromTarget).toBe(complete.landing?.offsetFromTarget)
    })
  })

  test('ne change rien quand la bosse visée n’existe pas', () => {
    expect(simulate(line, undefined, { stopAfterKicker: 7 })).toEqual(simulate(line))
  })
})
