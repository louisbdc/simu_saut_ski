import { describe, expect, test } from 'vitest'
import { bodyPoser, ridePose, type PoseTiming } from './choreography'
import { getTrick } from './tricks'

const TRICK_IDS = ['straight', 'spin540', 'spin1440', 'backflip', 'frontflip', 'cork1080', 'misty720', 'rodeo540', 'custom:3:1080:mute', 'custom:1:180:japan']
const RIDE_FLEXES = [0, 0.24, 0.6]

/** Instants autour d'un saut : élan, lèvre, vol, réception et remise en glisse. */
const instantsAround = (airTime: number): number[] => Array.from({ length: 60 }, (_, i) => -0.8 + (i * (airTime + 1.8)) / 59)

const timingsFor = (id: string): PoseTiming[] => [
  { trick: getTrick(id), airTime: 2.4, compactness: 0.6 },
  { trick: getTrick(id), airTime: 3.7, compactness: 1, set: { lean: 3.1, twist: -1.4 } },
  { trick: getTrick(id), airTime: 0.9, compactness: 0.8, set: { lean: -2, twist: 0.5 } },
]

describe('déroulé des postures d’un saut', () => {
  test.each(TRICK_IDS)('%s : la fonction renvoyée n’a pas de mémoire, ni l’ordre ni le nombre d’appels ne changent une posture', (id) => {
    timingsFor(id).forEach((timing) => {
      RIDE_FLEXES.forEach((rideFlex) => {
        const instants = instantsAround(timing.airTime)
        const poseAt = bodyPoser(timing, rideFlex)

        const forward = instants.map((time) => poseAt(time))
        const backward = [...instants].reverse().map((time) => poseAt(time)).reverse()
        const again = instants.map((time) => poseAt(time))
        const eachTimeNew = instants.map((time) => bodyPoser(timing, rideFlex)(time))

        expect(backward).toEqual(forward)
        expect(again).toEqual(forward)
        expect(eachTimeNew).toEqual(forward)
      })
    })
  })

  test.each(TRICK_IDS)('%s : hors de la fenêtre du saut, c’est la posture de glisse du réglage demandé', (id) => {
    timingsFor(id).forEach((timing) => {
      RIDE_FLEXES.forEach((rideFlex) => {
        const poseAt = bodyPoser(timing, rideFlex)

        expect(poseAt(-10)).toEqual(ridePose(rideFlex))
        expect(poseAt(timing.airTime + 10)).toEqual(ridePose(rideFlex))
      })
    })
  })

  test('sans temps de vol, le skieur reste en posture de glisse à tout instant', () => {
    const timing: PoseTiming = { trick: getTrick('cork1080'), airTime: 0, compactness: 1 }
    const poseAt = bodyPoser(timing, 0.3)

    const poses = [-1, -0.2, 0, 0.4, 3].map((time) => poseAt(time))

    poses.forEach((pose) => expect(pose).toEqual(ridePose(0.3)))
  })

  test('deux déroulés de flexions de glisse différentes ne se contaminent pas', () => {
    const timing = timingsFor('backflip')[1]
    const low = bodyPoser(timing, 0.1)
    const high = bodyPoser(timing, 0.6)

    const lowBefore = instantsAround(timing.airTime).map((time) => low(time))
    instantsAround(timing.airTime).forEach((time) => high(time))
    const lowAfter = instantsAround(timing.airTime).map((time) => low(time))

    expect(lowAfter).toEqual(lowBefore)
    expect(low(-10)).toEqual(ridePose(0.1))
    expect(high(-10)).toEqual(ridePose(0.6))
  })
})
