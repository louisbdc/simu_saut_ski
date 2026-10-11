import * as THREE from 'three'
import { startApp, type SceneFrame } from './app/shell'
import { DEFAULT_SCENARIO_ID, buildScenario } from './physics/presets'
import { simulate } from './physics/simulate'
import { solveInrunLength, tuneLine, withKicker, type InrunSolution } from './physics/solver'
import type { LineConfig, SimulationResult } from './physics/types'
import { buildFarSurroundings, buildSurroundings } from './scene/backdrop'
import { createCameraRig, type CameraMode } from './scene/cameraRig'
import { buildCrashScene, type CrashScene } from './scene/crash'
import { createOcclusionCuller, type OcclusionCuller } from './scene/occlusion'
import { PARTS, type RagdollPoints, type RagdollStart } from './scene/ragdoll'
import { barDownAt, chairTravelAt, epilogueAt, gateOpenAt } from './scene/epilogue'
import { buildLiftRide, liftLabel, liftSample, seatedPosture, type LiftRide } from './scene/liftRide'
import { advance, loopWithin, sampleAt, type LoopTiming, type PlaybackState, type TimeWindow } from './scene/playback'
import { revealUpTo } from './scene/reveal'
import {
  createStage,
  disposeGroup,
  frameOverview,
  resizeStage,
  setBottomInset,
  trackLight,
} from './scene/scene'
import { createSkier, type JumpContext } from './scene/skier'
import { createIdleGate } from './scene/idleGate'
import { createSnowSpray } from './scene/snowSpray'
import { planJump, type TrickPlan } from './scene/flightPlan'
import { getTrick, stancesAlong } from './scene/tricks'
import { buildTerrainGroup } from './scene/terrainMesh'
import { buildTrajectoryGroup } from './scene/trajectory'
import { createSpeedChart } from './ui/chart'
import { CRASH_LABEL, createLive, query, renderError, renderResults, renderSummary, trickName } from './ui/hud'
import { createPanel } from './ui/panel'

const SOLVER_DELAY_MS = 200
/** Le décor lointain n'est refait qu'une fois le curseur immobile depuis ce délai. */
const FAR_DECOR_DELAY_MS = 180
/** Écart d'orientation à la réception au-delà duquel une figure pas bouclée fait tomber, en radians. */
const CRASH_ANGLE = 0.6
/** Écart entre les deux poses qui mesurent la vitesse du corps juste avant l'impact, en secondes. */
const IMPACT_PROBE_SECONDS = 1 / 120
const MAX_FRAME_SECONDS = 0.1
/** Après une chute, le skieur reste au sol ce temps-là avant que la descente ne reparte, sans télésiège. */
const CRASH_HOLD_SECONDS = 2.5
/** Flocons soulevés à chaque réception. */
const LANDING_PUFF = 70
/** Hauteur du buste au-dessus des skis : c'est lui que la caméra doit toujours voir. */
const SUBJECT_HEIGHT = 1
/** Délai pendant lequel on continue de dessiner après une action, et au démarrage le temps de charger le mannequin. */
const WAKE_MS = 600
const STARTUP_WAKE_MS = 8000
const TIMELINE_STEPS = 1000
/** Marge du bandeau bas par rapport au bord de l'écran, en pixels. */
const DOCK_MARGIN = 14
const CAMERA_KEYS: Readonly<Record<string, CameraMode>> = { '1': 'side', '2': 'chase', '3': 'tv', '4': 'free' }

const resultsElement = query<HTMLElement>('#results')
const summaryElement = query<HTMLElement>('#summary')
const dock = query<HTMLElement>('#dock')
const playButton = query<HTMLButtonElement>('#play')
const rateSelect = query<HTMLSelectElement>('#rate')
const timeline = query<HTMLInputElement>('#timeline')
const toggleResults = query<HTMLButtonElement>('#toggle-results')

