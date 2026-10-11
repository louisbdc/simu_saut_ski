import * as THREE from 'three'
import { describe, expect, test } from 'vitest'
import { DEFAULT_LINE } from '../physics/constants'
import { simulate } from '../physics/simulate'
import { tuneLine } from '../physics/solver'
import { epilogueAt } from './epilogue'
import { buildLiftRide } from './liftRide'
import { revealUpTo } from './reveal'
import { buildTrajectoryGroup } from './trajectory'

const result = simulate(tuneLine(DEFAULT_LINE))

/** Nombre de triangles réellement dessinés par les tracés qui se dévoilent avec le temps. */
function drawn(root: THREE.Object3D): number {
  let triangles = 0
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || !object.userData.reveal) return
    const { start, count } = object.geometry.drawRange
    triangles += Math.min(count, (object.geometry.index?.count ?? 0) - start) / 3
  })
  return triangles
}

describe('traces qui apparaissent au passage du skieur', () => {
  test('ne montre aucune trace de ski avant le départ, et toutes à l’arrivée', () => {
    const group = buildTrajectoryGroup(result)

    revealUpTo(group, 0)
    const atStart = drawn(group)
    revealUpTo(group, result.duration)
    const atEnd = drawn(group)

    expect(atStart).toBe(0)
    expect(atEnd).toBeGreaterThan(500)
  })

  test('allonge les traces à mesure que le skieur avance, sans jamais les devancer', () => {
    const group = buildTrajectoryGroup(result)
    const counts = [0.2, 0.4, 0.6, 0.8, 1].map((fraction) => {
      revealUpTo(group, result.duration * fraction)
      return drawn(group)
    })

    counts.slice(1).forEach((count, i) => expect(count).toBeGreaterThanOrEqual(counts[i]))
    expect(counts[0]).toBeGreaterThan(0)
    expect(counts[0]).toBeLessThan(counts[4] * 0.5)
  })

  test('efface les traces quand la descente repart de zéro', () => {
    const group = buildTrajectoryGroup(result)

    revealUpTo(group, result.duration)
    revealUpTo(group, 0)

    expect(drawn(group)).toBe(0)
  })

  test('laisse une marque de dérapage là où le skieur a freiné, large comme ses skis en travers', () => {
    const ride = buildLiftRide(result)
    const skid = ride.skid
    expect(skid).not.toBeNull()
    if (!skid) return
    const positions = skid.geometry.getAttribute('position')
    const widths = Array.from({ length: positions.count / 2 }, (_, i) =>
      Math.hypot(positions.getX(i * 2) - positions.getX(i * 2 + 1), positions.getZ(i * 2) - positions.getZ(i * 2 + 1)),
    )

    expect(Math.max(...widths)).toBeGreaterThan(1.2)
    revealUpTo(skid, 0)
    expect(drawn(skid)).toBe(0)
    revealUpTo(skid, ride.plan.approachEnd)
    expect(drawn(skid)).toBeGreaterThan(20)
    // La marque est sur la neige, là où il est passé.
    const middle = epilogueAt(ride.plan, ride.plan.approachEnd * 0.4)
    const nearest = Array.from({ length: positions.count }, (_, i) =>
      Math.hypot(positions.getX(i) - middle.x, positions.getZ(i) - middle.z),
    )
    expect(Math.min(...nearest)).toBeLessThan(1.5)
  })

  test('ne laisse aucune marque quand le skieur arrive sans élan', () => {
    const stalled = simulate({
      ...DEFAULT_LINE,
      kickers: [{ ...DEFAULT_LINE.kickers[0], inrunLength: 2, inrunAngleDeg: 2 }],
      rider: { ...DEFAULT_LINE.rider, startSpeed: 0.5 },
    })

    expect(buildLiftRide(stalled).skid).toBeNull()
  })
})
