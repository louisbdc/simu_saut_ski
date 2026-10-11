import * as THREE from 'three'
import { describe, expect, test } from 'vitest'
import { createSnowSpray } from './snowSpray'

const ORIGIN = new THREE.Vector3(10, 2, 0)
const AHEAD = new THREE.Vector3(1, 0, 0)
const ALONG = new THREE.Vector3(0, 0, 1)

describe('gerbe de neige', () => {
  test('ne soulève rien tant que le skieur ne dérape pas', () => {
    const spray = createSnowSpray()

    spray.emit({ origin: ORIGIN, direction: AHEAD, along: ALONG, strength: 0 }, 0.1)

    expect(spray.liveCount()).toBe(0)
  })

  test('soulève d’autant plus de neige que le freinage est fort', () => {
    const gentle = createSnowSpray()
    const hard = createSnowSpray()

    gentle.emit({ origin: ORIGIN, direction: AHEAD, along: ALONG, strength: 0.2 }, 0.1)
    hard.emit({ origin: ORIGIN, direction: AHEAD, along: ALONG, strength: 1 }, 0.1)

    expect(gentle.liveCount()).toBeGreaterThan(0)
    expect(hard.liveCount()).toBeGreaterThan(gentle.liveCount() * 3)
  })

  test('projette la neige vers l’avant et vers le haut, depuis les skis', () => {
    const spray = createSnowSpray()
    spray.burst({ origin: ORIGIN, direction: AHEAD, along: ALONG, strength: 1 }, 60)

    spray.update(0.1)
    const positions = spray.object.geometry.getAttribute('position')
    const live = Array.from({ length: positions.count }, (_, i) => i).filter((i) => positions.getY(i) > -1000)
    const meanX = live.reduce((sum, i) => sum + positions.getX(i), 0) / live.length
    const meanY = live.reduce((sum, i) => sum + positions.getY(i), 0) / live.length

    expect(live).toHaveLength(60)
    expect(meanX).toBeGreaterThan(ORIGIN.x)
    expect(meanY).toBeGreaterThan(ORIGIN.y)
  })

  test('laisse retomber et disparaître la neige en moins de deux secondes', () => {
    const spray = createSnowSpray()
    spray.burst({ origin: ORIGIN, direction: AHEAD, along: ALONG, strength: 1 }, 80)

    for (let i = 0; i < 40; i++) spray.update(0.05)

    expect(spray.liveCount()).toBe(0)
  })

  test('recycle ses flocons : jamais plus que sa réserve, même sous un freinage prolongé', () => {
    const spray = createSnowSpray()

    for (let i = 0; i < 200; i++) spray.emit({ origin: ORIGIN, direction: AHEAD, along: ALONG, strength: 1 }, 0.05)

    expect(spray.liveCount()).toBeLessThanOrEqual(spray.capacity)
    expect(spray.liveCount()).toBeGreaterThan(0)
  })
})
