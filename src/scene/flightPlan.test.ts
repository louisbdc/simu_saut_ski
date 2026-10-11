import * as THREE from 'three'
import { describe, expect, test } from 'vitest'
import { planJump, trickVerdict, type JumpConditions } from './flightPlan'
import { TRICKS, getTrick, landsOpposite, nominalTurns } from './tricks'

/** Saut de big air type : kick à +30°, réception à −36°, 2,2 s de vol. */
const BIG_AIR: JumpConditions = {
  airTime: 2.2,
  takeoffTilt: 0.52,
  landingTilt: -0.63,
  switchBefore: false,
  switchAfter: false,
}
const LATERAL = new THREE.Vector3(0, 0, 1)
const UP = new THREE.Vector3(0, 1, 0)

const plan = (id: string, changes: Partial<JumpConditions> = {}) => {
  const trick = getTrick(id)
  const conditions = { ...BIG_AIR, ...changes }
  return planJump(trick, { ...conditions, switchAfter: conditions.switchBefore !== landsOpposite(trick) })
}
/** Orientation voulue à la réception : skis dans la pente, dans le bon sens de glisse. */
const landingTarget = (conditions: JumpConditions): THREE.Quaternion =>
  new THREE.Quaternion()
    .setFromAxisAngle(LATERAL, conditions.landingTilt - conditions.takeoffTilt)
    .multiply(new THREE.Quaternion().setFromAxisAngle(UP, conditions.switchAfter ? Math.PI : 0))
const degrees = (radians: number): number => (radians * 180) / Math.PI

describe('rotation en vol', () => {
  test('au décollage, le skieur est exactement dans l’axe de ses skis', () => {
    TRICKS.forEach((trick) => {
      expect(plan(trick.id).orientationAt(0).angleTo(new THREE.Quaternion())).toBeCloseTo(0, 9)
    })
  }, 60_000)

  test.each(TRICKS.map((trick) => trick.id))('%s : une figure faisable finit skis dans la pente de réception', (id) => {
    // Assez de temps de vol pour la plus longue figure du catalogue (double cork 1440).
    const jump = plan(id, { airTime: 3.5 })

    expect(jump.completed).toBe(true)
    expect(jump.orientationAt(3.5).angleTo(landingTarget(jump.conditions))).toBeLessThan(1e-6)
  })

  test('même un saut droit doit prendre un peu d’élan vers l’avant pour épouser la réception', () => {
    const jump = plan('straight')

    // Entre un kick à +30° et une réception à −36°, le corps bascule de 66° vers l'avant.
    expect(jump.angularMomentum).toBeGreaterThan(2)
    expect(degrees(jump.orientationAt(2.2).angleTo(new THREE.Quaternion()))).toBeCloseTo(66, 0)
    expect(jump.inFlightCorrection).toBeLessThan(1e-3)
  })

  test('sur un saut sans changement de pente, un saut droit ne demande aucun élan', () => {
    const jump = plan('straight', { takeoffTilt: 0, landingTilt: 0 })

    expect(jump.angularMomentum).toBeLessThan(0.5)
  })

  test('un backflip demande moins d’élan qu’un frontflip : la réception plonge dans son sens', () => {
    expect(plan('backflip').angularMomentum).toBeLessThan(plan('frontflip').angularMomentum)
  })

  test('le skieur tourne de plus en plus vite en se groupant, sans rien ajouter à son élan', () => {
    const jump = plan('doubleBackflip')
    const turned = (from: number, to: number): number => jump.orientationAt(from).angleTo(jump.orientationAt(to))

    expect(turned(1, 1.1)).toBeGreaterThan(turned(0.1, 0.2) * 1.5)
    expect(jump.peakRate).toBeGreaterThan(1)
  })

  test('replier les jambes sans élan fait basculer les skis d’un côté et le buste de l’autre', () => {
    // Japan sur un saut à plat : aucun élan n'est pris, mais le corps ne reste pas immobile.
    const jump = plan('japan', { takeoffTilt: 0, landingTilt: 0 })

    expect(jump.angularMomentum).toBeLessThan(1)
    expect(degrees(jump.orientationAt(1.1).angleTo(new THREE.Quaternion()))).toBeGreaterThan(8)
    expect(jump.orientationAt(2.2).angleTo(new THREE.Quaternion())).toBeLessThan(0.01)
  })

  test('un 180 fait atterrir retourné, un 360 dans le sens du départ', () => {
    const half = plan('spin180')
    const full = plan('spin360')

    expect(half.conditions.switchAfter).toBe(true)
    expect(full.conditions.switchAfter).toBe(false)
    expect(half.angularMomentum).toBeLessThan(full.angularMomentum)
  })

  test.each(['spin540mute', 'spin1080', 'cork720', 'cork720mute', 'misty540'])(
    '%s : la figure arrive juste par la seule physique, sans rattrapage en fin de vol',
    (id) => {
      expect(degrees(plan(id).inFlightCorrection)).toBeLessThan(0.1)
    },
  )

  test('une figure à plusieurs tours les fait vraiment : un 720 ne se boucle pas en un seul tour', () => {
    const turnsOf = (id: string): number => {
      const jump = plan(id)
      const samples = 400
      let turned = 0
      for (let i = 1; i <= samples; i++) {
        turned += jump.orientationAt((i * 2.2) / samples).angleTo(jump.orientationAt(((i - 1) * 2.2) / samples))
      }
      return turned / (2 * Math.PI)
    }

    // Chaque tour de vrille en plus allonge d'autant le chemin parcouru par le corps.
    expect(turnsOf('spin720')).toBeGreaterThan(turnsOf('spin360') + 0.7)
    expect(turnsOf('spin1080')).toBeGreaterThan(turnsOf('spin720') + 0.7)
    expect(turnsOf('cork720')).toBeGreaterThan(turnsOf('backflip') + 0.3)
  })

  test('en switch, la même figure se boucle aussi', () => {
    const jump = plan('spin360', { switchBefore: true })

    expect(jump.completed).toBe(true)
    expect(jump.orientationAt(0).angleTo(new THREE.Quaternion().setFromAxisAngle(UP, Math.PI))).toBeCloseTo(0, 9)
    expect(jump.orientationAt(2.2).angleTo(landingTarget(jump.conditions))).toBeLessThan(1e-6)
  })
})

