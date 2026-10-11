/**
 * Dynamique de rotation du skieur en vol.
 *
 * Une fois les skis décollés, plus rien ne peut modifier le moment cinétique L du skieur (on néglige
 * le couple de l'air) : toute la rotation vient de l'élan pris sur le kick. En vol, le skieur ne
 * peut que changer de posture, ce qui change son inertie et répartit autrement le même élan :
 *
 *     ω = I(t)⁻¹ · (L − h(t))
 *
 * où I(t) est le tenseur d'inertie de la posture et h(t) le moment cinétique des membres en
 * mouvement par rapport au corps (un bras lancé, des jambes qu'on replie). Grouper diminue I et
 * accélère la rotation ; un mouvement de bras fait tourner le reste du corps en sens inverse.
 *
 * Planifier une figure revient donc à chercher l'élan L à prendre au pop pour que le skieur, en
 * déroulant ses postures, se retrouve à la réception dans l'orientation voulue : skis dans la
 * pente, après le bon nombre de tours. Si cet élan dépasse ce qu'un skieur peut prendre, la
 * figure est sous-tournée.
 */
import * as THREE from 'three'
import { massPoints, massProperties, type MassPoint } from './bodyMass'
import { bodyPose, bodyPoser, type PoseTiming, type TakeoffSet } from './choreography'
import { solveJoints } from './skeleton'
import { RELAXED_COMPACTNESS, nominalTurns, type Trick, type TrickLevel } from './tricks'

/**
 * Vitesse de rotation maximale que le skieur peut prendre au pop, corps tendu, en tours par
 * seconde : en vrille (autour de son axe) et en salto (autour de l'axe latéral). Ce sont des
 * estimations, calées sur des cas réels : un 1440 tenu en 2,3 s de vol (Sandbech, X Games 2015)
 * et environ 2 tours/s en salto une fois groupé (Frohlich 1980).
 */
const MAX_SPIN_SET_RATE = 1.85
const MAX_FLIP_SET_RATE = 0.56
/** Inclinaison minimale entre l'axe du corps et l'élan pour qu'il y ait encore un salto, en radians. */
const MIN_CONE_ANGLE = 0.2

/** Flexion de glisse de référence pour dérouler les postures hors du saut. */
const RIDE_FLEX = 0.24
const FINE_STEP = 1 / 100
const COARSE_STEP = 1 / 40
/** Niveaux de groupé essayés, du plus détendu au plus serré. */
const COMPACTNESS_LEVELS = [0.6, 0.7, 0.8, 0.9, 1] as const
/** En dessous de cette part de l'élan maximal, la figure est confortable. */
const COMFORT_RATIO = 0.75
const MAX_SEARCH_AIR_TIME = 12
const NEWTON_ITERATIONS = 20
/** Passes de resserrement entre l'élan du vol et le lancer qui le fournit. */
const SET_PASSES = 4
/** Demi-écart de temps pour mesurer la vitesse des membres à la lèvre, en secondes. */
const SET_PROBE = 2e-3
/** Vitesses maximales du lancer à la lèvre : bascule du buste et rotation des épaules, en rad/s. */
const MAX_SET_LEAN_RATE = 9
const MAX_SET_TWIST_RATE = 4
/** Voisinage de l'estimation où l'on cherche l'élan : une part de sa norme, plus une marge fixe en kg·m²/s. */
const TRUST_RATIO = 1.5
const TRUST_SLACK = 6
/** Part du vol à partir de laquelle un écart restant est rattrapé. */
const CORRECTION_START = 0.45
/** Au-delà de ce rattrapage en fin de vol, le verdict le signale, en radians (environ 6°). */
const VISIBLE_CORRECTION = 0.1
/** Écart d'orientation à la réception en dessous duquel l'élan est considéré trouvé, en radians. */
const LANDING_TOLERANCE = 1e-4
/** Continuation vers la réception : part du chemin tentée d'abord, plus petit pas accepté, précision d'étape. */
const CONTINUATION_STRIDE = 1 / 8
const MIN_CONTINUATION_STRIDE = 1 / 256
const WAYPOINT_TOLERANCE = 1e-3
/** Écart à la réception en dessous duquel elle est propre, en radians (environ 2°). */
const CLEAN_LANDING = 0.035
/** Élans voisins d'où relancer la recherche : force, inclinaison (rad) et part d'élan de côté. */
interface RestartGrid {
  readonly scales: readonly number[]
  readonly tilts: readonly number[]
  readonly sides: readonly number[]
}
/** D'abord tout près de l'estimation ; plus loin seulement si rien ne tombe juste. */
const RESTART_GRIDS: readonly RestartGrid[] = [
  { scales: [1, 0.9, 1.1, 0.8, 1.2], tilts: [0, -0.3, 0.3], sides: [0, -0.25, 0.25] },
]
/** Écart de rotation cumulée au-delà duquel deux vols ne font plus la même figure : un demi-tour. */
const SAME_FIGURE_ANGLE = Math.PI
const PLAN_CACHE_SIZE = 300

const UP = new THREE.Vector3(0, 1, 0)
const LATERAL = new THREE.Vector3(0, 0, 1)
const TURN = 2 * Math.PI

