/**
 * Postures du skieur au fil d'un saut : appel dans la compression, pop à la lèvre, figure tenue,
 * ouverture vers la réception, amorti.
 *
 * Les consignes viennent des tutoriels de figures (Ski Addiction, Freeskier « Backy Academy »,
 * Fall-Line, Ski Mag, Backcountry Access) et de l'observation de photos de chaque figure :
 * - on tend complètement les jambes à l'instant où les pieds quittent la lèvre, et la rotation ne
 *   part qu'à ce moment ;
 * - vrilles : bras et épaules armés à l'opposé en bas du kick, revenus au neutre au pop, puis la
 *   tête mène ;
 * - grabs : ce sont les genoux qui montent vers la main, le buste reste presque droit ; la main
 *   libre part loin sur le côté pour l'équilibre ;
 * - backflip : hanches vers l'avant et buste vers l'arrière au pop, puis corps ouvert et cambré,
 *   bras écartés, tête vers la réception ; groupé serré seulement si le vol est court ;
 * - désaxés : pop d'une vrille puis épaule menante qui tombe, grab pour ramener les pieds sous soi ;
 * - réception : jambes tendues vers la neige, mains devant, amorti chevilles-genoux-hanches.
 */
import { massPoints, massProperties } from './bodyMass'
import { solveJoints } from './skeleton'
import {
  flightPhases,
  RELAXED_COMPACTNESS,
  type GrabKind,
  type Trick,
  type TrickFamily,
} from './tricks'

/** Positions de mains connues du squelette. */
export type ArmPreset = 'ride' | 'forward' | 'up' | 'wide' | 'back' | 'in' | 'low' | 'knees'
export type ArmWeights = Readonly<Record<ArmPreset, number>>

export interface BodyPose {
  /** Flexion de glisse, de 0 (debout) à 1 (accroupi sur les skis, buste penché). */
  readonly flex: number
  /** Groupé en l'air, de 0 à 1 : genoux remontés vers la poitrine, buste presque droit. */
  readonly tuck: number
  /**
   * Corps cambré vers l'arrière, de 0 à 1 : hanches ouvertes, genoux pliés, dos creusé. C'est la
   * forme d'un backflip ouvert, à l'opposé du groupé genoux-poitrine.
   */
  readonly layback: number
  /** Inclinaison supplémentaire du buste en radians : négatif = vers l'arrière. */
  readonly lean: number
  /** Rotation des épaules par rapport aux skis, en radians, dans le sens de la vrille. */
  readonly twist: number
  /**
   * Écartement des pieds, de 0 (largeur de glisse) à 1 (appuis larges). Une vrille se lance sur des
   * appuis écartés : c'est la distance entre les deux skis qui donne le bras de levier du couple.
   */
  readonly stance: number
  /**
   * Balayage des bras autour du buste, en radians, dans le sens de la vrille : en plus de la
   * rotation des épaules. Négatif, le bras menant croise devant le corps et l'autre part derrière.
   */
  readonly armSweep: number
  /** Croisement des skis en X, en radians par ski. */
  readonly skiCross: number
  /** Tête basculée vers l'arrière (positif) ou menton rentré (négatif), en radians. */
  readonly headPitch: number
  /** Tête tournée dans le sens de la vrille, en radians. */
  readonly headYaw: number
  /** Position des bras ; pendant un grab, elle ne vaut que pour la main libre. */
  readonly arms: ArmWeights
  /** Grab en cours et son avancement, de 0 (main libre) à 1 (main sur le ski). */
  readonly grab: GrabKind
  readonly grabAmount: number
  /** Figure faite de l'autre côté : c'est la main gauche qui attrape, et le ski gauche qui passe dessus. */
  readonly mirrored: boolean
}

/** Fenêtre d'animation autour du saut, en secondes. */
export const WIND_UP_SECONDS = 0.55
const LOADED_SECONDS = 0.28
const ABSORB_SECONDS = 0.14
export const RECOVER_SECONDS = 0.75

