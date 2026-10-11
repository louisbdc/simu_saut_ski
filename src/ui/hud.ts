import {
  COMFORT_KICK_G,
  HARD_FALL_HEIGHT,
  HARD_KICK_G,
  SAFE_FALL_HEIGHT,
} from '../physics/constants'
import type { InrunSolution } from '../physics/solver'
import { trickVerdict, type TrickPlan } from '../scene/flightPlan'
import type { RagdollTrack } from '../scene/ragdoll'
import { landingVerdict, lineVerdict, type Level } from './landingVerdict'
import { nominalTurns } from '../scene/tricks'
import type {
  CrashCause,
  CrashReport,
  KickerReport,
  Sample,
  SegmentKind,
  SimulationResult,
} from '../physics/types'


const MS_TO_KMH = 3.6
/** Libellé affiché en direct pendant une chute. */
export const CRASH_LABEL = 'Chute'

const PHASE_LABELS: Readonly<Record<SegmentKind | 'air', string>> = {
  inrun: 'Élan',
  transition: 'Compression',
  flat: 'Plat',
  takeoff: 'Kick',
  face: 'Mur',
  deck: 'Table',
  knuckle: 'Cassure',
  landing: 'Réception',
  runout: 'Sortie',
  air: 'En l’air',
}

export function query<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector)
  if (!element) throw new Error(`Élément introuvable : ${selector}`)
  return element
}

const fixed = (value: number, digits = 1): string => value.toFixed(digits).replace('.', ',')
const kmh = (speed: number): string => fixed(speed * MS_TO_KMH, 0)
const signed = (value: number): string => {
  const rounded = Math.round(value * 10) / 10
  return `${rounded > 0 ? '+' : ''}${fixed(rounded === 0 ? 0 : rounded)}`
}

function levelFor(value: number, comfort: number, hard: number): Level {
  if (value <= comfort) return 'ok'
  return value <= hard ? 'warn' : 'bad'
}

const tag = (level: Level, text: string): string => `<span class="tag ${level}">${text}</span>`

/** Appui affiché à fond de jauge, en g. */
const GAUGE_MAX_G = 4

const setText = (element: HTMLElement, text: string): void => {
  if (element.textContent !== text) element.textContent = text
}

/**
 * Bloc en direct : vitesse, phase du parcours, jauge d'appui, hauteur et temps.
 * La structure est créée une fois ; la fonction renvoyée ne met à jour que les valeurs.
 */
export function createLive(
  root: HTMLElement,
): (sample: Sample, trickLabel: string | null, ridingSwitch: boolean, phaseOverride?: string) => void {
  const tick = (g: number): string => `<i style="left: ${(g / GAUGE_MAX_G) * 100}%"></i>`
  root.innerHTML = `
    <div class="speed"><span data-live="speed">0</span><small>km/h</small></div>
    <p class="phase" data-live="phase"></p>
    <div class="gauge" title="Appui en g, repères à ${fixed(COMFORT_KICK_G)} g et ${fixed(HARD_KICK_G, 0)} g">
      <div class="gauge-fill" data-live="bar"></div>${tick(COMFORT_KICK_G)}${tick(HARD_KICK_G)}
    </div>
    <dl>
      <dt>Appui</dt><dd data-live="g"></dd>
      <dt>Hauteur</dt><dd data-live="height"></dd>
      <dt>Temps</dt><dd data-live="time"></dd>
    </dl>`
  const part = (name: string): HTMLElement => query<HTMLElement>(`#${root.id} [data-live="${name}"]`)
  const speed = part('speed')
  const phase = part('phase')
  const bar = part('bar')
  const g = part('g')
  const height = part('height')
  const time = part('time')

  return (sample: Sample, trickLabel: string | null, ridingSwitch: boolean, phaseOverride?: string): void => {
    const doingTrick = sample.kind === 'air' && sample.airProgress > 0
    const stanceSuffix = ridingSwitch && sample.kind !== 'air' ? ' en switch' : ''
    // Pendant une chute, l'appelant passe « Chute » : elle prime sur la phase du parcours.
    const named = trickLabel === CRASH_LABEL || (doingTrick && trickLabel !== null)
    const action = named ? String(trickLabel) : `${PHASE_LABELS[sample.kind]}${stanceSuffix}`
    setText(speed, kmh(sample.speed))
    // Hors de la descente (télésiège), l'appelant nomme lui-même ce que fait le skieur.
    setText(phase, phaseOverride ?? `${action}, bosse ${sample.kicker + 1}`)
    setText(g, `${fixed(sample.gLoad)} g`)
    setText(height, `${fixed(sample.height)} m`)
    setText(time, `${fixed(sample.t)} s`)
    bar.style.width = `${Math.min(1, sample.gLoad / GAUGE_MAX_G) * 100}%`
    bar.className = `gauge-fill ${levelFor(sample.gLoad, COMFORT_KICK_G, HARD_KICK_G)}`
  }
}