/** Conditions du saut qui déterminent l'orientation au décollage et celle à atteindre à la réception. */
export interface JumpConditions {
  readonly airTime: number
  /** Pente des skis à la lèvre et à la réception, en radians (positif = spatules vers le haut). */
  readonly takeoffTilt: number
  readonly landingTilt: number
  /** Sens de glisse au décollage et à la réception : `true` = en switch. */
  readonly switchBefore: boolean
  readonly switchAfter: boolean
}

/** Déroulé physique d'une figure pour un saut donné. */
export interface TrickPlan extends PoseTiming {
  readonly conditions: JumpConditions
  /** La figure est bouclée : le skieur arrive skis dans la pente après tous ses tours. */
  readonly completed: boolean
  /** Tours réellement bouclés, saltos et vrilles confondus : moins que prévu quand le vol est trop court. */
  readonly achievedTurns: number
  /** Temps de vol minimal pour boucler la figure avec l'élan maximal, groupé à fond. */
  readonly minAirTime: number
  /** Élan de rotation pris au kick (norme du moment cinétique), en kg·m²/s, et sa limite. */
  readonly angularMomentum: number
  readonly maxAngularMomentum: number
  /** Lancer à la lèvre qui fournit cet élan : bascule du buste et rotation des épaules, en rad/s. */
  readonly set: TakeoffSet
  /**
   * Vitesse à laquelle les skis pivotent autour de la verticale en quittant la neige, en rad/s.
   * Ce pivot commence au sol, sur les carres : c'est lui qui lance l'essentiel d'une vrille.
   */
  readonly takeoffPivotRate: number
  /**
   * Vitesse à laquelle les skis roulent sur leurs carres en quittant la neige, en rad/s. Comme le
   * pivot, cette prise de carre commence au sol : un cork part sur la carre extérieure.
   */
  readonly takeoffEdgeRate: number
  /**
   * Bascule avant-arrière que les skis prendraient d'un coup en quittant la neige, en tours par
   * seconde. Elle devrait être nulle : c'est la part de l'élan de salto que le lancer du buste
   * n'a pas fournie.
   */
  readonly takeoffJolt: number
  /** Vitesse de rotation au plus fort de la figure, en tours par seconde. */
  readonly peakRate: number
  /**
   * Écart que l'élan trouvé laisse à la réception et qui est rattrapé en fin de vol, en radians.
   * Nul quand la recherche de l'élan tombe juste : le vol est alors entièrement celui de la physique.
   */
  readonly inFlightCorrection: number
  /** Orientation du skieur à l'instant t du vol, dans le repère des skis au décollage. */
  readonly orientationAt: (time: number) => THREE.Quaternion
  /** Rotation qu'il reste à rattraper après la réception, exprimée dans le repère du skieur. */
  readonly landingResidual: THREE.Quaternion
  /** Centre de gravité dans le repère du skieur, à la lèvre et à la réception. */
  readonly centerAtTakeoff: THREE.Vector3
  readonly centerAtLanding: THREE.Vector3
}

/**
 * Ce que l'estimation de l'élan lit dans la table : l'inertie au décollage et au milieu de chaque
 * pas. C'est la part qui ne demande pas de dériver des vitesses, donc celle qu'on peut échantillonner
 * à moindre frais quand on cherche seulement si une figure passe.
 */
interface InertiaTable {
  /** Pas de temps entre deux instants d'intégration ; la table est échantillonnée au demi-pas. */
  readonly step: number
  readonly steps: number
  readonly takeoffInertia: THREE.Matrix3
  /** Inertie au milieu de chaque pas : l'instant `(2k + 1)` du demi-pas, pour k de 0 à steps − 1. */
  readonly middleInertia: readonly THREE.Matrix3[]
}

/** État du corps échantillonné au fil du vol, dans son propre repère. */
interface BodyTable extends InertiaTable {
  readonly inverseInertia: readonly THREE.Matrix3[]
  /** Moment cinétique des membres en mouvement par rapport au corps. */
  readonly internal: readonly THREE.Vector3[]
  readonly centers: readonly THREE.Vector3[]
}

function sampling(timing: PoseTiming, wantedStep: number): { steps: number; step: number } {
  const steps = Math.max(2, Math.ceil(timing.airTime / wantedStep))
  return { steps, step: timing.airTime / steps }
}

/** Table réduite à l'inertie : deux fois moins de postures à résoudre que la table complète. */
function inertiaTable(timing: PoseTiming, wantedStep: number): InertiaTable {
  const { steps, step } = sampling(timing, wantedStep)
  const half = step / 2
  const poseAt = bodyPoser(timing, RIDE_FLEX)
  const inertiaAt = (node: number): THREE.Matrix3 => massProperties(massPoints(solveJoints(poseAt(node * half)))).inertia
  return {
    step,
    steps,
    takeoffInertia: inertiaAt(0),
    middleInertia: Array.from({ length: steps }, (_, k) => inertiaAt(2 * k + 1)),
  }
}

interface PoseFrame {
  readonly points: readonly MassPoint[]
  readonly center: THREE.Vector3
}

