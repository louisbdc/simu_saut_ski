import type { Sample, SimulationResult } from '../physics/types'

const MS_TO_KMH = 3.6
const PADDING = { left: 38, right: 8, top: 10, bottom: 18 }
const GROUND_COLOR = '#9fd0ff'
const AIR_COLOR = '#ff5a1f'
const TERRAIN_FILL = 'rgba(157, 185, 214, 0.2)'
const AXIS_COLOR = '#9db9d6'
const CURSOR_COLOR = '#f4f8fc'
const SPEED_HEADROOM = 1.12

export interface SpeedChart {
  /** À appeler quand la simulation change : redessine le fond (profil et courbe). */
  readonly setResult: (result: SimulationResult) => void
  /** À appeler à chaque image : recopie le fond et place le curseur du skieur. */
  readonly draw: (cursorX: number) => void
}

interface Size {
  readonly width: number
  readonly height: number
  readonly ratio: number
}

function measure(canvas: HTMLCanvasElement): Size {
  return { width: canvas.clientWidth, height: canvas.clientHeight, ratio: window.devicePixelRatio || 1 }
}

function strokeSpeed(
  context: CanvasRenderingContext2D,
  samples: readonly Sample[],
  toPoint: (sample: Sample) => readonly [number, number],
): void {
  context.lineWidth = 2
  samples.slice(1).forEach((sample, i) => {
    const previous = samples[i]
    context.strokeStyle = sample.kind === 'air' && previous.kind === 'air' ? AIR_COLOR : GROUND_COLOR
    context.beginPath()
    context.moveTo(...toPoint(previous))
    context.lineTo(...toPoint(sample))
    context.stroke()
  })
}

/** Dessine le profil et la courbe de vitesse ; renvoie la conversion abscisse → pixel pour le curseur. */
function drawBackground(
  context: CanvasRenderingContext2D,
  result: SimulationResult,
  size: Size,
): (x: number) => number {
  const { points } = result.terrain
  const { samples } = result
  const plotWidth = size.width - PADDING.left - PADDING.right
  const plotHeight = size.height - PADDING.top - PADDING.bottom
  const maxX = points[points.length - 1].x
  const minY = points.reduce((min, point) => Math.min(min, point.y), 0)
  const maxY = points.reduce((max, point) => Math.max(max, point.y), 0)
  const maxSpeed = samples.reduce((max, sample) => Math.max(max, sample.speed), 1) * SPEED_HEADROOM

  const px = (x: number): number => PADDING.left + (Math.min(x, maxX) / maxX) * plotWidth
  const terrainY = (y: number): number => PADDING.top + (1 - (y - minY) / (maxY - minY || 1)) * plotHeight
  const speedY = (speed: number): number => PADDING.top + (1 - speed / maxSpeed) * plotHeight

  context.fillStyle = TERRAIN_FILL
  context.beginPath()
  context.moveTo(px(0), PADDING.top + plotHeight)
  points.forEach((point) => context.lineTo(px(point.x), terrainY(point.y)))
  context.lineTo(px(maxX), PADDING.top + plotHeight)
  context.fill()

  strokeSpeed(context, samples, (sample) => [px(sample.x), speedY(sample.speed)])

  context.fillStyle = AXIS_COLOR
  context.font = "12px 'Barlow', system-ui, sans-serif"
  context.textAlign = 'right'
  context.textBaseline = 'middle'
  const topSpeed = Math.floor((maxSpeed * MS_TO_KMH) / 10) * 10
  for (const tick of [0, topSpeed / 2, topSpeed]) {
    context.fillText(`${tick}`, PADDING.left - 6, speedY(tick / MS_TO_KMH))
  }
  context.textAlign = 'left'
  context.textBaseline = 'alphabetic'
  context.fillText('Vitesse en km/h le long de la ligne, en orange pendant les vols', PADDING.left, size.height - 3)
  return px
}

/** Courbe de la vitesse le long de la ligne, sur la silhouette du profil, avec la position du skieur. */
export function createSpeedChart(canvas: HTMLCanvasElement): SpeedChart {
  const background = document.createElement('canvas')
  let result: SimulationResult | null = null
  let drawnSize: Size | null = null
  let toPixel: ((x: number) => number) | null = null

  const refreshBackground = (size: Size): void => {
    background.width = canvas.width = Math.round(size.width * size.ratio)
    background.height = canvas.height = Math.round(size.height * size.ratio)
    const context = background.getContext('2d')
    drawnSize = size
    toPixel = null
    if (!context || !result || result.terrain.points.length < 2 || result.samples.length < 2) return
    context.setTransform(size.ratio, 0, 0, size.ratio, 0, 0)
    toPixel = drawBackground(context, result, size)
  }

  return {
    setResult: (next: SimulationResult): void => {
      result = next
      drawnSize = null
    },
    draw: (cursorX: number): void => {
      const size = measure(canvas)
      if (size.width === 0 || size.height === 0) return
      const stale =
        !drawnSize ||
        drawnSize.width !== size.width ||
        drawnSize.height !== size.height ||
        drawnSize.ratio !== size.ratio
      if (stale) refreshBackground(size)

      const context = canvas.getContext('2d')
      if (!context) return
      context.setTransform(1, 0, 0, 1, 0, 0)
      context.clearRect(0, 0, canvas.width, canvas.height)
      context.drawImage(background, 0, 0)
      if (!toPixel) return

      context.setTransform(size.ratio, 0, 0, size.ratio, 0, 0)
      context.strokeStyle = CURSOR_COLOR
      context.lineWidth = 1.5
      context.beginPath()
      context.moveTo(toPixel(cursorX), PADDING.top)
      context.lineTo(toPixel(cursorX), size.height - PADDING.bottom)
      context.stroke()
    },
  }
}