const CRASH_CAUSES: Readonly<Record<CrashCause, string>> = {
  impact: 'Chute : choc trop violent',
  figure: 'Chute : figure pas rentrée',
}

function verdict(report: KickerReport, crash: CrashReport | null = null): string {
  if (!report.reached || !report.landing) return tag('bad', crash ? 'Non sautée : déjà à terre' : 'Lèvre non atteinte')
  if (report.landing.crashed && crash) return tag('bad', CRASH_CAUSES[crash.cause])
  const { level, label } = landingVerdict(report.landing)
  return tag(level, label)
}

function idealCells(solution: InrunSolution | undefined): { speed: string; inrun: string } {
  if (!solution) return { speed: '…', inrun: '…' }
  if (solution.status === 'tooSlow') {
    return { speed: '—', inrun: tag('bad', 'Hors de portée même avec l’élan maximal : raidir l’élan') }
  }
  if (solution.status === 'tooFast') {
    return { speed: '—', inrun: tag('bad', 'Trop rapide même avec l’élan minimal') }
  }
  if (solution.status === 'unstable') {
    return { speed: '—', inrun: tag('warn', 'Pas de réglage stable : le saut frôle la cassure') }
  }
  return {
    speed: `${kmh(solution.lipSpeed)} km/h`,
    inrun: `${fixed(solution.inrunLength)} m (${fixed(solution.inrunDrop)} m de dénivelé)`,
  }
}

interface Row {
  readonly label: string
  readonly hint?: string
  readonly cell: (report: KickerReport, index: number) => string
}

/** Nom de la figure tel qu'on l'annonce : précédé de « Switch » quand le skieur décolle en arrière. */
export function trickName(plan: TrickPlan, takesOffSwitch: boolean): string {
  return takesOffSwitch ? `Switch ${plan.trick.label.toLowerCase()}` : plan.trick.label
}

/** Figure de la bosse et réponse à « y a-t-il le temps de la rentrer ? ». */
function trickCell(report: KickerReport, plan: TrickPlan | undefined, takesOffSwitch: boolean): string {
  if (!plan) return '—'
  const name = trickName(plan, takesOffSwitch)
  if (!report.reached || nominalTurns(plan.trick) === 0) return name
  const { level, label } = trickVerdict(plan)
  return `${name} ${tag(level, label)}`
}

const stanceLabel = (isSwitch: boolean): string => (isSwitch ? 'en switch' : 'de face')