describe('lancer de la figure à la lèvre', () => {
  test.each(['straight', 'backflip', 'doubleBackflip', 'frontflip'])(
    '%s : les skis ne se mettent pas à basculer d’un coup en quittant la neige',
    (id) => {
      // Tout l'élan de salto existe déjà au décollage, porté par le buste : aucun à-coup.
      expect(plan(id).takeoffJolt * 360).toBeLessThan(3)
    },
  )

  test('à l’instant du décollage, les skis sont immobiles en rotation puis se mettent à tourner', () => {
    const jump = plan('backflip')
    const turned = (from: number, to: number): number => jump.orientationAt(from).angleTo(jump.orientationAt(to))

    expect(turned(0, 0.01)).toBeLessThan(0.002)
    expect(turned(0.3, 0.4)).toBeGreaterThan(turned(0, 0.1))
  })

  test('backflip : le buste bascule vers l’arrière en traversant la lèvre', () => {
    expect(plan('backflip').set.lean).toBeGreaterThan(2)
  })

  test('frontflip : le buste part vers l’avant', () => {
    expect(plan('frontflip').set.lean).toBeLessThan(-2)
  })

  test('un double backflip demande un lancer plus fort qu’un simple', () => {
    expect(plan('doubleBackflip').set.lean).toBeGreaterThan(plan('backflip').set.lean * 1.5)
  })

  test('une vrille part du pivot des skis sur la neige, épaules en avance', () => {
    const jump = plan('spin360')

    expect(jump.takeoffPivotRate).toBeGreaterThan(1)
    expect(jump.set.twist).toBeGreaterThan(1)
  })

  test('plus la vrille compte de tours, plus les skis pivotent vite à la lèvre', () => {
    expect(plan('spin720').takeoffPivotRate).toBeGreaterThan(plan('spin360').takeoffPivotRate)
  })

  test.each(TRICKS.map((trick) => trick.id))('%s : aucune bascule brutale des skis à la lèvre', (id) => {
    // Le lancer du buste atteint sa limite sur les saltos les plus exigeants.
    const limit = ['doubleBackflip', 'rodeo540', 'doubleCork1080', 'cork1440'].includes(id) ? 120 : 3

    expect(plan(id, { airTime: 3.5 }).takeoffJolt * 360).toBeLessThan(limit)
  })

  test('un cork part sur la carre : les skis roulent déjà en quittant la neige', () => {
    expect(Math.abs(plan('cork720').takeoffEdgeRate)).toBeGreaterThan(0.05)
    expect(plan('backflip').takeoffEdgeRate).toBeCloseTo(0, 6)
  })

  test('un saut sans vrille ne fait pas tourner les épaules', () => {
    expect(plan('backflip').set.twist).toBe(0)
    expect(plan('straight').set.twist).toBe(0)
  })
})

