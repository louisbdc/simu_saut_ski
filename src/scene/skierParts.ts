/** Pièces du skieur : équipement commun et corps de secours en capsules. */
import * as THREE from 'three'
import { skiSole, skiTopsheet } from './skiGraphic'
import { SKI_GEOMETRY } from './skiShape'
import { SKIER_STYLE } from './skierStyle'
import {
  FOREARM,
  LEG_HALF_WIDTH,
  POLE_LENGTH,
  SHIN,
  SIDES,
  THIGH,
  TORSO,
  UPPER_ARM,
  type Joints,
} from './skeleton'


/** Couleurs du skieur, réglables dans `skierStyle.ts`. */
export const SKIER_COLORS = SKIER_STYLE.colors

/** Nom du groupe « ski et fixation » dans chaque pied. */
export const SKI_NAME = 'ski'

const UP = new THREE.Vector3(0, 1, 0)

/** Articulations d'un bras et d'une jambe telles que le corps affiché les place réellement. */
export interface LimbPoints {
  readonly shoulder: THREE.Vector3
  readonly elbow: THREE.Vector3
  readonly hand: THREE.Vector3
  /** Centre du poing, là où passe le manche du bâton. */
  readonly grip: THREE.Vector3
  readonly hip: THREE.Vector3
  readonly knee: THREE.Vector3
  readonly ankle: THREE.Vector3
}

/**
 * Où se trouve vraiment le corps affiché, dans le repère du skieur. Les proportions du mannequin
 * diffèrent du squelette : les vêtements et les bâtons se posent sur ces points, pas sur le squelette.
 */
export interface BodyPoints {
  readonly pelvis: THREE.Vector3
  readonly neck: THREE.Vector3
  readonly sides: readonly [LimbPoints, LimbPoints]
}

/** Corps affichable du skieur, piloté par les articulations. */
export interface SkierBody {
  readonly object: THREE.Object3D
  /**
   * Met le corps dans la posture donnée. `rig` est le repère du skieur, parent de `object`.
   * Renvoie la position réelle de ses articulations dans ce repère, pour l'habiller.
   */
  readonly apply: (joints: Joints, rig: THREE.Object3D) => BodyPoints
}

function material(color: number, roughness = 0.75): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness })
}

function shadowed<T extends THREE.Mesh>(mesh: T): T {
  mesh.castShadow = true
  return mesh
}

/** Comme `placeBetween`, en étirant la pièce (de longueur `nominal`) pour couvrir tout l'intervalle. */
function stretchBetween(mesh: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3, nominal: number): void {
  placeBetween(mesh, from, to)
  mesh.scale.y = from.distanceTo(to) / nominal
}

/** Oriente et place une pièce allongée (construite le long de y) entre deux points. */
export function placeBetween(mesh: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3): void {
  mesh.position.copy(from).add(to).multiplyScalar(0.5)
  mesh.quaternion.setFromUnitVectors(UP, to.clone().sub(from).normalize())
}

/** Ski à doubles spatules : chants sombres, dessus et semelle décorés. `side` vaut -1 à gauche, 1 à droite. */
export function createSki(side: number): THREE.Group {
  const ski = new THREE.Group()
  const top = new THREE.MeshStandardMaterial({ map: skiTopsheet(side), roughness: 0.35 })
  const sole = new THREE.MeshStandardMaterial({ map: skiSole(), roughness: 0.45 })
  ski.add(
    shadowed(new THREE.Mesh(SKI_GEOMETRY.edges, material(SKIER_COLORS.skiBase, 0.6))),
    shadowed(new THREE.Mesh(SKI_GEOMETRY.sole, sole)),
    shadowed(new THREE.Mesh(SKI_GEOMETRY.top, top)),
  )
  return ski
}

function block(size: readonly [number, number, number], at: readonly [number, number, number], color: number, roughness = 0.5): THREE.Mesh {
  const mesh = shadowed(new THREE.Mesh(new THREE.BoxGeometry(...size), material(color, roughness)))
  mesh.position.set(...at)
  return mesh
}

