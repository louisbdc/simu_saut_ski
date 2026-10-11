/**
 * Chute en corps articulé. Chaque articulation est une masse ponctuelle soumise à la gravité ; les
 * os sont des contraintes de longueur, satisfaites par relaxations successives ; la neige repousse
 * les masses, les freine par frottement et les fait un peu rebondir. Rien n'est scénarisé : la
 * façon dont le skieur roule, dont un bras passe sous lui ou dont sa tête touche la neige découle
 * de sa position et de ses vitesses à l'instant de l'impact.
 *
 * Méthode de Jakobsen, « Advanced Character Physics » (GDC 2001) : intégration de Verlet et
 * contraintes de distance. Le seuil de choc à la tête vient du test des casques de ski (norme
 * EN 1077 : 5,42 m/s ; casques de compétition FIS : 6,8 m/s). Les autres seuils de blessure sont
 * des ordres de grandeur indicatifs, pas un diagnostic.
 */
import * as THREE from 'three'

export const PARTS = [
  'head',
  'neck',
  'pelvis',
  'shoulderL',
  'shoulderR',
  'elbowL',
  'elbowR',
  'handL',
  'handR',
  'hipL',
  'hipR',
  'kneeL',
  'kneeR',
  'ankleL',
  'ankleR',
] as const
export type Part = (typeof PARTS)[number]
export type RagdollPoints = Readonly<Record<Part, THREE.Vector3>>

/** État du skieur à l'instant de l'impact : positions et vitesses de chaque articulation. */
export interface RagdollStart {
  readonly positions: RagdollPoints
  readonly velocities: RagdollPoints
}

export interface RagdollTrack {
  /** Durée de la chute jusqu'à l'immobilité (ou jusqu'à la durée maximale simulée), en secondes. */
  readonly duration: number
  readonly stopped: boolean
  /** Distance parcourue par le bassin, en mètres. */
  readonly slideDistance: number
  /** Positions des articulations à un instant compté depuis l'impact. */
  readonly frameAt: (time: number) => RagdollPoints
  /** Plus forte vitesse de choc contre la neige subie par chaque partie du corps, en m/s. */
  readonly impacts: Readonly<Record<Part, number>>
  /** Ce que la chute a pu coûter au skieur, en clair. */
  readonly notes: readonly string[]
}

const GRAVITY = 9.81
const STEP = 1 / 240
const FRAME_STEPS = 4
const MAX_SECONDS = 25
const RELAXATIONS = 8
/** Frottement du corps sur la neige, restitution au rebond, et légère résistance de l'air. */
const FRICTION = 0.45
const RESTITUTION = 0.18
const AIR_DAMPING = 0.9995
/** Le corps est à l'arrêt quand aucune partie ne dépasse cette vitesse pendant ce temps. */
const REST_SPEED = 0.35
const REST_SECONDS = 0.6
/** En dessous de cette vitesse contre la neige, un contact n'est pas compté comme un choc. */
const MIN_IMPACT_SPEED = 1

/** Masse portée par chaque articulation (kg) et rayon du corps autour d'elle (m). */
const BODY: Readonly<Record<Part, readonly [mass: number, radius: number]>> = {
  head: [5.7, 0.11],
  neck: [9, 0.13],
  pelvis: [14, 0.14],
  shoulderL: [6.5, 0.1],
  shoulderR: [6.5, 0.1],
  elbowL: [2, 0.05],
  elbowR: [2, 0.05],
  handL: [1.2, 0.05],
  handR: [1.2, 0.05],
  hipL: [8, 0.12],
  hipR: [8, 0.12],
  kneeL: [6.5, 0.07],
  kneeR: [6.5, 0.07],
  // Jambe, pied et chaussure de ski.
  ankleL: [5, 0.08],
  ankleR: [5, 0.08],
}

