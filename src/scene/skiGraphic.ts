/**
 * Décor du dessus des skis, peint une fois sur un canevas : nuit étoilée, ville rétro-futuriste,
 * piste en V et bandes orange et jaunes sur fond noir. Les deux skis se répondent en miroir.
 * La semelle a son propre décor : un dégradé de l'orange au jaune et le nom de la marque.
 */
import * as THREE from 'three'
import { markShared } from './sharedAssets'
import { SKIER_STYLE } from './skierStyle'

/**
 * Le décor se dessine ski debout, spatule en haut, dans ce repère : x en travers, du bord extérieur (0)
 * au bord intérieur, y de la spatule (0) au talon. Le canevas le couche ensuite, spatule à droite.
 */
const ART_WIDTH = 64
const ART_LENGTH = 1024
const PIXELS_PER_UNIT = 2
const ANISOTROPY = 8
const FONT = '"Helvetica Neue", Arial, sans-serif'

type Painter = CanvasRenderingContext2D
type Point = readonly [number, number]

const css = (color: number): string => `#${color.toString(16).padStart(6, '0')}`

const INK = {
  night: css(SKIER_STYLE.skiArt.background),
  orange: css(SKIER_STYLE.skiArt.orange),
  yellow: css(SKIER_STYLE.skiArt.yellow),
  white: css(SKIER_STYLE.skiArt.white),
  grey: css(SKIER_STYLE.skiArt.grey),
  soleTip: css(SKIER_STYLE.skiArt.soleTip),
  soleTail: css(SKIER_STYLE.skiArt.soleTail),
  sole: css(SKIER_STYLE.skiArt.soleInk),
}

function polygon(ctx: Painter, color: string, points: readonly Point[]): void {
  ctx.fillStyle = color
  ctx.beginPath()
  points.forEach(([x, y], index) => (index === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)))
  ctx.closePath()
  ctx.fill()
}

function ellipse(ctx: Painter, color: string, x: number, y: number, radiusX: number, radiusY = radiusX): void {
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.ellipse(x, y, radiusX, radiusY, 0, 0, Math.PI * 2)
  ctx.fill()
}

function line(ctx: Painter, color: string, width: number, from: Point, to: Point): void {
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.beginPath()
  ctx.moveTo(...from)
  ctx.lineTo(...to)
  ctx.stroke()
}

/** Étoiles de la spatule : position, rayon et couleur. */
const STARS: readonly (readonly [number, number, number, string])[] = [
  [14, 38, 0.9, INK.white],
  [48, 52, 1.3, INK.orange],
  [22, 74, 0.7, INK.yellow],
  [52, 96, 0.8, INK.white],
  [9, 118, 1.1, INK.orange],
  [50, 142, 0.7, INK.white],
  [12, 168, 1.2, INK.yellow],
  [54, 184, 0.9, INK.orange],
  [20, 206, 0.7, INK.white],
  [46, 232, 1.4, INK.white],
]

function paintSky(ctx: Painter): void {
  ctx.fillStyle = INK.night
  ctx.fillRect(0, 0, ART_WIDTH, ART_LENGTH)
  STARS.forEach(([x, y, radius, color]) => ellipse(ctx, color, x, y, radius))
}

const HORIZON = 336
/** Tours de la ville : bord gauche, largeur, hauteur au-dessus de l'horizon et couleur. */
const TOWERS: readonly (readonly [number, number, number, string])[] = [
  [3, 8, 58, INK.orange],
  [10, 6, 92, INK.yellow],
  [17, 9, 46, INK.orange],
  [34, 10, 68, INK.orange],
  [43, 8, 104, INK.yellow],
  [52, 9, 52, INK.orange],
]

function paintCity(ctx: Painter): void {
  // Planète annelée derrière les tours.
  ellipse(ctx, INK.yellow, 44, 232, 12)
  ctx.strokeStyle = INK.orange
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.ellipse(44, 232, 19, 5, -0.35, 0, Math.PI * 2)
  ctx.stroke()
  TOWERS.forEach(([left, width, height, color]) => {
    ctx.fillStyle = color
    ctx.fillRect(left, HORIZON - height, width, height)
    ellipse(ctx, color, left + width / 2, HORIZON - height, width / 2)
  })
  // Tour de télévision : un fût fin, deux boules.
  line(ctx, INK.yellow, 2, [28, HORIZON], [28, HORIZON - 128])
  ellipse(ctx, INK.orange, 28, HORIZON - 100, 5.5)
  ellipse(ctx, INK.white, 28, HORIZON - 72, 3.5)
  ctx.fillStyle = INK.white
  ctx.fillRect(0, HORIZON, ART_WIDTH, 3)
}