/** Part du chemin déjà faite vers la posture de réception quand le skieur de backflip la repère. */
const SPOTTING_OPENNESS = 0.55
const EXTENDED_FLEX = 0.05
const OPEN_FLEX = 0.2
const LOADED_FLEX = 0.55
const ABSORB_FLEX = 0.72
/** Armé des épaules avant une vrille : croît avec le nombre de tours, sans dépasser 45°. */
const WIND_PER_TURN = 0.26
const MAX_WIND = 0.8
/**
 * Appuis d'une vrille : les pieds s'écartent dès le bas du kick, d'autant plus que la figure compte
 * de tours, et restent larges jusqu'à ce que les skis quittent la neige.
 */
const SPIN_STANCE = { base: 0.55, perTurn: 0.3 }
/** Les bras vont plus loin que les épaules dans l'armé : le bras menant croise devant le corps. */
const ARM_WIND_RATIO = 1.3
/** À la lèvre, les bras sont déjà lancés dans le sens de la vrille et entraînent les épaules. */
const ARM_THROW = 0.55

/** Écartement des appuis pour une figure, de 0 (pas de vrille) à 1. */
function spinStance(spins: number): number {
  return spins > 0 ? Math.min(1, SPIN_STANCE.base + SPIN_STANCE.perTurn * spins) : 0
}

/** Skis croisés en X d'un mute : environ 35° chacun. */
const MUTE_SKI_CROSS = 0.6
/**
 * Japan : jambes repliées, buste redressé et tourné vers la main qui passe derrière la jambe.
 * Les skis partent derrière d'eux-mêmes : en repliant les jambes, le skieur fait basculer ses skis
 * dans un sens et son buste dans l'autre (conservation du moment cinétique).
 */
const JAPAN = { lean: -1.05, twist: -0.55, headPitch: 0.2 }
/** Un grab demande de remonter les genoux à fond, quel que soit le temps de vol. */
const GRAB_TUCK = 1

/** Amplitude dans laquelle le buste peut se régler pour équilibrer une vrille, en radians. */
const BALANCE_LEAN_RANGE = 0.9

const NO_ARMS: ArmWeights = { ride: 0, forward: 0, up: 0, wide: 0, back: 0, in: 0, low: 0, knees: 0 }
const NEUTRAL: BodyPose = {
  flex: 0,
  tuck: 0,
  layback: 0,
  lean: 0,
  twist: 0,
  stance: 0,
  armSweep: 0,
  skiCross: 0,
  headPitch: 0,
  headYaw: 0,
  arms: { ...NO_ARMS, ride: 1 },
  grab: 'none',
  grabAmount: 0,
  mirrored: false,
}

type PoseChanges = Partial<Omit<BodyPose, 'arms'>> & { arms?: Partial<ArmWeights> }

function pose(changes: PoseChanges): BodyPose {
  return { ...NEUTRAL, ...changes, arms: changes.arms ? { ...NO_ARMS, ...changes.arms } : NEUTRAL.arms }
}

/** Posture de glisse : seule la flexion varie, selon l'appui. */
export function ridePose(flex: number): BodyPose {
  return pose({ flex })
}

const mix = (from: number, to: number, ratio: number): number => from + (to - from) * ratio

function mixPose(from: BodyPose, to: BodyPose, ratio: number): BodyPose {
  const number = (
    key: 'flex' | 'tuck' | 'layback' | 'lean' | 'twist' | 'stance' | 'armSweep' | 'skiCross' | 'headPitch' | 'headYaw' | 'grabAmount',
  ): number =>
    mix(from[key], to[key], ratio)
  return {
    flex: number('flex'),
    tuck: number('tuck'),
    layback: number('layback'),
    lean: number('lean'),
    twist: number('twist'),
    stance: number('stance'),
    armSweep: number('armSweep'),
    skiCross: number('skiCross'),
    headPitch: number('headPitch'),
    headYaw: number('headYaw'),
    arms: {
      ride: mix(from.arms.ride, to.arms.ride, ratio),
      forward: mix(from.arms.forward, to.arms.forward, ratio),
      up: mix(from.arms.up, to.arms.up, ratio),
      wide: mix(from.arms.wide, to.arms.wide, ratio),
      back: mix(from.arms.back, to.arms.back, ratio),
      in: mix(from.arms.in, to.arms.in, ratio),
      low: mix(from.arms.low, to.arms.low, ratio),
      knees: mix(from.arms.knees, to.arms.knees, ratio),
    },
    // La main vise le même point du ski pendant toute l'approche et tout le relâchement du grab.
    grab: to.grabAmount > 0 ? to.grab : from.grab,
    grabAmount: number('grabAmount'),
    // Le côté suit le grab : la même main le prend et le lâche.
    mirrored: to.grabAmount > 0 || to.skiCross !== 0 ? to.mirrored : from.mirrored,
  }
}

