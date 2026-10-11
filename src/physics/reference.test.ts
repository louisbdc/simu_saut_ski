/**
 * Recoupement du moteur avec des références calculées séparément :
 * - formules exactes quand elles existent ;
 * - intégrateur SciPy (solve_ivp, rtol 1e-11) sur la géométrie analytique, en temps et non en
 *   distance, avec les forces écrites en vecteurs : donc indépendant du profil en ligne brisée
 *   et de la méthode de Heun utilisés ici ;
 * - bibliothèque skijumpdesign 1.4 (Levy et al.), avec son skieur par défaut.
 *
 * Paramètres communs, ceux de skijumpdesign : masse 75 kg, Cd·A = 0,821 × 0,34 m²,
 * air à 0,85 kg/m³, frottement 0,03.
 */
import { describe, expect, test } from 'vitest'
import { DEFAULT_LINE, GRAVITY } from './constants'
import { fly } from './flight'
import { rideGround } from './ground'
import { buildTerrain } from './terrain'
import type { KickerConfig, PhysicsParams } from './types'

const DRAG = (0.85 * 0.821 * 0.34) / (2 * 75)
const CALM: PhysicsParams = { friction: 0.03, drag: DRAG, flightDrag: DRAG, headwind: 0 }
const FACING_WIND: PhysicsParams = { ...CALM, headwind: 8 }

const toRad = (degrees: number): number => (degrees * Math.PI) / 180

function terrainWith(changes: Partial<KickerConfig>) {
  return buildTerrain({ ...DEFAULT_LINE, kickers: [{ ...DEFAULT_LINE.kickers[0], ...changes }] })
}

/** Vitesse et temps au bout d'un élan droit, juste avant la courbe. */
function endOfInrun(angleDeg: number, length: number, startSpeed: number, p: PhysicsParams) {
  const terrain = terrainWith({ inrunAngleDeg: angleDeg, inrunLength: length })
  const ride = rideGround(terrain, { index: 0, offset: 0, speed: startSpeed, time: 0 }, p)
  const sample = ride.samples.find((s) => s.kind === 'transition')
  if (!sample) throw new Error("la fin de l'élan n'a pas été atteinte")
  return sample
}

/** Forme exacte sur pente droite avec traînée : v² = vt² + (v0² − vt²)·e^(−2ks). */
function exactSpeedOnSlope(angleDeg: number, length: number, startSpeed: number, p: PhysicsParams): number {
  const angle = toRad(angleDeg)
  const terminalSquared = (GRAVITY * (Math.sin(angle) - p.friction * Math.cos(angle))) / p.drag
  return Math.sqrt(terminalSquared + (startSpeed ** 2 - terminalSquared) * Math.exp(-2 * p.drag * length))
}

describe('glisse sur pente droite', () => {
  test.each([
    { angle: 20, length: 60, start: 0 },
    { angle: 35, length: 120, start: 5 },
    { angle: 8, length: 200, start: 12 },
  ])('suit la forme exacte avec frottement et traînée ($angle°, $length m)', ({ angle, length, start }) => {
    const sample = endOfInrun(angle, length, start, CALM)

    expect(Math.abs(sample.speed - exactSpeedOnSlope(angle, length, start, CALM))).toBeLessThan(1e-4)
  })

  test('sans air, le temps de parcours vaut √(2·L/a)', () => {
    const noAir: PhysicsParams = { ...CALM, drag: 0 }
    const acceleration = GRAVITY * (Math.sin(toRad(20)) - 0.03 * Math.cos(toRad(20)))

    const sample = endOfInrun(20, 60, 0, noAir)

    expect(Math.abs(sample.t - Math.sqrt((2 * 60) / acceleration))).toBeLessThan(1e-4)
    expect(Math.abs(sample.speed - Math.sqrt(2 * acceleration * 60))).toBeLessThan(1e-6)
  })

  test('recoupe skijumpdesign sur un élan de 60 m à 20°', () => {
    // skijumpdesign : Skier().slide_on(FlatSurface(-20°, 60 m)) → 18,3535 m/s en 6,3389 s.
    // Sa force de frottement utilise cos(tan(pente)) au lieu de cos(arctan(pente)),
    // d'où un écart attendu de l'ordre du centième de m/s.
    const sample = endOfInrun(20, 60, 0, CALM)

    expect(Math.abs(sample.speed - 18.353463)).toBeLessThan(0.02)
    expect(Math.abs(sample.t - 6.338875)).toBeLessThan(0.01)
  })
})

