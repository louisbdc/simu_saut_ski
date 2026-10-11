import * as THREE from 'three'
import { describe, expect, test } from 'vitest'
import { ridePose } from './choreography'
import { PARTS, simulateRagdoll, type Part, type RagdollPoints, type RagdollStart } from './ragdoll'
import { solveJoints } from './skeleton'

const SLOPE = Math.tan((30 * Math.PI) / 180)
const slope = (x: number): number => -SLOPE * x
const flat = (): number => 0

/** Skieur debout, posé à une hauteur et lancé à une vitesse données, avec une rotation éventuelle. */
function standing(height: number, velocity: THREE.Vector3, spin = 0, lean = 0): RagdollStart {
  const joints = solveJoints(ridePose(0.2))
  const [left, right] = joints.sides
  const local: RagdollPoints = {
    head: joints.head,
    neck: joints.neck,
    pelvis: joints.pelvis,
    shoulderL: left.shoulder,
    shoulderR: right.shoulder,
    elbowL: left.elbow,
    elbowR: right.elbow,
    handL: left.hand,
    handR: right.hand,
    hipL: left.hip,
    hipR: right.hip,
    kneeL: left.knee,
    kneeR: right.knee,
    ankleL: left.ankle,
    ankleR: right.ankle,
  }
  const tilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), lean)
  const axis = new THREE.Vector3(0, 0, spin)
  const entries = PARTS.map((part) => {
    const position = local[part].clone().applyQuaternion(tilt).add(new THREE.Vector3(0, height, 0))
    const arm = position.clone().sub(new THREE.Vector3(0, height + 0.9, 0))
    return [part, { position, velocity: velocity.clone().add(axis.clone().cross(arm)) }] as const
  })
  return {
    positions: Object.fromEntries(entries.map(([part, state]) => [part, state.position])) as RagdollPoints,
    velocities: Object.fromEntries(entries.map(([part, state]) => [part, state.velocity])) as RagdollPoints,
  }
}

const BONES: readonly (readonly [Part, Part])[] = [
  ['shoulderL', 'elbowL'],
  ['elbowR', 'handR'],
  ['hipL', 'kneeL'],
  ['kneeR', 'ankleR'],
  ['pelvis', 'neck'],
  ['neck', 'head'],
]

describe('chute en corps articulé', () => {
  const start = standing(0.3, new THREE.Vector3(14, -6, 0), -4)
  const fall = simulateRagdoll(start, slope)

  test('les os gardent leur longueur pendant toute la chute', () => {
    for (const time of [0, 0.2, 0.6, 1.5, fall.duration]) {
      const frame = fall.frameAt(time)
      BONES.forEach(([a, b]) => {
        const length = start.positions[a].distanceTo(start.positions[b])
        expect(Math.abs(frame[a].distanceTo(frame[b]) - length)).toBeLessThan(length * 0.06 + 0.01)
      })
    }
  })

  test('aucune partie du corps ne s’enfonce dans la neige', () => {
    for (let time = 0; time <= fall.duration; time += 0.1) {
      const frame = fall.frameAt(time)
      PARTS.forEach((part) => expect(frame[part].y - slope(frame[part].x)).toBeGreaterThan(0.02))
    }
  })

  test('le corps dévale la pente puis s’immobilise', () => {
    const last = fall.frameAt(fall.duration)

    expect(fall.stopped || fall.duration >= 24.9).toBe(true)
    expect(last.pelvis.x).toBeGreaterThan(start.positions.pelvis.x + 5)
    expect(fall.slideDistance).toBeGreaterThan(5)
    expect(last.pelvis.y - slope(last.pelvis.x)).toBeLessThan(0.6)
  })

  test('sur du plat, le corps finit couché et à l’arrêt', () => {
    const still = simulateRagdoll(standing(0.5, new THREE.Vector3(6, -3, 0)), flat)
    const last = still.frameAt(still.duration)

    expect(still.stopped).toBe(true)
    expect(last.head.y).toBeLessThan(0.6)
    expect(last.pelvis.y).toBeLessThan(0.4)
  })

  test('plus on arrive vite, plus on glisse loin', () => {
    const slow = simulateRagdoll(standing(0.3, new THREE.Vector3(5, -2, 0)), flat)
    const fast = simulateRagdoll(standing(0.3, new THREE.Vector3(16, -2, 0)), flat)

    expect(fast.slideDistance).toBeGreaterThan(slow.slideDistance * 1.5)
  })

  test('la même chute se rejoue à l’identique', () => {
    const again = simulateRagdoll(start, slope)

    expect(again.duration).toBe(fall.duration)
    expect(again.frameAt(1).handL.toArray()).toEqual(fall.frameAt(1).handL.toArray())
  })

  test('la façon de tomber change la chute : sur les pieds, ce sont les jambes qui prennent en premier', () => {
    const feetFirst = simulateRagdoll(standing(1.5, new THREE.Vector3(2, -7, 0)), flat)
    const headFirst = simulateRagdoll(standing(2.6, new THREE.Vector3(2, -7, 0), 0, Math.PI), flat)

    expect(feetFirst.impacts.ankleL).toBeGreaterThan(headFirst.impacts.ankleL)
    expect(headFirst.impacts.head).toBeGreaterThan(5.42)
    expect(headFirst.notes.some((note) => note.startsWith('Tête') && note.includes('au-delà'))).toBe(true)
  })

  test('s’effondrer de toute sa hauteur suffit à cogner la tête : le corps bascule et la tête fouette la neige', () => {
    const collapse = simulateRagdoll(standing(0.02, new THREE.Vector3(1, 0, 0)), flat)

    expect(collapse.impacts.head).toBeGreaterThan(3)
  })

  test('glisser déjà couché, sans chute de hauteur, ne signale rien de grave', () => {
    const lying = simulateRagdoll(standing(0.25, new THREE.Vector3(4, 0, 0), 0, -Math.PI / 2), flat)

    expect(lying.notes.filter((note) => note.includes('risque') || note.includes('au-delà'))).toEqual([])
    expect(lying.stopped).toBe(true)
  })

  test('les genoux ne se plient jamais à l’envers pendant la chute', () => {
    for (let time = 0; time <= fall.duration; time += 0.05) {
      const frame = fall.frameAt(time)
      const forward = frame.neck.clone().sub(frame.pelvis).cross(frame.hipR.clone().sub(frame.hipL)).normalize()
      for (const [hip, knee, ankle] of [['hipL', 'kneeL', 'ankleL'], ['hipR', 'kneeR', 'ankleR']] as const) {
        const middle = frame[hip].clone().add(frame[ankle]).multiplyScalar(0.5)

        expect(frame[knee].clone().sub(middle).dot(forward)).toBeGreaterThan(-0.07)
      }
    }
  })

  test('les bras et les jambes bougent indépendamment du tronc', () => {
    const frame = fall.frameAt(0.5)
    const initialSpan = start.positions.handL.distanceTo(start.positions.handR)

    expect(Math.abs(frame.handL.distanceTo(frame.handR) - initialSpan)).toBeGreaterThan(0.05)
  })
})