const smooth = (ratio: number): number => {
  const x = Math.min(1, Math.max(0, ratio))
  return x * x * (3 - 2 * x)
}

/** En switch, le skieur glisse dos à la pente : épaules ouvertes et tête tournée par-dessus l'épaule. */
const SWITCH_LOOK = { twist: 0.45, headYaw: 1.5, lean: -0.08 }

/**
 * Part du « regard par-dessus l'épaule » à un instant du saut, de 0 à 1. Elle vaut 1 tant que le
 * skieur glisse en switch, s'efface pendant la figure et revient avant une réception en switch.
 */
export function switchLookAmount(
  switchBefore: boolean,
  switchAfter: boolean,
  timeFromTakeoff: number,
  airTime: number,
): number {
  const before = switchBefore ? 1 : 0
  const after = switchAfter ? 1 : 0
  if (timeFromTakeoff <= 0) return before
  if (timeFromTakeoff >= airTime) return after
  const { shaping, opening } = flightPhases(airTime)
  const leaving = before * (1 - smooth(timeFromTakeoff / shaping))
  const arriving = after * smooth((timeFromTakeoff - (airTime - opening)) / opening)
  return Math.max(leaving, arriving)
}

/**
 * Ajoute à une posture le regard par-dessus l'épaule de la glisse en switch : l'épaule gauche, ou
 * la droite quand le skieur tourne à droite, pour que la tête ne change pas de côté après la figure.
 */
export function withSwitchLook(body: BodyPose, amount: number, rightward = false): BodyPose {
  if (amount <= 0) return body
  const side = rightward ? -1 : 1
  return {
    ...body,
    twist: body.twist + side * SWITCH_LOOK.twist * amount,
    headYaw: body.headYaw + side * SWITCH_LOOK.headYaw * amount,
    lean: body.lean + SWITCH_LOOK.lean * amount,
  }
}

/**
 * Posture pendant une chute. Tant que le corps roule, bras et jambes partent dans tous les sens au
 * rythme du roulé-boulé ; une fois arrêté, le skieur est étendu sur le dos, bras écartés.
 */
export function crashPose(tumble: number, settled: number): BodyPose {
  const flail = Math.sin(tumble * 1.3)
  const loose = 1 - settled
  return pose({
    flex: mix(0.35 + 0.22 * flail, 0.1, settled),
    tuck: 0.25 * loose * (0.5 + 0.5 * Math.cos(tumble)),
    twist: 0.35 * flail * loose,
    headPitch: 0.15,
    arms: {
      wide: mix(0.5, 1, settled),
      up: 0.3 * loose * (0.5 + 0.5 * flail),
      back: 0.2 * loose * (0.5 - 0.5 * flail),
    },
  })
}

/** Bas du kick : jambes chargées, et épaules armées à l'opposé pour les figures qui vrillent. */
function loadedPose(spins: number): BodyPose {
  // Seules les figures qui vrillent arment les épaules ; un salto pur part droit.
  const twist = -Math.min(MAX_WIND, WIND_PER_TURN * spins)
  // Mains basses : elles seront lancées vers l'avant et le haut au pop, ce qui aide l'impulsion.
  const loaded = pose({ flex: LOADED_FLEX, lean: 0.05, twist, arms: { low: 0.7, ride: 0.3 } })
  if (spins <= 0) return loaded
  // Vrille : appuis larges, bras armés à l'opposé un peu décollés du corps pour peser dans le lancer.
  return {
    ...loaded,
    stance: spinStance(spins),
    armSweep: twist * ARM_WIND_RATIO,
    arms: { ...NO_ARMS, low: 0.45, ride: 0.3, wide: 0.25 },
  }
}