/** h = Σ m·d × v, avec d et v relatifs au centre de gravité ; les vitesses sont des différences centrées. */
function limbMomentum(before: PoseFrame, frame: PoseFrame, after: PoseFrame, step: number): THREE.Vector3 {
  const scale = 1 / step
  let hx = 0
  let hy = 0
  let hz = 0
  for (let index = 0; index < frame.points.length; index++) {
    const here = frame.points[index]
    const ahead = after.points[index].position
    const behind = before.points[index].position
    const dx = here.position.x - frame.center.x
    const dy = here.position.y - frame.center.y
    const dz = here.position.z - frame.center.z
    const vx = (ahead.x - after.center.x - (behind.x - before.center.x)) * scale
    const vy = (ahead.y - after.center.y - (behind.y - before.center.y)) * scale
    const vz = (ahead.z - after.center.z - (behind.z - before.center.z)) * scale
    const cx = dy * vz - dz * vy
    const cy = dz * vx - dx * vz
    const cz = dx * vy - dy * vx
    hx += cx * here.mass
    hy += cy * here.mass
    hz += cz * here.mass
  }
  return new THREE.Vector3(hx, hy, hz)
}

function tabulate(timing: PoseTiming, wantedStep: number): BodyTable {
  const { steps, step } = sampling(timing, wantedStep)
  const half = step / 2
  const poseAt = bodyPoser(timing, RIDE_FLEX)
  // Un instant de plus à chaque bout, pour dériver les vitesses par différences centrées.
  const frames = Array.from({ length: 2 * steps + 3 }, (_, i) => {
    const points = massPoints(solveJoints(poseAt((i - 1) * half)))
    return { points, ...massProperties(points) }
  })

  const nodes = frames.slice(1, -1).map((frame, i) => ({
    inertia: frame.inertia,
    inverseInertia: frame.inertia.clone().invert(),
    internal: limbMomentum(frames[i], frame, frames[i + 2], step),
    center: frame.center,
  }))

  return {
    step,
    steps,
    takeoffInertia: nodes[0].inertia,
    middleInertia: nodes.filter((_, node) => node % 2 === 1).map((node) => node.inertia),
    inverseInertia: nodes.map((node) => node.inverseInertia),
    internal: nodes.map((node) => node.internal),
    centers: nodes.map((node) => node.center),
  }
}

/** Vitesse de rotation du corps, dans son propre repère, pour un élan L donné dans le repère fixe. */
function bodyRate(table: BodyTable, node: number, orientation: THREE.Quaternion, momentum: THREE.Vector3): THREE.Vector3 {
  return momentum
    .clone()
    .applyQuaternion(orientation.clone().invert())
    .sub(table.internal[node])
    .applyMatrix3(table.inverseInertia[node])
}

/** Rotation correspondant à une vitesse angulaire tenue pendant une durée. */
function rotationOf(rate: THREE.Vector3, duration: number): THREE.Quaternion {
  const angle = rate.length() * duration
  return angle < 1e-12
    ? new THREE.Quaternion()
    : new THREE.Quaternion().setFromAxisAngle(rate.clone().normalize(), angle)
}

interface Flight {
  readonly orientations: readonly THREE.Quaternion[]
  /** Norme de la vitesse de rotation à chaque instant, en rad/s. */
  readonly rates: readonly number[]
  /**
   * Rotation cumulée sur tout le vol, en radians : `twist` autour de l'axe du corps (les vrilles),
   * `tumble` pour la bascule de cet axe (les saltos). Deux vols qui arrivent dans la même
   * orientation après un nombre de tours différent s'y distinguent.
   */
  readonly swept: { readonly twist: number; readonly tumble: number }
}

/** Intègre l'orientation du skieur sur tout le vol (méthode du point milieu). */
function integrate(table: BodyTable, start: THREE.Quaternion, momentum: THREE.Vector3): Flight {
  const orientations = [start.clone()]
  const rates: number[] = []
  let twist = 0
  let tumble = 0
  let orientation = start.clone()
  for (let k = 0; k < table.steps; k++) {
    const rateStart = bodyRate(table, 2 * k, orientation, momentum)
    const middle = orientation.clone().multiply(rotationOf(rateStart, table.step / 2))
    const rateMiddle = bodyRate(table, 2 * k + 1, middle, momentum)
    orientation = orientation.clone().multiply(rotationOf(rateMiddle, table.step)).normalize()
    orientations.push(orientation)
    rates.push(rateStart.length())
    twist += rateMiddle.y * table.step
    tumble += Math.hypot(rateMiddle.x, rateMiddle.z) * table.step
  }
  rates.push(bodyRate(table, 2 * table.steps, orientation, momentum).length())
  return { orientations, rates, swept: { twist, tumble } }
}

/** Écart entre deux orientations, sous forme de vecteur rotation exprimé dans le repère du corps. */
function rotationGap(target: THREE.Quaternion, actual: THREE.Quaternion): THREE.Vector3 {
  const gap = target.clone().invert().multiply(actual)
  const sign = gap.w < 0 ? -1 : 1
  const vector = new THREE.Vector3(gap.x, gap.y, gap.z).multiplyScalar(sign)
  const sine = vector.length()
  if (sine < 1e-12) return new THREE.Vector3()
  return vector.multiplyScalar((2 * Math.atan2(sine, sign * gap.w)) / sine)
}

const smooth = (ratio: number): number => {
  const x = Math.min(1, Math.max(0, ratio))
  return x * x * (3 - 2 * x)
}
const stanceTurn = (isSwitch: boolean): THREE.Quaternion =>
  new THREE.Quaternion().setFromAxisAngle(UP, isSwitch ? Math.PI : 0)
