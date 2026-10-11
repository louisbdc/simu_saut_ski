import * as THREE from 'three'
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { describe, expect, test } from 'vitest'
import { DEFAULT_LINE } from '../physics/constants'
import { simulate } from '../physics/simulate'
import { tuneLine } from '../physics/solver'
import { type CameraMode, DEFAULT_FOV, createCameraRig, damp, dampFactor, fovToFrame, scenicOffset } from './cameraRig'
import { sampleAt } from './playback'

describe('lissage de la caméra', () => {
  test('ne bouge pas quand aucun temps ne passe', () => {
    expect(damp(3, 10, 5, 0)).toBe(3)
  })

  test('se rapproche de la cible sans la dépasser', () => {
    const next = damp(0, 10, 5, 0.1)

    expect(next).toBeGreaterThan(0)
    expect(next).toBeLessThan(10)
  })

  test('donne le même résultat en une image longue ou en deux images courtes', () => {
    const once = damp(0, 10, 4, 0.2)

    const twice = damp(damp(0, 10, 4, 0.1), 10, 4, 0.1)

    expect(twice).toBeCloseTo(once, 12)
  })

  test('atteint presque la cible après un temps long', () => {
    expect(dampFactor(5, 10)).toBeCloseTo(1, 9)
  })

  test("ignore un temps négatif plutôt que de s'éloigner de la cible", () => {
    expect(dampFactor(5, -1)).toBe(0)
  })
})

describe('zoom du trépied', () => {
  test('serre le cadre quand le skieur est loin', () => {
    expect(fovToFrame(8, 60)).toBeLessThan(fovToFrame(8, 30))
  })

  test('cadre exactement la hauteur demandée à distance moyenne', () => {
    const fov = fovToFrame(8, 40)

    expect(Math.tan((fov * Math.PI) / 360) * 40).toBeCloseTo(8, 9)
  })

  test('reste dans des bornes utilisables de très près ou de très loin', () => {
    expect(fovToFrame(8, 0)).toBe(50)
    expect(fovToFrame(8, 10_000)).toBe(9)
  })
})

describe('plans de la remontée en télésiège', () => {
  test('filme le quai depuis la piste : la caméra est du côté opposé au télésiège', () => {
    expect(scenicOffset('approach', 0).z).toBeGreaterThan(0)
    expect(scenicOffset('boarding', 0).z).toBeGreaterThan(0)
  })

  test('part et arrive côté piste, devant le siège, là où les gares sont ouvertes', () => {
    ;[0, 1].forEach((progress) => {
      const offset = scenicOffset('ride', progress)
      expect(offset.x).toBeLessThan(0)
      expect(offset.z).toBeGreaterThan(0)
    })
  })

  test('passe au-dessus de la ligne à mi-montée, sans jamais aller derrière les pylônes côté forêt', () => {
    const middle = scenicOffset('ride', 0.5)

    expect(Math.abs(middle.z)).toBeLessThan(1.5)
    expect(middle.x).toBeLessThan(-10)
    ;[0, 0.2, 0.4, 0.5, 0.6, 0.8, 1].forEach((progress) => expect(scenicOffset('ride', progress).z).toBeGreaterThan(-1.5))
  })

  test('enchaîne le plan du quai et le départ du drone sans saut', () => {
    expect(scenicOffset('ride', 0).distanceTo(scenicOffset('boarding', 0))).toBeLessThan(5)
  })

  test('prend de la hauteur et du recul à mi-montée pour montrer le park', () => {
    const start = scenicOffset('ride', 0)
    const middle = scenicOffset('ride', 0.5)

    expect(middle.y).toBeGreaterThan(start.y + 5)
    expect(middle.length()).toBeGreaterThan(start.length() + 8)
  })

  test('reste toujours au-dessus du skieur', () => {
    ;[0, 0.25, 0.5, 0.75, 1].forEach((progress) => expect(scenicOffset('ride', progress).y).toBeGreaterThan(3))
  })
})