const stage = createStage(query<HTMLCanvasElement>('#scene'))
const rig = createCameraRig(stage.camera, stage.controls)
const skier = createSkier()
stage.scene.add(skier.object, skier.looseSkis)
const spray = createSnowSpray()
stage.scene.add(spray.object)
const updateLive = createLive(query<HTMLElement>('#live'))
const chart = createSpeedChart(query<HTMLCanvasElement>('#chart'))

interface SceneGroups {
  readonly terrain: THREE.Group
  readonly trajectory: THREE.Group
  readonly surroundings: THREE.Group
  readonly lift: THREE.Group
}

const firstScenario = buildScenario(DEFAULT_SCENARIO_ID)
let config: LineConfig = tuneLine(firstScenario.config)
let result: SimulationResult = simulate(config)
let plans: readonly TrickPlan[] = []
/** Sens de glisse avant chaque bosse, puis après la dernière : `true` = en switch. */
let stances: readonly boolean[] = []
/** Déroulé de la chute du parcours affiché, s'il y en a une. */
let crashScene: CrashScene | null = null
/** Bosse dont la figure ratée a été prise en compte dans la simulation affichée. */
let appliedFailure: number | undefined
let solutions: readonly InrunSolution[] | null = null
let playback: PlaybackState = { time: 0, playing: true, rate: Number(rateSelect.value) }
let groups: SceneGroups | null = null
/** Cache les oriflammes, l'arche et les sapins qui passent entre la caméra et le skieur. */
let culler: OcclusionCuller | null = null
/** Décor lointain : refait à part, seulement quand un réglage est stabilisé. */
let farDecor: THREE.Group | null = null
let farDecorTimer: number | undefined
/** Télésiège de la piste affichée et remontée qui suit la descente. */
let liftRide: LiftRide | null = null
/** Le skieur était-il en l'air à l'image précédente ? Sert à repérer l'instant d'une réception. */
let wasAirborne = false
/** Réglage en attente : appliqué une seule fois par image, même si le curseur a bougé dix fois entre-temps. */
let pendingConfig: LineConfig | null = null
/** Hauteur du bandeau bas, relue seulement quand il change de taille. */
let dockHeight = dock.offsetHeight
/** Hauteur masquée en bas par le bandeau d'un autre écran que la piste libre (les tutos). */
let screenInset = 0
/** Piste libre mise de côté pendant qu'un autre écran montre sa propre piste. */
let sandboxConfig: LineConfig | null = null
/** Tranche du parcours sur laquelle la lecture tourne en boucle ; `null` : la boucle normale. */
let loopWindow: TimeWindow | null = null
const frameListeners: ((time: number) => void)[] = []
/** Écran qui reprend la main sur la caméra ou pose ses repères pendant la descente (les tutos). */
let frameHook: ((frame: SceneFrame) => void) | null = null
const idle = createIdleGate(WAKE_MS)
const wake = (): void => idle.wake(performance.now())
let solverTimer: number | undefined

function buildGroups(simulated: SimulationResult, ride: LiftRide): SceneGroups {
  return {
    terrain: buildTerrainGroup(simulated.terrain),
    trajectory: buildTrajectoryGroup(simulated),
    surroundings: buildSurroundings(simulated.terrain, ride.line),
    lift: ride.chairlift.object,
  }
}

/**
 * Durées de la boucle de lecture. Après une descente réussie, le skieur remonte en télésiège ;
 * après une chute, il reste au sol un instant puis la descente repart.
 */
function loopTiming(): LoopTiming {
  if (!liftRide || crashScene) return { descent: result.duration, total: result.duration + CRASH_HOLD_SECONDS }
  return { descent: liftRide.plan.handover, total: liftRide.plan.handover + liftRide.plan.duration }
}