/** Os et entretoises du tronc : leur longueur reste celle de l'instant de l'impact. */
const BONES: readonly (readonly [Part, Part])[] = [
  ['neck', 'head'],
  ['pelvis', 'neck'],
  ['neck', 'shoulderL'],
  ['neck', 'shoulderR'],
  ['shoulderL', 'shoulderR'],
  ['pelvis', 'hipL'],
  ['pelvis', 'hipR'],
  ['hipL', 'hipR'],
  ['shoulderL', 'hipL'],
  ['shoulderR', 'hipR'],
  ['shoulderL', 'hipR'],
  ['shoulderR', 'hipL'],
  ['shoulderL', 'elbowL'],
  ['elbowL', 'handL'],
  ['shoulderR', 'elbowR'],
  ['elbowR', 'handR'],
  ['hipL', 'kneeL'],
  ['kneeL', 'ankleL'],
  ['hipR', 'kneeR'],
  ['kneeR', 'ankleR'],
]

/** Butées articulaires : deux parties ne peuvent pas se rapprocher en dessous de cette distance. */
const LIMITS: readonly (readonly [Part, Part, number])[] = [
  // Le coude et le genou se plient, mais pas jusqu'à ramener la main dans l'épaule.
  ['shoulderL', 'handL', 0.22],
  ['shoulderR', 'handR', 0.22],
  ['hipL', 'ankleL', 0.3],
  ['hipR', 'ankleR', 0.3],
  // La nuque ne se replie pas sur le dos, les genoux ne se traversent pas.
  ['head', 'pelvis', 0.6],
  ['kneeL', 'kneeR', 0.14],
  ['ankleL', 'ankleR', 0.14],
]

/**
 * Sens de pliage : un genou ne plie que vers l'avant du corps, un coude que vers l'arrière.
 * Chaque entrée donne la racine du membre, l'articulation, son extrémité, le sens permis et le jeu
 * toléré dans l'autre sens, en mètres.
 */
const HINGES: readonly (readonly [Part, Part, Part, 1 | -1, number])[] = [
  ['hipL', 'kneeL', 'ankleL', 1, 0.02],
  ['hipR', 'kneeR', 'ankleR', 1, 0.02],
  ['shoulderL', 'elbowL', 'handL', -1, 0.08],
  ['shoulderR', 'elbowR', 'handR', -1, 0.08],
]

/** Seuils de choc, en m/s. Seuls ceux de la tête viennent d'une norme ; les autres sont indicatifs. */
const HEAD_STANDARD = 5.42
const HEAD_RACING = 6.8
const WRIST_RISK = 4
const SHOULDER_RISK = 5
const TRUNK_RISK = 6
const KNEE_RISK = 6

const decimal = (value: number): string => value.toFixed(1).replace('.', ',')

function describe(impacts: Readonly<Record<Part, number>>, rest: RagdollPoints): string[] {
  const notes: string[] = []
  const head = impacts.head
  if (head >= HEAD_RACING) {
    notes.push(`Tête : choc à ${decimal(head)} m/s, au-delà du test des casques de compétition (6,8 m/s)`)
  } else if (head >= HEAD_STANDARD) {
    notes.push(`Tête : choc à ${decimal(head)} m/s, au-delà du test de la norme des casques (5,4 m/s)`)
  } else if (head >= MIN_IMPACT_SPEED) {
    notes.push(`Tête : touche la neige à ${decimal(head)} m/s, dans ce qu'un casque encaisse`)
  }
  const sides = [
    ['gauche', 'handL', 'shoulderL', 'kneeL'],
    ['droit', 'handR', 'shoulderR', 'kneeR'],
  ] as const
  for (const [name, hand, shoulder, knee] of sides) {
    if (impacts[hand] >= WRIST_RISK) {
      notes.push(`Poignet ${name} : réception sur la main à ${decimal(impacts[hand])} m/s, risque de fracture`)
    }
    if (impacts[shoulder] >= SHOULDER_RISK) {
      notes.push(`Épaule ${name === 'droit' ? 'droite' : name} : choc à ${decimal(impacts[shoulder])} m/s, risque pour la clavicule`)
    }
    if (impacts[knee] >= KNEE_RISK) notes.push(`Genou ${name} : choc à ${decimal(impacts[knee])} m/s`)
    // Bras resté sous le buste à l'arrêt.
    const under = rest[hand].y < rest.pelvis.y && rest[hand].distanceTo(rest.pelvis.clone().lerp(rest.neck, 0.5)) < 0.28
    if (under) notes.push(`Bras ${name} coincé sous le corps à l'arrêt`)
  }
  const trunk = Math.max(impacts.pelvis, impacts.hipL, impacts.hipR, impacts.neck)
  if (trunk >= TRUNK_RISK) notes.push(`Bassin et dos : choc à ${decimal(trunk)} m/s`)
  return notes
}