/** Fixation : platine, butée avant et talonnière. */
function createBinding(): THREE.Group {
  const binding = new THREE.Group()
  binding.add(
    block([0.5, 0.012, 0.075], [0.04, 0.03, 0], SKIER_COLORS.binding),
    block([0.09, 0.05, 0.08], [0.22, 0.055, 0], SKIER_COLORS.binding),
    block([0.11, 0.07, 0.08], [-0.15, 0.065, 0], SKIER_COLORS.binding),
    block([0.03, 0.02, 0.085], [-0.21, 0.105, 0], SKIER_COLORS.buckle, 0.3),
  )
  return binding
}

/** Chaussure de ski : semelle, coque arrondie, tige inclinée vers l'avant et boucles. */
function createBoot(): THREE.Group {
  const boot = new THREE.Group()
  const shell = shadowed(new THREE.Mesh(new THREE.CapsuleGeometry(0.058, 0.17, 6, 14), material(SKIER_COLORS.boot, 0.4)))
  shell.rotation.z = Math.PI / 2
  shell.position.set(0.045, 0.105, 0)
  shell.scale.set(1, 1, 0.95)
  const cuff = shadowed(new THREE.Mesh(new THREE.CapsuleGeometry(0.062, 0.13, 6, 14), material(SKIER_COLORS.boot, 0.4)))
  cuff.position.set(-0.005, 0.215, 0)
  cuff.rotation.z = -0.24
  const tongue = block([0.05, 0.16, 0.07], [0.055, 0.2, 0], SKIER_COLORS.bootSole, 0.6)
  tongue.rotation.z = -0.4
  boot.add(
    block([0.31, 0.03, 0.105], [0.04, 0.052, 0], SKIER_COLORS.bootSole, 0.7),
    shell,
    cuff,
    tongue,
    // Boucles : deux sur la coque, deux sur la tige.
    block([0.018, 0.012, 0.125], [0.11, 0.135, 0], SKIER_COLORS.buckle, 0.25),
    block([0.018, 0.012, 0.125], [0.03, 0.15, 0], SKIER_COLORS.buckle, 0.25),
    block([0.018, 0.012, 0.135], [0.01, 0.225, 0], SKIER_COLORS.buckle, 0.25),
    block([0.018, 0.012, 0.135], [-0.005, 0.275, 0], SKIER_COLORS.buckle, 0.25),
  )
  return boot
}

/** Ski, fixation et chaussure d'un côté, posés à plat sous le pied. */
export function createFoot(side: number): THREE.Group {
  const foot = new THREE.Group()
  // Ski et fixation sont regroupés : c'est ce qui se détache du pied dans une chute.
  const ski = new THREE.Group()
  ski.name = SKI_NAME
  ski.add(createSki(side), createBinding())
  foot.add(ski, createBoot())
  foot.position.z = side * LEG_HALF_WIDTH
  return foot
}

/** Jusqu'où la veste descend sous le bassin, en mètres (négatif : vers le bas). */
const JACKET_DROP = -0.11
const JACKET_WIDENING = 1.4
/** Couche un anneau, construit dans le plan xy, à plat autour de l'axe du buste. */
const FLAT = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2)

/**
 * Veste d'une seule pièce, du bas des hanches au col : droite sur le buste, arrondie aux épaules,
 * légèrement resserrée par l'élastique du bas. Construite le long de y à partir du bassin.
 */
function jacketShape(radius: number): THREE.BufferGeometry {
  const outline = new THREE.SplineCurve(
    [
      [0.86, JACKET_DROP],
      [1.02, JACKET_DROP + 0.05],
      [1.03, 0.08],
      [1, TORSO * 0.55],
      [0.97, TORSO * 0.8],
      [0.8, TORSO * 0.95],
      [0.5, TORSO * 1.02],
      [0.36, TORSO * 1.05],
    ].map(([ratio, height]) => new THREE.Vector2(radius * ratio, height)),
  )
  const geometry = new THREE.LatheGeometry(outline.getPoints(24), 28)
  geometry.scale(1, 1, JACKET_WIDENING)
  return geometry
}

