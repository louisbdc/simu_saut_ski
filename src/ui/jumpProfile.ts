import type { Sample, SimulationResult } from '../physics/types'
import { sampleAt } from '../scene/playback'
import type { PhaseId, PhaseWindow } from '../tutorials/phases'
import { svg } from './dom'

export interface JumpProfile {
  readonly element: SVGSVGElement
  /** Met en avant le tronçon d'une étape. */
  readonly setActive: (phase: PhaseId) => void
  /** Place le repère du skieur à un instant du parcours. */
  readonly setTime: (time: number) => void
}

/** Marges autour du saut, en mètres : devant, derrière, au-dessus, et épaisseur de neige dessinée dessous. */
const SIDE_MARGIN = 2
const TOP_MARGIN = 2
const SNOW_DEPTH = 3
/** Rayon du repère du skieur, en part de la largeur du dessin. */
const MARKER_SHARE = 1 / 110

const point = (x: number, y: number): string => `${x.toFixed(2)},${(-y).toFixed(2)}`

/** Trajet du skieur pendant une étape : les échantillons de la tranche, bornes comprises. */
function phasePath(samples: readonly Sample[], window: PhaseWindow): readonly Sample[] {
  const inside = samples.filter((sample) => sample.t > window.start && sample.t < window.end)
  return [sampleAt(samples, window.start), ...inside, sampleAt(samples, window.end)]
}

/**
 * Vue de profil du saut : la neige, et le trajet du skieur découpé en tronçons, un par étape. Un clic
 * sur un tronçon choisit son étape.
 */
export function createJumpProfile(
  result: SimulationResult,
  windows: readonly PhaseWindow[],
  onPick: (phase: PhaseId) => void,
): JumpProfile {
  const paths = windows.map((window) => ({ id: window.id, samples: phasePath(result.samples, window) }))
  const travelled = paths.flatMap((path) => path.samples)
  const minX = travelled[0].x - SIDE_MARGIN
  const maxX = travelled[travelled.length - 1].x + SIDE_MARGIN
  const ground = result.terrain.points.filter((terrainPoint) => terrainPoint.x >= minX && terrainPoint.x <= maxX)
  const heights = [...travelled.map((sample) => sample.y), ...ground.map((terrainPoint) => terrainPoint.y)]
  const top = Math.max(...heights) + TOP_MARGIN
  const bottom = Math.min(...heights) - SNOW_DEPTH
  const width = maxX - minX

  const element = svg('svg', {
    class: 'jump-profile',
    viewBox: `${minX} ${-top} ${width} ${top - bottom}`,
    role: 'img',
    'aria-label': 'Profil du saut, découpé en étapes',
  })
  const snow = [...ground.map((terrainPoint) => point(terrainPoint.x, terrainPoint.y)), point(maxX, bottom), point(minX, bottom)]
  element.append(svg('polygon', { class: 'snow', points: snow.join(' ') }))

  const lines = paths.map((path) => {
    const points = path.samples.map((sample) => point(sample.x, sample.y)).join(' ')
    const line = svg('polyline', { class: 'phase-line', points })
    const hit = svg('polyline', { class: 'phase-hit', points })
    hit.addEventListener('click', () => onPick(path.id))
    element.append(line, hit)
    return { id: path.id, line }
  })
  const marker = svg('circle', { class: 'marker', r: width * MARKER_SHARE })
  element.append(marker)

  return {
    element,
    setActive: (phase) => lines.forEach(({ id, line }) => line.classList.toggle('active', id === phase)),
    setTime: (time) => {
      const sample = sampleAt(result.samples, time)
      marker.setAttribute('cx', sample.x.toFixed(2))
      marker.setAttribute('cy', (-sample.y).toFixed(2))
    },
  }
}
