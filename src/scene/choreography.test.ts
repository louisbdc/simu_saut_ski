import { describe, expect, test } from 'vitest'
import {
  setSwing,
  RECOVER_SECONDS,
  WIND_UP_SECONDS,
  bodyPose,
  ridePose,
  switchLookAmount,
  withSwitchLook,
} from './choreography'
import { solveJoints } from './skeleton'
import { TRICKS, getTrick } from './tricks'

const AIR_TIME = 2.2
const RIDE_FLEX = 0.24
/** Saut à dérouler : la figure, son temps de vol et le groupé tenu (détendu par défaut). */
const planFor = (id: string, airTime = AIR_TIME, compactness = 0.6) => ({ trick: getTrick(id), airTime, compactness })

describe('postures au fil du saut', () => {
  test('hors de la fenêtre du saut, le skieur est en posture de glisse', () => {
    const plan = planFor('backflip')

    expect(bodyPose(plan, -WIND_UP_SECONDS - 0.1, RIDE_FLEX)).toEqual(ridePose(RIDE_FLEX))
    expect(bodyPose(plan, AIR_TIME + RECOVER_SECONDS + 0.1, RIDE_FLEX)).toEqual(ridePose(RIDE_FLEX))
  })

  test.each(TRICKS.map((trick) => trick.id))('%s : jambes chargées en bas du kick puis tendues à la lèvre', (id) => {
    const plan = planFor(id)

    const loaded = bodyPose(plan, -0.28, RIDE_FLEX)
    const pop = bodyPose(plan, 0, RIDE_FLEX)

    expect(loaded.flex).toBeGreaterThan(0.5)
    expect(pop.flex).toBeLessThan(0.06)
  })

  test('backflip : au pop, buste vers l’arrière, bras lancés vers le haut, tête presque neutre', () => {
    const pop = bodyPose(planFor('backflip'), 0, RIDE_FLEX)

    expect(pop.lean).toBeLessThan(-0.2)
    expect(pop.arms.up).toBe(1)
    expect(pop.headPitch).toBeLessThan(0.15)
  })

  test('backflip avec du temps de vol : corps ouvert et cambré, bras écartés, tête vers l’arrière', () => {
    const held = bodyPose(planFor('backflip', 2.2), 1.1, RIDE_FLEX)

    expect(held.layback).toBeCloseTo(1, 9)
    expect(held.flex).toBeLessThan(0.2)
    expect(held.arms.wide).toBeGreaterThan(0.8)
    expect(held.arms.knees).toBe(0)
    expect(held.headPitch).toBeGreaterThan(0.4)
  })

  test('backflip sur un vol très court : groupé genoux-poitrine, mains sur les genoux', () => {
    const plan = planFor('backflip', 0.9, 1)

    const held = bodyPose(plan, plan.airTime / 2, RIDE_FLEX)

    expect(held.layback).toBeCloseTo(0, 9)
    expect(held.tuck).toBeGreaterThan(0.9)
    expect(held.arms.knees).toBeCloseTo(1, 9)
  })

  test('seul le backflip se cambre : les autres figures restent sans cambré', () => {
    const others = ['spin720', 'cork720', 'frontflip', 'safety', 'mute', 'japan']

    others.forEach((id) => expect(bodyPose(planFor(id), AIR_TIME / 2, RIDE_FLEX).layback).toBe(0))
  })

  test('vrille : épaules armées à l’opposé en bas du kick, déjà lancées dans la rotation au pop', () => {
    const plan = planFor('spin720')

    expect(bodyPose(plan, -0.28, RIDE_FLEX).twist).toBeLessThan(-0.4)
    // À la lèvre, les épaules sont déjà engagées : la rotation part sur la neige, pas en l'air.
    expect(bodyPose(plan, 0, RIDE_FLEX).twist).toBeGreaterThan(0.1)
  })

  test('plus la vrille compte de tours, plus l’armé est marqué, sans dépasser 45°', () => {
    const wind = (id: string): number => -bodyPose(planFor(id), -0.28, RIDE_FLEX).twist

    expect(wind('spin720')).toBeGreaterThan(wind('spin360'))
    expect(wind('spin1440')).toBeLessThanOrEqual(0.8)
    expect(wind('cork720')).toBeGreaterThan(0)
    // Un salto pur part droit, sans armer les épaules.
    expect(wind('backflip')).toBeCloseTo(0, 12)
  })

  test('vrille : en l’air la tête mène et les bras sont resserrés', () => {
    const held = bodyPose(planFor('spin720'), AIR_TIME / 2, RIDE_FLEX)

    expect(held.headYaw).toBeGreaterThan(0.5)
    expect(held.tuck).toBeGreaterThan(0.3)
    // Sans grab, les deux bras restent contenus devant le corps : aucun ne part sur le côté.
    expect(held.arms.in).toBeGreaterThan(0.5)
    expect(held.arms.back).toBe(0)
    expect(held.arms.wide).toBe(0)
    expect(held.grab).toBe('none')
  })

  test('cork : la main attrape le ski pendant le groupé', () => {
    const held = bodyPose(planFor('cork720'), AIR_TIME / 2, RIDE_FLEX)

    expect(held.grab).toBe('safety')
    expect(held.grabAmount).toBe(1)
    expect(held.tuck).toBe(1)
    // La main libre part loin sur le côté pour l'équilibre.
    expect(held.arms.back).toBe(1)
  })

  test('mute : skis croisés en X, genoux remontés, main libre écartée', () => {
    const held = bodyPose(planFor('spin360mute'), AIR_TIME / 2, RIDE_FLEX)

    expect(held.grab).toBe('mute')
    expect(held.skiCross).toBeGreaterThan(0.5)
    expect(held.tuck).toBe(1)
    expect(held.arms.back).toBe(1)
  })

  test('japan : jambes repliées, buste redressé et tourné vers la main', () => {
    const held = bodyPose(planFor('japan'), AIR_TIME / 2, RIDE_FLEX)

    expect(held.grab).toBe('japan')
    expect(held.lean).toBeLessThan(-0.8)
    expect(held.twist).toBeLessThan(-0.4)
    expect(held.skiCross).toBe(0)
  })

  test('un grab se prend et se lâche progressivement, skis décroisés à la lèvre et à la réception', () => {
    const plan = planFor('spin360mute')
    const at = (time: number) => bodyPose(plan, time, RIDE_FLEX)

    expect(at(0).grabAmount).toBe(0)
    expect(at(0).skiCross).toBe(0)
    expect(at(0.15).grabAmount).toBeGreaterThan(0)
    expect(at(0.15).grabAmount).toBeLessThan(1)
    expect(at(AIR_TIME).grabAmount).toBeCloseTo(0, 9)
    expect(at(AIR_TIME).skiCross).toBeCloseTo(0, 9)
  })

  test('avant l’impact le corps se rouvre, puis il amortit la réception', () => {
    const plan = planFor('cork720')

    const touchdown = bodyPose(plan, AIR_TIME, RIDE_FLEX)
    const absorbing = bodyPose(plan, AIR_TIME + 0.14, RIDE_FLEX)

    expect(touchdown.flex).toBeCloseTo(0.2, 9)
    expect(touchdown.arms.forward).toBe(1)
    expect(absorbing.flex).toBeGreaterThan(0.7)
  })

  test('le groupé se resserre quand le temps de vol est juste', () => {
    const relaxed = bodyPose(planFor('backflip', 2.5, 0.6), 1.25, RIDE_FLEX)
    const tight = bodyPose(planFor('backflip', 1.0, 1), 0.5, RIDE_FLEX)

    expect(tight.tuck).toBeGreaterThan(relaxed.tuck)
    expect(tight.layback).toBeLessThan(relaxed.layback)
  })

  test('la posture évolue sans à-coup d’un instant au suivant', () => {
    const plan = planFor('cork1080')
    const times = Array.from({ length: 400 }, (_, i) => -0.6 + (i * (AIR_TIME + 1.5)) / 400)

    const flexes = times.map((time) => bodyPose(plan, time, RIDE_FLEX).flex)

    const biggestStep = flexes.slice(1).reduce((max, flex, i) => Math.max(max, Math.abs(flex - flexes[i])), 0)
    expect(biggestStep).toBeLessThan(0.08)
  })

  test('sans temps de vol, le skieur reste en posture de glisse', () => {
    expect(bodyPose(planFor('backflip', 0), 0, RIDE_FLEX)).toEqual(ridePose(RIDE_FLEX))
  })
})

