/**
 * Corps du skieur à partir d'un mannequin GLB riggé au standard Mixamo (ici « X Bot », distribué
 * avec les exemples de three.js). Ses animations ne sont pas utilisées : chaque os est orienté à
 * chaque image vers l'articulation suivante calculée par le squelette.
 */
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { POLE_DIRECTION, type Joints } from './skeleton'
import { SKIER_COLORS, createHeadGear, type LimbPoints, type SkierBody } from './skierParts'

export const SKIER_MODEL_URL = '/models/xbot.glb'

const BONE_PREFIX = 'mixamorig'
/** Le mannequin regarde vers +z ; le skieur avance vers +x. */
const FACING = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2)
const UP = new THREE.Vector3(0, 1, 0)
const LATERAL = new THREE.Vector3(0, 0, 1)
/** Le bassin ne suit qu'en partie l'inclinaison du buste : le reste est pris par la colonne. */
const PELVIS_FOLLOW = 0.6
/** Position du casque par rapport à la base du crâne, en mètres : vers le haut, vers l'avant. */
const HELMET_OFFSET = { up: 0.095, forward: 0.02 }
const HELMET_SCALE = 1.14
/** Côté de chaque demi-corps, dans l'ordre de `Rig.sides` : gauche (z négatif) puis droite. */
const SIDE_SIGNS = [-1, 1] as const

/** Doigts refermés sur la poignée du bâton : flexion de chaque phalange, en radians. */
const FINGER_CURL = 1.25
const THUMB_CURL = 0.6
const FINGERS = ['Index', 'Middle', 'Ring', 'Pinky'] as const
/** Centre du poing par rapport au poignet : vers les doigts, puis vers la paume, en mètres. */
const GRIP_OFFSET = { fingers: 0.085, palm: 0.03 }
/** Dans la pose de repos du mannequin (bras en croix), les paumes regardent le sol. */
const PALM_AT_REST = new THREE.Vector3(0, -1, 0)

/** Zone de vêtement de chaque os, pour colorer le maillage par sommet. */
function boneColor(name: string): number {
  if (/Foot|Toe/.test(name)) return SKIER_COLORS.boot
  if (/Hand/.test(name)) return SKIER_COLORS.glove
  if (/Leg|Hips/.test(name)) return SKIER_COLORS.pants
  if (/Head|Eye/.test(name)) return SKIER_COLORS.skin
  return SKIER_COLORS.jacket
}

/** Habille le mannequin : chaque sommet prend la couleur des os qui le déforment. */
function dress(mesh: THREE.SkinnedMesh): void {
  const { geometry, skeleton } = mesh
  const indices = geometry.getAttribute('skinIndex')
  const weights = geometry.getAttribute('skinWeight')
  const palette = skeleton.bones.map((bone) => new THREE.Color(boneColor(bone.name)))
  const colors = new Float32Array(indices.count * 3)
  const blended = new THREE.Color()

  for (let vertex = 0; vertex < indices.count; vertex++) {
    blended.setRGB(0, 0, 0)
    for (let slot = 0; slot < 4; slot++) {
      const weight = weights.getComponent(vertex, slot)
      const color = palette[indices.getComponent(vertex, slot)]
      if (weight > 0 && color) {
        blended.r += color.r * weight
        blended.g += color.g * weight
        blended.b += color.b * weight
      }
    }
    blended.toArray(colors, vertex * 3)
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  mesh.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 })
  // Pas d'ombre propre : les vêtements, le casque et les skis qui le recouvrent en projettent déjà une,
  // et le mannequin n'aurait fait qu'être dessiné une seconde fois pour rien.
  // Le maillage suit ses os bien au-delà de sa boîte englobante de repos.
  mesh.frustumCulled = false
}

/** Os orienté vers son os enfant : on mémorise sa pose de repos et la direction de l'enfant. */
interface AimedBone {
  readonly bone: THREE.Object3D
  readonly rest: THREE.Quaternion
  readonly toChild: THREE.Vector3
  /** Longueur de l'os dans son propre repère (centimètres pour ce mannequin). */
  readonly length: number
}

interface Rig {
  readonly hips: AimedBone
  readonly hipsRestPosition: THREE.Vector3
  readonly spine: readonly AimedBone[]
  readonly chest: AimedBone
  readonly neck: AimedBone
  readonly head: THREE.Object3D
  /** Dans l'ordre de `SIDES` : gauche du mannequin (z négatif) puis droite. */
  readonly sides: readonly {
    readonly thigh: AimedBone
    readonly shin: AimedBone
    readonly foot: THREE.Object3D
    readonly upperArm: AimedBone
    readonly forearm: AimedBone
    readonly hand: THREE.Object3D
    readonly grip: HandGrip
  }[]
}

