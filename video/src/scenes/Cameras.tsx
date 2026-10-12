import { AbsoluteFill, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { Footage, type Shot } from '../components/Footage'
import { Caption, Pill } from '../components/Kinetic'
import { useFormat, type Format } from '../layout'
import { COLORS } from '../theme'

interface Panel {
  readonly clip: string
  readonly label: string
  /** Première image de la capture, un peu avant le décollage. */
  readonly from: number
  readonly rate: number
  /** Cadrage du skieur dans la capture utilisée par chaque format de vidéo. */
  readonly shot: Readonly<Record<Format, Shot>>
}

/** Le saut de la piste libre décolle vers l'image 240 des captures de caméra ; le ralentir le garde à l'écran. */
const JUMP_START = 215
const JUMP_RATE = 0.75
const PANELS: readonly Panel[] = [
  { clip: 'cam-chase', label: 'Poursuite', from: JUMP_START, rate: JUMP_RATE, shot: { paysage: { at: 0, scale: 1.25, x: 0.5, y: 0.45 }, vertical: { at: 0, scale: 1.6, x: 0.5, y: 0.45 } } },
  { clip: 'cam-tv', label: 'Télé', from: JUMP_START, rate: JUMP_RATE, shot: { paysage: { at: 0, scale: 1.3, x: 0.75, y: 0.5 }, vertical: { at: 0, scale: 1.4, x: 0.6, y: 0.4 } } },
  { clip: 'flip-clean', label: 'Ciné', from: 150, rate: 1, shot: { paysage: { at: 0, scale: 1, x: 0.5, y: 0.5 }, vertical: { at: 0, scale: 1, x: 0.5, y: 0.5 } } },
]
const STAGGER = 5
const GAP = 10
const SLIDE = { damping: 18, stiffness: 120 } as const

/** Trois caméras du site côte à côte : des colonnes en paysage, des bandes en vertical. */
export function Cameras() {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const format = useFormat()
  const vertical = format === 'vertical'
  // Une colonne est haute et une bande est large : chacune prend la capture de l'autre format, qui lui va mieux.
  const footageFormat: Format = vertical ? 'paysage' : 'vertical'
  const { width, height } = useVideoConfig()
  const share = (length: number): number => (length - (PANELS.length - 1) * GAP) / PANELS.length
  const box = vertical ? { width, height: share(height) } : { width: share(width), height }

  return (
    <AbsoluteFill style={{ background: COLORS.nightDeep, display: 'flex', flexDirection: vertical ? 'column' : 'row', gap: GAP }}>
      {PANELS.map((panel, index) => {
        const enter = spring({ frame: frame - index * STAGGER, fps, config: SLIDE })
        const offset = (1 - enter) * 100 * (index % 2 === 0 ? 1 : -1)
        return (
          <div key={panel.clip} style={{ position: 'relative', flex: 1, overflow: 'hidden', transform: vertical ? `translateX(${offset}%)` : `translateY(${offset}%)` }}>
            <Footage clip={panel.clip} format={footageFormat} from={panel.from} rate={panel.rate} shots={[panel.shot[format]]} box={box} />
            <div style={{ position: 'absolute', left: 0, right: 0, bottom: vertical ? 36 : 70, display: 'flex', justifyContent: 'center' }}>
              <Pill text={panel.label} size={vertical ? 30 : 30} at={14 + index * STAGGER} />
            </div>
          </div>
        )
      })}
      <AbsoluteFill style={{ display: 'flex', flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center', paddingTop: vertical ? 210 : 90 }}>
        <Caption text="Sous tous les angles" size={vertical ? 54 : 60} at={30} />
      </AbsoluteFill>
    </AbsoluteFill>
  )
}