describe('glisse en switch', () => {
  test('de face du début à la fin, le skieur ne regarde jamais par-dessus l’épaule', () => {
    const amounts = [-1, 0, 0.5, 1.1, 2.2, 3].map((time) => switchLookAmount(false, false, time, 2.2))

    expect(amounts).toEqual([0, 0, 0, 0, 0, 0])
  })

  test('en switch avant la bosse : regard par-dessus l’épaule jusqu’à la lèvre, puis il s’efface en l’air', () => {
    expect(switchLookAmount(true, false, -0.5, 2.2)).toBe(1)
    expect(switchLookAmount(true, false, 0, 2.2)).toBe(1)
    expect(switchLookAmount(true, false, 1.1, 2.2)).toBe(0)
    expect(switchLookAmount(true, false, 2.5, 2.2)).toBe(0)
  })

  test('réception en switch : le regard revient avant l’impact et reste ensuite', () => {
    expect(switchLookAmount(false, true, 1.1, 2.2)).toBe(0)
    expect(switchLookAmount(false, true, 2.1, 2.2)).toBeGreaterThan(0.5)
    expect(switchLookAmount(false, true, 2.2, 2.2)).toBe(1)
    expect(switchLookAmount(false, true, 4, 2.2)).toBe(1)
  })

  test('le regard évolue sans à-coup tout au long du saut', () => {
    const amounts = Array.from({ length: 300 }, (_, i) => switchLookAmount(true, true, -0.2 + i * 0.01, 2.2))

    const biggestStep = amounts.slice(1).reduce((max, amount, i) => Math.max(max, Math.abs(amount - amounts[i])), 0)
    expect(biggestStep).toBeLessThan(0.1)
  })

  test('en switch, les épaules s’ouvrent et la tête se tourne vers l’aval', () => {
    const ride = ridePose(RIDE_FLEX)

    const looking = withSwitchLook(ride, 1)

    expect(looking.headYaw).toBeGreaterThan(1.2)
    expect(looking.twist).toBeGreaterThan(0.3)
    expect(looking.flex).toBe(ride.flex)
    expect(withSwitchLook(ride, 0)).toBe(ride)
  })
})