/** Repère de la main au repos, dans le repère de son os : de quoi l'orienter pour tenir le bâton. */
interface HandGrip {
  /** Colonnes : vers les doigts, le long des jointures (du petit doigt vers l'index), vers la paume. */
  readonly restBasis: THREE.Matrix4
}

/**
 * Referme les doigts une fois pour toutes, comme sur une poignée, et relève le repère de la main.
 * À appeler tant que le mannequin est dans sa pose de repos.
 */
function closeHand(model: THREE.Object3D, prefix: 'Left' | 'Right'): HandGrip {
  const bone = (name: string): THREE.Object3D => {
    const found = model.getObjectByName(`${BONE_PREFIX}${prefix}Hand${name}`)
    if (!found) throw new Error(`os introuvable dans le modèle : ${prefix}Hand${name}`)
    return found
  }
  model.updateMatrixWorld(true)
  const hand = bone('')
  const position = (object: THREE.Object3D): THREE.Vector3 => object.getWorldPosition(new THREE.Vector3())
  const fingers = position(bone('Middle1')).sub(position(hand)).normalize()
  const knuckles = position(bone('Index1')).sub(position(bone('Pinky1')))
  knuckles.addScaledVector(fingers, -knuckles.dot(fingers)).normalize()
  const palm = new THREE.Vector3().crossVectors(fingers, knuckles)
  // Selon la main, ce produit pointe vers la paume ou vers le dos : on garde le côté paume.
  if (palm.dot(PALM_AT_REST) < 0) palm.negate()
  const toHand = hand.getWorldQuaternion(new THREE.Quaternion()).invert()
  const restBasis = new THREE.Matrix4().makeBasis(
    fingers.clone().applyQuaternion(toHand),
    knuckles.clone().applyQuaternion(toHand),
    palm.clone().applyQuaternion(toHand),
  )

  /** Plie une phalange vers la paume, autour de l'axe perpendiculaire au doigt. */
  const curl = (name: string, child: string, angle: number): void => {
    const segment = bone(name)
    const along = position(bone(child)).sub(position(segment)).normalize()
    const axis = new THREE.Vector3().crossVectors(along, palm).normalize()
    const world = segment.getWorldQuaternion(new THREE.Quaternion())
    const turned = new THREE.Quaternion().setFromAxisAngle(axis, angle).multiply(world)
    setWorldQuaternion(segment, turned)
    model.updateMatrixWorld(true)
  }
  FINGERS.forEach((finger) => {
    for (const joint of [1, 2, 3]) curl(`${finger}${joint}`, `${finger}${joint + 1}`, FINGER_CURL)
  })
  for (const joint of [2, 3]) curl(`Thumb${joint}`, `Thumb${joint + 1}`, THUMB_CURL)
  return { restBasis }
}

function findRig(model: THREE.Object3D, grips: Readonly<Record<'Left' | 'Right', HandGrip>>): Rig {
  const bone = (name: string): THREE.Object3D => {
    const found = model.getObjectByName(`${BONE_PREFIX}${name}`)
    if (!found) throw new Error(`os introuvable dans le modèle : ${name}`)
    return found
  }
  const aimed = (name: string, child: string): AimedBone => ({
    bone: bone(name),
    rest: bone(name).quaternion.clone(),
    toChild: bone(child).position.clone().normalize(),
    length: bone(child).position.length(),
  })
  const side = (prefix: 'Left' | 'Right') => ({
    thigh: aimed(`${prefix}UpLeg`, `${prefix}Leg`),
    shin: aimed(`${prefix}Leg`, `${prefix}Foot`),
    foot: bone(`${prefix}Foot`),
    upperArm: aimed(`${prefix}Arm`, `${prefix}ForeArm`),
    forearm: aimed(`${prefix}ForeArm`, `${prefix}Hand`),
    hand: bone(`${prefix}Hand`),
    grip: grips[prefix],
  })
  return {
    hips: aimed('Hips', 'Spine'),
    hipsRestPosition: bone('Hips').position.clone(),
    spine: [aimed('Spine', 'Spine1'), aimed('Spine1', 'Spine2')],
    chest: aimed('Spine2', 'Neck'),
    neck: aimed('Neck', 'Head'),
    head: bone('Head'),
    sides: [side('Left'), side('Right')],
  }
}

function parentOf(object: THREE.Object3D): THREE.Object3D {
  if (!object.parent) throw new Error(`os sans parent : ${object.name}`)
  return object.parent
}

/** Donne à un os une orientation exprimée dans le monde. */
function setWorldQuaternion(bone: THREE.Object3D, world: THREE.Quaternion): void {
  const parent = parentOf(bone).getWorldQuaternion(new THREE.Quaternion())
  bone.quaternion.copy(parent.invert().multiply(world))
}

