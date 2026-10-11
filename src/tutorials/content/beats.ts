import type { BeatAnchor, BeatSpec, BodyPart, GazeKind } from '../beats'

/**
 * Moments clés de chaque figure. Les instants avant la lèvre et avant l'impact sont ceux que le
 * skieur du simulateur respecte (jambes chargées 0,28 s avant la lèvre, ouverture 0,4 s avant
 * l'impact) ; les angles de vrille et de salto sont lus sur sa rotation réelle.
 */

type Tip = readonly [part: BodyPart, text: string]

const beat = (at: BeatAnchor, title: string, text: string, gaze: GazeKind, tips: readonly Tip[]): BeatSpec => ({
  at,
  title,
  text,
  gaze,
  callouts: tips.map(([part, tip]) => ({ part, text: tip })),
})

/** Secondes avant la lèvre où les jambes sont chargées et commencent à pousser. */
const LOADED = -0.28
/** Secondes avant l'impact où le corps s'ouvre pour aller chercher la neige. */
const OPENING = -0.4

const IN_LINE = beat(
  { from: 'kick', seconds: -1.2 },
  'En ligne',
  'Ta vitesse est faite. Plus de virage ni de freinage : à partir d’ici tu ne touches plus à rien.',
  'lip',
  [
    ['head', 'Regard sur le bout de la lèvre'],
    ['chest', 'Buste légèrement vers l’avant'],
    ['hands', 'Mains devant, visibles'],
    ['skis', 'À plat, à la largeur des hanches'],
  ],
)

const KICK_ENTRY = beat(
  { from: 'kick', seconds: 0 },
  'Entrée de la courbe',
  'La bosse commence à te pousser dans les jambes. Résiste : si tu t’assois ici, tu décolleras en arrière.',
  'lip',
  [
    ['knees', 'Fléchis et toniques : ils encaissent'],
    ['hips', 'Au-dessus des pieds, pas derrière'],
    ['chest', 'Perpendiculaire à la bosse'],
  ],
)

const PUSH_START = beat(
  { from: 'takeoff', seconds: LOADED },
  'Début de la poussée',
  'C’est ici que tu commences à te déplier, pas avant : tu as moins de trois dixièmes de seconde pour finir.',
  'horizon',
  [
    ['knees', 'Chargés : ils commencent à pousser'],
    ['chest', 'Gainé, il monte avec les jambes'],
    ['hands', 'Elles montent devant toi'],
    ['head', 'Le regard quitte la lèvre et passe au-dessus'],
  ],
)

const POP = beat(
  { from: 'takeoff', seconds: 0 },
  'Pop',
  'Tes pieds passent la lèvre : l’extension doit être finie maintenant. Trop tôt, tu décolles à plat ; trop tard, tu pousses dans le vide.',
  'horizon',
  [
    ['knees', 'Jambes tendues'],
    ['hips', 'Elles avancent vers les mains'],
    ['skis', 'Poussée égale sur les deux pieds'],
    ['head', 'Regard à l’horizon, pas sur les spatules'],
  ],
)

const APEX = beat(
  { air: 0.5 },
  'Sommet du saut',
  'Tu ne peux plus rien changer à ta trajectoire. Reste compact et calme : tout mouvement brusque te déséquilibre.',
  'landing',
  [
    ['knees', 'Légèrement remontés'],
    ['hands', 'Sur les côtés, immobiles'],
    ['head', 'Regard déjà sur la réception'],
  ],
)

const GEAR_DOWN = beat(
  { from: 'landing', seconds: OPENING },
  'Train d’atterrissage',
  'Déplie les jambes vers la neige et incline les skis comme la pente : tu vas à sa rencontre, tu ne l’attends pas.',
  'landing',
  [
    ['knees', 'Ils se déplient, sans se verrouiller'],
    ['skis', 'Parallèles à la pente de réception'],
    ['head', 'Regard sur ton point de chute'],
  ],
)

const IMPACT = beat(
  { from: 'landing', seconds: 0 },
  'Impact',
  'Les deux skis touchent ensemble. Amortis, puis laisse-toi repartir avec la pente.',
  'horizon',
  [
    ['skis', 'Les deux en même temps, à plat'],
    ['knees', 'Chevilles, genoux, hanches plient dans cet ordre'],
    ['chest', 'Vers l’avant'],
    ['hands', 'Devant les hanches'],
  ],
)

