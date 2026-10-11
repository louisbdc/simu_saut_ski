import * as THREE from 'three'
import { routeHash } from '../app/routes'
import type { Simulator } from '../app/shell'
import { getKickerModel } from '../physics/presets'
import type { KickerReport, LineConfig } from '../physics/types'
import { sampleAt, type TimeWindow } from '../scene/playback'
import type { RagdollPoints } from '../scene/ragdoll'
import { createTutorialStage, type StageTrick } from '../scene/tutorialStage'
import { getTrick, hasDirection } from '../scene/tricks'
import { resolveBeats, rotationTrack, type Beat, type PoseAxes } from '../tutorials/beats'
import { getBeats } from '../tutorials/content/beats'
import { CUE_LABELS, PHASE_RATES, cuesFor, ease, turnSign, type CueKind } from '../tutorials/direction'
import { GROUP_LABELS, type Lesson, type Mistake } from '../tutorials/lesson'
import { lessonLine } from '../tutorials/lessonLine'
import { PHASE_IDS, phaseAt, phaseWindows, type PhaseId, type PhaseWindow } from '../tutorials/phases'
import { el } from './dom'
import { createJumpProfile, type JumpProfile } from './jumpProfile'
import { createLessonBeats } from './lessonBeats'
import { levelBadge } from './tutorialIndex'

export interface LessonView {
  /** Panneau d'explications et bandeau des étapes, à ranger dans la page. */
  readonly panel: HTMLElement
  readonly rail: HTMLElement
  readonly open: (lesson: Lesson) => void
  readonly close: () => void
  /** Passe à l'étape suivante (+1) ou précédente (−1). */
  readonly step: (direction: 1 | -1) => void
}

/** Ce que la lecture montre : le saut entier, ou une seule étape en boucle. */
type Selection = PhaseId | 'all'

interface Session {
  readonly lesson: Lesson
  readonly windows: readonly PhaseWindow[]
  readonly profile: JumpProfile
  readonly selection: Selection
  /** Étape dont les explications sont affichées. */
  readonly shown: PhaseId | null
  readonly trick: StageTrick
}

/** Vitesse « Auto » : chaque étape a son ralenti, et la lecture glisse de l'un à l'autre. */
const AUTO_RATE = 'auto'
const RATES: readonly number[] = [1, 0.5, 0.25, 0.1]
/** Rapidité du passage d'un ralenti au suivant, et écart en dessous duquel on ne touche plus à la lecture. */
const RATE_EASING = 5
const RATE_STEP = 0.004
/** Écart entre les deux poses qui donnent le sens de rotation du skieur, en secondes. */
const TURN_PROBE_SECONDS = 0.03
const CINEMA_KEYS: readonly string[] = ['1', '2', '3', '4']
/** Nombre de poses lues pendant le vol pour savoir à quel instant la rotation atteint chaque angle. */
const ROTATION_PROBES = 40
const GAZE_LABEL = 'Regard'
const MS_TO_KMH = 3.6
const WHOLE_JUMP_LABEL = 'Saut entier'
const STEP_LABELS: Readonly<Record<PhaseId, string>> = {
  approach: 'Approche',
  compression: 'Appui',
  pop: 'Impulsion',
  air: 'En l’air',
  spot: 'Repérage',
  landing: 'Réception',
}
const CAMERAS: readonly (readonly [mode: string, label: string])[] = [
  ['side', 'Latérale'],
  ['chase', 'Poursuite'],
  ['tv', 'Télé'],
  ['free', 'Libre'],
]

const fr = (value: number, digits = 1): string => value.toFixed(digits).replace('.', ',')
const rateLabel = (rate: number): string => `${String(rate).replace('.', ',')}×`
const stepNumber = (phase: PhaseId): string => String(PHASE_IDS.indexOf(phase) + 1).padStart(2, '0')

function button(text: string, className = ''): HTMLButtonElement {
  return el('button', { className, text, attributes: { type: 'button' } })
}