function buildRows(
  result: SimulationResult,
  solutions: readonly InrunSolution[] | null,
  plans: readonly TrickPlan[],
  stances: readonly boolean[],
): Row[] {
  const rotating =
    (cell: (plan: TrickPlan) => string) =>
    (report: KickerReport, i: number): string =>
      report.reached && plans[i] && nominalTurns(plans[i].trick) > 0 ? cell(plans[i]) : '—'
  const jumped =
    (cell: (report: KickerReport) => string) =>
    (report: KickerReport): string =>
      report.reached ? cell(report) : '—'
  const landed =
    (cell: (landing: NonNullable<KickerReport['landing']>) => string) =>
    (report: KickerReport): string =>
      report.landing ? cell(report.landing) : '—'

  return [
    { label: 'Verdict', cell: (report) => verdict(report, result.crash) },
    { label: 'Figure', cell: (report, i) => trickCell(report, plans[i], stances[i] === true) },
    {
      label: 'Sens de glisse',
      hint: 'Un 180 ou un 540 fait atterrir dans l’autre sens ; le skieur le garde jusqu’au demi-tour suivant.',
      cell: (_, i) => `Décollage ${stanceLabel(stances[i] === true)}, réception ${stanceLabel(stances[i + 1] === true)}`,
    },
    {
      label: 'Élan de rotation pris au kick',
      hint: 'Moment cinétique à prendre au pop. Il ne change plus en l’air : toute la figure en découle. La limite est une estimation de ce qu’un skieur peut prendre.',
      cell: (report, i) =>
        report.reached && plans[i]
          ? `${fixed(plans[i].angularMomentum, 0)} kg·m²/s${
              nominalTurns(plans[i].trick) > 0 ? ` (limite ${fixed(plans[i].maxAngularMomentum, 0)})` : ''
            }`
          : '—',
    },
    {
      label: 'Lancer à la lèvre',
      hint: 'Vitesse à laquelle le buste bascule (saltos) et les skis pivotent sur leurs carres (vrilles) en quittant la neige : ce sont ces gestes, faits sur le kick, qui créent l’élan.',
      cell: (report, i) =>
        report.reached && plans[i]
          ? `buste ${Math.round((plans[i].set.lean * 180) / Math.PI)}°/s, pivot des skis ${Math.round((Math.abs(plans[i].takeoffPivotRate) * 180) / Math.PI)}°/s`
          : '—',
    },
    {
      label: 'À-coup des skis à la lèvre',
      hint: 'Bascule avant-arrière que les skis prendraient d’un coup en quittant la neige. Elle doit rester proche de zéro : sinon le lancer du buste ne suffit pas à fournir l’élan de salto. Le pivot et la prise de carre, eux, commencent sur la neige.',
      cell: (report, i) =>
        report.reached && plans[i] ? `${Math.round(plans[i].takeoffJolt * 360)}°/s` : '—',
    },
    {
      label: 'Rotation au plus fort de la figure',
      hint: 'Le skieur accélère en se groupant, sans rien ajouter à son élan.',
      cell: rotating((plan) => `${fixed(plan.peakRate, 2)} tour/s`),
    },
    {
      label: 'Temps de vol minimal pour la figure',
      hint: 'Vol le plus court qui laisse boucler la figure avec l’élan maximal. Estimation.',
      cell: rotating((plan) => `${fixed(plan.minAirTime, 2)} s`),
    },
    {
      label: 'Rotation bouclée',
      cell: rotating(
        (plan) => `${Math.round(plan.achievedTurns * 360)}° sur ${Math.round(nominalTurns(plan.trick) * 360)}°`,
      ),
    },
    {
      label: 'Rattrapage en fin de vol',
      hint: 'Écart que l’élan trouvé laisse à la réception et qui est corrigé en fin de vol. 0° : le vol est entièrement celui de la physique.',
      cell: rotating((plan) => `${Math.round((plan.inFlightCorrection * 180) / Math.PI)}°`),
    },
    {
      label: 'Hauteur réelle du kick',
      hint: 'Lèvre au-dessus du plat ; peut dépasser le réglage si la courbe seule monte déjà plus haut.',
      cell: (_, i) => `${fixed(result.terrain.kickers[i].lipY - result.terrain.kickers[i].baseY)} m`,
    },
    { label: 'Vitesse max dans l’élan', cell: (report) => `${kmh(report.approachSpeed)} km/h` },
    { label: 'Vitesse au pied du kick', cell: (report) => `${kmh(report.kickEntrySpeed)} km/h` },
    { label: 'Vitesse à la lèvre', cell: jumped((report) => `<b>${kmh(report.lipSpeed)} km/h</b>`) },
    {
      label: 'Perdu dans le kick',
      hint: 'Ralentissement dû à la montée, au frottement accru par la compression et à l’air.',
      cell: jumped((report) => `−${kmh(report.speedLostInKick)} km/h`),
    },
    {
      label: 'Vitesse idéale à la lèvre',
      hint: 'Vitesse qui fait atterrir sur le repère vert foncé de la réception.',
      cell: (_, i) => idealCells(solutions?.[i]).speed,
    },
    { label: 'Élan idéal', cell: (_, i) => idealCells(solutions?.[i]).inrun },
    {
      label: 'G max dans le kick',
      hint: `Repère d’étude : ${fixed(COMFORT_KICK_G)} g de confort.`,
      cell: (report) => tag(levelFor(report.maxG, COMFORT_KICK_G, HARD_KICK_G), `${fixed(report.maxG)} g`),
    },
    { label: 'Distance de vol', cell: jumped((report) => `${fixed(report.flightDistance)} m`) },
    { label: 'Temps de vol', cell: jumped((report) => `${fixed(report.airTime, 2)} s`) },
    { label: 'Hauteur max sur la neige', cell: jumped((report) => `${fixed(report.maxHeight)} m`) },
    {
      label: 'Écart au point visé',
      cell: landed((landing) => `${signed(landing.offsetFromTarget)} m`),
    },
    { label: 'Vitesse à l’impact', cell: landed((landing) => `${kmh(landing.impactSpeed)} km/h`) },
    {
      label: 'Hauteur de chute équivalente',
      hint: `Chute à plat qui donnerait le même choc. Visé : ${fixed(SAFE_FALL_HEIGHT)} m ou moins.`,
      cell: landed((landing) =>
        tag(
          levelFor(landing.equivalentFallHeight, SAFE_FALL_HEIGHT, HARD_FALL_HEIGHT),
          `${fixed(landing.equivalentFallHeight, 2)} m`,
        ),
      ),
    },
    {
      label: 'G estimés à l’impact',
      hint: 'Moyenne sur 0,6 m d’amorti des jambes.',
      cell: landed((landing) => `${fixed(landing.impactG)} g`),
    },
    { label: 'Vitesse après réception', cell: landed((landing) => `${kmh(landing.speedAfter)} km/h`) },
    {
      label: 'Vitesse max en sortie',
      hint: 'Vitesse regagnée dans la pente de réception.',
      cell: jumped((report) => `${kmh(report.exitSpeed)} km/h`),
    },
  ]
}