const inertiaAbout = (inertia: THREE.Matrix3, axis: THREE.Vector3): number =>
  axis.dot(axis.clone().applyMatrix3(inertia))

/** ∫ dt / I(t) autour d'un axe du corps : multiplié par l'élan, il donne l'angle parcouru. */
function mobility(table: InertiaTable, axis: THREE.Vector3): number {
  let sum = 0
  for (let k = 0; k < table.steps; k++) sum += table.step / inertiaAbout(table.middleInertia[k], axis)
  return sum
}

interface Candidate {
  /** Élan demandé rapporté à ce que le skieur peut prendre au pop : au-delà de 1, la figure ne passe pas. */
  readonly ratio: number
  /** Estimation de l'élan, dans le repère fixe. */
  readonly momentum: THREE.Vector3
}

interface Demand {
  /** Façons de boucler la figure, la moins coûteuse en premier. */
  readonly candidates: readonly Candidate[]
  readonly ratio: number
  /** Élan maximal que le skieur pourrait prendre dans la direction retenue, en kg·m²/s. */
  readonly available: number
}

/**
 * Estime l'élan à prendre au pop. Le skieur est limité séparément en vrille (autour de son axe) et
 * en salto (autour de l'axe latéral) ; les deux se combinent comme les axes d'une ellipse.
 *
 * Une figure désaxée peut se boucler de deux façons, selon la posture :
 * - en toupie : l'axe du corps tourne en cône autour de l'élan L à la vitesse L / I⊥ (un tour de
 *   cône est un salto) pendant que le corps vrille sur lui-même à L·cos θ·(1/I∥ − 1/I⊥). Le nombre
 *   de saltos fixe la norme de l'élan, le nombre de vrilles son inclinaison θ. C'est le régime du
 *   corps tendu, dont l'inertie est bien plus faible en vrille qu'en salto ;
 * - d'un bloc : une fois groupé, les inerties sont presque égales dans tous les sens et le corps
 *   tourne simplement autour de l'élan, incliné entre l'axe de vrille et l'axe de salto.
 */
function estimateDemand(trick: Trick, conditions: JumpConditions, table: InertiaTable): Demand {
  const start = stanceTurn(conditions.switchBefore)
  // En switch, l'axe latéral du skieur est retourné : la bascule vers la réception change de signe pour lui.
  const lateralSense = LATERAL.clone().applyQuaternion(start).dot(LATERAL)
  const tilt = lateralSense * (conditions.landingTilt - conditions.takeoffTilt)
  const flipMobility = mobility(table, LATERAL)
  const spinMobility = mobility(table, UP)
  const maxAlong = TURN * MAX_SPIN_SET_RATE * inertiaAbout(table.takeoffInertia, UP)
  const maxAcross = TURN * MAX_FLIP_SET_RATE * inertiaAbout(table.takeoffInertia, LATERAL)

  const candidate = (along: number, across: number, impossible = false): Candidate => {
    const ratio = Math.hypot(along / maxAlong, across / maxAcross)
    return {
      ratio: impossible ? Infinity : ratio,
      momentum: UP.clone().multiplyScalar(along).addScaledVector(LATERAL, across).applyQuaternion(start),
    }
  }

  const across = (TURN * trick.flips + tilt) / flipMobility
  const candidates: Candidate[] = []
  if (trick.flips === 0 || trick.spins === 0) {
    candidates.push(candidate((TURN * trick.spins) / spinMobility, across))
  } else {
    const along = (TURN * trick.spins) / (spinMobility - flipMobility)
    // En toupie, la vrille ne peut pas demander plus d'élan que les saltos n'en fournissent.
    candidates.push(candidate(along, across, Math.abs(along) > Math.abs(across) / Math.tan(MIN_CONE_ANGLE)))
    const axis = UP.clone().multiplyScalar(trick.spins).addScaledVector(LATERAL, trick.flips).normalize()
    const block = (TURN * nominalTurns(trick)) / mobility(table, axis)
    candidates.push(candidate(block * axis.y, block * axis.z + tilt / flipMobility))
  }

  const sorted = [...candidates].sort((a, b) => a.ratio - b.ratio)
  const best = sorted[0]
  return {
    candidates: sorted.filter((option) => Number.isFinite(option.ratio)),
    ratio: best.ratio,
    available: best.ratio > 0 ? best.momentum.length() / best.ratio : Math.hypot(maxAlong, maxAcross),
  }
}

function solveLinear(columns: readonly THREE.Vector3[], right: THREE.Vector3): THREE.Vector3 | null {
  const [a, b, c] = columns
  const matrix = new THREE.Matrix3().set(a.x, b.x, c.x, a.y, b.y, c.y, a.z, b.z, c.z)
  if (Math.abs(matrix.determinant()) < 1e-14) return null
  return right.clone().applyMatrix3(matrix.invert())
}

interface Solution {
  readonly momentum: THREE.Vector3
  /** Écart d'orientation à la réception, en radians. */
  readonly error: number
}

/**
 * Méthode de Newton sur les trois composantes de L, à partir de `from`, pour arriver sur `target` :
 * chaque pas est raccourci tant qu'il n'améliore pas la réception, et la recherche ne s'éloigne pas
 * de l'estimation `guess` de plus de `reach`.
 */