describe('caméra pendant la remontée', () => {
  /** Fait monter un siège en ligne droite à la vitesse donnée et renvoie l'écart caméra-skieur image par image. */
  function followRide(speed: number, seconds: number): { distances: number[]; aim: number[] } {
    const camera = new THREE.PerspectiveCamera(DEFAULT_FOV, 16 / 9, 0.5, 9000)
    const controls = { target: new THREE.Vector3(), enabled: true } as unknown as OrbitControls
    const rig = createCameraRig(camera, controls)
    camera.position.set(-9, 3.5, 16)
    const step = 1 / 60
    const distances: number[] = []
    const aim: number[] = []
    for (let t = 0; t <= seconds; t += step) {
      const focus = new THREE.Vector3(-speed * t, 0.3 * speed * t, -20)
      rig.updateScenic({ focus, phase: 'ride', rideProgress: t / seconds }, step)
      distances.push(camera.position.distanceTo(focus))
      // Le skieur est-il au centre de l'image ? Cosinus de l'angle entre l'axe de visée et lui.
      aim.push(camera.getWorldDirection(new THREE.Vector3()).dot(focus.clone().sub(camera.position).normalize()))
    }
    return { distances, aim }
  }

  test('reste près du skieur même quand le siège file à toute allure sur une longue ligne', () => {
    ;[25, 60, 130].forEach((speed) => {
      const { distances } = followRide(speed, 12)
      // On laisse une seconde à la caméra pour venir du plan précédent, puis elle ne doit plus décrocher.
      expect(Math.max(...distances.slice(60)), `à ${speed} m/s`).toBeLessThan(34)
    })
  })

  test('garde le skieur au centre de l’image quelle que soit la vitesse du siège', () => {
    ;[25, 130].forEach((speed) => {
      const { aim } = followRide(speed, 12)
      expect(Math.min(...aim.slice(30)), `à ${speed} m/s`).toBeGreaterThan(0.995)
    })
  })

  test('cadre le skieur pareil sur une ligne courte et sur une ligne longue', () => {
    const slow = followRide(25, 12).distances
    const fast = followRide(130, 12).distances
    const middle = Math.floor(slow.length / 2)

    expect(fast[middle]).toBeCloseTo(slow[middle], 0)
  })
})

describe('raccord entre la remontée et la descente suivante', () => {
  const result = simulate(tuneLine(DEFAULT_LINE))
  const start = result.samples[0]
  const step = 1 / 60

  /** Joue la fin du débarquement puis le début de la descente, et renvoie le plus grand saut de caméra et de visée. */
  function handoff(mode: CameraMode): { jump: number; swing: number } {
    const camera = new THREE.PerspectiveCamera(DEFAULT_FOV, 16 / 9, 0.5, 9000)
    const controls = { target: new THREE.Vector3(), enabled: true } as unknown as OrbitControls
    const rig = createCameraRig(camera, controls)
    rig.setMode(mode)
    const positions: THREE.Vector3[] = []
    const aims: THREE.Vector3[] = []
    const record = (): void => {
      positions.push(camera.position.clone())
      aims.push(camera.getWorldDirection(new THREE.Vector3()))
    }
    // Comme dans l'app, la caméra a déjà filmé une descente avant la remontée.
    const last = result.samples[result.samples.length - 1]
    for (let i = 0; i < 30; i++) rig.update(last, result.terrain, step)
    // Cinq secondes de débarquement : le skieur glisse de la gare amont jusqu'au départ.
    for (let t = 5; t >= 0; t -= step) {
      const focus = new THREE.Vector3(start.x - 4 * t, start.y + 1 + 0.35 * t, -3 * t)
      rig.updateScenic({ focus, phase: 'unload', rideProgress: 1 }, step)
      record()
    }
    // Puis la descente repart du premier échantillon.
    for (let time = 0; time < 1.5; time += step) {
      rig.update(sampleAt(result.samples, time), result.terrain, step)
      record()
    }
    const jumps = positions.slice(1).map((position, i) => position.distanceTo(positions[i]))
    const swings = aims.slice(1).map((aim, i) => aim.angleTo(aims[i]))
    return { jump: Math.max(...jumps.slice(60)), swing: Math.max(...swings.slice(60)) }
  }

  test.each(['side', 'chase', 'tv'] as const)('ne coupe pas en caméra %s : ni saut de position ni à-coup de visée', (mode) => {
    const { jump, swing } = handoff(mode)

    expect(jump, 'saut de caméra en mètres par image').toBeLessThan(4)
    expect(swing, 'à-coup de visée en radians par image').toBeLessThan(0.12)
  })
})