function factList(facts: readonly (readonly [string, string])[]): HTMLElement {
  return el(
    'dl',
    { className: 'facts' },
    facts.map(([name, value]) => el('div', {}, [el('dt', { text: name }), el('dd', { text: value })])),
  )
}

function headerContent(lesson: Lesson, line: LineConfig, report: KickerReport): readonly Node[] {
  const facts = factList([
    ['Bosse', `${getKickerModel(lesson.bump).label}, ${fr(line.kickers[0].kickerHeight)} m`],
    ['Vitesse à la lèvre', `${fr(report.lipSpeed * MS_TO_KMH, 0)} km/h`],
    ['Temps de vol', `${fr(report.airTime)} s`],
    ['Hauteur', `${fr(report.maxHeight)} m`],
  ])
  const before = lesson.prerequisites.flatMap((id, index) => [
    document.createTextNode(index === 0 ? 'À maîtriser avant : ' : ', '),
    el('a', { text: getTrick(id).label, attributes: { href: routeHash({ view: 'lesson', lesson: id }) } }),
  ])
  return [
    levelBadge(lesson.level, GROUP_LABELS[lesson.group]),
    el('h1', { text: getTrick(lesson.id).label }),
    el('p', { className: 'lesson-summary', text: lesson.summary }),
    ...(lesson.caveat ? [el('p', { className: 'caveat', text: lesson.caveat })] : []),
    facts,
    ...(before.length > 0 ? [el('p', { className: 'prerequisites' }, before)] : []),
  ]
}

function mistakeItem(mistake: Mistake): HTMLLIElement {
  return el('li', {}, [
    el('h3', { text: mistake.title }),
    el('p', {}, [el('b', { text: 'Cause. ' }), document.createTextNode(mistake.cause)]),
    el('p', {}, [el('b', { text: 'Correction. ' }), document.createTextNode(mistake.fix)]),
  ])
}

function fold(title: string, content: Node): HTMLDetailsElement {
  return el('details', {}, [el('summary', { text: title }), content])
}

function extrasContent(lesson: Lesson): readonly Node[] {
  const sources = lesson.sources.map((source) =>
    el('li', {}, [el('a', { text: source.label, attributes: { href: source.url, target: '_blank', rel: 'noopener' } })]),
  )
  return [
    fold(`Erreurs classiques (${lesson.mistakes.length})`, el('ul', { className: 'mistakes' }, lesson.mistakes.map(mistakeItem))),
    fold('Sécurité', el('ul', {}, lesson.safety.map((text) => el('li', { text })))),
    ...(sources.length > 0 ? [fold('Sources', el('ul', {}, sources))] : []),
  ]
}

/** Explications d'une étape : sa consigne, puis ce que fait chaque partie du corps. */
function stepContent(lesson: Lesson, phase: PhaseId): readonly Node[] {
  const { title, caption, cues } = lesson.phases[phase]
  return [
    el('p', { className: 'step-count', text: `Étape ${PHASE_IDS.indexOf(phase) + 1} sur ${PHASE_IDS.length}` }),
    el('h2', { text: title }),
    el('p', { className: 'caption', text: caption }),
    el('dl', { className: 'cues' }, cues.flatMap((cue) => [el('dt', { text: cue.part }), el('dd', { text: cue.text })])),
  ]
}

/** Sens de rotation du skieur du moteur au milieu du vol, lu sur deux poses très proches. */
function turnSigns(before: RagdollPoints | null, after: RagdollPoints | null): { readonly spinSign: 1 | -1; readonly flipSign: 1 | -1 } {
  if (!before || !after) return { spinSign: 1, flipSign: 1 }
  const axis = (points: RagdollPoints) => points.head.clone().sub(points.pelvis).normalize()
  const lateral = (points: RagdollPoints) => points.shoulderR.clone().sub(points.shoulderL).normalize()
  return {
    spinSign: turnSign(lateral(before), lateral(after), axis(before)) || 1,
    flipSign: turnSign(axis(before), axis(after), lateral(before)) || 1,
  }
}