/** À la lèvre : le lancer de la famille, sur des appuis encore larges et bras lancés s'il y a vrille. */
function popPose(trick: Trick): BodyPose {
  const spins = Math.abs(trick.spins)
  const pop = POP[trick.family]
  return spins > 0 ? { ...pop, stance: spinStance(spins), armSweep: ARM_THROW } : pop
}

/** À la lèvre : corps complètement tendu, et lancer propre à chaque famille. */
const POP: Readonly<Record<TrickFamily, BodyPose>> = {
  straight: pose({ flex: EXTENDED_FLEX, arms: { forward: 0.5, ride: 0.5 } }),
  // La vrille part sur la neige : à la lèvre, épaules et tête sont déjà engagées dans la rotation.
  spin: pose({ flex: EXTENDED_FLEX, twist: 0.25, headYaw: 0.3, arms: { forward: 0.5, ride: 0.5 } }),
  backflip: pose({ flex: 0.03, lean: -0.3, headPitch: 0.08, arms: { up: 1 } }),
  frontflip: pose({ flex: 0.03, lean: 0.12, arms: { up: 1 } }),
  cork: pose({ flex: EXTENDED_FLEX, lean: -0.14, twist: 0.25, headYaw: 0.3, arms: { ride: 0.5, forward: 0.5 } }),
  rodeo: pose({ flex: 0.03, lean: -0.28, twist: 0.6, arms: { up: 1 } }),
  misty: pose({ flex: 0.02, lean: 0.1, twist: 0.2, arms: { forward: 1 } }),
}

/** Ce que le grab impose au corps : skis, buste, et la main libre qui part sur le côté. */
function grabChanges(grab: GrabKind): PoseChanges {
  switch (grab) {
    case 'none':
      return {}
    case 'safety':
      return { tuck: GRAB_TUCK, grab, grabAmount: 1, arms: { back: 1 } }
    case 'mute':
      return { tuck: GRAB_TUCK, skiCross: MUTE_SKI_CROSS, grab, grabAmount: 1, arms: { back: 1 } }
    case 'japan':
      return { tuck: GRAB_TUCK, ...JAPAN, grab, grabAmount: 1, arms: { wide: 0.6, up: 0.4 } }
  }
}

/**
 * Backflip ouvert, tel qu'on le voit quand le saut laisse le temps : corps cambré presque droit des
 * genoux aux épaules, genoux pliés, bras écartés et relâchés, tête rejetée vers la réception.
 */
const OPEN_BACKFLIP = pose({ flex: 0.1, layback: 1, headPitch: 0.45, arms: { wide: 0.85, up: 0.15 } })

/**
 * Backflip au milieu du vol : ouvert et cambré tant que le temps de vol le permet, puis de plus en
 * plus groupé genoux-poitrine, mains sur les genoux, quand il faut tourner vite.
 */
function backflipPose(compactness: number, tuckMax: number): BodyPose {
  const tightness = Math.min(1, Math.max(0, (compactness - RELAXED_COMPACTNESS) / (1 - RELAXED_COMPACTNESS)))
  const tucked = pose({ tuck: tuckMax, headPitch: 0.5, arms: { knees: 1 } })
  return mixPose(OPEN_BACKFLIP, tucked, smooth(tightness))
}

const leanCache = new Map<string, number>()

/**
 * Inclinaison du buste qui place les masses du skieur autour de son axe de vrille. Sans elle, cet
 * axe n'est pas un axe principal d'inertie et la vrille part en oscillation ; un skieur qui tient
 * une vrille propre fait ce réglage d'instinct.
 */
function balancedLean(shape: BodyPose): number {
  const key = [shape.tuck, shape.twist, shape.skiCross, shape.grab, shape.grabAmount, ...Object.values(shape.arms)].join('|')
  const cached = leanCache.get(key)
  if (cached !== undefined) return cached

  // Produit d'inertie entre l'avant et le haut : nul quand l'axe de vrille est un axe principal.
  const imbalance = (lean: number): number =>
    massProperties(massPoints(solveJoints({ ...shape, lean }))).inertia.elements[1]
  let low = -BALANCE_LEAN_RANGE
  let high = BALANCE_LEAN_RANGE
  const rising = imbalance(high) > imbalance(low)
  if (Math.sign(imbalance(low)) === Math.sign(imbalance(high))) {
    const fallback = Math.abs(imbalance(low)) < Math.abs(imbalance(high)) ? low : high
    leanCache.set(key, fallback)
    return fallback
  }
  for (let i = 0; i < 30; i++) {
    const middle = (low + high) / 2
    if (imbalance(middle) > 0 === rising) high = middle
    else low = middle
  }
  const lean = (low + high) / 2
  leanCache.set(key, lean)
  return lean
}