function replaceGroups(next: SceneGroups): void {
  Object.values(groups ?? {}).forEach((group) => {
    stage.scene.remove(group)
    disposeGroup(group)
  })
  stage.scene.add(...Object.values(next))
  groups = next
  culler = createOcclusionCuller([next.surroundings])
}

/** Refait le décor lointain pour la piste affichée. */
function rebuildFarDecor(): void {
  window.clearTimeout(farDecorTimer)
  if (!liftRide) return
  const next = buildFarSurroundings(result.terrain, liftRide.line)
  if (farDecor) {
    stage.scene.remove(farDecor)
    disposeGroup(farDecor)
  }
  stage.scene.add(next)
  farDecor = next
  wake()
}

/** Pendant qu'un curseur bouge, le décor lointain attend : il n'est refait qu'une fois le geste terminé. */
function scheduleFarDecor(): void {
  window.clearTimeout(farDecorTimer)
  farDecorTimer = window.setTimeout(rebuildFarDecor, FAR_DECOR_DELAY_MS)
}

/** Sens de glisse avant chaque bosse, puis après la dernière. */
function stancesOf(line: LineConfig): boolean[] {
  return stancesAlong(
    line.kickers.map((_, index) => getTrick(line.tricks[index])),
    line.startSwitch,
  )
}

/** Prépare la figure de chaque bosse : élan à prendre au kick et rotation au fil du vol. */
function planTricks(line: LineConfig, simulated: SimulationResult, sides: readonly boolean[]): TrickPlan[] {
  return simulated.reports.map((report, index) =>
    planJump(getTrick(line.tricks[index]), {
      airTime: report.airTime,
      takeoffTilt: report.takeoffAngle,
      landingTilt: report.landingAngle,
      switchBefore: sides[index] === true,
      switchAfter: sides[index + 1] === true,
    }),
  )
}

function showResults(): void {
  renderSummary(summaryElement, result, solutions, plans, stances, crashScene?.ragdoll ?? undefined)
  renderResults(resultsElement, result, solutions, plans, stances)
}

/** Saut à animer autour de l'instant affiché : celui de la bosse où se trouve le skieur. */
function jumpAt(kicker: number, time: number): JumpContext | null {
  const report = result.reports[kicker]
  const plan = plans[kicker]
  if (!report?.reached || !plan) return null
  return {
    plan,
    timeFromTakeoff: time - report.takeoffTime,
    switchBefore: stances[kicker] === true,
    switchAfter: stances[kicker + 1] === true,
  }
}

/** Le skieur glisse-t-il en switch à cet instant ? En vol, il garde le sens de son décollage. */
function ridesSwitch(kicker: number, jump: JumpContext | null): boolean {
  if (!jump) return stances[kicker] === true
  return jump.timeFromTakeoff < jump.plan.airTime ? jump.switchBefore : jump.switchAfter
}

/**
 * État du skieur à l'instant où il touche la neige, pour lancer la chute articulée : on pose le
 * skieur à deux instants très proches juste avant l'impact, et la différence donne la vitesse de
 * chaque articulation, rotation de la figure et mouvements des membres compris.
 */
function ragdollStart(): RagdollStart | undefined {
  const { crash } = result
  if (!crash) return undefined
  const measure = (time: number): RagdollPoints | null => {
    const sample = sampleAt(result.samples, time)
    const jump = jumpAt(sample.kicker, time)
    skier.pose(sample, jump, ridesSwitch(sample.kicker, jump), null, 0)
    return skier.worldPoints()
  }
  const before = measure(crash.time - 2 * IMPACT_PROBE_SECONDS)
  const positions = measure(crash.time - IMPACT_PROBE_SECONDS)
  if (!before || !positions) return undefined
  const velocities = Object.fromEntries(
    PARTS.map((part) => [part, positions[part].clone().sub(before[part]).multiplyScalar(1 / IMPACT_PROBE_SECONDS)]),
  ) as RagdollPoints
  return { positions, velocities }
}

