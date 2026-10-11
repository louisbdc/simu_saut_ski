import { describe, expect, test } from 'vitest'
import { bodyPose, ridePose } from './choreography'
import { ANKLE_HEIGHT, FOREARM, LEG_HALF_WIDTH, SHIN, THIGH, TORSO, UPPER_ARM, solveJoints } from './skeleton'
import { TRICKS, getTrick } from './tricks'

const timing = (id: string, airTime: number, compactness = 0.6) => ({ trick: getTrick(id), airTime, compactness })

const AIR_TIME = 2.2
/** Postures échantillonnées sur tout le saut de chaque figure, de l'élan à la reprise de glisse. */
const allPoses = TRICKS.flatMap((trick) => {
  const plan = { trick, airTime: AIR_TIME, compactness: 0.6 }
  return Array.from({ length: 40 }, (_, i) => bodyPose(plan, -0.6 + (i * (AIR_TIME + 1.5)) / 39, 0.24))
})

describe('articulations du skieur', () => {
  test('les pieds restent sur les skis quelle que soit la posture', () => {
    allPoses.forEach((pose) => {
      const [left, right] = solveJoints(pose).sides

      // Les pieds ne quittent jamais la semelle ; seul leur écartement change, pour lancer une vrille.
      expect([left.ankle.x, left.ankle.y]).toEqual([0, ANKLE_HEIGHT])
      expect([right.ankle.x, right.ankle.y]).toEqual([0, ANKLE_HEIGHT])
      expect(right.ankle.z).toBeGreaterThanOrEqual(LEG_HALF_WIDTH)
      expect(left.ankle.z).toBeCloseTo(-right.ankle.z, 12)
    })
  })

  test('les os gardent leur longueur dans toutes les postures de toutes les figures', () => {
    allPoses.forEach((pose) => {
      const joints = solveJoints(pose)

      expect(joints.pelvis.distanceTo(joints.neck)).toBeCloseTo(TORSO, 9)
      joints.sides.forEach((side) => {
        expect(side.ankle.distanceTo(side.knee)).toBeCloseTo(SHIN, 9)
        expect(side.shoulder.distanceTo(side.elbow)).toBeCloseTo(UPPER_ARM, 9)
        expect(side.elbow.distanceTo(side.hand)).toBeCloseTo(FOREARM, 9)
        // La cuisse rejoint une hanche un peu plus resserrée que le genou.
        expect(Math.abs(side.knee.distanceTo(side.hip) - THIGH)).toBeLessThan(0.01)
      })
    })
  })

  test('aucune articulation ne prend de valeur invalide', () => {
    allPoses.forEach((pose) => {
      const joints = solveJoints(pose)
      const values = [
        joints.pelvis,
        joints.neck,
        joints.head,
        joints.center,
        ...joints.sides.flatMap((side) => Object.values(side)),
      ].flatMap((value) => (typeof value === 'number' ? [value] : value.toArray()))

      expect(values.every(Number.isFinite)).toBe(true)
    })
  })

  test('debout, le skieur mesure environ 1,75 m et se tient droit', () => {
    const joints = solveJoints(ridePose(0))

    expect(joints.head.y).toBeGreaterThan(1.5)
    expect(joints.head.y).toBeLessThan(1.8)
    expect(joints.pelvis.y).toBeGreaterThan(0.9)
  })

  test('groupé, le bassin descend et les genoux remontent vers la poitrine', () => {
    const standing = solveJoints(ridePose(0))
    const tucked = solveJoints(ridePose(1))

    expect(tucked.pelvis.y).toBeLessThan(standing.pelvis.y - 0.4)
    expect(tucked.sides[0].knee.distanceTo(tucked.neck)).toBeLessThan(0.3)
  })

  test('backflip ouvert : corps presque droit des genoux aux épaules, couché derrière les genoux', () => {
    const joints = solveJoints({ ...ridePose(0.1), layback: 1 })
    const knee = joints.sides[0].knee.clone().setZ(0)
    const kneeToHip = joints.pelvis.clone().sub(knee).normalize()
    const hipToNeck = joints.neck.clone().sub(joints.pelvis).normalize()

    // Hanches ouvertes : cuisses et buste presque alignés, avec un léger cambré.
    expect(kneeToHip.dot(hipToNeck)).toBeGreaterThan(0.9)
    expect(joints.neck.x).toBeLessThan(joints.pelvis.x - 0.3)
    expect(joints.head.x).toBeLessThan(joints.neck.x)
    // Tibias presque perpendiculaires aux skis, comme l'imposent les chaussures.
    expect(knee.x).toBeLessThan(0.15)
    expect(knee.y).toBeGreaterThan(0.5)
  })

  test('le centre de gravité suit la posture : il recule quand le corps se couche en arrière', () => {
    const standing = solveJoints(ridePose(0.1))
    const laidBack = solveJoints({ ...ridePose(0.1), layback: 1 })

    expect(standing.center.y).toBeGreaterThan(0.8)
    expect(laidBack.center.x).toBeLessThan(standing.center.x - 0.25)
    expect(laidBack.center.y).toBeLessThan(standing.center.y)
  })

  test('les deux côtés sont symétriques en posture de glisse', () => {
    const [left, right] = solveJoints(ridePose(0.3)).sides

    expect(left.hand.x).toBeCloseTo(right.hand.x, 9)
    expect(left.hand.y).toBeCloseTo(right.hand.y, 9)
    expect(left.hand.z).toBeCloseTo(-right.hand.z, 9)
  })

  test.each(['safety', 'mute', 'japan'])('%s : la main droite arrive sur le ski', (id) => {
    const plan = timing(id, AIR_TIME)

    const right = solveJoints(bodyPose(plan, AIR_TIME / 2, 0.24)).sides[1]

    expect(right.hand.distanceTo(right.handTarget)).toBeLessThan(0.05)
    expect(right.handTarget.y).toBeLessThan(0.15)
  })

  test('safety : la main prend le ski droit par l’extérieur, devant la chaussure', () => {
    const right = solveJoints(bodyPose(timing('safety', AIR_TIME), AIR_TIME / 2, 0.24)).sides[1]

    expect(right.handTarget.x).toBeGreaterThan(0.1)
    expect(right.handTarget.z).toBeGreaterThan(LEG_HALF_WIDTH)
  })

  test('mute : les spatules se croisent, le ski droit passe au-dessus', () => {
    const [left, right] = solveJoints(bodyPose(timing('mute', AIR_TIME), AIR_TIME / 2, 0.24)).sides

    // Chaque spatule part vers l'autre ski.
    expect(right.skiYaw).toBeGreaterThan(0.5)
    expect(left.skiYaw).toBeCloseTo(-right.skiYaw, 9)
    expect(right.skiLift).toBeGreaterThan(0)
    expect(left.skiLift).toBe(0)
  })

  test('japan : la main passe derrière la chaussure', () => {
    const joints = solveJoints(bodyPose(timing('japan', AIR_TIME), AIR_TIME / 2, 0.24))

    expect(joints.sides[1].handTarget.x).toBeLessThan(-0.1)
  })

  test('groupé en l’air : genoux à la poitrine, tibias proches de la perpendiculaire aux skis', () => {
    const joints = solveJoints({ ...ridePose(0), tuck: 1 })
    const knee = joints.sides[0].knee

    expect(knee.x).toBeLessThan(0.2)
    expect(knee.distanceTo(joints.neck.clone().setZ(knee.z))).toBeLessThan(0.25)
    // Le buste reste bien plus droit que dans l'accroupi de glisse.
    expect(joints.along.x).toBeLessThan(solveJoints(ridePose(1)).along.x - 0.2)
  })

  test('hors des grabs, la main libre garde la longueur du bras sans tirer sur l’épaule', () => {
    const [left] = solveJoints(bodyPose(timing('safety', AIR_TIME), AIR_TIME / 2, 0.24)).sides

    expect(left.hand.distanceTo(left.handTarget)).toBeLessThan(1e-9)
  })

  test('armer une vrille fait tourner les épaules sans bouger le bassin', () => {
    const neutral = solveJoints({ ...ridePose(0.5), twist: 0 })
    const wound = solveJoints({ ...ridePose(0.5), twist: -0.6 })

    expect(wound.pelvis.toArray()).toEqual(neutral.pelvis.toArray())
    // Armé à l'opposé d'une vrille vers la gauche : l'épaule droite recule, la gauche avance.
    expect(wound.sides[1].shoulder.x).toBeLessThan(neutral.sides[1].shoulder.x)
    expect(wound.sides[0].shoulder.x).toBeGreaterThan(neutral.sides[0].shoulder.x)
  })
})
