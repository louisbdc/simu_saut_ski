import { describe, expect, test } from 'vitest'
import { createIdleGate } from './idleGate'

describe('mise en veille du rendu', () => {
  test('reste éveillé pendant le délai de grâce après un réveil', () => {
    const gate = createIdleGate(500)

    gate.wake(1000)

    expect(gate.isAwake(1400)).toBe(true)
    expect(gate.isAwake(1501)).toBe(false)
  })

  test('dort tant que rien ne l’a réveillé', () => {
    expect(createIdleGate(500).isAwake(0)).toBe(false)
  })

  test('prolonge l’éveil quand on le réveille plus longtemps, sans jamais le raccourcir', () => {
    const gate = createIdleGate(500)

    gate.wake(1000, 5000)
    gate.wake(2000)

    expect(gate.isAwake(5900)).toBe(true)
    expect(gate.isAwake(6100)).toBe(false)
  })
})