const SWITCH_IMPACT = beat(
  { from: 'landing', seconds: 0 },
  'Impact en switch',
  'Tu poses en marche arrière. Amortis, roule quelques mètres, et ne te retourne qu’ensuite.',
  'shoulder',
  [
    ['skis', 'Les deux ensemble, talons vers l’aval'],
    ['knees', 'Ils plient pour amortir'],
    ['head', 'Regard par-dessus l’épaule, vers l’aval'],
    ['chest', 'Centré : ni sur les talons ni sur les spatules'],
  ],
)

const STRAIGHT: readonly BeatSpec[] = [IN_LINE, KICK_ENTRY, PUSH_START, POP, APEX, GEAR_DOWN, IMPACT]

function grab(title: string, text: string, tips: readonly Tip[]): readonly BeatSpec[] {
  return [
    IN_LINE,
    KICK_ENTRY,
    PUSH_START,
    { ...POP, text: `${POP.text} Le grab ne commence qu’après.` },
    beat({ air: 0.3 }, title, text, 'horizon', tips),
    beat(
      { from: 'landing', seconds: OPENING - 0.1 },
      'Lâche le ski',
      'Lâche maintenant, pas plus tard : il te faut le temps de déplier les jambes avant la neige.',
      'landing',
      [
        ['hands', 'La main lâche et revient devant'],
        ['knees', 'Ils commencent à se déplier'],
        ['head', 'Regard sur la réception'],
      ],
    ),
    IMPACT,
  ]
}

const SPIN_ARMED = beat(
  { from: 'takeoff', seconds: LOADED },
  'Armé',
  'Jambes chargées, épaules et bras tournés à l’opposé du sens où tu vas tourner. Les skis, eux, restent droits.',
  'horizon',
  [
    ['chest', 'Épaules armées à l’opposé de la rotation'],
    ['hands', 'Bras écartés, prêts à lancer'],
    ['knees', 'Chargés : ils commencent à pousser'],
    ['skis', 'Droits et à plat : aucun pivot'],
  ],
)

const SPIN_RELEASE = beat(
  { from: 'takeoff', seconds: 0 },
  'Lâche la vrille',
  'Les talons quittent la lèvre : l’armé se relâche dans la toute fin de la poussée. Plus tôt, dans la courbe, les skis dérapent ; plus tard, en l’air, tu n’as plus d’appui pour tourner.',
  'shoulder',
  [
    ['head', 'Elle part la première, regard par-dessus l’épaule'],
    ['chest', 'Épaules déjà engagées dans la rotation, buste droit'],
    ['knees', 'Jambes tendues : le pop est fini'],
    ['skis', 'Encore droits en quittant la neige'],
  ],
)

const SPIN_TUCK = beat(
  { spin: 90 },
  'Regroupe',
  'Un quart de tour est fait. Ramène les bras près du corps et remonte un peu les genoux : plus tu es compact, plus tu tournes vite.',
  'shoulder',
  [
    ['hands', 'Près du corps'],
    ['knees', 'Un peu remontés, jambes souples'],
    ['chest', 'Grand et droit : s’il penche, la rotation part de travers'],
  ],
)

const SPIN_BLIND = beat(
  { spin: 180 },
  'Dos à la pente',
  'Tu ne vois plus la réception. Ne regarde pas le sol : continue de chercher par-dessus l’épaule, c’est la tête qui emmène le reste.',
  'shoulder',
  [
    ['head', 'Menton haut, regard par-dessus l’épaule'],
    ['chest', 'Toujours droit'],
    ['hands', 'Toujours près du corps'],
  ],
)

const spotLanding = (degrees: number, text: string): BeatSpec =>
  beat({ spin: degrees }, 'Tu vois la réception', text, 'landing', [
    ['head', 'Regard verrouillé sur ton point de chute'],
    ['hands', 'Elles s’ouvrent vers l’avant : la rotation ralentit'],
    ['knees', 'Ils commencent à se déplier'],
  ])

const FLIP_POP = beat(
  { from: 'takeoff', seconds: 0 },
  'Pop et lancer',
  'Tes pieds passent la lèvre : pousse vers le haut et envoie les hanches. La tête ne part pas en arrière, c’est la bosse et les hanches qui te font tourner.',
  'horizon',
  [
    ['hips', 'Elles montent et lancent le salto'],
    ['head', 'Droite sur les épaules, regard devant'],
    ['hands', 'Elles montent devant toi'],
    ['knees', 'Jambes tendues, poussée sur les deux pieds'],
  ],
)