describe('élan, courbe et kick complets', () => {
  // Géométrie du premier kicker par défaut : élan 60 m à 25°, rayon 22 m, plat 6 m,
  // sortie à 30°, lèvre à 4,5 m. Référence SciPy : (temps à la lèvre, vitesse à la lèvre).
  const terrain = buildTerrain({ ...DEFAULT_LINE, kickers: [DEFAULT_LINE.kickers[0]] })
  const start = { index: 0, offset: 0, speed: 0, time: 0 }

  test('la vitesse et le temps à la lèvre recoupent la référence sans vent', () => {
    const ride = rideGround(terrain, start, CALM)

    expect(ride.end).toBe('lip')
    expect(Math.abs(ride.speed - 17.233540575724792)).toBeLessThan(2e-3)
    expect(Math.abs(ride.time - 7.162270066804717)).toBeLessThan(2e-3)
  })

  test('la vitesse et le temps à la lèvre recoupent la référence avec 8 m/s de vent de face', () => {
    const ride = rideGround(terrain, start, FACING_WIND)

    expect(Math.abs(ride.speed - 15.102753173635836)).toBeLessThan(2e-3)
    expect(Math.abs(ride.time - 7.486093542391553)).toBeLessThan(2e-3)
  })
})

describe('vol avec traînée', () => {
  // Décollage à 18 m/s et 25°, réception sur une pente à 30° qui part 2 m sous la lèvre.
  const launch = { x: 0, y: 0, vx: 18 * Math.cos(toRad(25)), vy: 18 * Math.sin(toRad(25)), t: 0 }
  const slope = (x: number): number => -2 - Math.tan(toRad(30)) * x

  test('dans le vide, atterrit au point donné par la résolution exacte du second degré', () => {
    const b = launch.vy + Math.tan(toRad(30)) * launch.vx
    const time = (b + Math.sqrt(b * b + 4 * (GRAVITY / 2) * 2)) / GRAVITY

    const { landing } = fly(launch, slope, { friction: 0, drag: 0, flightDrag: 0, headwind: 0 })

    expect(Math.abs(landing.t - time)).toBeLessThan(1e-5)
    expect(Math.abs(landing.x - launch.vx * time)).toBeLessThan(1e-4)
  })

  test("recoupe la référence SciPy pour le point et la vitesse d'atterrissage", () => {
    const { landing } = fly(launch, slope, CALM)

    expect(Math.abs(landing.t - 3.5427392958422494)).toBeLessThan(1e-4)
    expect(Math.abs(landing.x - 54.98437164)).toBeLessThan(1e-3)
    expect(Math.abs(landing.y - -33.74524177)).toBeLessThan(1e-3)
    expect(Math.abs(landing.vx - 14.56758493)).toBeLessThan(1e-3)
    expect(Math.abs(landing.vy - -25.86055946)).toBeLessThan(1e-3)
  })

  test('recoupe la référence SciPy avec 8 m/s de vent de face', () => {
    const { landing } = fly(launch, slope, FACING_WIND)

    expect(Math.abs(landing.t - 3.458656887172311)).toBeLessThan(1e-4)
    expect(Math.abs(landing.x - 50.97709422)).toBeLessThan(1e-3)
    expect(Math.abs(landing.vx - 13.07708309)).toBeLessThan(1e-3)
    expect(Math.abs(landing.vy - -24.90632881)).toBeLessThan(1e-3)
  })

  test('reste à moins de 1 % du modèle de vol de skijumpdesign', () => {
    // skijumpdesign applique la traînée séparément sur vx et sur vy (atterrissage à x = 55,2709 m).
    // Ici la traînée s'oppose au vecteur vitesse, ce qui est la loi physique : le saut est plus court de 0,29 m.
    const { landing } = fly(launch, slope, CALM)

    expect(Math.abs(landing.x - 55.27090871) / 55.27090871).toBeLessThan(0.01)
    expect(landing.x).toBeLessThan(55.27090871)
  })
})
