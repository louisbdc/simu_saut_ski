import * as THREE from 'three'
import { markShared } from './sharedAssets'

const TEXTURE_SIZE = 128
const ANISOTROPY = 8

/** Côté d'un carreau de neige damée, en mètres, nombre de sillons par carreau et creux d'un sillon. */
export const GROOMED_TILE = 1.6
const GROOVES_PER_TILE = 8
const GROOVE_DEPTH = 0.03

/** Côté d'un carreau de neige vierge, en mètres, et creux de ses houles. */
export const POWDER_TILE = 14
const POWDER_DEPTH = 0.5

/** Relief d'un carreau, entre 0 et 1, aux coordonnées (u, v) du carreau, elles-mêmes entre 0 et 1. */
type HeightField = (u: number, v: number) => number

/**
 * Carte de normales répétable tirée d'un relief, par différences finies sur le carreau refermé.
 * `depth` est le creux du relief rapporté au côté du carreau.
 */
function normalMap(height: HeightField, depth: number): THREE.DataTexture {
  const data = new Uint8Array(TEXTURE_SIZE * TEXTURE_SIZE * 4)
  const step = 1 / TEXTURE_SIZE
  for (let row = 0; row < TEXTURE_SIZE; row++) {
    for (let column = 0; column < TEXTURE_SIZE; column++) {
      const u = column * step
      const v = row * step
      const slopeU = (height(u + step, v) - height(u - step, v)) * depth
      const slopeV = (height(u, v + step) - height(u, v - step)) * depth
      const normal = new THREE.Vector3(-slopeU, -slopeV, step * 2).normalize()
      const offset = (row * TEXTURE_SIZE + column) * 4
      data[offset] = Math.round((normal.x * 0.5 + 0.5) * 255)
      data[offset + 1] = Math.round((normal.y * 0.5 + 0.5) * 255)
      data[offset + 2] = Math.round((normal.z * 0.5 + 0.5) * 255)
      data[offset + 3] = 255
    }
  }
  const texture = new THREE.DataTexture(data, TEXTURE_SIZE, TEXTURE_SIZE, THREE.RGBAFormat)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.magFilter = THREE.LinearFilter
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.generateMipmaps = true
  texture.anisotropy = ANISOTROPY
  texture.needsUpdate = true
  return markShared(texture)
}

const TURN = Math.PI * 2

/** Velours côtelé de la dameuse : des sillons réguliers dans le sens de la pente, à peine irréguliers. */
const groomed: HeightField = (u, v) =>
  0.5 + 0.5 * Math.sin(TURN * GROOVES_PER_TILE * v + 0.35 * Math.sin(TURN * 3 * u)) * (0.85 + 0.15 * Math.sin(TURN * 5 * u))

/** Neige non damée : de larges houles molles, sans direction. */
const powder: HeightField = (u, v) =>
  0.5 +
  0.25 * Math.sin(TURN * (2 * u + v)) +
  0.15 * Math.sin(TURN * (3 * v - u) + 1.7) +
  0.1 * Math.sin(TURN * (5 * u + 4 * v) + 0.6)

export const GROOMED_NORMALS = normalMap(groomed, GROOVE_DEPTH / GROOMED_TILE)
export const POWDER_NORMALS = normalMap(powder, POWDER_DEPTH / POWDER_TILE)