/**
 * Première bosse où la figure n'est pas bouclée au point de faire tomber : le skieur arrive à la
 * réception avec plus de `CRASH_ANGLE` d'écart par rapport à ses skis dans la pente.
 */
function failedKickerOf(simulated: SimulationResult, tricks: readonly TrickPlan[]): number | undefined {
  const failed = simulated.reports.findIndex((report, index) => {
    const plan = tricks[index]
    if (!report.reached || !plan || plan.completed) return false
    return plan.landingResidual.angleTo(new THREE.Quaternion()) > CRASH_ANGLE
  })
  return failed === -1 ? undefined : failed
}

/**
 * Le calcul inverse et la planification des rotations coûtent cher : on attend la fin du geste sur
 * le curseur.
 */
function scheduleSolver(): void {
  window.clearTimeout(solverTimer)
  solverTimer = window.setTimeout(() => {
    try {
      plans = planTricks(config, result, stances)
      // Les plans à jour peuvent révéler une figure ratée (ou rattrapée) : on resimule alors la ligne.
      if (failedKickerOf(result, plans) !== appliedFailure) {
        applyConfig(config)
        return
      }
      solutions = config.kickers.map((_, index) => solveInrunLength(config, index))
      showResults()
    } catch (error: unknown) {
      renderError(summaryElement, error)
    }
  }, SOLVER_DELAY_MS)
}

/**
 * Applique une nouvelle configuration sans toucher à la lecture ni à la caméra :
 * on règle sa bosse en gardant la vue et l'instant où l'on se trouve.
 */
function applyConfig(next: LineConfig, settled = true): void {
  try {
    const clean = simulate(next)
    const nextStances = stancesOf(next)
    // Planifier les rotations est coûteux : pendant qu'on fait glisser un curseur de géométrie,
    // on garde les plans précédents et on les recalcule avec le calcul inverse, une fois le geste fini.
    const sameTricks =
      plans.length === next.kickers.length &&
      next.startSwitch === config.startSwitch &&
      plans.every((plan, index) => plan.trick.id === getTrick(next.tricks[index]).id)
    const nextPlans = sameTricks ? plans : planTricks(next, clean, nextStances)
    // Une figure pas bouclée fait tomber à la réception : la suite du parcours est une glissade.
    const failure = failedKickerOf(clean, nextPlans)
    const simulated = failure === undefined ? clean : simulate(next, undefined, { failedKicker: failure })
    const nextRide = buildLiftRide(simulated, nextStances[nextStances.length - 1] === true)
    const nextGroups = buildGroups(simulated, nextRide)
    appliedFailure = failure
    config = next
    result = simulated
    liftRide = nextRide
    plans = nextPlans
    stances = nextStances
    crashScene = buildCrashScene(result, ragdollStart())
    solutions = null
    replaceGroups(nextGroups)
    if (settled) rebuildFarDecor()
    else scheduleFarDecor()
    chart.setResult(result)
    playback = { ...playback, time: Math.min(playback.time, result.duration) }
    showResults()
    scheduleSolver()
  } catch (error: unknown) {
    renderError(summaryElement, error)
  }
}

/** Applique un réglage automatique et le reporte dans le panneau. */
function applyTuning(tune: (current: LineConfig) => LineConfig): void {
  try {
    const tuned = tune(config)
    panel.setLine({ config: tuned })
    applyConfig(tuned)
  } catch (error: unknown) {
    renderError(summaryElement, error)
  }
}

/** Charge une ligne toute faite, élans déjà réglés, et rejoue le parcours depuis le départ. */
function loadScenario(id: string): void {
  try {
    const scenario = buildScenario(id)
    const tuned = tuneLine(scenario.config)
    panel.setLine({ config: tuned, models: scenario.models, scenario: id })
    applyConfig(tuned)
    restart()
  } catch (error: unknown) {
    renderError(summaryElement, error)
  }
}

