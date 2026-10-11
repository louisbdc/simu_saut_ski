import * as THREE from 'three'
import type { Sample, SimulationResult } from '../physics/types'
import { landingVerdict, type Level } from '../ui/landingVerdict'
import { revealable } from './reveal'
import { markShared } from './sharedAssets'

const FLIGHT_COLOR = 0xff6a1a
const TUBE_RADIUS = 0.07
const FLIGHT_DECIMATION = 6
const MARKER_RADIUS = 0.45

/** Sillons laissés par les skis : écart à l'axe, demi-largeur, hauteur au-dessus de la neige, pas le long de la trace. */
const TRACK_OFFSET = 0.11
const TRACK_HALF_WIDTH = 0.04
const TRACK_LIFT = 0.03
const TRACK_SPACING = 0.4
const TRACK_MATERIAL = markShared(new THREE.MeshBasicMaterial({ color: 0xb9cadf, side: THREE.DoubleSide }))

/** Couleur du repère d'atterrissage selon le verdict de la réception. */
const VERDICT_COLORS: Readonly<Record<Level, number>> = { ok: 0x2fb36a, warn: 0xf2a53a, bad: 0xe5484d }

/** Regroupe les échantillons en vol par saut. */
function splitFlights(samples: readonly Sample[]): Sample[][] {
  return samples.reduce<Sample[][]>((flights, sample, i) => {
    if (sample.kind !== 'air') return flights
    const startsNewFlight = i === 0 || samples[i - 1].kind !== 'air'
    if (startsNewFlight) return [...flights, [sample]]
    flights[flights.length - 1].push(sample)
    return flights
  }, [])
}

function flightTube(flight: readonly Sample[]): THREE.Mesh | null {
  const kept = flight.filter((_, i) => i % FLIGHT_DECIMATION === 0 || i === flight.length - 1)
  if (kept.length < 2) return null
  const curve = new THREE.CatmullRomCurve3(kept.map((sample) => new THREE.Vector3(sample.x, sample.y, 0)))
  return new THREE.Mesh(
    new THREE.TubeGeometry(curve, kept.length, TUBE_RADIUS, 6),
    new THREE.MeshBasicMaterial({ color: FLIGHT_COLOR }),
  )
}

/** Regroupe les échantillons au sol par portion de glisse, entre deux vols. */
function splitRuns(samples: readonly Sample[]): Sample[][] {
  return samples.reduce<Sample[][]>((runs, sample, i) => {
    if (sample.kind === 'air') return runs
    const startsNewRun = i === 0 || samples[i - 1].kind === 'air'
    if (startsNewRun) return [...runs, [sample]]
    runs[runs.length - 1].push(sample)
    return runs
  }, [])
}

/** Les deux sillons d'une portion de glisse, en un seul maillage. */
function skiTracks(run: readonly Sample[]): THREE.Mesh | null {
  const kept = run.filter(
    (sample, i) => i === 0 || i === run.length - 1 || Math.floor(sample.x / TRACK_SPACING) !== Math.floor(run[i - 1].x / TRACK_SPACING),
  )
  if (kept.length < 2) return null
  const edges = [-TRACK_OFFSET - TRACK_HALF_WIDTH, -TRACK_OFFSET + TRACK_HALF_WIDTH, TRACK_OFFSET - TRACK_HALF_WIDTH, TRACK_OFFSET + TRACK_HALF_WIDTH]
  const positions = kept.flatMap((sample) => edges.flatMap((z) => [sample.x, sample.y + TRACK_LIFT, z]))
  const indices = kept.slice(1).flatMap((_, i) => {
    const a = i * 4
    return [a, a + 1, a + 4, a + 1, a + 5, a + 4, a + 2, a + 3, a + 6, a + 3, a + 7, a + 6]
  })
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  // Les sillons se creusent au passage du skieur : chaque rangée porte l'instant où il y est.
  return revealable(
    new THREE.Mesh(geometry, TRACK_MATERIAL),
    kept.map((sample) => sample.t),
    12,
  )
}

/** Trajectoires de vol, traces de ski et points d'atterrissage, colorés selon la zone touchée. */
export function buildTrajectoryGroup(result: SimulationResult): THREE.Group {
  const group = new THREE.Group()
  splitFlights(result.samples).forEach((flight) => {
    const tube = flightTube(flight)
    if (tube) group.add(tube)
  })
  splitRuns(result.samples).forEach((run) => {
    const tracks = skiTracks(run)
    if (tracks) group.add(tracks)
  })
  result.reports.forEach((report) => {
    if (!report.landing) return
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(MARKER_RADIUS, 14, 10),
      new THREE.MeshStandardMaterial({ color: VERDICT_COLORS[landingVerdict(report.landing).level], roughness: 0.5 }),
    )
    marker.position.set(report.landing.x, report.landing.y, 0)
    group.add(marker)
  })
  return group
}