/** Résumé toujours visible : verdict de la ligne et une carte par bosse avec l'essentiel. */
export function renderSummary(
  element: HTMLElement,
  result: SimulationResult,
  solutions: readonly InrunSolution[] | null,
  plans: readonly TrickPlan[],
  stances: readonly boolean[],
  fall?: RagdollTrack,
): void {
  const rows = result.reports.map((report, i) => {
    const solution = solutions?.[i]
    const ideal = !solution ? '…' : solution.status === 'ok' ? `${kmh(solution.lipSpeed)} km/h` : '—'
    const lip = report.reached ? `${kmh(report.lipSpeed)} km/h` : '—'
    const flight = report.reached ? `${fixed(report.flightDistance)} m` : '—'
    const shock = report.landing
      ? tag(
          levelFor(report.landing.equivalentFallHeight, SAFE_FALL_HEIGHT, HARD_FALL_HEIGHT),
          `${fixed(report.landing.equivalentFallHeight, 2)} m`,
        )
      : '—'
    const stats = [
      ['À la lèvre', lip],
      ['Vitesse idéale', ideal],
      ['Vol', flight],
      ['Choc', shock],
    ].map(([name, value]) => `<div><dt>${name}</dt><dd>${value}</dd></div>`)
    return `<article class="bump-card">
      <h3>Bosse ${i + 1}</h3>
      <p class="bump-trick">${trickCell(report, plans[i], stances[i] === true)}</p>
      <dl class="bump-stats">${stats.join('')}</dl>
      <p class="bump-landing">${verdict(report, result.crash)}</p>
    </article>`
  })
  const { crash } = result
  const { level, label } = crash
    ? { level: 'bad' as Level, label: `Chute à la réception de la bosse ${crash.kicker + 1}` }
    : lineVerdict(result.reports.map((report) => report.landing))
  // Ce que devient le skieur une fois à terre : la glissade calculée par la simulation.
  // La chute articulée, quand elle est disponible, fait foi pour la distance, la durée et les chocs.
  const distance = fall ? fall.slideDistance : crash?.slideDistance ?? 0
  const duration = fall ? fall.duration : crash?.slideDuration ?? 0
  const stopped = fall ? fall.stopped : crash?.stopped ?? true
  const notes = fall && fall.notes.length > 0 ? `<ul class="crash">${fall.notes.map((note) => `<li>${note}</li>`).join('')}</ul>` : ''
  const slide = crash
    ? `<p class="crash">Impact à ${kmh(crash.impactSpeed)} km/h, puis il dévale ${fixed(distance, 0)} m en ${fixed(duration)} s ${
        stopped ? 'avant de s’arrêter' : 'et glisse encore'
      }. Ses skis déchaussent et partent devant.</p>${notes}`
    : ''
  element.innerHTML = `
    <p class="verdict ${level}">${label}</p>${slide}
    <div class="bump-cards">${rows.join('')}</div>`
}

/** Tableau de résultats détaillé : une colonne par bosse. */
export function renderResults(
  element: HTMLElement,
  result: SimulationResult,
  solutions: readonly InrunSolution[] | null,
  plans: readonly TrickPlan[],
  stances: readonly boolean[],
): void {
  const { reports } = result

  const header = reports.map((_, i) => `<th>Bosse ${i + 1}</th>`).join('')
  const body = buildRows(result, solutions, plans, stances)
    .map((row) => {
      const cells = reports.map((report, i) => `<td>${row.cell(report, i)}</td>`).join('')
      // L'explication se déplie au clic ou au toucher : un `title` ne se lit pas sur un téléphone.
      const label = row.hint ? `<details class="hint"><summary>${row.label}</summary>${row.hint}</details>` : row.label
      return `<tr><th scope="row">${label}</th>${cells}</tr>`
    })
    .join('')

  element.innerHTML = `
    <table><thead><tr><th></th>${header}</tr></thead><tbody>${body}</tbody></table>`
}

export function renderError(element: HTMLElement, error: unknown): void {
  const message = error instanceof Error ? error.message : 'erreur inconnue'
  element.textContent = `Simulation impossible : ${message}`
}
