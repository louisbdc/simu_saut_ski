import * as THREE from 'three'
import { describe, expect, test } from 'vitest'
import { DEFAULT_LINE } from '../physics/constants'
import { buildScenario } from '../physics/presets'
import { tuneLine } from '../physics/solver'
import { buildTerrain } from '../physics/terrain'
import { APRON_MESH_NAME, OFF_PISTE_MESH_NAME, SNOW_MESH_NAME, buildAprons } from './snowMesh'
import { buildTerrainGroup } from './terrainMesh'
import { buildCourseShape, surfaceHeightAt } from './terrainShape'

const terrain = buildTerrain(DEFAULT_LINE)
const shape = buildCourseShape(terrain)
const group = buildTerrainGroup(terrain)
const snow = group.getObjectByName(SNOW_MESH_NAME) as THREE.Mesh
const offPiste = group.getObjectByName(OFF_PISTE_MESH_NAME) as THREE.Mesh
const positions = snow.geometry.getAttribute('position') as THREE.BufferAttribute
const normals = snow.geometry.getAttribute('normal')
const box = new THREE.Box3().setFromBufferAttribute(positions)
const aboveFloor = Array.from({ length: positions.count }, (_, i) => i).filter(
  (i) => positions.getY(i) > box.min.y + 1e-6,
)

function triangleCount(root: THREE.Object3D): number {
  let triangles = 0
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) triangles += (object.geometry.index?.count ?? 0) / 3
  })
  return triangles
}

const scenarioTriangles = (id: string): number =>
  triangleCount(buildTerrainGroup(buildTerrain(tuneLine(buildScenario(id).config))))

describe('maillage de la neige', () => {
  test('pose chaque sommet sur la forme de la piste', () => {
    const gaps = aboveFloor.map((i) =>
      Math.abs(positions.getY(i) - surfaceHeightAt(shape, positions.getX(i), positions.getZ(i))),
    )

    expect(gaps.reduce((max, gap) => Math.max(max, gap), 0)).toBeLessThan(0.02)
  })

  test('pose aussi chaque sommet du hors-piste sur la forme de la piste', () => {
    const outside = offPiste.geometry.getAttribute('position') as THREE.BufferAttribute
    const floor = new THREE.Box3().setFromBufferAttribute(outside).min.y
    const gaps = Array.from({ length: outside.count }, (_, i) => i)
      .filter((i) => outside.getY(i) > floor + 1e-6)
      .map((i) => Math.abs(outside.getY(i) - surfaceHeightAt(shape, outside.getX(i), outside.getZ(i))))

    expect(gaps.reduce((max, gap) => Math.max(max, gap), 0)).toBeLessThan(0.02)
  })

  test('prolonge le terrain au-delà des deux bouts de la piste, posé sur la même forme', () => {
    const apron = buildAprons(shape)
    expect(apron.name).toBe(APRON_MESH_NAME)
    const beyond = apron.geometry.getAttribute('position') as THREE.BufferAttribute
    const reach = new THREE.Box3().setFromBufferAttribute(beyond)
    const gaps = Array.from({ length: beyond.count }, (_, i) =>
      Math.abs(beyond.getY(i) - surfaceHeightAt(shape, beyond.getX(i), beyond.getZ(i))),
    )

    expect(gaps.reduce((max, gap) => Math.max(max, gap), 0)).toBeLessThan(0.02)
    expect(reach.min.x).toBeLessThan(shape.terrain.points[0].x - 300)
    expect(reach.max.x).toBeGreaterThan(shape.terrain.points[shape.terrain.points.length - 1].x + 300)
  })

  test('couvre toute la ligne, et le hors-piste déborde largement de la piste', () => {
    const outside = new THREE.Box3().setFromBufferAttribute(offPiste.geometry.getAttribute('position') as THREE.BufferAttribute)

    expect(box.min.x).toBeCloseTo(shape.terrain.points[0].x, 3)
    expect(box.max.x).toBeCloseTo(terrain.points[terrain.points.length - 1].x, 3)
    expect(box.max.z).toBeCloseTo(shape.halfWidth, 3)
    expect(outside.max.z).toBeGreaterThan(300)
    expect(outside.min.z).toBeCloseTo(-outside.max.z, 6)
  })

  test('reste léger : le nombre de triangles est plafonné par scénario', () => {
    expect(scenarioTriangles('hard')).toBeLessThan(30_000)
    expect(scenarioTriangles('wtf')).toBeLessThan(66_000)
  })

  test('ne fait projeter une ombre qu’à la piste, pas au hors-piste', () => {
    expect(snow.castShadow).toBe(true)
    expect(offPiste.castShadow).toBe(false)
  })

  test('ne retourne aucune face de la piste vers le sol', () => {
    const onLine = aboveFloor.filter((i) => Math.abs(positions.getZ(i)) < shape.halfWidth)
    const upward = onLine.filter((i) => normals.getY(i) > 0.2)
    const downward = onLine.filter((i) => normals.getY(i) < -1e-6)

    // Les flancs repliés hors des bosses n'ont pas de surface, donc pas de normale : ni vers le haut ni vers le bas.
    expect(downward).toHaveLength(0)
    expect(upward.length).toBeGreaterThan(onLine.length * 0.4)
  })
})