function newton(
  table: BodyTable,
  start: THREE.Quaternion,
  target: THREE.Quaternion,
  from: THREE.Vector3,
  guess: THREE.Vector3,
  reach: number,
  tolerance: number,
): Solution {
  const gapFor = (momentum: THREE.Vector3): THREE.Vector3 =>
    rotationGap(target, integrate(table, start, momentum).orientations[table.steps])

  let momentum = from.clone()
  let gap = gapFor(momentum)
  for (let iteration = 0; iteration < NEWTON_ITERATIONS && gap.length() > tolerance; iteration++) {
    const nudge = 0.005 * Math.max(1, momentum.length())
    const columns = [new THREE.Vector3(1, 0, 0), UP, LATERAL].map((direction) =>
      gapFor(momentum.clone().addScaledVector(direction, nudge)).sub(gap).multiplyScalar(1 / nudge),
    )
    const correction = solveLinear(columns, gap.clone().negate())
    if (!correction) break

    let improved = false
    for (let scale = 1; scale > 1 / 40; scale /= 2) {
      const candidate = momentum.clone().addScaledVector(correction, scale)
      if (candidate.distanceTo(guess) > reach) continue
      const candidateGap = gapFor(candidate)
      if (candidateGap.length() < gap.length()) {
        momentum = candidate
        gap = candidateGap
        improved = true
        break
      }
    }
    if (!improved) break
  }
  return { momentum, error: gap.length() }
}

/**
 * Amène pas à pas l'élan estimé jusqu'à la réception voulue. L'estimation fait atterrir quelque
 * part ; on déplace la cible de ce point vers la vraie réception par petites étapes, en corrigeant
 * l'élan à chacune. On reste ainsi sur la même façon de tourner que l'estimation, là où un Newton
 * direct, lancé trop loin de la solution, se bloque sur un minimum local.
 */
function followToTarget(
  table: BodyTable,
  start: THREE.Quaternion,
  target: THREE.Quaternion,
  guess: THREE.Vector3,
  reach: number,
): THREE.Vector3 {
  const landed = integrate(table, start, guess).orientations[table.steps]
  let momentum = guess.clone()
  let done = 0
  let stride = CONTINUATION_STRIDE
  while (done < 1 && stride >= MIN_CONTINUATION_STRIDE) {
    const next = Math.min(1, done + stride)
    const waypoint = landed.clone().slerp(target, next)
    const step = newton(table, start, waypoint, momentum, guess, reach, WAYPOINT_TOLERANCE)
    if (step.error <= WAYPOINT_TOLERANCE) {
      momentum = step.momentum
      done = next
      stride *= 2
    } else {
      stride /= 2
    }
  }
  return momentum
}

/**
 * Affine un élan estimé pour arriver sur l'orientation voulue. La recherche reste au voisinage de
 * l'estimation : un corps qui tourne plusieurs fois est très sensible à son élan, et loin de
 * l'estimation on trouverait des solutions qui « tombent juste » après une culbute désordonnée
 * qu'aucun skieur ne chercherait.
 */
function refineMomentum(
  table: BodyTable,
  start: THREE.Quaternion,
  target: THREE.Quaternion,
  guess: THREE.Vector3,
): Solution {
  const reach = TRUST_RATIO * guess.length() + TRUST_SLACK
  const direct = newton(table, start, target, guess, guess, reach, LANDING_TOLERANCE)
  if (direct.error <= LANDING_TOLERANCE && sameFigure(table, start, guess, direct.momentum)) return direct
  const followed = newton(
    table,
    start,
    target,
    followToTarget(table, start, target, guess, reach),
    guess,
    reach,
    LANDING_TOLERANCE,
  )
  if (followed.error <= LANDING_TOLERANCE && sameFigure(table, start, guess, followed.momentum)) return followed
  // Rien ne tombe juste en faisant la figure demandée : on garde l'élan estimé, avec son écart.
  const estimated = rotationGap(target, integrate(table, start, guess).orientations[table.steps]).length()
  const kept = [direct, followed].filter((solution) => sameFigure(table, start, guess, solution.momentum))
  return kept.reduce((best, solution) => (solution.error < best.error ? solution : best), {
    momentum: guess.clone(),
    error: estimated,
  })
}

/**
 * Cet élan fait-il la même figure que l'estimation ? Une orientation d'arrivée se retrouve à
 * l'identique un tour plus tôt ou plus tard : sans ce contrôle, la recherche pourrait « réussir »
 * un 720 en ne faisant qu'un 360.
 */
function sameFigure(table: BodyTable, start: THREE.Quaternion, guess: THREE.Vector3, momentum: THREE.Vector3): boolean {
  const wanted = integrate(table, start, guess).swept
  const found = integrate(table, start, momentum).swept
  return (
    Math.abs(found.twist - wanted.twist) < SAME_FIGURE_ANGLE && Math.abs(found.tumble - wanted.tumble) < SAME_FIGURE_ANGLE
  )
}