/** Orientation du buste : y le long de la colonne, z d'une épaule à l'autre. */
function torsoFrame(body: BodyPoints, along: THREE.Vector3): THREE.Quaternion {
  const [left, right] = body.sides
  const across = right.shoulder.clone().sub(left.shoulder)
  across.addScaledVector(along, -across.dot(along)).normalize()
  const ahead = along.clone().cross(across)
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(ahead, along, across))
}

/** Vêtements amples portés par-dessus le corps : ils suivent les mêmes articulations. */
export interface Outfit {
  readonly object: THREE.Group
  readonly apply: (body: BodyPoints) => void
}

/**
 * Veste et pantalon amples. L'ampleur vient de `skierStyle.ts` ; les pièces sont posées entre les
 * articulations du squelette, donc elles suivent toutes les postures, figures et chutes comprises.
 */
export function createOutfit(): Outfit {
  const { jacket: loose, pants: baggy } = SKIER_STYLE.fit
  const object = new THREE.Group()
  const jacket = shadowed(new THREE.Mesh(jacketShape(0.125 * loose), material(SKIER_COLORS.jacket)))
  const hem = shadowed(new THREE.Mesh(new THREE.TorusGeometry(0.125 * loose * 0.93, 0.022, 8, 28), material(SKIER_COLORS.jacketTrim)))
  hem.scale.y = JACKET_WIDENING
  const collar = shadowed(new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.04, 10, 24), material(SKIER_COLORS.jacketTrim)))
  const seat = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.125 * baggy, 16, 12), material(SKIER_COLORS.pants)))
  seat.scale.set(1, 0.85, 1.3)
  const limbs = SIDES.map(() => ({
    sleeve: limb(0.058 * loose, UPPER_ARM, SKIER_COLORS.jacket),
    forearm: limb(0.052 * loose, FOREARM, SKIER_COLORS.jacket),
    cuff: limb(0.046 * loose, 0.03, SKIER_COLORS.jacketTrim),
    thigh: limb(0.082 * baggy, THIGH, SKIER_COLORS.pants),
    shin: limb(0.074 * baggy, SHIN, SKIER_COLORS.pants),
    // Bas de pantalon évasé qui retombe sur la chaussure.
    flare: limb(0.082 * baggy, 0.1, SKIER_COLORS.pants),
  }))
  object.add(jacket, hem, collar, seat, ...limbs.flatMap((set) => Object.values(set)))

  const toward = (from: THREE.Vector3, to: THREE.Vector3, distance: number): THREE.Vector3 =>
    from.clone().addScaledVector(to.clone().sub(from).normalize(), distance)

  return {
    object,
    apply: (body: BodyPoints) => {
      const { pelvis, neck } = body
      const along = neck.clone().sub(pelvis).normalize()
      const torso = torsoFrame(body, along)
      jacket.position.copy(pelvis)
      jacket.quaternion.copy(torso)
      jacket.scale.y = pelvis.distanceTo(neck) / TORSO
      hem.position.copy(pelvis).addScaledVector(along, JACKET_DROP + 0.015)
      hem.quaternion.copy(torso).multiply(FLAT)
      collar.position.copy(neck).addScaledVector(along, 0.03)
      collar.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), along)
      seat.position.copy(pelvis)
      body.sides.forEach((side, index) => {
        const parts = limbs[index]
        stretchBetween(parts.sleeve, side.shoulder, side.elbow, UPPER_ARM)
        stretchBetween(parts.forearm, side.elbow, side.hand, FOREARM)
        placeBetween(parts.cuff, toward(side.hand, side.elbow, 0.03), side.hand)
        stretchBetween(parts.thigh, side.knee, side.hip, THIGH)
        stretchBetween(parts.shin, toward(side.ankle, side.knee, 0.1), side.knee, SHIN)
        placeBetween(parts.flare, toward(side.ankle, side.knee, 0.06), toward(side.ankle, side.knee, 0.16))
      })
    },
  }
}