/** Figure tenue au milieu du vol. */
function heldPose(trick: Trick, compactness: number): BodyPose {
  // Le backflip groupé reste genoux-poitrine même quand le vol laisserait le temps de s'ouvrir.
  if (trick.family === 'backflip') return backflipPose(trick.tucked ? 1 : compactness, trick.tuckMax)
  const tuck = trick.tuckMax * compactness
  const grab = grabChanges(trick.grab)

  switch (trick.family) {
    case 'straight':
      return pose({ tuck, arms: { ride: 0.5, wide: 0.5 }, ...grab })
    case 'spin': {
      // La tête mène la rotation ; sans grab, les bras restent contenus, coudes pliés, mains devant le
      // ventre. Écartés à hauteur d'épaules, ils freinent la vrille et dessinent un « T ».
      const shape = pose({ tuck, twist: 0.15, headYaw: 0.6, arms: { in: 0.7, ride: 0.3 }, ...grab })
      // Le japan impose son buste ; sinon le skieur se place autour de son axe de vrille.
      return trick.grab === 'japan' ? shape : { ...shape, lean: balancedLean(shape) }
    }
    case 'frontflip':
      return pose({ tuck, headPitch: -0.35, arms: { knees: 1 } })
    case 'cork':
      // Corps couché sur le côté, regard par-dessus l'épaule vers la réception.
      return pose({ tuck, twist: 0.2, headYaw: 0.5, headPitch: -0.25, arms: { in: 1 }, ...grab })
    case 'rodeo':
      // Base de backflip : dos creusé, skis ramenés derrière.
      return pose({ tuck, layback: 0.25, headYaw: 0.6, headPitch: 0.2, arms: { in: 1 }, ...grab })
    case 'misty':
      return pose({ tuck, headYaw: 0.4, headPitch: -0.3, arms: { in: 1 }, ...grab })
  }
}

/** Juste avant l'impact : jambes vers la neige, mains vers la réception. */
function openPose(family: TrickFamily): BodyPose {
  if (family === 'straight') return pose({ flex: OPEN_FLEX })
  if (family === 'backflip') return pose({ flex: OPEN_FLEX, arms: { up: 0.5, wide: 0.5 } })
  return pose({ flex: OPEN_FLEX, arms: { forward: 1 } })
}

const ABSORB = pose({ flex: ABSORB_FLEX, lean: 0.06, arms: { ride: 0.7, forward: 0.3 } })

/**
 * Lancer de la figure à la lèvre : vitesses, en rad/s, auxquelles le buste bascule vers l'arrière
 * et les épaules tournent dans le sens de la vrille à l'instant où les skis quittent la neige.
 * C'est ce mouvement, fait pendant que la neige retient encore les skis, qui donne au skieur son
 * élan de rotation : en l'air, il ne pourrait plus le créer.
 */
export interface TakeoffSet {
  readonly lean: number
  readonly twist: number
}

/** Ce qu'il faut savoir d'un saut pour en dérouler les postures. */
export interface PoseTiming {
  readonly trick: Trick
  readonly airTime: number
  /** Groupé tenu au milieu du vol, de 0 à 1. */
  readonly compactness: number
  /** Lancer à la lèvre ; absent, le skieur arrive à la lèvre sans élan de rotation. */
  readonly set?: TakeoffSet
}

/** Durée caractéristique du lancer, de part et d'autre de la lèvre, en secondes. */
const SET_SECONDS = 0.16

/**
 * Écart de posture dû au lancer, pour une vitesse d'un radian par seconde à la lèvre. Avant la
 * lèvre le buste part de l'autre côté (c'est l'armé), il traverse sa position neutre à pleine
 * vitesse en quittant la neige, puis le mouvement s'éteint en l'air.
 */