/** Cherche l'élan à prendre au pop, en partant de chaque façon de boucler la figure. */
function solveMomentum(
  table: BodyTable,
  start: THREE.Quaternion,
  target: THREE.Quaternion,
  candidates: readonly Candidate[],
): Solution {
  let best: Solution | null = null
  for (const candidate of candidates) {
    const solution = refineMomentum(table, start, target, candidate.momentum)
    if (!best || solution.error < best.error) best = solution
    if (best.error <= LANDING_TOLERANCE) break
  }
  if (best && best.error > CLEAN_LANDING) {
    const nearby = nearbySolution(table, start, target, candidates)
    if (nearby) return nearby
  }
  return best ?? { momentum: new THREE.Vector3(), error: Infinity }
}

/**
 * Quand la recherche bute près de l'estimation, on repart d'élans voisins : un peu plus ou un peu
 * moins fort, un peu plus ou un peu moins désaxé. Parmi ceux qui tombent juste, on garde le plus
 * proche de l'estimation, donc la façon de tourner la plus proche de celle que le skieur vise.
 */
function nearbySolution(
  table: BodyTable,
  start: THREE.Quaternion,
  target: THREE.Quaternion,
  candidates: readonly Candidate[],
): Solution | null {
  for (const grid of RESTART_GRIDS) {
    const found = nearestOnGrid(table, start, target, candidates, grid)
    if (found) return found
  }
  return null
}

function nearestOnGrid(
  table: BodyTable,
  start: THREE.Quaternion,
  target: THREE.Quaternion,
  candidates: readonly Candidate[],
  grid: RestartGrid,
): Solution | null {
  let nearest: { solution: Solution; distance: number } | null = null
  for (const candidate of candidates) {
    const guess = candidate.momentum
    const reach = TRUST_RATIO * guess.length() + TRUST_SLACK
    const forward = new THREE.Vector3(1, 0, 0).applyQuaternion(start)
    for (const scale of grid.scales) {
      for (const tilt of grid.tilts) {
        for (const side of grid.sides) {
          if (scale === 1 && tilt === 0 && side === 0) continue
          const from = guess
            .clone()
            .applyAxisAngle(forward, tilt)
            .multiplyScalar(scale)
            .addScaledVector(forward, side * guess.length())
          if (from.distanceTo(guess) > reach) continue
          const solution = newton(table, start, target, from, guess, reach, LANDING_TOLERANCE)
          if (solution.error > LANDING_TOLERANCE || !sameFigure(table, start, guess, solution.momentum)) continue
          const distance = solution.momentum.distanceTo(guess)
          if (!nearest || distance < nearest.distance) nearest = { solution, distance }
        }
      }
    }
  }
  return nearest?.solution ?? null
}

const hasRotation = (trick: Trick): boolean => nominalTurns(trick) > 0
const minimumCache = new Map<string, number>()

/** Niveaux de groupé du plus serré au plus détendu : le serré est celui qui réussit le plus tôt. */
const TIGHTEST_FIRST = [...COMPACTNESS_LEVELS].reverse()

/** La figure se boucle-t-elle dans ce temps de vol, pour au moins un niveau de groupé ? */
function closesWithin(trick: Trick, conditions: JumpConditions): boolean {
  let best = Infinity
  for (const compactness of TIGHTEST_FIRST) {
    const table = inertiaTable({ trick, airTime: conditions.airTime, compactness }, COARSE_STEP)
    best = Math.min(best, estimateDemand(trick, conditions, table).ratio)
    if (best <= 1) return true
  }
  return false
}

/** Plus petit temps de vol qui laisse boucler la figure, groupé à fond avec l'élan maximal. */
function minimumAirTime(trick: Trick, conditions: JumpConditions): number {
  if (!hasRotation(trick)) return 0
  const tiltChange = conditions.landingTilt - conditions.takeoffTilt
  const key = `${trick.id}|${tiltChange.toFixed(2)}|${conditions.switchBefore}`
  const cached = minimumCache.get(key)
  if (cached !== undefined) return cached

  let low = 0.05
  let high = MAX_SEARCH_AIR_TIME
  for (let i = 0; i < 24; i++) {
    const airTime = (low + high) / 2
    if (closesWithin(trick, { ...conditions, airTime })) high = airTime
    else low = airTime
  }
  minimumCache.set(key, high)
  return high
}

/** Groupé le plus détendu qui laisse boucler la figure avec l'élan disponible ; le moins mauvais sinon. */
function chooseCompactness(trick: Trick, conditions: JumpConditions): { compactness: number; feasible: boolean } {
  if (!hasRotation(trick)) return { compactness: RELAXED_COMPACTNESS, feasible: true }
  const options: Array<{ compactness: number; ratio: number }> = []
  for (const compactness of COMPACTNESS_LEVELS) {
    const table = inertiaTable({ trick, airTime: conditions.airTime, compactness }, COARSE_STEP)
    const { ratio } = estimateDemand(trick, conditions, table)
    // Le plus détendu qui passe suffit : inutile d'essayer les niveaux plus serrés.
    if (ratio <= 1) return { compactness, feasible: true }
    options.push({ compactness, ratio })
  }
  const leastBad = options.reduce((best, option) => (option.ratio < best.ratio ? option : best))
  return { compactness: leastBad.compactness, feasible: false }
}

const NO_SET: TakeoffSet = { lean: 0, twist: 0 }