describe('élan à prendre au kick', () => {
  test('plus la figure compte de tours, plus il faut d’élan', () => {
    const momentum = (id: string): number => plan(id).angularMomentum

    expect(momentum('spin360')).toBeLessThan(momentum('spin720'))
    expect(momentum('backflip')).toBeLessThan(momentum('doubleBackflip'))
  })

  test('un salto demande plus d’élan qu’une vrille : le corps est bien plus dur à faire basculer', () => {
    expect(plan('backflip').angularMomentum).toBeGreaterThan(plan('spin360').angularMomentum * 1.5)
  })

  test('les sauts simples arrivent juste par le seul élan du kick, sans rattrapage', () => {
    for (const id of ['straight', 'safety', 'mute', 'japan', 'spin180', 'spin360', 'backflip', 'frontflip']) {
      expect(degrees(plan(id).inFlightCorrection)).toBeLessThan(1)
    }
  })

  test('l’élan pris reste sous ce qu’un skieur peut prendre quand la figure est faisable', () => {
    TRICKS.filter((trick) => nominalTurns(trick) > 0).forEach((trick) => {
      const jump = plan(trick.id, { airTime: 3.5 })

      expect(jump.angularMomentum).toBeLessThan(jump.maxAngularMomentum * 1.7)
    })
  })
})

describe('y a-t-il le temps de rentrer la figure', () => {
  test('avec du temps de vol en trop, le groupé reste détendu', () => {
    const jump = plan('backflip', { airTime: 2.5 })

    expect(jump.compactness).toBeCloseTo(0.6, 9)
    expect(trickVerdict(jump).level).toBe('ok')
  })

  test('avec un vol trop court, la figure est sous-tournée et le skieur atterrit de travers', () => {
    const jump = plan('cork720', { airTime: 0.9 })

    expect(jump.completed).toBe(false)
    expect(jump.achievedTurns).toBeLessThan(2)
    expect(jump.orientationAt(0.9).angleTo(landingTarget(jump.conditions))).toBeGreaterThan(0.3)
    expect(jump.landingResidual.angleTo(new THREE.Quaternion())).toBeGreaterThan(0.3)
    expect(trickVerdict(jump).level).toBe('bad')
    expect(trickVerdict(jump).label).toContain('Pas le temps')
  })

  test('le temps de vol minimal sépare les figures rentrées des figures sous-tournées', () => {
    const { minAirTime } = plan('spin720')

    expect(plan('spin720', { airTime: minAirTime + 0.1 }).completed).toBe(true)
    expect(plan('spin720', { airTime: minAirTime - 0.1 }).completed).toBe(false)
  })

  test('plus la figure compte de tours, plus il faut de temps de vol', () => {
    const minimum = (id: string): number => plan(id).minAirTime

    expect(minimum('spin360')).toBeLessThan(minimum('spin720'))
    expect(minimum('spin720')).toBeLessThan(minimum('spin1080'))
    expect(minimum('backflip')).toBeLessThan(minimum('doubleBackflip'))
    expect(minimum('cork720')).toBeLessThan(minimum('cork1440'))
  })

  test('les temps minimaux restent dans les ordres de grandeur observés', () => {
    const minimum = (id: string): number => plan(id).minAirTime

    // 1080 tenus en moins de 1,9 s de vol en halfpipe ; 1440 en 2,3 s aux X Games 2015.
    expect(minimum('spin1080')).toBeLessThan(1.95)
    expect(minimum('spin1440')).toBeLessThan(2.5)
    // Un backflip s'apprend sur une table de 6 à 9 m, soit environ une seconde de vol.
    expect(minimum('backflip')).toBeGreaterThan(0.5)
    expect(minimum('backflip')).toBeLessThan(1.1)
  })

  test('un saut sans figure passe toujours', () => {
    const jump = plan('safety', { airTime: 0.4 })

    expect(jump.completed).toBe(true)
    expect(trickVerdict(jump)).toEqual({ level: 'ok', label: 'Pas de rotation' })
  })

  test('sans temps de vol, une figure avec rotation n’est pas rentrée', () => {
    const jump = plan('backflip', { airTime: 0 })

    expect(jump.completed).toBe(false)
    expect(jump.achievedTurns).toBe(0)
  })

  test('refaire le même plan redonne le même objet, sans recalcul', () => {
    expect(plan('cork720')).toBe(plan('cork720'))
  })
})
