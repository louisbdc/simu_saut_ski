import type { CSSProperties, ReactNode } from 'react'
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { BODY_FONT, COLORS, DISPLAY_FONT, stickerShadow } from '../theme'

const BOUNCY = { damping: 11, stiffness: 170, mass: 0.8 } as const
const EXIT_FRAMES = 8
const WORD_STAGGER = 4

interface PopProps {
  /** Image, dans le plan, où l'élément apparaît. */
  readonly at?: number
  /** Image où il commence à disparaître ; absent, il reste jusqu'au bout. */
  readonly until?: number
  /** Décalage de départ, en pixels : l'élément arrive depuis là. */
  readonly rise?: number
  readonly tilt?: number
  readonly style?: CSSProperties
  readonly children: ReactNode
}

/** Fait apparaître son contenu avec le rebond des boutons du site, et le fait disparaître en fondu. */
export function Pop({ at = 0, until, rise = 40, tilt = 0, style, children }: PopProps) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const enter = spring({ frame: frame - at, fps, config: BOUNCY })
  const exit = until === undefined ? 1 : interpolate(frame, [until, until + EXIT_FRAMES], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const opacity = Math.min(1, interpolate(frame, [at, at + 4], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })) * exit
  return (
    <div style={{ display: 'inline-block', opacity, transform: `translateY(${(1 - enter) * rise}px) scale(${0.6 + 0.4 * enter}) rotate(${tilt}deg)`, ...style }}>
      {children}
    </div>
  )
}

interface TitleProps {
  readonly lines: readonly string[]
  readonly size: number
  readonly at?: number
  readonly until?: number
  readonly align?: 'left' | 'center'
  readonly color?: string
}

/** Titre façon autocollant, dont les mots arrivent l'un après l'autre. */
export function Title({ lines, size, at = 0, until, align = 'left', color = COLORS.snow }: TitleProps) {
  const words = lines.map((line) => line.split(' '))
  const offsets = words.map((_, index) => words.slice(0, index).reduce((count, line) => count + line.length, 0))
  return (
    <div style={{ fontFamily: DISPLAY_FONT, fontWeight: 700, fontSize: size, lineHeight: 0.95, color, textAlign: align, textShadow: stickerShadow(size / 22), transform: 'rotate(-2deg)' }}>
      {words.map((line, lineIndex) => (
        <div key={line.join(' ')} style={{ display: 'flex', gap: size * 0.26, justifyContent: align === 'center' ? 'center' : 'flex-start' }}>
          {line.map((word, wordIndex) => (
            <Pop key={word} at={at + (offsets[lineIndex] + wordIndex) * WORD_STAGGER} until={until} rise={size * 0.5}>
              {word}
            </Pop>
          ))}
        </div>
      ))}
    </div>
  )
}

interface LabelProps {
  readonly text: string
  readonly size: number
  readonly at?: number
  readonly until?: number
}

/** Étiquette jaune inclinée, comme « Ski freestyle » sur le menu du site. */
export function Pill({ text, size, at = 0, until }: LabelProps) {
  return (
    <Pop at={at} until={until} tilt={-3}>
      <span style={{ display: 'inline-block', padding: `${size * 0.36}px ${size}px`, fontFamily: BODY_FONT, fontWeight: 800, fontSize: size, letterSpacing: '0.08em', textTransform: 'uppercase', color: COLORS.ink, background: COLORS.sun, borderRadius: 999, boxShadow: `0 ${size * 0.2}px 0 ${COLORS.nightDeep}` }}>
        {text}
      </span>
    </Pop>
  )
}

interface CaptionProps extends LabelProps {
  /** Mot mis en avant en jaune, en tête de la légende. */
  readonly lead?: string
}

/** Légende sur panneau bleu nuit, dans le style des panneaux du site. */
export function Caption({ text, lead, size, at = 0, until }: CaptionProps) {
  return (
    <Pop at={at} until={until}>
      <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: size * 0.4, padding: `${size * 0.5}px ${size * 0.9}px`, fontFamily: DISPLAY_FONT, fontWeight: 600, fontSize: size, lineHeight: 1.1, color: COLORS.snow, background: COLORS.panel, border: `3px solid ${COLORS.panelEdge}`, borderRadius: size * 0.6, boxShadow: `0 ${size * 0.16}px 0 ${COLORS.nightDeep}, 0 ${size * 0.5}px ${size}px rgba(8, 22, 40, 0.45)` }}>
        {lead ? <span style={{ color: COLORS.sun }}>{lead}</span> : null}
        <span>{text}</span>
      </span>
    </Pop>
  )
}

interface ScrimProps {
  /** Dégradé CSS posé sur l'image pour que le texte reste lisible. */
  readonly gradient: string
  readonly opacity?: number
}

export function Scrim({ gradient, opacity = 1 }: ScrimProps) {
  return <AbsoluteFill style={{ background: gradient, opacity }} />
}

/** Zone de texte par-dessus un plan : centre ses enfants et les empile. */
export function Stack({ children, style }: { readonly children: ReactNode; readonly style?: CSSProperties }) {
  return <AbsoluteFill style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', ...style }}>{children}</AbsoluteFill>
}
