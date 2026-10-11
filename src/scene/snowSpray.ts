import * as THREE from 'three'

/** Réserve de flocons, recyclés en boucle : rien n'est alloué pendant l'animation. */
const CAPACITY = 520
/** Flocons soulevés par seconde à pleine force. */
const EMISSION_RATE = 760
const MIN_LIFE = 0.45
const MAX_LIFE = 0.95
/** Vitesse d'éjection vers l'avant et vers le haut, en m/s, à pleine force. */
const THROW_SPEED = 7
const LIFT_SPEED = 4.2
const SCATTER = 1.6
/** Demi-longueur de ski sur laquelle la neige est arrachée. */
const EDGE_HALF_LENGTH = 0.8
const GRAVITY = 9.81
const FLAKE_SIZE = 0.2
const FLAKE_TEXTURE_SIZE = 32
/** Hauteur où sont rangés les flocons éteints, hors de vue. */
const PARKED_Y = -1e5

/** Source d'une gerbe : là où les carres mordent, vers où part la neige, et le long de quel axe. */
export interface SprayPuff {
  readonly origin: THREE.Vector3
  /** Sens du déplacement du skieur : la neige est poussée devant ses carres. */
  readonly direction: THREE.Vector3
  /** Axe des skis : la gerbe naît sur toute leur longueur. */
  readonly along: THREE.Vector3
  /** De 0 à 1. */
  readonly strength: number
}

export interface SnowSpray {
  readonly object: THREE.Points
  readonly capacity: number
  /** Gerbe continue pendant `elapsed` secondes, comme sous un dérapage. */
  readonly emit: (puff: SprayPuff, elapsed: number) => void
  /** Bouffée de `count` flocons d'un coup, comme à une réception. */
  readonly burst: (puff: SprayPuff, count: number) => void
  readonly update: (elapsed: number) => void
  readonly liveCount: () => number
}

/** Pastille ronde aux bords fondus : sans elle, chaque flocon serait un carré. */
function flakeTexture(): THREE.DataTexture {
  const data = new Uint8Array(FLAKE_TEXTURE_SIZE * FLAKE_TEXTURE_SIZE * 4)
  const center = (FLAKE_TEXTURE_SIZE - 1) / 2
  for (let row = 0; row < FLAKE_TEXTURE_SIZE; row++) {
    for (let column = 0; column < FLAKE_TEXTURE_SIZE; column++) {
      const distance = Math.hypot(column - center, row - center) / center
      const offset = (row * FLAKE_TEXTURE_SIZE + column) * 4
      data.fill(255, offset, offset + 3)
      data[offset + 3] = Math.round(255 * Math.max(0, 1 - distance * distance))
    }
  }
  const texture = new THREE.DataTexture(data, FLAKE_TEXTURE_SIZE, FLAKE_TEXTURE_SIZE, THREE.RGBAFormat)
  texture.magFilter = THREE.LinearFilter
  texture.minFilter = THREE.LinearFilter
  texture.needsUpdate = true
  return texture
}

/** Générateur déterministe : la gerbe est la même d'une lecture à l'autre. */
function scatterer(): () => number {
  let state = 0x9e3779b9
  return () => {
    state = (Math.imul(state ^ (state >>> 15), 0x2c1b3c6d) + 0x297a2d39) >>> 0
    return state / 4294967296
  }
}

/** Neige soulevée par les carres : un seul nuage de points, mis à jour sur place. */
export function createSnowSpray(): SnowSpray {
  const positions = new Float32Array(CAPACITY * 3)
  const velocities = new Float32Array(CAPACITY * 3)
  const lives = new Float32Array(CAPACITY)
  for (let i = 0; i < CAPACITY; i++) positions[i * 3 + 1] = PARKED_Y
  const random = scatterer()
  let next = 0
  let owed = 0

  const attribute = new THREE.BufferAttribute(positions, 3)
  attribute.setUsage(THREE.DynamicDrawUsage)
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', attribute)
  const material = new THREE.PointsMaterial({
    color: 0xffffff,
    map: flakeTexture(),
    size: FLAKE_SIZE,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.8,
    depthWrite: false,
  })
  const object = new THREE.Points(geometry, material)
  // Le nuage suit le skieur sur toute la piste : pas de tri par boîte englobante figée.
  object.frustumCulled = false

  const launch = (puff: SprayPuff): void => {
    const i = next
    next = (next + 1) % CAPACITY
    const slot = i * 3
    const along = (random() * 2 - 1) * EDGE_HALF_LENGTH
    const power = puff.strength * (0.45 + 0.55 * random())
    positions[slot] = puff.origin.x + puff.along.x * along
    positions[slot + 1] = puff.origin.y + 0.05
    positions[slot + 2] = puff.origin.z + puff.along.z * along
    velocities[slot] = puff.direction.x * THROW_SPEED * power + (random() - 0.5) * SCATTER
    velocities[slot + 1] = LIFT_SPEED * power * (0.4 + 0.6 * random())
    velocities[slot + 2] = puff.direction.z * THROW_SPEED * power + (random() - 0.5) * SCATTER
    lives[i] = MIN_LIFE + (MAX_LIFE - MIN_LIFE) * random()
  }

  return {
    object,
    capacity: CAPACITY,
    emit: (puff: SprayPuff, elapsed: number): void => {
      if (puff.strength <= 0 || elapsed <= 0) return
      owed += EMISSION_RATE * puff.strength * elapsed
      const count = Math.min(Math.floor(owed), CAPACITY)
      owed -= count
      for (let i = 0; i < count; i++) launch(puff)
      attribute.needsUpdate = true
    },
    burst: (puff: SprayPuff, count: number): void => {
      for (let i = 0; i < Math.min(count, CAPACITY); i++) launch(puff)
      attribute.needsUpdate = true
    },
    update: (elapsed: number): void => {
      if (elapsed <= 0) return
      for (let i = 0; i < CAPACITY; i++) {
        if (lives[i] <= 0) continue
        const slot = i * 3
        lives[i] -= elapsed
        if (lives[i] <= 0) {
          positions[slot + 1] = PARKED_Y
          continue
        }
        velocities[slot + 1] -= GRAVITY * elapsed
        positions[slot] += velocities[slot] * elapsed
        positions[slot + 1] += velocities[slot + 1] * elapsed
        positions[slot + 2] += velocities[slot + 2] * elapsed
      }
      attribute.needsUpdate = true
    },
    liveCount: (): number => lives.reduce((count, life) => count + (life > 0 ? 1 : 0), 0),
  }
}