/** Axe et largeur du corps pour une orientation : debout, il est dressé vers le haut, épaules en travers de la piste. */
const bodyAxes = (turn: THREE.Quaternion): PoseAxes => ({
  axis: new THREE.Vector3(0, 1, 0).applyQuaternion(turn),
  lateral: new THREE.Vector3(0, 0, 1).applyQuaternion(turn),
})

/** Bandeau de retransmission : le numéro de l'étape, son titre, sa consigne, et la légende des repères 3D. */
function lowerThirdContent(lesson: Lesson, phase: PhaseId, cues: readonly CueKind[]): readonly Node[] {
  const { title, caption } = lesson.phases[phase]
  const legend = [
    ...cues.filter((cue) => cue !== 'gazeLip' && cue !== 'gazeLanding').map((cue) => el('li', { className: `cue cue-${cue}`, text: CUE_LABELS[cue] })),
    el('li', { className: 'cue cue-gazeLip', text: GAZE_LABEL }),
  ]
  return [
    el('span', { className: 'third-number', text: stepNumber(phase), attributes: { 'aria-hidden': 'true' } }),
    el('span', { className: 'third-text' }, [
      el('span', { className: 'third-title', text: title }),
      el('span', { className: 'third-caption', text: caption }),
    ]),
    el('ul', { className: 'cue-legend' }, legend),
  ]
}

/**
 * Écran d'une leçon : la figure tourne en boucle sur sa bosse, étape par étape, avec les consignes
 * de chaque moment dans le panneau et sur le bandeau.
 */
