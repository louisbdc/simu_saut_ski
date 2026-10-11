import { describe, expect, test } from 'vitest'
import { SKI_GEOMETRY, skiOutline } from './skiShape'
import { SKIER_STYLE } from './skierStyle'

describe('contour du ski', () => {
  test('va du talon à la spatule sur toute la longueur du ski', () => {
    const outline = skiOutline()

    const length = outline[outline.length - 1].x - outline[0].x

    expect(outline[0].along).toBe(0)
    expect(outline[outline.length - 1].along).toBe(1)
    expect(length).toBeCloseTo(SKIER_STYLE.ski.length + 0.04, 6)
  })

  test('se referme en arrondi aux deux bouts', () => {
    const outline = skiOutline()

    const widest = Math.max(...outline.map((station) => station.halfWidth))

    expect(outline[0].halfWidth).toBeLessThan(widest * 0.05)
    expect(outline[outline.length - 1].halfWidth).toBeLessThan(widest * 0.05)
  })

  test('est plus étroit au patin qu’à la spatule et au talon', () => {
    const outline = skiOutline()
    const widthNear = (along: number) =>
      outline.reduce((best, station) => (Math.abs(station.along - along) < Math.abs(best.along - along) ? station : best)).halfWidth

    expect(widthNear(0.47)).toBeLessThan(widthNear(0.08))
    expect(widthNear(0.08)).toBeLessThan(widthNear(0.92))
  })

  test('reste à plat sous le pied et se relève aux deux spatules', () => {
    const outline = skiOutline()
    const underFoot = outline.filter((station) => Math.abs(station.x) < 0.3)

    expect(underFoot.every((station) => station.rise === 0)).toBe(true)
    expect(outline[outline.length - 1].rise).toBeCloseTo(SKIER_STYLE.ski.tipRise, 6)
    expect(outline[0].rise).toBeGreaterThan(0)
  })
})

describe('maillage du ski', () => {
  test('le dessus regarde vers le haut', () => {
    const normals = SKI_GEOMETRY.top.getAttribute('normal')

    const heights = Array.from({ length: normals.count }, (_, index) => normals.getY(index))

    expect(heights.every((y) => y > 0)).toBe(true)
  })

  test.each(['top', 'sole'] as const)('le décor de la face %s reste dans la texture', (face) => {
    const uvs = SKI_GEOMETRY[face].getAttribute('uv')

    const values = Array.from({ length: uvs.count }, (_, index) => [uvs.getX(index), uvs.getY(index)]).flat()

    expect(values.every((value) => value >= 0 && value <= 1)).toBe(true)
  })

  test('la semelle regarde vers le bas sous le pied', () => {
    const positions = SKI_GEOMETRY.sole.getAttribute('position')
    const normals = SKI_GEOMETRY.sole.getAttribute('normal')

    const soleNormals = Array.from({ length: positions.count }, (_, index) => index)
      .filter((index) => positions.getY(index) === 0 && Math.abs(positions.getX(index)) < 0.3)
      .map((index) => normals.getY(index))

    expect(soleNormals.length).toBeGreaterThan(0)
    expect(soleNormals.every((y) => y < -0.9)).toBe(true)
  })
})