/** Moment cinétique des membres en mouvement par rapport aux skis, à l'instant du décollage. */
function internalAtTakeoff(timing: PoseTiming): THREE.Vector3 {
  const poseAt = bodyPoser(timing, RIDE_FLEX)
  const frames = [-SET_PROBE, 0, SET_PROBE].map((time) => {
    const points = massPoints(solveJoints(poseAt(time)))
    return { points, center: massProperties(points).center }
  })
  const [before, now, after] = frames
  return now.points.reduce((sum, point, index) => {
    const d = point.position.clone().sub(now.center)
    const velocity = after.points[index].position
      .clone()
      .sub(after.center)
      .sub(before.points[index].position.clone().sub(before.center))
      .multiplyScalar(1 / (2 * SET_PROBE))
    return sum.addScaledVector(d.cross(velocity), point.mass)
  }, new THREE.Vector3())
}

/**
 * Lancer qui donne au skieur l'élan voulu avant qu'il ne quitte la neige. Tant que les skis sont
 * posés sur une rampe droite, ils ne tournent pas : tout le moment cinétique du skieur est alors
 * celui de ses membres en mouvement, et il doit déjà valoir l'élan du vol, sinon les skis se
 * mettraient à basculer d'un coup à la lèvre. Autour de la verticale c'est différent : les skis
 * peuvent pivoter sur leurs carres, et c'est ce pivot qui lance la vrille.
 */
function setFor(shape: PoseTiming, wanted: THREE.Vector3): TakeoffSet {
  const still = internalAtTakeoff({ ...shape, set: NO_SET })
  const perLean = internalAtTakeoff({ ...shape, set: { lean: 1, twist: 0 } }).sub(still)
  const perTwist = internalAtTakeoff({ ...shape, set: { lean: 0, twist: 1 } }).sub(still)
  const missing = wanted.clone().sub(still)

  // Les épaules qui tournent fournissent une part du moment de vrille (axe du corps) ; le reste
  // vient du pivot des skis.
  const twistRaw = shape.trick.spins !== 0 && Math.abs(perTwist.y) > 1e-9 ? missing.y / perTwist.y : 0
  const twist = THREE.MathUtils.clamp(twistRaw, -MAX_SET_TWIST_RATE, MAX_SET_TWIST_RATE)

  // Le buste qui bascule doit annuler exactement la bascule avant-arrière des skis à la lèvre :
  // ω = I⁻¹·(L − h), dont on veut la composante latérale nulle.
  const inverse = massProperties(massPoints(solveJoints(bodyPose(shape, 0, RIDE_FLEX)))).inertia.clone().invert()
  const withoutLean = missing.clone().addScaledVector(perTwist, -twist).applyMatrix3(inverse)
  const perLeanRate = perLean.clone().applyMatrix3(inverse)
  const lean = Math.abs(perLeanRate.z) > 1e-9 ? withoutLean.z / perLeanRate.z : 0
  return { lean: THREE.MathUtils.clamp(lean, -MAX_SET_LEAN_RATE, MAX_SET_LEAN_RATE), twist }
}

function idlePlan(trick: Trick, conditions: JumpConditions): TrickPlan {
  const start = stanceTurn(conditions.switchBefore)
  const center = massProperties(massPoints(solveJoints(bodyPose({ trick, airTime: 0, compactness: 0 }, 0, RIDE_FLEX)))).center
  return {
    trick,
    airTime: conditions.airTime,
    compactness: RELAXED_COMPACTNESS,
    conditions,
    completed: !hasRotation(trick),
    achievedTurns: 0,
    minAirTime: minimumAirTime(trick, conditions),
    angularMomentum: 0,
    maxAngularMomentum: 0,
    set: NO_SET,
    takeoffPivotRate: 0,
    takeoffEdgeRate: 0,
    takeoffJolt: 0,
    peakRate: 0,
    inFlightCorrection: 0,
    orientationAt: () => start.clone(),
    landingResidual: new THREE.Quaternion(),
    centerAtTakeoff: center,
    centerAtLanding: center,
  }
}

interface Attempt {
  readonly compactness: number
  readonly demand: Demand
  readonly set: TakeoffSet
  readonly table: BodyTable
  readonly momentum: THREE.Vector3
  readonly flight: Flight
  readonly landed: THREE.Quaternion
  /** Écart d'orientation à la réception, en radians. */
  readonly error: number
}