export function createLessonView(simulator: Simulator): LessonView {
  const header = el('header', { className: 'lesson-head' })
  const stepBox = el('section', { className: 'lesson-step', attributes: { 'aria-live': 'polite' } })
  const extras = el('div', { className: 'lesson-extras' })
  const panel = el('aside', { attributes: { id: 'lesson', 'aria-label': 'Explications de la figure' } }, [header, stepBox])

  const lowerThird = el('div', { className: 'lower-third', attributes: { 'aria-hidden': 'true' } })
  const profileSlot = el('div', { className: 'profile-slot' })
  const wholeButton = button(WHOLE_JUMP_LABEL)
  const stepButtons = PHASE_IDS.map((phase, index) => {
    const element = button('')
    element.append(el('b', { text: String(index + 1) }), el('span', { text: STEP_LABELS[phase] }))
    return { phase, element }
  })
  const steps = el('ol', { className: 'steps' }, [wholeButton, ...stepButtons.map((item) => item.element)].map((item) => el('li', {}, [item])))
  const previousButton = button('← Étape')
  const playButton = button('Pause', 'primary')
  const nextButton = button('Étape →')
  const rateSelect = el('select', { attributes: { 'aria-label': 'Vitesse de lecture' } }, [
    el('option', { text: 'Auto', attributes: { value: AUTO_RATE } }),
    ...RATES.map((rate) => el('option', { text: rateLabel(rate), attributes: { value: String(rate) } })),
  ])
  const cinemaButton = el('button', { text: 'Ciné', attributes: { type: 'button', 'aria-pressed': 'true', title: 'Caméra de tuto : un plan par étape' } })
  const cameras = el('div', { className: 'cameras', attributes: { role: 'group', 'aria-label': 'Caméra' } }, [cinemaButton, ...CAMERAS.map(([mode, label]) => el('button', { text: label, attributes: { type: 'button', 'data-camera': mode, 'aria-pressed': 'false' } }))])
  const bar = el('div', { className: 'bar' })
  const directionButton = button('')
  /** La figure est montrée à droite ; le choix vaut d'une leçon à l'autre. */
  let rightward = false
  const barItems = (freezeToggle: HTMLElement): readonly Node[] => [previousButton, playButton, nextButton, freezeToggle, directionButton, el('label', { className: 'field', text: 'Vitesse ' }, [rateSelect]), cameras]
  const rail = el('section', { attributes: { id: 'lesson-rail', 'aria-label': 'Étapes du saut' } }, [lowerThird, profileSlot, steps, bar])

  const stage = createTutorialStage()
  simulator.addToScene(stage.object)

  let session: Session | null = null
  /** La caméra de tuto a la main ; un autre choix de caméra la lui retire. */
  let cinematic = true

  const setCinematic = (on: boolean): void => {
    cinematic = on
    if (on) simulator.setCamera('free')
    // En mode ciné, aucune caméra du simulateur n'est « la » caméra choisie.
    if (on) cameras.querySelectorAll('[data-camera]').forEach((item) => item.setAttribute('aria-pressed', 'false'))
    cinemaButton.setAttribute('aria-pressed', String(on))
  }

  /** Vitesse de lecture voulue à un instant : le ralenti de l'étape en mode Auto, sinon celle choisie. */
  const wantedRate = (current: Session, time: number): number =>
    rateSelect.value === AUTO_RATE ? PHASE_RATES[phaseAt(current.windows, time)] : Number(rateSelect.value)

  const windowOf = (current: Session, selection: Selection): TimeWindow => {
    if (selection !== 'all') return current.windows[PHASE_IDS.indexOf(selection)]
    return { start: current.windows[0].start, end: current.windows[current.windows.length - 1].end }
  }

  /** Affiche les explications d'une étape, dans le panneau, sur le bandeau et sur le profil. */
  const showPhase = (phase: PhaseId): void => {
    if (!session || session.shown === phase) return
    session = { ...session, shown: phase }
    stepBox.replaceChildren(...stepContent(session.lesson, phase))
    lowerThird.replaceChildren(...lowerThirdContent(session.lesson, phase, cuesFor(phase, session.trick)))
    session.profile.setActive(phase)
    stepButtons.forEach((item) => item.element.toggleAttribute('aria-current', item.phase === phase))
  }

  const select = (selection: Selection): void => {
    if (!session) return
    session = { ...session, selection }
    const window = windowOf(session, selection)
    beats.rewind()
    simulator.setLoop(window)
    simulator.setPlayback({ time: window.start, playing: true, rate: wantedRate(session, window.start) })
    wholeButton.setAttribute('aria-pressed', String(selection === 'all'))
    stepButtons.forEach((item) => item.element.setAttribute('aria-pressed', String(item.phase === selection)))
    showPhase(selection === 'all' ? session.windows[0].id : selection)
  }

  const step = (direction: 1 | -1): void => {
    if (!session) return
    const index = PHASE_IDS.indexOf(session.shown ?? PHASE_IDS[0]) + direction
    select(PHASE_IDS[Math.min(PHASE_IDS.length - 1, Math.max(0, index))])
  }

  const close = (): void => {
    if (!session) return
    session = null
    beats.clear()
    stage.reset()
    simulator.setFrameHook(null)
    simulator.setLoop(null)
    simulator.setBottomInset(0)
  }

  const open = (lesson: Lesson): void => {
    close()
    try {
      directionButton.hidden = !hasDirection(getTrick(lesson.id))
      directionButton.textContent = rightward ? 'Sens : droite' : 'Sens : gauche'
      const line = lessonLine(lesson, rightward && !directionButton.hidden)
      const result = simulator.showLine(line)
      const windows = phaseWindows(result.samples, result.reports[0])
      const profile = createJumpProfile(result, windows, select)
      header.replaceChildren(...headerContent(lesson, line, result.reports[0]))
      extras.replaceChildren(...extrasContent(lesson))
      profileSlot.replaceChildren(profile.element)
      rail.hidden = false
      const report = result.reports[0]
      const middle = report.takeoffTime + report.airTime / 2
      const { flips, spins } = getTrick(lesson.id)
      const trick = { flips, spins, ...turnSigns(simulator.probePoints(middle), simulator.probePoints(middle + TURN_PROBE_SECONDS)) }
      stage.setTrick(trick)
      // Rotation réelle du skieur au fil du vol : c'est elle qui date « à 270°, tu vois la réception ».
      const probeTimes = Array.from({ length: ROTATION_PROBES + 1 }, (_, index) => report.takeoffTime + (report.airTime * index) / ROTATION_PROBES)
      // On lit l'orientation du corps entier, pas ses articulations : se grouper ne compte pas comme tourner.
      const turns = probeTimes.map((time) => simulator.orientationAt(time))
      const track = turns.every((turn) => turn !== null)
        ? rotationTrack(probeTimes, turns.map((turn) => bodyAxes(turn as THREE.Quaternion)))
        : { times: probeTimes, spin: probeTimes.map(() => 0), flip: probeTimes.map(() => 0) }
      const lipX = result.terrain.kickers[0].lipX
      beats.load({
        beats: resolveBeats(getBeats(lesson.id), { kickStart: windows[1].start, takeoff: report.takeoffTime, landing: report.landingTime, track, windows }),
        takeoff: report.takeoffTime,
        landing: report.landingTime,
        distanceToLip: (time) => lipX - sampleAt(result.samples, time).x,
      })
      session = { lesson, windows, profile, selection: 'all', shown: null, trick }
      simulator.setFrameHook((frame) => {
        if (!session) return
        const playing = simulator.getPlayback().playing
        stage.frame({ ...frame, phase: phaseAt(session.windows, frame.time), playing, cinematic, gaze: beats.gazeAt(frame.time), sideShare: panel.offsetWidth / window.innerWidth })
        beats.frame(frame)
      })
      setCinematic(true)
      select('all')
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : 'erreur inconnue'
      header.replaceChildren(el('h1', { text: getTrick(lesson.id).label }))
      stepBox.replaceChildren(el('p', { className: 'caveat', text: `Cette leçon n’a pas pu être chargée : ${reason}` }))
      extras.replaceChildren()
      rail.hidden = true
    }
  }

  /** Va se poser, en pause, sur un moment clé choisi dans la liste. */
  const seekBeat = (beat: Beat): void => {
    if (!session) return
    if (session.selection !== 'all') select('all')
    simulator.setPlayback({ time: beat.time, playing: false })
  }
  const beats = createLessonBeats(simulator, seekBeat)
  panel.append(beats.list, extras)
  rail.prepend(beats.card)
  bar.append(...barItems(beats.toggle))

  directionButton.addEventListener('click', () => {
    if (!session) return
    rightward = !rightward
    open(session.lesson)
  })
  wholeButton.addEventListener('click', () => select('all'))
  stepButtons.forEach((item) => item.element.addEventListener('click', () => select(item.phase)))
  previousButton.addEventListener('click', () => step(-1))
  nextButton.addEventListener('click', () => step(1))
  playButton.addEventListener('click', () => simulator.setPlayback({ playing: !simulator.getPlayback().playing }))
  rateSelect.addEventListener('change', () => {
    if (session) simulator.setPlayback({ rate: wantedRate(session, simulator.getPlayback().time) })
  })
  cinemaButton.addEventListener('click', () => setCinematic(true))
  cameras.addEventListener('click', (event) => {
    if (event.target instanceof Element && event.target.closest('[data-camera]')) setCinematic(false)
  })
  window.addEventListener('keydown', (event) => {
    if (session && CINEMA_KEYS.includes(event.key)) setCinematic(false)
  })
  new ResizeObserver(() => {
    if (session) simulator.setBottomInset(rail.offsetHeight)
  }).observe(rail)
  simulator.onFrame((time) => {
    if (!session) return
    session.profile.setTime(time)
    beats.tick(time)
    if (session.selection === 'all') showPhase(phaseAt(session.windows, time))
    const playback = simulator.getPlayback()
    // Le ralenti glisse vers celui de l'étape en cours, sans à-coup.
    const rate = ease(playback.rate, wantedRate(session, time), RATE_EASING, 1 / 60)
    if (playback.playing && Math.abs(rate - playback.rate) > RATE_STEP) simulator.setPlayback({ rate })
    const label = playback.playing ? 'Pause' : 'Lecture'
    if (playButton.textContent !== label) playButton.textContent = label
  })

  return { panel, rail, open, close, step }
}
