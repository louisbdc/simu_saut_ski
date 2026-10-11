import type * as THREE from 'three'
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import type { LineConfig, SimulationResult, Terrain } from '../physics/types'
import type { CameraMode } from '../scene/cameraRig'
import type { PlaybackState, TimeWindow } from '../scene/playback'
import type { RagdollPoints } from '../scene/ragdoll'
import { getTrick } from '../scene/tricks'
import { getLesson, type Lesson } from '../tutorials/lessons'
import { el } from '../ui/dom'
import { createLessonView } from '../ui/lessonView'
import { createMenu } from '../ui/menu'
import { createTutorialIndex } from '../ui/tutorialIndex'
import { parseRoute, routeHash, type Route } from './routes'

/** Image de la descente en cours de dessin, remise à l'écran qui veut y poser sa caméra ou ses repères. */
export interface SceneFrame {
  readonly time: number
  /** Temps réel écoulé depuis l'image précédente, en secondes. */
  readonly elapsed: number
  /** Articulations du skieur dans le monde ; `null` tant qu'il n'a pas été posé. */
  readonly points: RagdollPoints | null
  readonly camera: THREE.PerspectiveCamera
  readonly controls: OrbitControls
  readonly terrain: Terrain
}

/** Ce que les écrans peuvent demander à la scène 3D et à sa lecture. */
export interface Simulator {
  /** Montre une piste hors de la piste libre, rejouée depuis le départ ; échoue si elle ne se simule pas. */
  readonly showLine: (line: LineConfig) => SimulationResult
  /** Charge dans la piste libre une ligne partagée par un lien ; rend `false` si le texte n'est pas une ligne. */
  readonly loadSandboxLine: (text: string) => boolean
  /** Revient à la piste libre telle qu'elle était, lecture normale. */
  readonly restoreSandbox: () => void
  readonly getPlayback: () => PlaybackState
  readonly setPlayback: (changes: Partial<PlaybackState>) => void
  /** Fait tourner la lecture en boucle sur une tranche du parcours ; `null` rend la boucle normale. */
  readonly setLoop: (window: TimeWindow | null) => void
  readonly setCamera: (mode: CameraMode) => void
  /** Hauteur, en pixels, masquée en bas de l'écran par un bandeau autre que celui de la piste libre. */
  readonly setBottomInset: (pixels: number) => void
  /** Ajoute un objet à la scène 3D, pour toute la durée de la page. */
  readonly addToScene: (object: THREE.Object3D) => void
  /** Appelé à chaque image de la descente, après le cadrage habituel : il peut reprendre la caméra. */
  readonly setFrameHook: (hook: ((frame: SceneFrame) => void) | null) => void
  /** Orientation du skieur par rapport à son décollage, à un instant du vol de la première bosse ; `null` sans saut. */
  readonly orientationAt: (time: number) => THREE.Quaternion | null
  /** Articulations du skieur à un instant du parcours, pour mesurer sa pose sans attendre la lecture. */
  readonly probePoints: (time: number) => RagdollPoints | null
  /** Appelle `listener` à chaque image dessinée, avec l'instant affiché. */
  readonly onFrame: (listener: (time: number) => void) => void
}

interface Crumb {
  readonly label: string
  readonly route?: Route
}

const SITE_TITLE = 'Simulateur de kickers'
const MENU_CRUMB: Crumb = { label: 'Menu', route: { view: 'menu' } }
const TUTORIALS_LABEL = 'Tutos'

/** Fil d'Ariane d'un écran : chaque étape ramène d'un cran vers le menu. */
function crumbsOf(route: Route, lesson: Lesson | undefined): readonly Crumb[] {
  switch (route.view) {
    case 'menu':
      return []
    case 'sandbox':
      return [MENU_CRUMB, { label: 'Piste libre' }]
    case 'tutorials':
      return [MENU_CRUMB, { label: TUTORIALS_LABEL }]
    case 'lesson':
      return [MENU_CRUMB, { label: TUTORIALS_LABEL, route: { view: 'tutorials' } }, { label: lesson ? getTrick(lesson.id).label : '' }]
  }
}

function crumbNodes(crumbs: readonly Crumb[]): readonly Node[] {
  return crumbs.flatMap((crumb, index) => {
    const item = crumb.route
      ? el('a', { text: crumb.label, attributes: { href: routeHash(crumb.route) } })
      : el('span', { text: crumb.label, attributes: { 'aria-current': 'page' } })
    return index === 0 ? [item] : [el('span', { className: 'crumb-rule', text: '/', attributes: { 'aria-hidden': 'true' } }), item]
  })
}

/**
 * Met en place le menu, les tutos et la navigation entre les écrans. La scène 3D reste la même d'un
 * écran à l'autre : seuls changent ce qu'elle montre et ce qui est posé par-dessus.
 */
export function startApp(simulator: Simulator): void {
  const topbar = el('nav', { attributes: { id: 'topbar', 'aria-label': 'Fil d’Ariane' } })
  const menu = createMenu()
  const tutorials = createTutorialIndex()
  const lessonView = createLessonView(simulator)
  document.body.append(topbar, menu, tutorials, lessonView.panel, lessonView.rail)
  let crumbs: readonly Crumb[] = []

  const show = (): void => {
    const route = parseRoute(window.location.hash)
    const lesson = route.view === 'lesson' ? getLesson(route.lesson) : undefined
    if (route.view === 'lesson' && !lesson) {
      window.location.replace(routeHash({ view: 'tutorials' }))
      return
    }
    const changed = document.body.dataset.view !== route.view
    document.body.dataset.view = route.view
    crumbs = crumbsOf(route, lesson)
    topbar.replaceChildren(...crumbNodes(crumbs))
    topbar.hidden = route.view === 'menu'
    menu.hidden = route.view !== 'menu'
    tutorials.hidden = route.view !== 'tutorials'
    lessonView.panel.hidden = route.view !== 'lesson'
    lessonView.rail.hidden = route.view !== 'lesson'
    document.title = crumbs.length > 0 ? `${crumbs[crumbs.length - 1].label} · ${SITE_TITLE}` : SITE_TITLE
    if (lesson) {
      lessonView.open(lesson)
      return
    }
    lessonView.close()
    simulator.restoreSandbox()
    if (route.view === 'sandbox' && route.line) {
      simulator.loadSandboxLine(route.line)
      // La ligne est chargée et enregistrée : l'adresse redevient celle de la piste libre, pour qu'un
      // rechargement garde les réglages faits depuis au lieu de revenir au lien.
      window.history.replaceState(null, '', routeHash({ view: 'sandbox' }))
    }
    if (changed) simulator.setCamera(route.view === 'sandbox' ? 'side' : 'tv')
  }

  window.addEventListener('hashchange', show)
  window.addEventListener('keydown', (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return
    const typing = event.target instanceof HTMLElement && event.target.closest('input, select, textarea')
    const parent = [...crumbs].reverse().find((crumb) => crumb.route)?.route
    if (event.key === 'Escape' && parent) window.location.hash = routeHash(parent)
    if (typing || document.body.dataset.view !== 'lesson') return
    if (event.key === 'ArrowRight') lessonView.step(1)
    if (event.key === 'ArrowLeft') lessonView.step(-1)
  })
  show()
}
