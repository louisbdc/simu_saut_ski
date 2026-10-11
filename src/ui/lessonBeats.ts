import * as THREE from 'three'
import type { SceneFrame, Simulator } from '../app/shell'
import type { RagdollPoints } from '../scene/ragdoll'
import { crossedBeat, timingLabel, type Beat, type BodyPart, type GazeKind } from '../tutorials/beats'
import { el, svg } from './dom'

export interface BeatsJump {
  readonly beats: readonly Beat[]
  readonly takeoff: number
  readonly landing: number
  /** Distance qui reste avant la lèvre à un instant, en mètres ; négative une fois la lèvre passée. */
  readonly distanceToLip: (time: number) => number
}

export interface LessonBeats {
  /** Liste des moments clés, à ranger dans le panneau. */
  readonly list: HTMLElement
  /** Carte du moment à l'écran : son instant, son titre, sa consigne. À ranger dans le bandeau. */
  readonly card: HTMLElement
  /** Bouton qui active ou coupe les arrêts sur image. */
  readonly toggle: HTMLButtonElement
  readonly load: (jump: BeatsJump) => void
  readonly clear: () => void
  /** À appeler quand la lecture saute ailleurs : aucun moment n'est « franchi » par ce saut. */
  readonly rewind: () => void
  /** À chaque image dessinée : arrêts sur image et moment en cours. */
  readonly tick: (time: number) => void
  /** À chaque image de la descente : replace les étiquettes sur le corps du skieur. */
  readonly frame: (frame: SceneFrame) => void
  /** Où va le regard à cet instant ; `null` avant le premier moment clé. */
  readonly gazeAt: (time: number) => GazeKind | null
}

const PART_LABELS: Readonly<Record<BodyPart, string>> = {
  head: 'Tête',
  chest: 'Buste',
  hips: 'Hanches',
  knees: 'Genoux',
  hands: 'Mains',
  skis: 'Skis',
}
/** Durée d'un arrêt sur image : un socle, plus le temps de lire chaque étiquette, en millisecondes. */
const HOLD_BASE_MS = 2400
const HOLD_PER_CALLOUT_MS = 800
/** Écart sous lequel la lecture en pause est « sur » un moment clé, en secondes. */
const ON_BEAT = 0.03
/** Recul donné au dernier instant vu après un saut de lecture, pour franchir un moment posé pile à l'arrivée. */
const REWIND_MARGIN = 1e-4
/** Étiquettes : écart horizontal au skieur, hauteur réservée à chacune, marge au bord, en pixels. */
const LABEL_REACH = 170
const LABEL_SPACING = 58
const LABEL_WIDTH = 210
const SCREEN_MARGIN = 14
const METERS_SHOWN_BEFORE_LIP = 0.3

const middle = (a: THREE.Vector3, b: THREE.Vector3, share = 0.5): THREE.Vector3 => a.clone().lerp(b, share)

/** Point du corps auquel une étiquette se rattache. */
function anchorOf(part: BodyPart, points: RagdollPoints): THREE.Vector3 {
  switch (part) {
    case 'head':
      return points.head
    case 'chest':
      return middle(points.neck, points.pelvis, 0.35)
    case 'hips':
      return points.pelvis
    case 'knees':
      return middle(points.kneeL, points.kneeR)
    case 'hands':
      return middle(points.handL, points.handR)
    case 'skis':
      return middle(points.ankleL, points.ankleR)
  }
}

/** « 0,28 s avant la lèvre · 2,4 m » : quand tombe le moment, et à quelle distance de la lèvre. */
function whenLabel(beat: Beat, jump: BeatsJump): string {
  const label = timingLabel(beat.time, jump.takeoff, jump.landing)
  const distance = jump.distanceToLip(beat.time)
  return distance > METERS_SHOWN_BEFORE_LIP ? `${label} · ${distance.toFixed(1).replace('.', ',')} m` : label
}

/**
 * Moments clés d'une leçon : la lecture s'arrête sur chacun, le temps de lire ce que fait chaque
 * partie du corps, sur des étiquettes accrochées au skieur.
 */