export function setSwing(timeFromTakeoff: number): number {
  return timeFromTakeoff * Math.exp(-((timeFromTakeoff / SET_SECONDS) ** 2))
}

function withSet(body: BodyPose, set: TakeoffSet | undefined, timeFromTakeoff: number): BodyPose {
  if (!set) return body
  const swing = setSwing(timeFromTakeoff)
  return { ...body, lean: body.lean - set.lean * swing, twist: body.twist + set.twist * swing }
}

interface Keyframe {
  readonly time: number
  readonly pose: BodyPose
}

/**
 * Même posture, faite de l'autre côté. Toutes les postures sont écrites pour une vrille à gauche et
 * la main droite : à droite, épaules, bras et tête tournent dans l'autre sens et le grab change de main.
 */
export function mirrorPose(body: BodyPose): BodyPose {
  return { ...body, twist: -body.twist, armSweep: -body.armSweep, headYaw: -body.headYaw, mirrored: !body.mirrored }
}

/**
 * Posture à un instant du saut. `timeFromTakeoff` est négatif pendant l'élan, nul à la lèvre.
 * Hors de la fenêtre du saut, le skieur est en posture de glisse.
 */
export function bodyPose(plan: PoseTiming, timeFromTakeoff: number, rideFlex: number): BodyPose {
  return bodyPoser(plan, rideFlex)(timeFromTakeoff)
}

/**
 * Comme `bodyPose`, pour qui lit beaucoup d'instants d'un même saut (la planification en échantillonne
 * des centaines) : les postures-clés ne dépendent que de la figure, du temps de vol et du groupé, on
 * les construit une seule fois et la fonction renvoyée n'a plus qu'à interpoler.
 */
export function bodyPoser(plan: PoseTiming, rideFlex: number): (timeFromTakeoff: number) => BodyPose {
  const { trick, airTime } = plan
  const ride = ridePose(rideFlex)
  if (airTime <= 0) return () => ride
  const sided = (body: BodyPose): BodyPose => (trick.mirrored ? mirrorPose(body) : body)

  const { shaping, opening } = flightPhases(airTime)
  const held = heldPose(trick, plan.compactness)
  const heldFrom = shaping
  const openFrom = airTime - opening
  const landing = openPose(trick.family)
  // Un salto se rouvre tôt : dès que la réception est en vue, les jambes repassent sous le corps.
  // Sur un vol trop court pour cela, il reste groupé jusqu'à l'ouverture finale.
  const spotFrom = openFrom - opening
  const spots = trick.family === 'backflip' || trick.family === 'frontflip'
  const release: readonly Keyframe[] =
    spots && spotFrom > heldFrom
      ? [
          { time: spotFrom, pose: held },
          { time: openFrom, pose: mixPose(held, landing, SPOTTING_OPENNESS) },
        ]
      : [{ time: openFrom, pose: held }]
  const frames: readonly Keyframe[] = [
    { time: -WIND_UP_SECONDS, pose: ride },
    { time: -LOADED_SECONDS, pose: sided(loadedPose(Math.abs(trick.spins))) },
    { time: 0, pose: sided(popPose(trick)) },
    { time: heldFrom, pose: sided(held) },
    ...release.map((frame) => ({ ...frame, pose: sided(frame.pose) })),
    { time: airTime, pose: landing },
    { time: airTime + ABSORB_SECONDS, pose: ABSORB },
    { time: airTime + RECOVER_SECONDS, pose: ride },
  ]

  return (timeFromTakeoff: number): BodyPose => {
    if (timeFromTakeoff <= frames[0].time || timeFromTakeoff >= frames[frames.length - 1].time) return ride
    const next = frames.findIndex((frame) => frame.time > timeFromTakeoff)
    const from = frames[next - 1]
    const to = frames[next]
    const span = to.time - from.time
    const shape = span > 0 ? mixPose(from.pose, to.pose, smooth((timeFromTakeoff - from.time) / span)) : to.pose
    return withSet(shape, plan.set, timeFromTakeoff)
  }
}
