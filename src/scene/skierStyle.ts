/**
 * Apparence du skieur. Tout ce fichier est cosmétique : changer une valeur ici ne modifie ni la
 * physique du saut, ni les figures, ni les chutes. C'est l'endroit où régler son look.
 *
 * Les couleurs sont des codes hexadécimaux (0xRRVVBB).
 */
export interface SkierStyle {
  readonly colors: {
    readonly jacket: number
    /** Col et bas de veste, pour un liseré contrasté. */
    readonly jacketTrim: number
    readonly pants: number
    readonly glove: number
    readonly helmet: number
    /** Écran du masque. */
    readonly lens: number
    readonly skin: number
    readonly boot: number
    /** Boucles des chaussures et pièces de fixation. */
    readonly buckle: number
    readonly bootSole: number
    /** Chants des skis. */
    readonly skiBase: number
    readonly binding: number
    readonly pole: number
  }
  /** Décor du dessus des skis, celui qu'on voit en vol : fond et encres du dessin. */
  readonly skiArt: {
    readonly background: number
    readonly orange: number
    readonly yellow: number
    readonly white: number
    /** Arche et anneau du décor. */
    readonly grey: number
    /** Semelle, celle qu'on voit quand le skieur a la tête en bas : dégradé de la spatule au talon, et inscriptions. */
    readonly soleTip: number
    readonly soleTail: number
    readonly soleInk: number
  }
  /** Ampleur des vêtements : 1 = près du corps, 1,5 = très ample. */
  readonly fit: {
    readonly jacket: number
    readonly pants: number
  }
  /** Forme des skis, en mètres. Purement visuelle : la physique garde ses propres dimensions. */
  readonly ski: {
    readonly length: number
    readonly width: number
    /** Hauteur des spatules, à l'avant comme à l'arrière (skis à doubles spatules). */
    readonly tipRise: number
  }
}

export const SKIER_STYLE: SkierStyle = {
  colors: {
    jacket: 0xf2b90f,
    jacketTrim: 0x1c2a3d,
    pants: 0x1c2a3d,
    glove: 0x14181f,
    helmet: 0xf4f8fc,
    lens: 0xff5a1f,
    skin: 0xe2ad8b,
    boot: 0x20242c,
    buckle: 0xc9d2dc,
    bootSole: 0x0d0f13,
    skiBase: 0x111418,
    binding: 0x2a2f38,
    pole: 0xc9d2dc,
  },
  skiArt: { background: 0x16151a, orange: 0xf26a1b, yellow: 0xf9c61c, white: 0xf5f2ea, grey: 0xc4c1ba, soleTip: 0xff7a2e, soleTail: 0xf6e23c, soleInk: 0x2c2a2d },
  fit: { jacket: 1.35, pants: 1.4 },
  ski: { length: 1.72, width: 0.105, tipRise: 0.13 },
}
