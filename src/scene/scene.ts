import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { HORIZON_COLOR, createSky } from './backdrop'
import { DEFAULT_FOV } from './cameraRig'
import { isShared } from './sharedAssets'
import { SUN_OFFSET } from './sun'

/** Brume de distance : nulle autour du skieur, elle voile peu à peu les flancs de la vallée et leur donne de la profondeur. */
const FOG_NEAR = 110
const FOG_FAR = 2100
const CAMERA_FAR = 9000
/** Au-delà, un écran Retina fait payer quatre fois les pixels pour un gain de netteté à peine visible sur de la neige. */
const MAX_PIXEL_RATIO = 1.5
const EXPOSURE = 0.92
/** Demi-côté de la zone ombrée qui accompagne le skieur, en mètres. */
const SHADOW_HALF_SIZE = 70
const SHADOW_MAP_SIZE = 2048
const SHADOW_SOFTNESS = 2.5

export interface Stage {
  readonly scene: THREE.Scene
  readonly camera: THREE.PerspectiveCamera
  readonly renderer: THREE.WebGLRenderer
  readonly controls: OrbitControls
  readonly sun: THREE.DirectionalLight
  readonly sky: THREE.Mesh
}

export function createStage(canvas: HTMLCanvasElement): Stage {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = EXPOSURE

  const scene = new THREE.Scene()
  scene.fog = new THREE.Fog(HORIZON_COLOR, FOG_NEAR, FOG_FAR)
  const sky = createSky(SUN_OFFSET)
  scene.add(sky)

  const camera = new THREE.PerspectiveCamera(DEFAULT_FOV, 1, 0.5, CAMERA_FAR)

  scene.add(new THREE.HemisphereLight(0xcfe2ff, 0x7fa3d0, 0.8))
  const sun = new THREE.DirectionalLight(0xfff0d8, 2.5)
  sun.castShadow = true
  sun.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE)
  sun.shadow.radius = SHADOW_SOFTNESS
  sun.shadow.camera.left = -SHADOW_HALF_SIZE
  sun.shadow.camera.right = SHADOW_HALF_SIZE
  sun.shadow.camera.top = SHADOW_HALF_SIZE
  sun.shadow.camera.bottom = -SHADOW_HALF_SIZE
  sun.shadow.camera.far = 400
  sun.shadow.bias = -0.0004
  sun.shadow.normalBias = 0.06
  scene.add(sun, sun.target)

  const controls = new OrbitControls(camera, canvas)
  controls.enableDamping = true
  controls.maxPolarAngle = Math.PI * 0.495
  controls.maxDistance = 700

  return { scene, camera, renderer, controls, sun, sky }
}

/** Part maximale de la hauteur d'écran que le bandeau bas peut faire remonter dans le cadrage. */
const MAX_INSET_RATIO = 0.5
let bottomInset = 0

function applyViewport(stage: Stage): void {
  const width = window.innerWidth
  const height = window.innerHeight
  stage.camera.aspect = width / height
  // Décale l'image vers le haut pour que le sujet reste centré dans la zone libre au-dessus du bandeau.
  stage.camera.setViewOffset(width, height, 0, bottomInset / 2, width, height)
}

export function resizeStage(stage: Stage): void {
  stage.renderer.setSize(window.innerWidth, window.innerHeight, false)
  applyViewport(stage)
}

/** Indique la hauteur, en pixels, masquée par le bandeau en bas de l'écran. */
export function setBottomInset(stage: Stage, inset: number): void {
  const clamped = Math.min(Math.max(0, inset), window.innerHeight * MAX_INSET_RATIO)
  if (clamped === bottomInset) return
  bottomInset = clamped
  applyViewport(stage)
}

/** Garde le soleil et sa zone d'ombre centrés sur le skieur, et le ciel centré sur la caméra. */
export function trackLight(stage: Stage, focus: THREE.Vector3): void {
  stage.sun.position.copy(focus).add(SUN_OFFSET)
  stage.sun.target.position.copy(focus)
  stage.sky.position.copy(stage.camera.position)
}

/** Recule la caméra pour voir toute la ligne de profil. */
export function frameOverview(stage: Stage, minX: number, maxX: number, minY: number, maxY: number): void {
  const center = new THREE.Vector3((minX + maxX) / 2, (minY + maxY) / 2, 0)
  const distance = Math.max(maxX - minX, maxY - minY) * 0.75
  stage.controls.target.copy(center)
  stage.camera.position.set(center.x, center.y + distance * 0.25, distance)
}

/** Libère un matériau et ses textures, sauf ce qui est partagé d'une reconstruction à l'autre. */
function disposeMaterial(material: THREE.Material): void {
  if (isShared(material)) return
  Object.values(material).forEach((value) => {
    if (value instanceof THREE.Texture && !isShared(value)) value.dispose()
  })
  material.dispose()
}

/** Libère la géométrie, les matériaux et les textures d'un groupe retiré de la scène, hors ressources partagées. */
export function disposeGroup(group: THREE.Object3D): void {
  group.traverse((object) => {
    if (!(object instanceof THREE.Mesh || object instanceof THREE.Line)) return
    if (!isShared(object.geometry)) object.geometry.dispose()
    if (object instanceof THREE.InstancedMesh) object.dispose()
    const materials: THREE.Material[] = Array.isArray(object.material) ? object.material : [object.material]
    materials.forEach(disposeMaterial)
  })
}
