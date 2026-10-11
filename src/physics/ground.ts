import { GRAVITY } from './constants'
import type { PhysicsParams, Sample, Terrain } from './types'

export interface GroundStart {
  /** Segment de départ et distance déjà parcourue dessus. */
  readonly index: number
  readonly offset: number
  readonly speed: number
  readonly time: number
}

/**
 * lip : arrivé à une lèvre. detached : décollage sur une bosse (appui nul).
 * stalled : vitesse tombée à zéro. end : bout du profil.
 */
export type GroundEnd = 'lip' | 'detached' | 'stalled' | 'end'

export interface GroundResult {
  readonly samples: readonly Sample[]
  readonly end: GroundEnd
  readonly index: number
  readonly x: number
  readonly y: number
  /** Pente du dernier segment parcouru, direction de la vitesse à l'arrivée. */
  readonly angle: number
  readonly speed: number
  readonly time: number
}

interface SlopeForces {
  /** Appui par unité de masse (N/m) ; négatif quand le skieur décollerait. */
  readonly normal: number
  /** d(v²)/ds le long de la pente. */
  readonly rate: number
}

/**
 * Bilan des forces sur la pente, par unité de masse, pour v² = u.
 * La traînée s'oppose à la vitesse relative à l'air (vitesse du skieur + vent de face horizontal) :
 * sa composante le long de la pente freine, sa composante perpendiculaire modifie l'appui.
 * Le frottement vaut μ fois l'appui, lui-même augmenté par la compression (courbure × v²).
 */
function slopeForces(u: number, sin: number, cos: number, curvature: number, p: PhysicsParams): SlopeForces {
  const speed = Math.sqrt(Math.max(u, 0))
  const airAlong = speed + p.headwind * cos
  const airAcross = -p.headwind * sin
  const airSpeed = Math.hypot(airAlong, airAcross)
  const normal = GRAVITY * cos + curvature * u + p.drag * airSpeed * airAcross
  const rate = -2 * (GRAVITY * sin + p.friction * Math.max(0, normal) + p.drag * airSpeed * airAlong)
  return { normal, rate }
}

/** Fait glisser le skieur sur le profil jusqu'à une lèvre, un décollage, l'arrêt ou la fin. */
export function rideGround(terrain: Terrain, start: GroundStart, p: PhysicsParams): GroundResult {
  const { points, lipIndices } = terrain
  const samples: Sample[] = []
  let u = start.speed * start.speed
  let time = start.time
  let angle = 0

  const finish = (end: GroundEnd, index: number, x: number, y: number): GroundResult => ({
    samples,
    end,
    index,
    x,
    y,
    angle,
    speed: Math.sqrt(Math.max(u, 0)),
    time,
  })

  for (let i = start.index; i < points.length - 1; i++) {
    const a = points[i]
    const b = points[i + 1]
    const length = Math.hypot(b.x - a.x, b.y - a.y)
    const cos = (b.x - a.x) / length
    const sin = (b.y - a.y) / length
    const offset = i === start.index ? Math.min(start.offset, length) : 0
    const x = a.x + cos * offset
    const y = a.y + sin * offset
    const speed = Math.sqrt(u)
    const forces = slopeForces(u, sin, cos, a.curvature, p)
    const { normal } = forces
    // Le profil est une ligne brisée : on ne quitte la neige qu'à un sommet, dans la direction
    // du segment qu'on vient de parcourir. Décoller en plein segment ferait retomber aussitôt dessous.
    const arrivedAtVertex = i > start.index
    const arrivedAtLip = arrivedAtVertex && lipIndices.has(i)
    const detaches = arrivedAtVertex && !arrivedAtLip && normal < 0
    if (!arrivedAtLip && !detaches) angle = Math.atan2(sin, cos)

    samples.push({
      t: time,
      x,
      y,
      vx: speed * Math.cos(angle),
      vy: speed * Math.sin(angle),
      speed,
      gLoad: arrivedAtLip ? 0 : Math.max(0, normal) / GRAVITY,
      height: 0,
      tilt: angle,
      airProgress: 0,
      kind: arrivedAtLip ? points[i - 1].kind : a.kind,
      kicker: a.kicker,
    })
    if (arrivedAtLip) return finish('lip', i, x, y)
    if (detaches) return finish('detached', i, x, y)

    // Méthode de Heun sur v² le long du segment.
    const distance = length - offset
    const rateStart = forces.rate
    const predicted = Math.max(0, u + rateStart * distance)
    const rateEnd = slopeForces(predicted, sin, cos, a.curvature, p).rate
    const next = u + ((rateStart + rateEnd) / 2) * distance
    if (next <= 0) return finish('stalled', i, x, y)

    time += distance / ((speed + Math.sqrt(next)) / 2)
    u = next
  }

  const last = points[points.length - 1]
  const speed = Math.sqrt(u)
  samples.push({
    t: time,
    x: last.x,
    y: last.y,
    vx: speed * Math.cos(angle),
    vy: speed * Math.sin(angle),
    speed,
    gLoad: 1,
    height: 0,
    tilt: angle,
    airProgress: 0,
    kind: last.kind,
    kicker: last.kicker,
  })
  return finish('end', points.length - 1, last.x, last.y)
}
