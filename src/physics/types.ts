/** Géométrie d'un kicker. Longueurs en mètres, angles en degrés. */
export interface KickerConfig {
  /** Pente de l'élan (positif = descente). */
  readonly inrunAngleDeg: number
  readonly inrunLength: number
  /** Plat entre le bas de l'élan et le début du kick. */
  readonly flatLength: number
  /** Rayon de la courbe du kick. */
  readonly transitionRadius: number
  readonly takeoffAngleDeg: number
  /** Hauteur de la lèvre au-dessus du plat. */
  readonly kickerHeight: number
  /** Hauteur de la lèvre au-dessus de la table. */
  readonly deckDrop: number
  /** Distance horizontale entre la lèvre et la cassure. */
  readonly tableLength: number
  readonly landingAngleDeg: number
  readonly landingLength: number
}

export interface RiderConfig {
  /** Masse du skieur seul, en kg. */
  readonly mass: number
  /** Masse de l'équipement (skis, fixations, chaussures, casque, vêtements), en kg. */
  readonly equipmentMass: number
  /** Coefficient de frottement ski/neige. */
  readonly friction: number
  /** Prise à l'air CdA en glisse, en m² : elle dépend de la posture et de l'ampleur de la tenue. */
  readonly dragArea: number
  /** Prise à l'air CdA en vol, en m² : le corps regroupé offre moins de prise que debout dans l'élan. */
  readonly dragAreaAir: number
  /** Impulsion donnée à la lèvre, perpendiculaire au kick, en m/s (négatif : le skieur absorbe la lèvre). */
  readonly popSpeed: number
  /** Vitesse au point de départ en m/s. */
  readonly startSpeed: number
}

export interface EnvironmentConfig {
  readonly altitude: number
  /** Vent de face en m/s (négatif = vent de dos). */
  readonly headwind: number
}

export interface LineConfig {
  readonly kickers: readonly KickerConfig[]
  /** Identifiant de la figure tentée sur chaque bosse. Sans effet sur la trajectoire. */
  readonly tricks: readonly string[]
  /** Le skieur part en switch (en arrière). Sans effet sur la trajectoire. */
  readonly startSwitch: boolean
  readonly rider: RiderConfig
  readonly environment: EnvironmentConfig
}

/** Paramètres dérivés utilisés par les intégrateurs. */
export interface PhysicsParams {
  readonly friction: number
  /** ρ·CdA / 2m en glisse, en 1/m. */
  readonly drag: number
  /** ρ·CdA / 2m en vol, en 1/m. */
  readonly flightDrag: number
  readonly headwind: number
}

export type SegmentKind =
  | 'inrun'
  | 'transition'
  | 'flat'
  | 'takeoff'
  | 'face'
  | 'deck'
  | 'knuckle'
  | 'landing'
  | 'runout'

/** Un point du profil ; angle, courbure et type décrivent le segment qui part de ce point. */
export interface TerrainPoint {
  readonly x: number
  readonly y: number
  readonly s: number
  readonly angle: number
  /** dφ/ds : positif en compression (creux), négatif sur une bosse. */
  readonly curvature: number
  readonly kind: SegmentKind
  readonly kicker: number
}

export interface KickerLandmarks {
  readonly lipIndex: number
  readonly lipX: number
  readonly lipY: number
  readonly baseY: number
  readonly knuckleStartX: number
  readonly landingStartX: number
  readonly landingEndX: number
  /** Point visé dans la réception. */
  readonly targetX: number
  readonly idealEndX: number
}

export interface Terrain {
  readonly points: readonly TerrainPoint[]
  readonly kickers: readonly KickerLandmarks[]
  readonly lipIndices: ReadonlySet<number>
}

export interface Sample {
  readonly t: number
  readonly x: number
  readonly y: number
  readonly vx: number
  readonly vy: number
  readonly speed: number
  /** Appui ressenti en g (0 en l'air). */
  readonly gLoad: number
  /** Hauteur au-dessus de la neige. */
  readonly height: number
  /** Inclinaison du skieur en radians. */
  readonly tilt: number
  /** Avancement du saut de 0 à 1 pendant un vol parti d'une lèvre ; 0 partout ailleurs. */
  readonly airProgress: number
  readonly kind: SegmentKind | 'air'
  readonly kicker: number
}