/** Casque, sangle et masque, tournés vers +x. Le visage n'est ajouté que si aucun modèle n'en fournit. */
export function createHeadGear(withFace: boolean): THREE.Group {
  const head = new THREE.Group()
  const helmet = shadowed(
    new THREE.Mesh(new THREE.SphereGeometry(0.128, 24, 18), material(SKIER_COLORS.helmet, 0.35)),
  )
  helmet.scale.set(1.06, 1, 1)
  const strap = new THREE.Mesh(new THREE.TorusGeometry(0.129, 0.012, 8, 28), material(SKIER_COLORS.pants, 0.6))
  strap.rotation.x = Math.PI / 2
  strap.position.y = 0.005
  const lens = new THREE.Mesh(
    new THREE.BoxGeometry(0.05, 0.075, 0.19),
    new THREE.MeshStandardMaterial({ color: SKIER_COLORS.lens, roughness: 0.15, metalness: 0.5 }),
  )
  lens.position.set(0.108, 0.005, 0)
  head.add(helmet, strap, lens)
  if (withFace) {
    const face = new THREE.Mesh(new THREE.SphereGeometry(0.1, 20, 16), material(SKIER_COLORS.skin))
    face.position.set(0.035, -0.035, 0)
    head.add(face)
  }
  return head
}

export function createPole(): THREE.Mesh {
  return shadowed(
    new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.008, POLE_LENGTH, 6), material(SKIER_COLORS.pole, 0.4)),
  )
}

/** Segment arrondi de longueur fixe, à poser ensuite entre deux articulations. */
function limb(radius: number, length: number, color: number): THREE.Mesh {
  return shadowed(new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 5, 12), material(color)))
}

/** Le corps simplifié a une boule pour main : le bâton passe par son centre. */
const withGrip = <T extends { readonly hand: THREE.Vector3 }>(side: T): T & { grip: THREE.Vector3 } => ({
  ...side,
  grip: side.hand,
})

/** Corps simplifié en capsules : affiché le temps que le modèle se charge, ou s'il est indisponible. */
export function createCapsuleBody(): SkierBody {
  const object = new THREE.Group()
  const torso = limb(0.15, TORSO - 0.12, SKIER_COLORS.jacket)
  torso.scale.z = 1.38
  const pelvis = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12), material(SKIER_COLORS.pants)))
  pelvis.scale.set(1, 0.82, 1.3)
  const head = createHeadGear(true)
  const limbs = SIDES.map(() => ({
    shin: limb(0.075, SHIN, SKIER_COLORS.pants),
    thigh: limb(0.095, THIGH, SKIER_COLORS.pants),
    upperArm: limb(0.062, UPPER_ARM, SKIER_COLORS.jacket),
    forearm: limb(0.054, FOREARM, SKIER_COLORS.jacket),
    hand: shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.058, 12, 10), material(SKIER_COLORS.glove))),
  }))
  object.add(torso, pelvis, head, ...limbs.flatMap((set) => Object.values(set)))

  return {
    object,
    apply: (joints: Joints) => {
      pelvis.position.copy(joints.pelvis)
      placeBetween(
        torso,
        joints.pelvis.clone().addScaledVector(joints.along, 0.08),
        joints.neck.clone().addScaledVector(joints.along, -0.06),
      )
      head.position.copy(joints.head)
      head.rotation.set(...joints.headRotation)
      joints.sides.forEach((side, index) => {
        const parts = limbs[index]
        placeBetween(parts.shin, side.ankle, side.knee)
        placeBetween(parts.thigh, side.knee, side.hip)
        placeBetween(parts.upperArm, side.shoulder, side.elbow)
        placeBetween(parts.forearm, side.elbow, side.hand)
        parts.hand.position.copy(side.hand)
      })
      return { ...joints, sides: [withGrip(joints.sides[0]), withGrip(joints.sides[1])] }
    },
  }
}