const LAYER_INKS = [INK.orange, INK.yellow, INK.white] as const

/** Empilement de disques vus de biais, du plus large en bas au plus étroit en haut. */
function stackedDiscs(ctx: Painter, x: number, base: number, radius: number, layers: number): void {
  for (let layer = 0; layer < layers; layer++) {
    const shrink = 1 - layer / (layers + 1)
    ellipse(ctx, LAYER_INKS[layer % LAYER_INKS.length], x, base - layer * radius * 0.42, radius * shrink, radius * shrink * 0.32)
  }
}

/** Piste en V : des bandes parallèles qui plongent vers le bord intérieur, et leurs faisceaux. */
function paintRunway(ctx: Painter): void {
  const slope = 0.95
  const inner = 60
  const stripes = [INK.white, INK.yellow, INK.orange, INK.yellow, INK.orange, INK.white, INK.yellow, INK.orange]
  line(ctx, INK.orange, 1, [12, 470], [40, 930])
  line(ctx, INK.yellow, 1, [22, 540], [48, 930])
  line(ctx, INK.orange, 1, [6, 600], [30, 930])
  stripes.forEach((color, index) => {
    const outer = 6 + index * 5
    const top = 404 + index * 27
    const drop = (inner - outer) * slope
    polygon(ctx, color, [[outer, top], [inner, top + drop], [inner, top + drop + 15], [outer, top + 15]])
  })
  // Liseré de la piste, le long de la première bande.
  line(ctx, INK.orange, 2, [4, 394], [62, 394 + 58 * slope])
}

function paintYard(ctx: Painter): void {
  stackedDiscs(ctx, 32, 384, 20, 3)
  stackedDiscs(ctx, 40, 716, 20, 6)
  // Arche : chaque ski en porte une moitié, les deux se rejoignent quand les skis sont serrés.
  ctx.strokeStyle = INK.grey
  ctx.lineWidth = 9
  ctx.beginPath()
  ctx.arc(ART_WIDTH, 800, 25, Math.PI, Math.PI * 2)
  ctx.stroke()
  polygon(ctx, INK.orange, [[8, 842], [30, 832], [30, 858], [8, 868]])
  polygon(ctx, INK.white, [[8, 842], [30, 832], [40, 838], [18, 848]])
  ellipse(ctx, INK.yellow, 14, 892, 6, 3)
  ellipse(ctx, INK.orange, 32, 880, 5, 2.5)
  ctx.strokeStyle = INK.grey
  ctx.lineWidth = 6
  ctx.beginPath()
  ctx.arc(58, 896, 13, 0, Math.PI * 2)
  ctx.stroke()
}

const LABEL_TOP = 964

function paintTail(ctx: Painter): void {
  const chevrons = [INK.orange, INK.yellow, INK.orange]
  chevrons.forEach((color, index) => {
    const top = 906 + index * 17
    polygon(ctx, color, [[4, top], [60, top + 30], [60, top + 41], [4, top + 11]])
  })
  ctx.fillStyle = INK.night
  ctx.fillRect(0, LABEL_TOP, ART_WIDTH, ART_LENGTH - LABEL_TOP)
  ctx.fillStyle = INK.white
  ctx.fillRect(0, LABEL_TOP, ART_WIDTH, 1)
  // Mentions techniques : trop petites pour être lues, de simples filets.
  ctx.fillStyle = INK.grey
  ;[978, 984, 990].forEach((y, index) => ctx.fillRect(10, y, 18 - index * 4, 1.2))
}

/** Nom de la marque, lu de la spatule vers le talon à partir de `start`, sur la longueur `reach`. */
function paintWordmark(ctx: Painter, color: string, start: number, size: number, reach: number): void {
  ctx.save()
  ctx.translate(ART_WIDTH / 2, start)
  ctx.rotate(Math.PI / 2)
  ctx.fillStyle = color
  ctx.font = `bold ${size}px ${FONT}`
  ctx.textBaseline = 'middle'
  ctx.fillText('FACTION', 0, 1, reach)
  ctx.restore()
}