const panel = createPanel(
  { config, models: firstScenario.models, scenario: DEFAULT_SCENARIO_ID },
  {
    onChange: (next) => {
      pendingConfig = next
      wake()
    },
    onScenario: loadScenario,
    onTuneAll: () => applyTuning(tuneLine),
    onTuneKicker: (index) =>
      applyTuning((current) =>
        withKicker(current, index, { inrunLength: solveInrunLength(current, index).inrunLength }),
      ),
  },
)

function setCamera(mode: CameraMode): void {
  rig.setMode(mode)
  document
    .querySelectorAll<HTMLButtonElement>('[data-camera]')
    .forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.camera === mode)))
}

function showOverview(): void {
  const { points } = result.terrain
  const ys = points.map((point) => point.y)
  setCamera('free')
  frameOverview(stage, points[0].x, points[points.length - 1].x, Math.min(...ys), Math.max(...ys))
}

function togglePlay(): void {
  playback = { ...playback, playing: !playback.playing }
}

function restart(): void {
  playback = { ...playback, time: 0, playing: true }
}

playButton.addEventListener('click', togglePlay)
query<HTMLButtonElement>('#restart').addEventListener('click', restart)
rateSelect.addEventListener('change', () => {
  playback = { ...playback, rate: Number(rateSelect.value) }
})
timeline.addEventListener('input', () => {
  const time = (Number(timeline.value) / TIMELINE_STEPS) * result.duration
  playback = { ...playback, time, playing: false }
})
// Les boutons de caméra existent sur plusieurs écrans : un seul écouteur pour tous.
document.addEventListener('click', (event) => {
  const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('[data-camera]') : null
  if (button) setCamera(button.dataset.camera as CameraMode)
})
query<HTMLButtonElement>('#overview').addEventListener('click', showOverview)
toggleResults.addEventListener('click', () => {
  const collapsed = dock.classList.toggle('collapsed')
  toggleResults.textContent = collapsed ? 'Afficher le détail des calculs' : 'Masquer le détail des calculs'
})
window.addEventListener('resize', () => {
  resizeStage(stage)
  wake()
})
// Toute action de l'utilisateur peut changer l'image : on redessine un instant, puis on se rendort.
;['pointerdown', 'wheel', 'keydown', 'input', 'change'].forEach((type) =>
  window.addEventListener(type, wake, { passive: true }),
)
new ResizeObserver(() => {
  dockHeight = dock.offsetHeight
  wake()
}).observe(dock)
window.addEventListener('keydown', (event) => {
  const typing = event.target instanceof HTMLElement && event.target.closest('input, select, textarea, button')
  if (typing || event.metaKey || event.ctrlKey || event.altKey) return
  if (event.key === ' ') {
    event.preventDefault()
    togglePlay()
  } else if (event.key.toLowerCase() === 'r') restart()
  else if (CAMERA_KEYS[event.key]) setCamera(CAMERA_KEYS[event.key])
})

let previousFrame = performance.now()