/**
 * Tourne un os, par le plus court chemin depuis sa pose de repos, pour qu'il pointe vers son
 * enfant dans la direction voulue. `roll` ajoute une rotation autour de cette direction.
 */
function aim(target: AimedBone, direction: THREE.Vector3, roll = 0): void {
  const restWorld = parentOf(target.bone).getWorldQuaternion(new THREE.Quaternion()).multiply(target.rest)
  const current = target.toChild.clone().applyQuaternion(restWorld)
  const world = new THREE.Quaternion().setFromUnitVectors(current, direction).multiply(restWorld)
  if (roll !== 0) world.premultiply(new THREE.Quaternion().setFromAxisAngle(direction, roll))
  setWorldQuaternion(target.bone, world)
}

type ArmBones = Pick<Rig['sides'][number], 'upperArm' | 'forearm'>

/**
 * Tend le bras du mannequin vers une cible, avec ses vraies longueurs d'os et depuis sa vraie
 * épaule : la main arrive exactement sur le ski pendant un grab. Une cible trop lointaine est
 * visée bras tendu.
 */
function reach(arm: ArmBones, target: THREE.Vector3, side: number, frameQuaternion: THREE.Quaternion): void {
  const scale = arm.upperArm.bone.getWorldScale(new THREE.Vector3()).x
  const upper = arm.upperArm.length * scale
  const lower = arm.forearm.length * scale
  const shoulder = arm.upperArm.bone.getWorldPosition(new THREE.Vector3())
  const toTarget = target.clone().sub(shoulder)
  const distance = THREE.MathUtils.clamp(toTarget.length(), 0.05, upper + lower - 0.005)
  const direction = toTarget.normalize()

  const along = (upper ** 2 - lower ** 2 + distance ** 2) / (2 * distance)
  const offset = Math.sqrt(Math.max(0, upper ** 2 - along ** 2))
  // Le coude part vers l'extérieur et un peu vers l'arrière, comme sur le squelette.
  const outward = new THREE.Vector3(-0.5, -0.15, side).applyQuaternion(frameQuaternion)
  outward.addScaledVector(direction, -outward.dot(direction)).normalize()
  const elbow = shoulder.clone().addScaledVector(direction, along).addScaledVector(outward, offset)
  const hand = shoulder.clone().addScaledVector(direction, distance)

  aim(arm.upperArm, elbow.clone().sub(shoulder).normalize())
  aim(arm.forearm, hand.sub(elbow).normalize())
}

/** Direction du bâton, de la main vers la pointe, dans le monde. */
function poleDirection(side: number, frameQuaternion: THREE.Quaternion): THREE.Vector3 {
  const [back, down, out] = POLE_DIRECTION
  return new THREE.Vector3(back, down, side * out).normalize().applyQuaternion(frameQuaternion)
}

type HandBones = Pick<Rig['sides'][number], 'forearm' | 'hand' | 'grip'>

/**
 * Tourne la main pour qu'elle tienne le bâton : le manche passe le long des jointures et ressort du
 * côté du petit doigt, les doigts restent dans le prolongement de l'avant-bras autant que possible.
 */
function holdPole(side: HandBones, pole: THREE.Vector3): void {
  const wrist = side.hand.getWorldPosition(new THREE.Vector3())
  const knuckles = pole.clone().negate()
  const fingers = wrist.clone().sub(side.forearm.bone.getWorldPosition(new THREE.Vector3()))
  fingers.addScaledVector(knuckles, -fingers.dot(knuckles))
  // Avant-bras dans l'axe du bâton : n'importe quelle direction perpendiculaire convient.
  if (fingers.lengthSq() < 1e-6) fingers.set(knuckles.y, -knuckles.x, 0)
  fingers.normalize()
  const wanted = new THREE.Matrix4().makeBasis(fingers, knuckles, new THREE.Vector3().crossVectors(fingers, knuckles))
  // Le repère de repos n'est pas forcément direct : on le compare à un repère de même sens.
  const rest = side.grip.restBasis
  if (rest.determinant() < 0) wanted.makeBasis(fingers, knuckles, new THREE.Vector3().crossVectors(knuckles, fingers))
  const world = new THREE.Quaternion().setFromRotationMatrix(wanted.multiply(rest.clone().transpose()))
  setWorldQuaternion(side.hand, world)
}

/** Centre du poing, là où passe le manche du bâton, dans le monde. */
function gripCenter(side: HandBones): THREE.Vector3 {
  const orientation = side.hand.getWorldQuaternion(new THREE.Quaternion())
  const axis = (column: number): THREE.Vector3 =>
    new THREE.Vector3().setFromMatrixColumn(side.grip.restBasis, column).applyQuaternion(orientation)
  return side.hand
    .getWorldPosition(new THREE.Vector3())
    .addScaledVector(axis(0), GRIP_OFFSET.fingers)
    .addScaledVector(axis(2), GRIP_OFFSET.palm)
}