const FRONT_POP = beat(
  { from: 'takeoff', seconds: 0 },
  'Pop, puis bascule',
  'Finis ton extension avant de basculer. Si tu plonges dès la lèvre, le salto part bas et court.',
  'horizon',
  [
    ['knees', 'Jambes tendues d’abord'],
    ['chest', 'Il bascule ensuite par-dessus les spatules'],
    ['hands', 'Les deux épaules à la même hauteur'],
    ['head', 'Menton rentré au moment de basculer'],
  ],
)

const OFF_AXIS_LANDING = beat(
  { from: 'landing', seconds: OPENING },
  'Redresse-toi',
  'Ramène les pieds sous toi maintenant : si tu restes désaxé, tu poses sur le dos ou sur le côté.',
  'landing',
  [
    ['hands', 'Bras lancés vers l’avant'],
    ['knees', 'Ils se déplient vers la neige'],
    ['chest', 'Il se remet au-dessus des skis'],
  ],
)

const BEATS: Readonly<Record<string, readonly BeatSpec[]>> = {
  straight: STRAIGHT,
  safety: grab('Safety grab', 'Monte les genoux vers la main : c’est le ski qui vient au grab. Si tu te penches pour l’attraper, tu bascules vers l’avant.', [
    ['knees', 'Remontés haut'],
    ['hands', 'La main prend le ski du même côté, sous la chaussure'],
    ['chest', 'Droit : il ne plonge pas vers le ski'],
  ]),
  mute: grab('Mute grab', 'Croise les skis et monte les genoux : le ski opposé vient se placer sous ta main.', [
    ['skis', 'Croisés en X'],
    ['hands', 'La main prend le ski opposé, carre extérieure, devant la fixation'],
    ['knees', 'Remontés vers la poitrine'],
  ]),
  japan: grab('Japan grab', 'Ramène les talons vers les fesses, creuse le dos, et passe la main sous le genou pour saisir le ski opposé.', [
    ['knees', 'Pliés, talons vers les fesses'],
    ['hands', 'La main passe sous le genou et prend le ski opposé, sous la chaussure'],
    ['chest', 'Dos creusé'],
  ]),
  tail: grab('Tail grab', 'Remonte les talons des skis derrière toi et envoie la main en arrière : le ski vient à sa rencontre, tu ne te penches pas pour le chercher.', [
    ['knees', 'Pliés, talons des skis remontés'],
    ['hands', 'La main prend le ski du même côté, derrière la chaussure'],
    ['chest', 'Redressé, tourné vers la main'],
  ]),
  nose: grab('Nose grab', 'Penche le buste sur les skis et remonte les spatules : la main part en avant saisir le ski devant la chaussure.', [
    ['skis', 'Spatules remontées vers toi'],
    ['hands', 'La main prend le ski du même côté, devant la chaussure'],
    ['chest', 'Penché sur les skis'],
  ]),
  spin180: [
    IN_LINE,
    KICK_ENTRY,
    { ...SPIN_ARMED, text: 'Jambes chargées, épaules à peine armées à l’opposé : un demi-tour demande très peu d’élan.' },
    SPIN_RELEASE,
    beat({ spin: 90 }, 'À mi-chemin', 'Un quart de tour : garde le regard par-dessus l’épaule, vers l’aval. Tu ne quittes jamais la réception des yeux.', 'shoulder', [
      ['head', 'Regard par-dessus l’épaule, toujours la même'],
      ['chest', 'Droit et compact'],
      ['knees', 'Ils se préparent à se déplier'],
    ]),
    SWITCH_IMPACT,
  ],
  spin360: [
    IN_LINE,
    KICK_ENTRY,
    SPIN_ARMED,
    SPIN_RELEASE,
    SPIN_TUCK,
    SPIN_BLIND,
    spotLanding(270, 'Trois quarts de tour : la réception réapparaît. Fixe ton point de chute et sors les mains devant toi : en t’ouvrant, tu arrêtes la rotation.'),
    IMPACT,
  ],
  spin540: [
    IN_LINE,
    KICK_ENTRY,
    { ...SPIN_ARMED, text: 'Jambes chargées, épaules armées plus fort que pour un 360. Les skis restent droits jusqu’au bout de la lèvre.' },
    SPIN_RELEASE,
    SPIN_TUCK,
    beat({ spin: 270 }, 'Toujours aveugle', 'Tu n’as rien vu depuis la lèvre, c’est normal. Tête haute, vers l’horizon : elle continue de mener.', 'shoulder', [
      ['head', 'Haute, regard vers l’horizon'],
      ['hands', 'Près du corps'],
      ['knees', 'Regroupés'],
    ]),
    beat({ spin: 400 }, 'Yeux et buste s’arrêtent', 'La réception apparaît : fixe-la. Les yeux et le buste se figent, les hanches et les jambes finissent seules le dernier demi-tour.', 'landing', [
      ['head', 'Regard verrouillé sur la réception'],
      ['chest', 'Il s’arrête avec les yeux'],
      ['hips', 'Elles continuent de tourner'],
    ]),
    SWITCH_IMPACT,
  ],
  spin720: [
    IN_LINE,
    KICK_ENTRY,
    { ...SPIN_ARMED, text: 'Jambes chargées, épaules armées franchement : deux tours se décident ici, pas en l’air.' },
    SPIN_RELEASE,
    SPIN_TUCK,
    beat({ spin: 360 }, 'Coup d’œil', 'Premier tour bouclé : un coup d’œil bref à la réception pour te situer, sans t’attarder. Si tu regardes trop longtemps, la rotation s’arrête.', 'landing', [
      ['head', 'Un repère, puis elle repart'],
      ['hands', 'La main libre reste basse, sans croiser le corps'],
      ['knees', 'Toujours regroupés'],
    ]),
    beat({ spin: 450 }, 'Relance', 'La tête repart par-dessus l’épaule et emmène le second tour. Menton haut : s’il tombe, la figure se désaxe.', 'shoulder', [
      ['head', 'Menton haut, par-dessus l’épaule'],
      ['chest', 'Droit'],
      ['knees', 'Regroupés pour garder la vitesse'],
    ]),
    spotLanding(630, 'Deuxième passage : cette fois tu fixes la réception et tu sors les mains devant toi pour arrêter la rotation.'),
    IMPACT,
  ],
  backflipTuck: [
    IN_LINE,
    KICK_ENTRY,
    PUSH_START,
    FLIP_POP,
    beat({ flip: 90 }, 'Groupe', 'Tu es sur le dos. Ramène les genoux à la poitrine : c’est le groupé qui règle la vitesse du salto.', 'blind', [
      ['knees', 'À la poitrine'],
      ['hands', 'Sur les tibias'],
      ['head', 'Yeux ouverts'],
    ]),
    beat({ flip: 180 }, 'Tête en bas', 'Bascule légèrement la tête : tu cherches la réception. Dès que tu la vois, commence à lâcher les genoux, plus tôt que tu ne le crois.', 'landing', [
      ['head', 'Elle bascule pour trouver la réception'],
      ['knees', 'Encore groupés : ils vont se relâcher'],
      ['chest', 'Compact'],
    ]),
    beat({ flip: 270 }, 'Pieds vers la neige', 'Trois quarts du salto sont faits et tu es presque déplié : c’est en t’ouvrant que tu as freiné la rotation. Les pieds vont chercher la neige.', 'landing', [
      ['knees', 'Presque tendus, vers la neige'],
      ['chest', 'Il se redresse'],
      ['head', 'Regard fixé sur la réception'],
    ]),
    IMPACT,
  ],
  frontflip: [
    IN_LINE,
    KICK_ENTRY,
    PUSH_START,
    FRONT_POP,
    beat({ flip: 90 }, 'Groupe', 'Tu regardes la neige passer sous toi. Genoux à la poitrine, et patiente : tu ne verras pas la réception avant la fin.', 'blind', [
      ['knees', 'À la poitrine'],
      ['hands', 'Sur les tibias'],
      ['chest', 'Épaules dans l’axe des skis'],
    ]),
    beat({ flip: 180 }, 'Le ciel', 'Tête en bas, tu ne vois que le ciel. Reste groupé : ouvrir maintenant te ferait poser sur le dos.', 'blind', [
      ['knees', 'Toujours groupés'],
      ['head', 'Elle ne cherche rien : attends'],
      ['chest', 'Épaules toujours dans l’axe'],
    ]),
    beat({ flip: 300 }, 'La réception arrive', 'Après le ciel, la réception apparaît sous tes pieds : lâche le groupé et tends les jambes vers elle.', 'landing', [
      ['knees', 'Ils se relâchent et se tendent vers la neige'],
      ['chest', 'Il se redresse'],
      ['head', 'Regard sur la réception'],
    ]),
    IMPACT,
  ],
  cork720: [
    IN_LINE,
    KICK_ENTRY,
    { ...SPIN_ARMED, text: 'Jambes chargées, épaules armées comme pour un 720. Rien ne penche encore.' },
    beat({ from: 'takeoff', seconds: 0 }, 'Pop, puis l’épaule tombe', 'Finis de pousser comme pour un 720. Ensuite seulement, l’épaule qui mène tombe vers l’arrière : c’est elle qui désaxe la rotation.', 'shoulder', [
      ['knees', 'Jambes tendues d’abord'],
      ['chest', 'Il part en arrière, l’épaule menante plus bas que l’autre'],
      ['head', 'Elle mène, regard par-dessus l’épaule'],
      ['skis', 'Droits en quittant la neige'],
    ]),
    beat({ air: 0.3 }, 'Grab et bloc', 'Attrape le ski et tiens-le : le grab garde le corps d’un seul bloc et la rotation régulière.', 'shoulder', [
      ['hands', 'Une main tient le ski ; l’autre ne croise pas le corps'],
      ['knees', 'Ramenés'],
      ['head', 'Elle continue de mener'],
    ]),
    beat({ air: 0.7 }, 'Repère à 540°', 'La réception apparaît : c’est elle qui te dit s’il faut tenir encore le grab ou commencer à ouvrir.', 'landing', [
      ['head', 'Regard sur la réception'],
      ['hands', 'Prête à lâcher'],
      ['chest', 'Il commence à se redresser'],
    ]),
    OFF_AXIS_LANDING,
    IMPACT,
  ],
  rodeo540: [
    IN_LINE,
    KICK_ENTRY,
    PUSH_START,
    beat({ from: 'takeoff', seconds: 0 }, 'Backflip, quart de tour', 'Poids égal sur les deux pieds, lancer de backflip par les hanches, et les épaules tournent d’un quart de tour.', 'shoulder', [
      ['hips', 'Lancer de backflip'],
      ['chest', 'Épaules tournées d’un quart de tour'],
      ['skis', 'Poids égal sur les deux pieds'],
    ]),
    beat({ air: 0.35 }, 'Tiens le grab', 'Japan grab tenu : c’est lui qui finit la rotation. Si tu t’ouvres ici, elle s’arrête.', 'shoulder', [
      ['hands', 'Japan : la main sous le genou, sur le ski opposé'],
      ['knees', 'Ramenés vers toi, pas la tête vers les skis'],
      ['head', 'Regard par-dessus l’épaule'],
    ]),
    { ...OFF_AXIS_LANDING, title: 'Lâche et regarde l’amont', text: 'Lâche le ski et regarde vers l’amont pendant que les pieds descendent : tu vas poser en marche arrière.' },
    SWITCH_IMPACT,
  ],
  misty540: [
    IN_LINE,
    KICK_ENTRY,
    PUSH_START,
    beat({ from: 'takeoff', seconds: 0 }, 'Pop, puis roule', 'Finis ton extension, puis roule par-dessus l’épaule avant : elle tombe vers l’avant et le côté, c’est elle qui désaxe.', 'horizon', [
      ['knees', 'Jambes tendues d’abord'],
      ['chest', 'Une épaule tombe vers l’avant et le côté'],
      ['head', 'Elle suit l’épaule'],
    ]),
    beat({ air: 0.35 }, 'Groupe et grab', 'Ramène les genoux à la poitrine et tiens le safety pendant le passage tête en bas.', 'blind', [
      ['knees', 'À la poitrine'],
      ['hands', 'Safety : le ski du même côté'],
      ['chest', 'Compact'],
    ]),
    { ...OFF_AXIS_LANDING, title: 'Cherche la réception', text: 'Cherche la réception par-dessus l’épaule et ramène les pieds sous toi : tu vas poser en marche arrière.' },
    SWITCH_IMPACT,
  ],
}

/** Moments clés d'une figure ; une figure sans fiche reçoit ceux du saut droit. */
export function getBeats(lessonId: string): readonly BeatSpec[] {
  return BEATS[lessonId] ?? STRAIGHT
}