export function createLessonBeats(simulator: Simulator, onSeek: (beat: Beat) => void): LessonBeats {
  const list = el('section', { className: 'beat-list', attributes: { 'aria-label': 'Moments clés' } })
  const toggle = el('button', { text: 'Arrêts sur image', attributes: { type: 'button', 'aria-pressed': 'true' } })
  const card = el('div', { className: 'beat-card', attributes: { 'aria-live': 'polite' } })
  const lines = svg('svg', { class: 'callout-lines', 'aria-hidden': 'true' })
  const labels = el('div', { className: 'callout-labels' })
  const overlay = el('div', { attributes: { id: 'beat-overlay' } }, [lines, labels])
  overlay.hidden = true
  card.hidden = true
  document.body.append(overlay)

  let jump: BeatsJump | null = null
  let items: readonly HTMLButtonElement[] = []
  let lastTime = 0
  /** Moment sur lequel la lecture s'est arrêtée d'elle-même, et le minuteur qui la relancera. */
  let held: Beat | null = null
  let timer: number | undefined
  /** Moment dont les étiquettes sont à l'écran. */
  let shown: Beat | null = null
  let current: Beat | null = null

  const show = (beat: Beat | null, holdMs = 0): void => {
    if (shown === beat) return
    shown = beat
    overlay.hidden = beat === null
    card.hidden = beat === null
    if (!beat || !jump) return
    const progress = el('i', { className: 'beat-progress' })
    progress.style.animationDuration = `${holdMs}ms`
    card.replaceChildren(
      el('span', { className: 'beat-when', text: whenLabel(beat, jump) }),
      el('strong', { text: beat.title }),
      el('p', { text: beat.text }),
      ...(holdMs > 0 ? [progress] : []),
    )
    labels.replaceChildren(
      ...beat.callouts.map((callout) =>
        el('p', { className: 'callout' }, [el('b', { text: PART_LABELS[callout.part] }), document.createTextNode(callout.text)]),
      ),
    )
    lines.replaceChildren(...beat.callouts.flatMap(() => [svg('line'), svg('circle', { r: 5 })]))
  }

  const release = (): void => {
    window.clearTimeout(timer)
    held = null
  }

  const hold = (beat: Beat): void => {
    const holdMs = HOLD_BASE_MS + HOLD_PER_CALLOUT_MS * beat.callouts.length
    held = beat
    // La lecture revient pile sur le moment : il ne doit pas être franchi une seconde fois à la reprise.
    lastTime = beat.time
    simulator.setPlayback({ time: beat.time, playing: false })
    show(beat, holdMs)
    timer = window.setTimeout(() => {
      if (held !== beat) return
      held = null
      simulator.setPlayback({ playing: true })
    }, holdMs)
  }

  const markCurrent = (beat: Beat | null): void => {
    if (current === beat || !jump) return
    current = beat
    items.forEach((item, index) => item.toggleAttribute('aria-current', jump?.beats[index] === beat))
  }

  const tick = (time: number): void => {
    if (!jump) return
    const { playing } = simulator.getPlayback()
    if (held && playing) release()
    // Un retour en arrière (boucle, clic sur une étape) ne « franchit » rien, sauf un moment posé à l'arrivée.
    const from = time < lastTime ? time - REWIND_MARGIN : lastTime
    lastTime = time
    markCurrent([...jump.beats].reverse().find((beat) => beat.time <= time + ON_BEAT) ?? null)
    const crossed = playing && toggle.getAttribute('aria-pressed') === 'true' ? crossedBeat(jump.beats, from, time) : null
    if (crossed) {
      hold(crossed)
      return
    }
    if (playing) show(null)
    else if (!held) show(jump.beats.find((beat) => Math.abs(beat.time - time) < ON_BEAT) ?? null)
  }

  /** Projette les points du corps à l'écran et range les étiquettes de part et d'autre du skieur. */
  const frame = ({ camera, points }: SceneFrame): void => {
    if (!shown || !points) return
    const freeWidth = window.innerWidth - (document.querySelector<HTMLElement>('#lesson')?.offsetWidth ?? 0) - 2 * SCREEN_MARGIN
    const anchors = shown.callouts.map((callout) => {
      const projected = anchorOf(callout.part, points).clone().project(camera)
      return { x: ((projected.x + 1) / 2) * window.innerWidth, y: ((1 - projected.y) / 2) * window.innerHeight }
    })
    const centerX = anchors.reduce((sum, anchor) => sum + anchor.x, 0) / anchors.length
    // Du haut du corps vers le bas, une étiquette à gauche, la suivante à droite.
    const order = anchors.map((_, index) => index).sort((a, b) => anchors[a].y - anchors[b].y)
    const nextY = [-Infinity, -Infinity]
    order.forEach((index, rank) => {
      const side = rank % 2
      const anchor = anchors[index]
      const wanted = centerX + (side === 0 ? -LABEL_REACH - LABEL_WIDTH : LABEL_REACH)
      const left = Math.min(freeWidth - LABEL_WIDTH, Math.max(SCREEN_MARGIN, wanted))
      const top = Math.max(anchor.y - LABEL_SPACING / 2, nextY[side])
      nextY[side] = top + LABEL_SPACING
      const label = labels.children[index] as HTMLElement
      label.style.transform = `translate(${left.toFixed(0)}px, ${top.toFixed(0)}px)`
      const line = lines.children[index * 2]
      const dot = lines.children[index * 2 + 1]
      line.setAttribute('x1', String(side === 0 ? left + LABEL_WIDTH : left))
      line.setAttribute('y1', String(top + LABEL_SPACING / 2 - 6))
      line.setAttribute('x2', anchor.x.toFixed(1))
      line.setAttribute('y2', anchor.y.toFixed(1))
      dot.setAttribute('cx', anchor.x.toFixed(1))
      dot.setAttribute('cy', anchor.y.toFixed(1))
    })
  }

  toggle.addEventListener('click', () => {
    const on = toggle.getAttribute('aria-pressed') !== 'true'
    toggle.setAttribute('aria-pressed', String(on))
    if (!on && held) {
      release()
      simulator.setPlayback({ playing: true })
    }
  })

  return {
    list,
    card,
    toggle,
    load: (next) => {
      release()
      show(null)
      jump = next
      current = null
      lastTime = 0
      items = next.beats.map((beat) => {
        const item = el('button', { attributes: { type: 'button' } }, [
          el('span', { className: 'beat-when', text: whenLabel(beat, next) }),
          el('strong', { text: beat.title }),
          el('span', { className: 'beat-text', text: beat.text }),
        ])
        item.addEventListener('click', () => {
          release()
          onSeek(beat)
        })
        return item
      })
      list.replaceChildren(el('h2', { text: 'Moments clés' }), el('ol', {}, items.map((item) => el('li', {}, [item]))))
    },
    clear: () => {
      release()
      show(null)
      jump = null
    },
    rewind: () => {
      release()
      lastTime = Infinity
    },
    tick,
    frame,
    gazeAt: (time) => (jump ? ([...jump.beats].reverse().find((beat) => beat.time <= time + ON_BEAT)?.gaze ?? null) : null),
  }
}