function createModelBody(model: THREE.Object3D): SkierBody {
  // Les doigts se referment avant toute rotation du mannequin, pendant qu'il est dans sa pose de repos.
  const rig = findRig(model, { Left: closeHand(model, 'Left'), Right: closeHand(model, 'Right') })
  model.quaternion.copy(FACING)
  model.traverse((object) => {
    if (object instanceof THREE.SkinnedMesh) dress(object)
  })

  // Le casque est accroché à l'os de la tête, dont le repère est en centimètres et tourné vers +z.
  const helmet = createHeadGear(false)
  const boneScale = rig.head.getWorldScale(new THREE.Vector3()).x
  helmet.scale.setScalar(HELMET_SCALE / boneScale)
  helmet.position.set(0, HELMET_OFFSET.up / boneScale, HELMET_OFFSET.forward / boneScale)
  helmet.quaternion.copy(FACING).invert()
  rig.head.add(helmet)

  return {
    object: model,
    apply: (joints: Joints, frame: THREE.Object3D) => {
      const frameQuaternion = frame.getWorldQuaternion(new THREE.Quaternion())
      const direction = (from: THREE.Vector3, to: THREE.Vector3): THREE.Vector3 =>
        to.clone().sub(from).normalize().applyQuaternion(frameQuaternion)
      const along = joints.along.clone().applyQuaternion(frameQuaternion)
      rig.hips.bone.position.copy(rig.hipsRestPosition)
      aim(rig.hips, UP.clone().lerp(joints.along, PELVIS_FOLLOW).normalize().applyQuaternion(frameQuaternion))
      rig.spine.forEach((bone) => aim(bone, along))
      aim(rig.chest, along, joints.twist)
      aim(rig.neck, direction(joints.neck, joints.head))
      setWorldQuaternion(
        rig.head,
        frameQuaternion
          .clone()
          .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(...joints.headRotation)))
          .multiply(FACING),
      )

      rig.sides.forEach((side, index) => {
        const target = joints.sides[index]
        aim(side.thigh, direction(target.hip, target.knee))
        aim(side.shin, direction(target.knee, target.ankle))
        const yaw = new THREE.Quaternion().setFromAxisAngle(UP, target.skiYaw)
        // Le pied reste à plat dans la chaussure : il tourne avec le ski quand ils se croisent, et bascule avec lui.
        const pitch = new THREE.Quaternion().setFromAxisAngle(LATERAL, target.skiPitch)
        setWorldQuaternion(side.foot, frameQuaternion.clone().multiply(yaw).multiply(pitch).multiply(FACING))
        reach(side, frame.localToWorld(target.handTarget.clone()), SIDE_SIGNS[index], frameQuaternion)
        holdPole(side, poleDirection(SIDE_SIGNS[index], frameQuaternion))
      })

      // Les proportions du mannequin diffèrent un peu du squelette : on recale le bassin pour que
      // ses chevilles tombent exactement dans les chaussures.
      const ankles = rig.sides
        .map((side) => side.foot.getWorldPosition(new THREE.Vector3()))
        .reduce((sum, position) => sum.add(position), new THREE.Vector3())
        .multiplyScalar(1 / rig.sides.length)
      const wanted = frame.localToWorld(joints.sides[0].ankle.clone().lerp(joints.sides[1].ankle, 0.5))
      const hipsWorld = rig.hips.bone.getWorldPosition(new THREE.Vector3()).add(wanted.sub(ankles))
      rig.hips.bone.position.copy(parentOf(rig.hips.bone).worldToLocal(hipsWorld))

      const local = (bone: THREE.Object3D): THREE.Vector3 =>
        frame.worldToLocal(bone.getWorldPosition(new THREE.Vector3()))
      const limb = (side: Rig['sides'][number]): LimbPoints => ({
        shoulder: local(side.upperArm.bone),
        elbow: local(side.forearm.bone),
        hand: local(side.hand),
        grip: frame.worldToLocal(gripCenter(side)),
        hip: local(side.thigh.bone),
        knee: local(side.shin.bone),
        ankle: local(side.foot),
      })
      const sides = [limb(rig.sides[0]), limb(rig.sides[1])] as const
      return { pelvis: sides[0].hip.clone().lerp(sides[1].hip, 0.5), neck: local(rig.neck.bone), sides }
    },
  }
}

/** Charge le mannequin et prépare son pilotage. Rejette si le fichier ou un os manque. */
export async function loadModelBody(url: string = SKIER_MODEL_URL): Promise<SkierBody> {
  const gltf = await new GLTFLoader().loadAsync(url)
  return createModelBody(gltf.scene)
}
