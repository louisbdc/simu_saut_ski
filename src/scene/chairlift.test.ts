import * as THREE from 'three'
import { describe, expect, test } from 'vitest'
import { DEFAULT_LINE } from '../physics/constants'
import { buildScenario } from '../physics/presets'
import { tuneLine } from '../physics/solver'
import { buildTerrain } from '../physics/terrain'
import type { LineConfig } from '../physics/types'
import { buildChairlift } from './chairlift'
import { GATE_BACK, buildLiftLine, loopAt } from './liftLine'
import { BAR_GEOMETRY, BYSTANDER_GEOMETRY, CHAIR_GEOMETRY, GATE_ARM_GEOMETRY, RIDER_GEOMETRY } from './liftParts'
import { isShared } from './sharedAssets'
import { buildCourseShape } from './terrainShape'

const liftFor = (config: LineConfig) => buildLiftLine(buildCourseShape(buildTerrain(config)))
const meshWith = <T extends THREE.Mesh>(root: THREE.Object3D, geometry: THREE.BufferGeometry): T => {
  let found: THREE.Object3D | undefined
  root.traverse((object) => {
    if (object instanceof THREE.Mesh && object.geometry === geometry) found = object
  })
  return found as T
}
const STILL = { travel: 0, gate: 0, bar: 0 }

function instance(mesh: THREE.InstancedMesh, index: number): { position: THREE.Vector3; rotation: THREE.Euler } {
  const matrix = new THREE.Matrix4()
  mesh.getMatrixAt(index, matrix)
  return {
    position: new THREE.Vector3().setFromMatrixPosition(matrix),
    rotation: new THREE.Euler().setFromRotationMatrix(matrix, 'YXZ'),
  }
}