/** Sigle de la marque : deux « f » dos à dos, reliés par leur barre. `flip` vaut -1 pour le retourner. */
function paintEmblem(ctx: Painter, color: string, top: number, flip = 1): void {
  ctx.save()
  ctx.translate(ART_WIDTH / 2, top)
  ctx.scale(1, flip)
  ctx.strokeStyle = color
  ctx.lineWidth = 4.5
  ;[-1, 1].forEach((side) => {
    const stem = side * 6.5
    ctx.beginPath()
    ctx.moveTo(stem, 40)
    ctx.lineTo(stem, 8)
    ctx.quadraticCurveTo(stem, 0, stem + side * 8, 0)
    ctx.stroke()
  })
  line(ctx, color, 4.5, [-14, 18], [14, 18])
  ctx.restore()
}

/** Numéro du modèle, dans le cartouche du talon. */
function paintModelNumber(ctx: Painter): void {
  ctx.fillStyle = INK.white
  ctx.font = `bold 15px ${FONT}`
  ctx.textAlign = 'center'
  ctx.fillText('2', 44, 986)
}

function paintTopsheet(ctx: Painter, side: number): void {
  ctx.save()
  // Le bord intérieur est à droite sur le ski gauche, à gauche sur le ski droit.
  if (side > 0) {
    ctx.translate(ART_WIDTH, 0)
    ctx.scale(-1, 1)
  }
  paintSky(ctx)
  paintCity(ctx)
  paintRunway(ctx)
  paintYard(ctx)
  paintTail(ctx)
  ctx.restore()
  // Les inscriptions ne se retournent pas : le nom sur le ski gauche, le sigle sur le droit.
  if (side < 0) {
    paintWordmark(ctx, INK.white, 84, 30, 116)
    paintModelNumber(ctx)
  } else paintEmblem(ctx, INK.white, 84)
}

/** Semelle : dégradé de la spatule au talon, nom au milieu, sigle à chaque bout tourné vers son extrémité. */
function paintSole(ctx: Painter): void {
  const fade = ctx.createLinearGradient(0, 0, 0, ART_LENGTH)
  fade.addColorStop(0, INK.soleTip)
  fade.addColorStop(0.45, INK.orange)
  fade.addColorStop(0.62, INK.yellow)
  fade.addColorStop(1, INK.soleTail)
  ctx.fillStyle = fade
  ctx.fillRect(0, 0, ART_WIDTH, ART_LENGTH)
  paintWordmark(ctx, INK.sole, 418, 46, 190)
  paintEmblem(ctx, INK.sole, 24)
  paintEmblem(ctx, INK.sole, ART_LENGTH - 24, -1)
}

function createSheet(paint: (ctx: Painter) => void): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = ART_LENGTH * PIXELS_PER_UNIT
  canvas.height = ART_WIDTH * PIXELS_PER_UNIT
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Décor des skis impossible à peindre : ce navigateur ne fournit pas de canevas 2D.')
  // Ski debout dans le repère du décor, couché sur le canevas, spatule à droite.
  ctx.translate(canvas.width, 0)
  ctx.rotate(Math.PI / 2)
  ctx.scale(PIXELS_PER_UNIT, PIXELS_PER_UNIT)
  paint(ctx)
  const texture = new THREE.CanvasTexture(canvas)
  // Sans retournement, le haut du canevas tombe sur le bord gauche du ski : le décor n'est pas en miroir.
  texture.flipY = false
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = ANISOTROPY
  return markShared(texture)
}

const topsheets = new Map<number, THREE.CanvasTexture>()

/** Décor du dessus du ski de ce côté (-1 à gauche, 1 à droite), peint à la première demande puis réutilisé. */
export function skiTopsheet(side: number): THREE.CanvasTexture {
  const key = Math.sign(side)
  const painted = topsheets.get(key) ?? createSheet((ctx) => paintTopsheet(ctx, key))
  topsheets.set(key, painted)
  return painted
}

let sole: THREE.CanvasTexture | undefined

/** Décor de la semelle, le même pour les deux skis. */
export function skiSole(): THREE.CanvasTexture {
  sole ??= createSheet(paintSole)
  return sole
}