describe('bras dans les appuis', () => {
  test('mains basses dans la compression, puis lancées vers l’avant au pop', () => {
    const plan = planFor('straight')

    const loaded = bodyPose(plan, -0.28, RIDE_FLEX)
    const pop = bodyPose(plan, 0, RIDE_FLEX)

    expect(loaded.arms.low).toBeGreaterThan(0.5)
    expect(pop.arms.low).toBe(0)
    expect(pop.arms.forward).toBeGreaterThan(0.4)
  })

  test('une vrille tenue place le buste autour de son axe, sans le pencher à fond', () => {
    const held = bodyPose(planFor('spin360safety'), AIR_TIME / 2, RIDE_FLEX)

    expect(Math.abs(held.lean)).toBeLessThan(0.9)
    expect(held.lean).not.toBe(0)
  })
})

describe('lancer à la lèvre', () => {
  test('le buste traverse sa position neutre à pleine vitesse en quittant la neige', () => {
    expect(setSwing(0)).toBe(0)
    expect((setSwing(0.001) - setSwing(-0.001)) / 0.002).toBeCloseTo(1, 3)
  })

  test('il part de l’autre côté avant la lèvre, puis le mouvement s’éteint en l’air', () => {
    expect(setSwing(-0.1)).toBeLessThan(0)
    expect(setSwing(0.1)).toBeGreaterThan(0)
    expect(Math.abs(setSwing(0.8))).toBeLessThan(1e-6)
    expect(Math.abs(setSwing(-0.8))).toBeLessThan(1e-6)
  })

  test('un lancer vers l’arrière penche le buste en arrière juste après la lèvre', () => {
    const still = bodyPose(planFor('backflip'), 0.1, RIDE_FLEX)

    const thrown = bodyPose({ ...planFor('backflip'), set: { lean: 4, twist: 0 } }, 0.1, RIDE_FLEX)

    expect(thrown.lean).toBeLessThan(still.lean - 0.1)
    expect(thrown.twist).toBe(still.twist)
  })

  test('à la lèvre même, le lancer ne change pas la posture : seule sa vitesse compte', () => {
    const still = bodyPose(planFor('spin360'), 0, RIDE_FLEX)

    expect(bodyPose({ ...planFor('spin360'), set: { lean: 5, twist: 3 } }, 0, RIDE_FLEX)).toEqual(still)
  })
})