describe('télésiège', () => {
  const line = liftFor(DEFAULT_LINE)

  test('place le siège du skieur au quai aval quand le câble est à zéro', () => {
    const lift = buildChairlift(line)
    const first = instance(meshWith<THREE.InstancedMesh>(lift.object, CHAIR_GEOMETRY), 0).position

    expect(first.x).toBeCloseTo(line.bottom.x)
    expect(first.z).toBeCloseTo(line.z)
    expect(first.y).toBeCloseTo(line.cable[0].y)
  })

  test('fait suivre la boucle à chaque siège, poulies comprises', () => {
    const lift = buildChairlift(line)
    const chairs = meshWith<THREE.InstancedMesh>(lift.object, CHAIR_GEOMETRY)

    ;[-6, line.length / 2, line.length + 7, line.loopLength * 0.75].forEach((travel) => {
      lift.update({ ...STILL, travel })
      const expected = loopAt(line, travel)
      const first = instance(chairs, 0).position
      expect(first.x).toBeCloseTo(expected.x, 4)
      expect(first.y).toBeCloseTo(expected.y, 4)
      expect(first.z).toBeCloseTo(expected.z, 4)
    })
  })

  test('répartit les sièges régulièrement et en met davantage sur une ligne plus longue', () => {
    const long = liftFor(tuneLine(buildScenario('wtf').config))
    const chairs = meshWith<THREE.InstancedMesh>(buildChairlift(line).object, CHAIR_GEOMETRY)
    const longChairs = meshWith<THREE.InstancedMesh>(buildChairlift(long).object, CHAIR_GEOMETRY)
    const second = instance(chairs, 1).position
    const expected = loopAt(line, line.loopLength / chairs.count)

    expect(longChairs.count).toBeGreaterThan(chairs.count)
    expect(second.x).toBeCloseTo(expected.x, 4)
  })

  test('baisse le garde-corps du skieur et des passagers en ligne, pas celui des sièges vides', () => {
    const lift = buildChairlift(line)
    const bars = meshWith<THREE.InstancedMesh>(lift.object, BAR_GEOMETRY)
    const tilt = (index: number): number => {
      const matrix = new THREE.Matrix4()
      bars.getMatrixAt(index, matrix)
      // Le garde-corps baissé pointe vers l'avant du siège ; relevé, il pointe vers le haut.
      return new THREE.Vector3(1, 0, 0).transformDirection(matrix).y
    }

    lift.update({ ...STILL, travel: line.length / 2, bar: 1 })

    expect(tilt(0)).toBeCloseTo(0, 5)
    // Le siège 2 est vide ; le siège 1 porte un passager, mais il est sur le brin descendant, donc vide lui aussi.
    expect(tilt(2)).toBeGreaterThan(0.8)
    lift.update({ ...STILL, travel: line.length / 2 - line.loopLength / bars.count, bar: 1 })
    expect(Math.abs(tilt(1))).toBeLessThan(0.15)
  })

  test('barre le couloir d’embarquement, puis relève la barre du portillon', () => {
    const lift = buildChairlift(line)
    const arm = meshWith<THREE.Mesh>(lift.object, GATE_ARM_GEOMETRY)
    const tip = (): THREE.Vector3 => {
      arm.updateMatrixWorld(true)
      return new THREE.Vector3(0, 0, 2).applyMatrix4(arm.matrixWorld)
    }

    const closed = tip()
    lift.update({ ...STILL, gate: 1 })
    const open = tip()

    expect(arm.position.x).toBeCloseTo(line.bottom.x + GATE_BACK)
    expect(closed.y).toBeCloseTo(arm.position.y)
    expect(Math.abs(closed.z - line.z)).toBeLessThan(1.3)
    expect(open.y).toBeGreaterThan(closed.y + 1.5)
  })

  test('fait monter d’autres skieurs sur une partie des sièges, jamais sur celui du skieur', () => {
    const lift = buildChairlift(line)
    const chairs = meshWith<THREE.InstancedMesh>(lift.object, CHAIR_GEOMETRY)
    const riders = meshWith<THREE.InstancedMesh>(lift.object, RIDER_GEOMETRY)
    lift.update({ ...STILL, travel: 0 })
    const scaleOf = (index: number): number => {
      const matrix = new THREE.Matrix4()
      riders.getMatrixAt(index, matrix)
      return new THREE.Vector3().setFromMatrixScale(matrix).x
    }
    const visible = Array.from({ length: riders.count }, (_, i) => i).filter((i) => scaleOf(i) > 0.5)
    const skierChair = instance(chairs, 0).position

    expect(riders.count).toBeGreaterThan(2)
    expect(riders.count).toBeLessThan(chairs.count)
    expect(visible.length).toBeGreaterThan(0)
    expect(visible.length).toBeLessThan(riders.count)
    visible.forEach((i) => {
      const position = instance(riders, i).position
      // Ils sont tous sur le brin montant, à l'écart du siège du skieur.
      expect(Math.abs(position.z - line.z)).toBeLessThan(0.6)
      expect(position.distanceTo(skierChair)).toBeGreaterThan(5)
    })
  })

  test('poste quelques skieurs aux deux gares, à côté du passage', () => {
    const waiting = meshWith<THREE.InstancedMesh>(buildChairlift(line).object, BYSTANDER_GEOMETRY)
    const spots = Array.from({ length: waiting.count }, (_, i) => instance(waiting, i).position)

    expect(spots.filter((spot) => spot.x > line.bottom.x).length).toBeGreaterThan(1)
    expect(spots.filter((spot) => spot.x < line.top.x).length).toBeGreaterThan(0)
    // Aucun dans le couloir d'embarquement ni sur la sortie du quai amont.
    spots.forEach((spot) => expect(Math.abs(spot.z - line.z)).toBeGreaterThan(1.6))
  })

  test('reste léger et ne recrée ni géométrie ni matériau d’une piste à l’autre', () => {
    const lift = buildChairlift(liftFor(tuneLine(buildScenario('wtf').config)))
    let triangles = 0
    lift.object.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return
      const count = object instanceof THREE.InstancedMesh ? object.count : 1
      triangles += (object.geometry.getAttribute('position').count / 3) * count
      expect(isShared(object.geometry)).toBe(true)
      expect(isShared(object.material as THREE.Material)).toBe(true)
    })

    expect(triangles).toBeLessThan(45_000)
  })
})