/**
 * Simule la chute. `groundHeight` donne l'altitude de la neige à l'abscisse x ; la piste est
 * uniforme dans sa largeur.
 */
export function simulateRagdoll(start: RagdollStart, groundHeight: (x: number) => number): RagdollTrack {
  const count = PARTS.length
  const position = PARTS.map((part) => start.positions[part].clone())
  const previous = PARTS.map((part, i) => position[i].clone().addScaledVector(start.velocities[part], -STEP))
  const inverseMass = PARTS.map((part) => 1 / BODY[part][0])
  const radius = PARTS.map((part) => BODY[part][1])
  const indexOf = (part: Part): number => PARTS.indexOf(part)
  // Indices cherchés une seule fois : la boucle de simulation les relit des milliers de fois.
  const [hipL, hipR, neck, pelvis] = (['hipL', 'hipR', 'neck', 'pelvis'] as const).map(indexOf)
  const bones = BONES.map(([a, b]) => ({ a: indexOf(a), b: indexOf(b), length: position[indexOf(a)].distanceTo(position[indexOf(b)]) }))
  const limits = LIMITS.map(([a, b, min]) => ({ a: indexOf(a), b: indexOf(b), min }))

  const hinges = HINGES.map(([root, joint, tip, sense, slack]) => ({
    root: indexOf(root),
    joint: indexOf(joint),
    tip: indexOf(tip),
    sense,
    slack,
  }))
  const forward = new THREE.Vector3()
  const lateral = new THREE.Vector3()

  /** Empêche genoux et coudes de se plier à l'envers, par rapport à l'avant du buste. */
  const keepHinges = (): void => {
    lateral.subVectors(position[hipR], position[hipL])
    forward.subVectors(position[neck], position[pelvis]).cross(lateral)
    if (forward.lengthSq() < 1e-9) return
    forward.normalize()
    for (const hinge of hinges) {
      delta.addVectors(position[hinge.root], position[hinge.tip]).multiplyScalar(0.5)
      const bend = delta.subVectors(position[hinge.joint], delta).dot(forward) * hinge.sense
      const excess = -hinge.slack - bend
      if (excess <= 0) continue
      // L'articulation revient du bon côté ; la racine et l'extrémité reculent un peu en échange.
      position[hinge.joint].addScaledVector(forward, hinge.sense * excess * 0.7)
      position[hinge.root].addScaledVector(forward, -hinge.sense * excess * 0.15)
      position[hinge.tip].addScaledVector(forward, -hinge.sense * excess * 0.15)
    }
  }

  const impacts = PARTS.map(() => 0)
  const touching = PARTS.map(() => false)
  const frames: THREE.Vector3[][] = [position.map((p) => p.clone())]
  const delta = new THREE.Vector3()
  const normal = new THREE.Vector3()
  const velocity = new THREE.Vector3()
  const pelvisBefore = new THREE.Vector3()
  const tangent = new THREE.Vector3()
  let quiet = 0
  let travelled = 0
  let stopped = false
  let steps = 0

  /** Ramène deux masses à la distance voulue, chacune bougeant d'autant moins qu'elle est lourde. */
  const separate = (a: number, b: number, wanted: number, onlyIfCloser: boolean): void => {
    delta.subVectors(position[b], position[a])
    const distance = delta.length()
    if (distance < 1e-9 || (onlyIfCloser && distance >= wanted)) return
    const correction = (distance - wanted) / distance / (inverseMass[a] + inverseMass[b])
    position[a].addScaledVector(delta, correction * inverseMass[a])
    position[b].addScaledVector(delta, -correction * inverseMass[b])
  }

  const collide = (i: number): void => {
    const p = position[i]
    const ground = groundHeight(p.x)
    const depth = ground + radius[i] - p.y
    if (depth <= 0) {
      touching[i] = false
      return
    }
    const slope = (groundHeight(p.x + 0.05) - groundHeight(p.x - 0.05)) / 0.1
    normal.set(-slope, 1, 0).normalize()
    velocity.subVectors(p, previous[i])
    const into = velocity.dot(normal)
    if (!touching[i] && into < 0) impacts[i] = Math.max(impacts[i], -into / STEP)
    touching[i] = true

    p.addScaledVector(normal, depth * normal.y)
    tangent.copy(velocity).addScaledVector(normal, -into)
    const sliding = tangent.length()
    // Frottement de Coulomb : la neige retire au glissement μ fois ce qu'elle a repoussé.
    const braking = FRICTION * (Math.max(0, -into) + depth * normal.y)
    const kept = sliding > 1e-9 ? Math.max(0, 1 - braking / sliding) : 0
    const rebound = into < 0 ? -into * RESTITUTION : into
    previous[i].copy(p).addScaledVector(tangent, -kept).addScaledVector(normal, -rebound)
  }

  while (steps * STEP < MAX_SECONDS && !stopped) {
    let fastest = 0
    pelvisBefore.copy(position[pelvis])
    for (let i = 0; i < count; i++) {
      velocity.subVectors(position[i], previous[i]).multiplyScalar(AIR_DAMPING)
      previous[i].copy(position[i])
      position[i].add(velocity)
      position[i].y -= GRAVITY * STEP * STEP
    }
    for (let pass = 0; pass < RELAXATIONS; pass++) {
      for (const bone of bones) separate(bone.a, bone.b, bone.length, false)
      for (const limit of limits) separate(limit.a, limit.b, limit.min, true)
      keepHinges()
      for (let i = 0; i < count; i++) collide(i)
    }
    for (let i = 0; i < count; i++) fastest = Math.max(fastest, position[i].distanceTo(previous[i]) / STEP)
    travelled += position[pelvis].distanceTo(pelvisBefore)
    steps++
    quiet = fastest < REST_SPEED ? quiet + STEP : 0
    stopped = quiet >= REST_SECONDS
    if (steps % FRAME_STEPS === 0) frames.push(position.map((p) => p.clone()))
  }

  const toPoints = (frame: readonly THREE.Vector3[]): RagdollPoints =>
    Object.fromEntries(PARTS.map((part, i) => [part, frame[i]])) as RagdollPoints
  const frameSeconds = STEP * FRAME_STEPS
  const maxImpacts = Object.fromEntries(PARTS.map((part, i) => [part, impacts[i]])) as Record<Part, number>

  return {
    duration: steps * STEP,
    stopped,
    slideDistance: travelled,
    impacts: maxImpacts,
    notes: describe(maxImpacts, toPoints(frames[frames.length - 1])),
    frameAt: (time: number): RagdollPoints => {
      const at = Math.min(Math.max(time, 0) / frameSeconds, frames.length - 1)
      const index = Math.min(frames.length - 2, Math.floor(at))
      if (index < 0) return toPoints(frames[0])
      const ratio = at - index
      return toPoints(frames[index].map((point, i) => point.clone().lerp(frames[index + 1][i], ratio)))
    },
  }
}
