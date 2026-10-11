import { describe, expect, test } from 'vitest'
import { DEFAULT_LINE } from '../physics/constants'
import { simulate } from '../physics/simulate'
import { epilogueAt } from './epilogue'
import { LIFT_DISPLAY_SPEED, buildLiftRide, liftLabel, liftSample, seatOffset, seatedPosture } from './liftRide'
import { solveJoints } from './skeleton'

describe('skieur sur le télésiège', () => {
  test('s’assoit cuisses à l’horizontale, buste redressé', () => {
    const joints = solveJoints(seatedPosture(1))
    const knee = joints.sides[0].knee

    expect(Math.abs(knee.y - joints.pelvis.y)).toBeLessThan(0.08)
    expect(joints.pelvis.x).toBeLessThan(knee.x - 0.3)
    expect(Math.abs(joints.neck.x - joints.pelvis.x)).toBeLessThan(0.2)
    expect(joints.neck.y).toBeGreaterThan(joints.pelvis.y + 0.4)
  })

  test('reste debout comme en glisse tant qu’il n’est pas assis', () => {
    const standing = seatedPosture(0)

    expect(standing.tuck).toBe(0)
    expect(standing.lean).toBeCloseTo(0)
    expect(standing.arms.ride).toBe(1)
    expect(standing.arms.knees).toBe(0)
  })

  test('se fléchit davantage quand il freine en dérapage', () => {
    expect(seatedPosture(0, 0.35).flex).toBeGreaterThan(seatedPosture(0).flex + 0.3)
    expect(seatedPosture(1, 0.35).flex).toBe(0)
  })

  test('pose le bassin sur le siège : les pieds sont devant et plus bas que l’assise', () => {
    const offset = seatOffset()

    expect(offset.forward).toBeLessThan(-0.15)
    expect(offset.up).toBeGreaterThan(0.25)
  })

  test('prépare la remontée de la piste simulée et la traduit en échantillons lisibles', () => {
    const result = simulate(DEFAULT_LINE)
    const ride = buildLiftRide(result)
    const middle = (ride.plan.rideStart + ride.plan.rideEnd) / 2
    const state = epilogueAt(ride.plan, middle)
    const sample = liftSample(state, ride.plan.handover + middle, 1)

    expect(sample.kind).toBe('runout')
    expect(sample.x).toBe(state.x)
    expect(sample.vx).toBeLessThan(0)
    expect(sample.height).toBeGreaterThan(1)
    expect(sample.kicker).toBe(1)
  })

  test('affiche la vitesse d’un vrai télésiège pendant la montée, et dit qu’elle est accélérée', () => {
    const ride = buildLiftRide(simulate(DEFAULT_LINE))
    const riding = epilogueAt(ride.plan, (ride.plan.rideStart + ride.plan.rideEnd) / 2)
    const braking = epilogueAt(ride.plan, ride.plan.approachEnd * 0.4)

    expect(riding.speed).toBeGreaterThan(20)
    expect(liftSample(riding, 0, 0).speed).toBe(LIFT_DISPLAY_SPEED)
    expect(liftLabel(riding)).toMatch(/^Télésiège, accéléré ×\d+$/)
    // Hors du siège, c'est sa vraie vitesse sur la neige qui est affichée.
    expect(liftSample(braking, 0, 0).speed).toBe(braking.speed)
    expect(liftLabel(braking)).toBe('Retour vers le télésiège')
  })
})