function frame(now: number): void {
  const elapsed = Math.min((now - previousFrame) / 1000, MAX_FRAME_SECONDS)
  previousFrame = now
  if (pendingConfig) {
    // Un réglage en cours de glissement : la piste suit tout de suite, le décor lointain après.
    applyConfig(pendingConfig, false)
    pendingConfig = null
  }
  // En pause, caméra immobile et rien en cours : l'image ne changerait pas, on ne la recalcule pas.
  const moving = playback.playing || idle.isAwake(now) || spray.liveCount() > 0
  if (!moving && !stage.controls.update()) {
    requestAnimationFrame(frame)
    return
  }
  playback = advance(playback, elapsed, loopTiming())
  if (loopWindow) playback = loopWithin(playback, loopWindow)
  setBottomInset(stage, Math.max(dockHeight, screenInset) + DOCK_MARGIN)
  spray.update(playback.playing ? elapsed : 0)

  const sinceHandover = liftRide ? playback.time - liftRide.plan.handover : -1
  liftRide?.chairlift.update({
    travel: chairTravelAt(liftRide.plan, sinceHandover),
    gate: crashScene ? 0 : gateOpenAt(liftRide.plan, sinceHandover),
    bar: crashScene ? 0 : barDownAt(liftRide.plan, sinceHandover),
  })
  if (liftRide && !crashScene && sinceHandover >= 0) frameLift(liftRide, sinceHandover, elapsed)
  else frameDescent(elapsed)

  const playLabel = playback.playing ? 'Pause' : 'Lecture'
  if (playButton.textContent !== playLabel) playButton.textContent = playLabel
  if (document.activeElement !== timeline) {
    const shown = Math.min(playback.time, result.duration) / (result.duration || 1)
    timeline.value = String(Math.round(shown * TIMELINE_STEPS))
  }
  frameListeners.forEach((listener) => listener(playback.time))
  requestAnimationFrame(frame)
}

/** Image de la remontée : le skieur rejoint la gare, s'assoit, monte, puis regagne le départ. */
function frameLift(ride: LiftRide, sinceHandover: number, elapsed: number): void {
  const state = epilogueAt(ride.plan, sinceHandover)
  if (groups) revealUpTo(groups.trajectory, playback.time)
  if (ride.skid) revealUpTo(ride.skid, sinceHandover)
  const sample = liftSample(state, playback.time, result.reports.length - 1)
  const focus = new THREE.Vector3(state.x, state.y + 1, state.z)
  skier.pose(sample, null, false, null, elapsed, {
    posture: seatedPosture(state.seated, state.crouch, state.backward),
    yaw: state.yaw,
    lean: state.lean,
    z: state.z,
  })
  if (playback.playing && state.spray > 0) {
    // La neige part dans le sens de la glisse, arrachée sur toute la longueur des skis mis en travers.
    const puff = {
      origin: new THREE.Vector3(state.x, state.y, state.z),
      direction: new THREE.Vector3(Math.cos(state.heading), 0, -Math.sin(state.heading)),
      along: new THREE.Vector3(Math.cos(state.yaw), 0, -Math.sin(state.yaw)),
      strength: state.spray,
    }
    spray.emit(puff, elapsed)
  }
  wasAirborne = false
  rig.updateScenic({ focus, phase: state.phase, rideProgress: state.rideProgress }, elapsed)
  stage.controls.update()
  culler?.update(stage.camera.position, focus)
  skier.setViewDistance(stage.camera.position.distanceTo(focus))
  trackLight(stage, focus)
  stage.renderer.render(stage.scene, stage.camera)

  updateLive(sample, null, state.backward > 0.5, liftLabel(state))
  chart.draw(result.samples[result.samples.length - 1].x)
}

