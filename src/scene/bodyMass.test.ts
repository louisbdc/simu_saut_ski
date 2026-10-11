import { describe, expect, test } from 'vitest'
import { massPoints, massProperties } from './bodyMass'
import { ridePose } from './choreography'
import { solveJoints } from './skeleton'

const propertiesOf = (pose: Parameters<typeof solveJoints>[0]) => massProperties(massPoints(solveJoints(pose)))
const standing = propertiesOf(ridePose(0))
const tucked = propertiesOf({ ...ridePose(0), tuck: 1 })
/** Composantes du tenseur : [xx, yy, zz] = roulis, vrille, salto. */
const diagonal = (inertia: { elements: number[] }) => [inertia.elements[0], inertia.elements[4], inertia.elements[8]]

describe('masses du skieur', () => {
  test('le skieur équipé pèse environ 86 kg, dans toutes les postures', () => {
    expect(standing.mass).toBeCloseTo(85.7, 1)
    expect(tucked.mass).toBeCloseTo(standing.mass, 9)
  })

  test('debout, le centre de gravité est vers le nombril, au milieu des deux skis', () => {
    expect(standing.center.y).toBeGreaterThan(0.8)
    expect(standing.center.y).toBeLessThan(1)
    expect(standing.center.z).toBeCloseTo(0, 9)
  })

  test('groupé, le centre de gravité descend vers les skis', () => {
    expect(tucked.center.y).toBeLessThan(standing.center.y - 0.3)
  })

  test('le tenseur d’inertie est symétrique', () => {
    const e = tucked.inertia.elements

    expect(e[1]).toBeCloseTo(e[3], 12)
    expect(e[2]).toBeCloseTo(e[6], 12)
    expect(e[5]).toBeCloseTo(e[7], 12)
  })

  test('debout, l’inertie en salto est du même ordre que celle mesurée sur un corps tendu', () => {
    // Frohlich (1980) : 14 à 20 kg·m² sans équipement ; les skis et les chaussures en ajoutent.
    const [, , somersault] = diagonal(standing.inertia)

    expect(somersault).toBeGreaterThan(15)
    expect(somersault).toBeLessThan(26)
  })

  test('se grouper divise l’inertie en salto par 3 à 5, comme chez les plongeurs', () => {
    // Frohlich : environ 4 sans skis (3,8 kg·m² groupé).
    const ratio = diagonal(standing.inertia)[2] / diagonal(tucked.inertia)[2]

    expect(ratio).toBeGreaterThan(3)
    expect(ratio).toBeLessThan(5)
  })

  test('debout, il est bien plus facile de vriller que de faire un salto', () => {
    const [, twist, somersault] = diagonal(standing.inertia)

    expect(twist).toBeLessThan(somersault / 3)
  })

  test('se grouper ne rend pas la vrille plus rapide : les skis dominent son inertie', () => {
    const ratio = diagonal(standing.inertia)[1] / diagonal(tucked.inertia)[1]

    expect(ratio).toBeGreaterThan(0.7)
    expect(ratio).toBeLessThan(1.3)
  })

  test('écarter les bras augmente l’inertie en vrille', () => {
    const armsIn = propertiesOf({ ...ridePose(0), arms: { ...ridePose(0).arms, ride: 0, in: 1 } })
    const armsWide = propertiesOf({ ...ridePose(0), arms: { ...ridePose(0).arms, ride: 0, wide: 1 } })

    expect(diagonal(armsWide.inertia)[1]).toBeGreaterThan(diagonal(armsIn.inertia)[1] * 1.1)
  })

  test('croiser les skis ne change ni la masse ni la hauteur du centre de gravité', () => {
    const crossed = propertiesOf({ ...ridePose(0), tuck: 1, skiCross: 0.6 })

    expect(crossed.mass).toBeCloseTo(tucked.mass, 9)
    expect(crossed.center.y).toBeCloseTo(tucked.center.y, 2)
  })

  test('basculer les skis ne change pas la masse, et remonte le centre de gravité du côté levé', () => {
    const tailsUp = propertiesOf({ ...ridePose(0), tuck: 1, skiPitch: -0.6 })
    const tipsUp = propertiesOf({ ...ridePose(0), tuck: 1, skiPitch: 0.6 })

    expect(tailsUp.mass).toBeCloseTo(tucked.mass, 9)
    expect(tipsUp.mass).toBeCloseTo(tucked.mass, 9)
    expect(tailsUp.center.x).toBeLessThan(tipsUp.center.x + 1e-9)
    expect(tipsUp.center.y).toBeGreaterThan(tucked.center.y)
  })
})