describe('lancer d’une vrille sur le kick', () => {
  const stanceWidth = (id: string, time: number): number => {
    const [left, right] = solveJoints(bodyPose(planFor(id), time, RIDE_FLEX)).sides
    return right.ankle.z - left.ankle.z
  }
  const rideWidth = stanceWidth('spin360', -1)

  test('les skis s’écartent dans le bas du kick et restent larges jusqu’à la lèvre', () => {
    expect(stanceWidth('spin360', -0.28)).toBeGreaterThan(rideWidth + 0.15)
    expect(stanceWidth('spin360', 0)).toBeGreaterThan(rideWidth + 0.15)
  })

  test('plus la figure compte de tours, plus les appuis sont larges', () => {
    expect(stanceWidth('spin720', -0.28)).toBeGreaterThan(stanceWidth('spin180', -0.28))
  })

  test('une fois la figure prise en l’air, les pieds sont revenus à leur largeur de glisse', () => {
    expect(stanceWidth('spin360', AIR_TIME / 2)).toBeCloseTo(rideWidth, 6)
  })

  test('sans vrille, les appuis ne bougent pas : un backflip ou un saut droit partent pieds serrés', () => {
    expect(stanceWidth('backflip', -0.28)).toBeCloseTo(rideWidth, 6)
    expect(stanceWidth('straight', 0)).toBeCloseTo(rideWidth, 6)
  })

  test('les bras s’arment à l’opposé plus loin que les épaules, puis sont lancés dans le sens de la vrille', () => {
    const loaded = bodyPose(planFor('spin360'), -0.28, RIDE_FLEX)
    const pop = bodyPose(planFor('spin360'), 0, RIDE_FLEX)

    expect(loaded.twist).toBeLessThan(0)
    expect(loaded.armSweep).toBeLessThan(loaded.twist)
    expect(pop.armSweep).toBeGreaterThan(0)
  })

  test('armé, le bras menant croise devant le corps et l’autre part derrière', () => {
    const [left, right] = solveJoints(bodyPose(planFor('spin360'), -0.28, RIDE_FLEX)).sides

    expect(Math.abs(left.hand.x - right.hand.x)).toBeGreaterThan(0.2)
  })
})

describe('figure faite à droite', () => {
  test('l’armé, le lancer et la tête partent dans l’autre sens', () => {
    const left = planFor('spin720')
    const right = planFor('spin720@d')

    expect(bodyPose(right, -0.28, RIDE_FLEX).twist).toBeCloseTo(-bodyPose(left, -0.28, RIDE_FLEX).twist, 9)
    expect(bodyPose(right, 0, RIDE_FLEX).armSweep).toBeCloseTo(-bodyPose(left, 0, RIDE_FLEX).armSweep, 9)
    expect(bodyPose(right, AIR_TIME / 2, RIDE_FLEX).headYaw).toBeLessThan(-0.5)
  })

  test('le reste de la posture ne change pas : même groupé, même flexion, mêmes appuis', () => {
    const left = bodyPose(planFor('spin360mute'), AIR_TIME / 2, RIDE_FLEX)
    const right = bodyPose(planFor('spin360mute@d'), AIR_TIME / 2, RIDE_FLEX)

    expect(right.tuck).toBe(left.tuck)
    expect(right.skiCross).toBe(left.skiCross)
    expect(right.lean).toBeCloseTo(left.lean, 9)
    expect(right.mirrored).toBe(true)
    expect(left.mirrored).toBe(false)
  })

  test('le grab est pris et lâché par la même main', () => {
    const plan = planFor('safety@d')

    expect(bodyPose(plan, AIR_TIME / 2, RIDE_FLEX).mirrored).toBe(true)
    expect(bodyPose(plan, AIR_TIME - 0.2, RIDE_FLEX).mirrored).toBe(true)
  })

  test('en switch, le regard passe par-dessus l’épaule du côté où l’on tourne', () => {
    const left = withSwitchLook(ridePose(RIDE_FLEX), 1)
    const right = withSwitchLook(ridePose(RIDE_FLEX), 1, true)

    expect(right.headYaw).toBeCloseTo(-left.headYaw, 9)
    expect(right.twist).toBeCloseTo(-left.twist, 9)
    expect(right.lean).toBeCloseTo(left.lean, 9)
  })
})