export type LandingZone = 'table' | 'knuckle' | 'ideal' | 'long' | 'flat'

export interface LandingReport {
  readonly zone: LandingZone
  readonly x: number
  readonly y: number
  /** Écart horizontal au point visé (négatif = trop court). */
  readonly offsetFromTarget: number
  readonly impactSpeed: number
  /** Vitesse perpendiculaire à la neige à l'impact. */
  readonly normalSpeed: number
  /** Chute verticale sur du plat qui donnerait le même choc. */
  readonly equivalentFallHeight: number
  /** G moyens estimés pendant l'amorti. */
  readonly impactG: number
  readonly speedAfter: number
  /** Le skieur est tombé à cette réception. */
  readonly crashed: boolean
}

export interface KickerReport {
  readonly reached: boolean
  /** Vitesse maximale atteinte avant le kick. */
  readonly approachSpeed: number
  /** Vitesse au pied du kick, là où la courbe commence à monter. */
  readonly kickEntrySpeed: number
  readonly lipSpeed: number
  readonly speedLostInKick: number
  /** G maximum dans la compression du kick. */
  readonly maxG: number
  readonly flightDistance: number
  /** Instants du décollage et de la réception dans le parcours, en secondes (0 si la lèvre n'est pas atteinte). */
  readonly takeoffTime: number
  readonly landingTime: number
  /** Pente des skis à la lèvre et pente de la neige à la réception, en radians. */
  readonly takeoffAngle: number
  readonly landingAngle: number
  readonly airTime: number
  /** Hauteur maximale au-dessus de la neige pendant le vol. */
  readonly maxHeight: number
  readonly landing: LandingReport | null
  /** Vitesse maximale regagnée dans la réception. */
  readonly exitSpeed: number
}

/** impact : choc trop violent à la réception. figure : figure pas bouclée, réception de travers. */
export type CrashCause = 'impact' | 'figure'

/** Chute du skieur à une réception, et sa glissade jusqu'à l'arrêt. */
export interface CrashReport {
  readonly kicker: number
  readonly cause: CrashCause
  readonly time: number
  readonly x: number
  readonly y: number
  /** Vitesse à l'impact, puis au début de la glissade une fois le choc encaissé. */
  readonly impactSpeed: number
  readonly slideSpeed: number
  readonly equivalentFallHeight: number
  /** Distance parcourue et temps mis à dévaler la piste avant l'arrêt (ou la fin du profil). */
  readonly slideDistance: number
  readonly slideDuration: number
  /** Le corps s'est arrêté sur la piste ; sinon il glissait encore au bout du profil. */
  readonly stopped: boolean
}

export interface SimulationOptions {
  /** Bosse dont la figure n'est pas bouclée : le skieur y arrive de travers et tombe. */
  readonly failedKicker?: number
  /**
   * Arrête la simulation juste après la réception de cette bosse : le résultat est tronqué, les
   * bosses suivantes y sont « non atteintes » et la vitesse de sortie de cette bosse, qui se lit
   * après la réception, reste à 0. Tout le reste de son rapport (lèvre, vol, réception) est celui
   * de la simulation complète. Le calcul inverse, qui ne lit que le saut qu'il règle, évite ainsi
   * de simuler tout le reste de la ligne à chacun de ses essais.
   */
  readonly stopAfterKicker?: number
}

export interface SimulationResult {
  readonly terrain: Terrain
  readonly samples: readonly Sample[]
  readonly reports: readonly KickerReport[]
  /** 'stopped' : le skieur s'est arrêté avant la fin de la ligne. */
  readonly outcome: 'finished' | 'stopped' | 'crashed'
  /** Chute éventuelle ; une fois tombé, le skieur ne fait plus que glisser. */
  readonly crash: CrashReport | null
  readonly duration: number
}