/** Image de la descente : le skieur suit le parcours simulé. */
function frameDescent(elapsed: number): void {
  const sample = sampleAt(result.samples, playback.time)
  if (groups) revealUpTo(groups.trajectory, playback.time)
  // Pas encore de marque de dérapage : il ne freinera qu'au bas de la piste.
  if (liftRide?.skid) revealUpTo(liftRide.skid, -1)
  const airborne = sample.kind === 'air'
  if (wasAirborne && !airborne && playback.playing) {
    const forward = new THREE.Vector3(1, 0, 0)
    spray.burst({ origin: new THREE.Vector3(sample.x, sample.y, 0), direction: forward, along: forward, strength: 0.8 }, LANDING_PUFF)
  }
  wasAirborne = airborne
  const fallen = crashScene !== null && playback.time >= crashScene.time
  const jump = fallen ? null : jumpAt(sample.kicker, playback.time)
  const ridingSwitch = ridesSwitch(sample.kicker, jump)
  skier.pose(sample, jump, ridingSwitch, crashScene ? { scene: crashScene, time: playback.time } : null, elapsed)
  // Pendant une chute articulée, la caméra suit le corps lui-même, pas le point de la simulation.
  const fall = fallen && crashScene ? crashScene.ragdoll : null
  const body = fall && crashScene ? fall.frameAt(playback.time - crashScene.time).pelvis : null
  const viewed = body ? { ...sample, x: body.x, y: body.y, vx: 0, vy: 0 } : sample
  rig.update(viewed, result.terrain, elapsed)
  frameHook?.({
    time: playback.time,
    elapsed,
    points: fallen ? null : skier.worldPoints(),
    camera: stage.camera,
    controls: stage.controls,
    terrain: result.terrain,
  })
  stage.controls.update()
  culler?.update(stage.camera.position, { x: viewed.x, y: viewed.y + SUBJECT_HEIGHT, z: 0 })
  skier.setViewDistance(stage.camera.position.distanceTo(skier.object.position))
  trackLight(stage, new THREE.Vector3(viewed.x, viewed.y, 0))
  stage.renderer.render(stage.scene, stage.camera)

  updateLive(sample, fallen ? CRASH_LABEL : jump ? trickName(jump.plan, jump.switchBefore) : null, ridingSwitch)
  chart.draw(sample.x)
}

/** Montre la piste d'un autre écran (une leçon), en mettant la piste libre de côté. */
function showLine(line: LineConfig): SimulationResult {
  sandboxConfig ??= config
  applyConfig(line)
  if (config !== line) throw new Error('la piste n’a pas pu être simulée')
  restart()
  return result
}

/** Rend la piste libre telle qu'on l'avait laissée, avec sa lecture normale. */
function restoreSandbox(): void {
  loopWindow = null
  if (!sandboxConfig) return
  const saved = sandboxConfig
  sandboxConfig = null
  applyConfig(saved)
  playback = { time: 0, playing: true, rate: Number(rateSelect.value) }
}

/** Articulations du skieur à un instant du parcours ; la prochaine image le reposera à l'instant affiché. */
function probePoints(time: number): RagdollPoints | null {
  const sample = sampleAt(result.samples, time)
  const jump = jumpAt(sample.kicker, time)
  skier.pose(sample, jump, ridesSwitch(sample.kicker, jump), null, 0)
  return skier.worldPoints()
}

resizeStage(stage)
applyConfig(config)
startApp({
  showLine,
  restoreSandbox,
  getPlayback: () => playback,
  setPlayback: (changes) => {
    playback = { ...playback, ...changes }
    wake()
  },
  setLoop: (window) => {
    loopWindow = window
  },
  setCamera,
  setBottomInset: (pixels) => {
    screenInset = pixels
    wake()
  },
  addToScene: (object) => {
    stage.scene.add(object)
  },
  setFrameHook: (hook) => {
    frameHook = hook
  },
  orientationAt: (time) => {
    const report = result.reports[0]
    const plan = plans[0]
    return report?.reached && plan ? plan.orientationAt(time - report.takeoffTime) : null
  },
  probePoints,
  onFrame: (listener) => {
    frameListeners.push(listener)
  },
})
idle.wake(performance.now(), STARTUP_WAKE_MS)
requestAnimationFrame(frame)
// DEBUG-TEMP
;(window as unknown as Record<string, unknown>).__seek = (t: number, dx = 0, dy = 3, dz = 9) => {
  playback = { ...playback, time: (liftRide?.plan.handover ?? 0) + t, playing: false }
  setCamera('free')
  if (!liftRide) return null
  const state = epilogueAt(liftRide.plan, t)
  stage.controls.target.set(state.x, state.y + 1, state.z)
  stage.camera.position.set(state.x + dx, state.y + 1 + dy, state.z + dz)
  wake()
  return { end: liftRide.plan.approachEnd, lead: liftRide.plan.leadLength / (liftRide.plan.entrySpeed || 1), state }
}