function buildPlan(trick: Trick, conditions: JumpConditions): TrickPlan {
  const { airTime } = conditions
  if (airTime <= 0) return idlePlan(trick, conditions)

  const chosen = chooseCompactness(trick, conditions)
  const { feasible } = chosen
  const start = stanceTurn(conditions.switchBefore)
  const target = new THREE.Quaternion()
    .setFromAxisAngle(LATERAL, conditions.landingTilt - conditions.takeoffTilt)
    .multiply(stanceTurn(conditions.switchAfter))

  /** Cherche l'élan et le lancer pour un niveau de groupé, et mesure où le skieur arrive. */
  const attempt = (compactness: number): Attempt => {
    const shape = { trick, airTime, compactness }
    const bareTable = tabulate(shape, FINE_STEP)
    const demand = estimateDemand(trick, conditions, bareTable)
    // Vol trop court : le skieur prend tout l'élan qu'il peut, sans arriver à boucler la figure.
    const cheapest = demand.candidates[0]?.momentum ?? new THREE.Vector3()

    // L'élan dépend un peu du lancer (il déplace des masses), et le lancer doit fournir l'élan :
    // on resserre les deux l'un sur l'autre en quelques passes.
    let set = NO_SET
    let table = bareTable
    let momentum = feasible
      ? solveMomentum(table, start, target, demand.candidates).momentum
      : cheapest.clone().multiplyScalar(1 / demand.ratio)
    for (let pass = 0; pass < SET_PASSES; pass++) {
      set = setFor(shape, momentum.clone().applyQuaternion(start.clone().invert()))
      table = tabulate({ ...shape, set }, FINE_STEP)
      // La dernière passe s'arrête sur le lancer : la continuité à la lèvre prime.
      if (feasible && pass < SET_PASSES - 1) {
        momentum = solveMomentum(table, start, target, [{ ratio: demand.ratio, momentum }]).momentum
      }
    }
    const flight = integrate(table, start, momentum)
    const landed = flight.orientations[table.steps]
    return { compactness, demand, set, table, momentum, flight, landed, error: rotationGap(target, landed).length() }
  }

  const best = attempt(chosen.compactness)
  const { compactness, demand, set, table, momentum, flight, landed } = best
  const rateAtTakeoff = bodyRate(table, 0, start, momentum)
  // Ce qui manque à l'arrivée. Sur une figure sous-tournée, le skieur atterrit avec. Sur une figure
  // faisable, la recherche de l'élan tombe juste dans la plupart des cas ; quand elle n'y arrive pas,
  // l'écart est rattrapé en fin de vol, et le verdict le signale.
  const residual = target.clone().invert().multiply(landed)
  const correction = feasible ? residual.clone().invert() : new THREE.Quaternion()
  const correctionFrom = airTime * CORRECTION_START

  return {
    trick,
    airTime,
    compactness,
    conditions,
    completed: feasible,
    achievedTurns: feasible ? nominalTurns(trick) : nominalTurns(trick) / demand.ratio,
    minAirTime: minimumAirTime(trick, conditions),
    angularMomentum: momentum.length(),
    maxAngularMomentum: demand.available,
    set,
    takeoffPivotRate: rateAtTakeoff.y,
    takeoffEdgeRate: rateAtTakeoff.x,
    takeoffJolt: Math.abs(rateAtTakeoff.z) / TURN,
    peakRate: flight.rates.reduce((max, rate) => Math.max(max, rate), 0) / TURN,
    inFlightCorrection: feasible ? best.error : 0,
    orientationAt: (time: number): THREE.Quaternion => {
      const clamped = Math.min(Math.max(time, 0), airTime)
      const position = (clamped / airTime) * table.steps
      const index = Math.min(table.steps - 1, Math.floor(position))
      const free = flight.orientations[index].clone().slerp(flight.orientations[index + 1], position - index)
      const progress = smooth((clamped - correctionFrom) / (airTime - correctionFrom))
      return free.multiply(new THREE.Quaternion().slerp(correction, progress))
    },
    landingResidual: feasible ? new THREE.Quaternion() : residual,
    centerAtTakeoff: table.centers[0],
    centerAtLanding: table.centers[2 * table.steps],
  }
}

const planCache = new Map<string, TrickPlan>()

/** Prépare une figure pour un saut : élan à prendre au kick, orientation au fil du vol, faisabilité. */
export function planJump(trick: Trick, conditions: JumpConditions): TrickPlan {
  const key = [
    trick.id,
    conditions.airTime.toFixed(3),
    conditions.takeoffTilt.toFixed(3),
    conditions.landingTilt.toFixed(3),
    conditions.switchBefore,
    conditions.switchAfter,
  ].join('|')
  const cached = planCache.get(key)
  if (cached) return cached
  if (planCache.size >= PLAN_CACHE_SIZE) planCache.clear()
  const plan = buildPlan(trick, conditions)
  planCache.set(key, plan)
  return plan
}

export interface TrickVerdict {
  readonly level: TrickLevel
  readonly label: string
}

const decimal = (value: number, digits: number): string => value.toFixed(digits).replace('.', ',')

/** Y a-t-il vraiment le temps de rentrer la figure sur cette bosse ? */
export function trickVerdict(plan: TrickPlan): TrickVerdict {
  if (nominalTurns(plan.trick) === 0) return { level: 'ok', label: 'Pas de rotation' }
  if (!plan.completed) {
    const missingDegrees = Math.round((nominalTurns(plan.trick) - plan.achievedTurns) * 360)
    const missingTime = Math.max(0, plan.minAirTime - plan.airTime)
    return {
      level: 'bad',
      label: `Pas le temps : il manque ${missingDegrees}° et ${decimal(missingTime, 2)} s de vol`,
    }
  }
  const relaxed =
    plan.compactness <= RELAXED_COMPACTNESS && plan.angularMomentum <= COMFORT_RATIO * plan.maxAngularMomentum
  if (plan.inFlightCorrection > VISIBLE_CORRECTION) {
    const caught = Math.round((plan.inFlightCorrection * 180) / Math.PI)
    return { level: 'warn', label: `Ça passe, réception rattrapée de ${caught}°` }
  }
  return relaxed
    ? { level: 'ok', label: 'Largement le temps' }
    : { level: 'warn', label: 'Ça passe, en groupant serré' }
}
