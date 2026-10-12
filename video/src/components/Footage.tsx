import { Video } from '@remotion/media'
import type { CSSProperties } from 'react'
import { AbsoluteFill, Easing, interpolate, staticFile, useCurrentFrame, useVideoConfig } from 'remotion'
import { SIZES, useFormat, type Format } from '../layout'

/** Cadrage à un instant du plan : `x` et `y` désignent le point visé dans l'image, de 0 à 1. */
export interface Shot {
  readonly at: number
  readonly scale: number
  readonly x: number
  readonly y: number
}

export interface FootageProps {
  /** Nom de la séquence capturée, sans le format : `hero`, `piste`, `cam-chase`… */
  readonly clip: string
  /** Format de la capture à utiliser ; par défaut celui de la composition. */
  readonly format?: Format
  /** Première image de la capture à montrer. */
  readonly from?: number
  readonly rate?: number
  /** Cadrages successifs : la caméra glisse de l'un à l'autre. Un seul cadrage donne un plan fixe. */
  readonly shots?: readonly Shot[]
  /** Taille du conteneur, en pixels, s'il n'occupe pas toute la composition. */
  readonly box?: { readonly width: number; readonly height: number }
  readonly style?: CSSProperties
}

const FULL_FRAME: readonly Shot[] = [{ at: 0, scale: 1, x: 0.5, y: 0.5 }]
const GLIDE = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic) } as const

/** Une séquence filmée sur le site, recadrée pour remplir son conteneur, avec un mouvement de caméra. */
export function Footage({ clip, format, from = 0, rate = 1, shots = FULL_FRAME, box, style }: FootageProps) {
  const frame = useCurrentFrame()
  const compositionFormat = useFormat()
  const composition = useVideoConfig()
  const source = SIZES[format ?? compositionFormat]
  const target = box ?? composition
  // Le lecteur vidéo ne recadre pas de lui-même : on agrandit la capture jusqu'à couvrir le conteneur,
  // puis on la décale pour amener le point visé au même endroit du cadre.
  const cover = Math.max(target.width / source.width, target.height / source.height)
  const width = source.width * cover
  const height = source.height * cover
  const times = shots.map((shot) => shot.at)
  const glide = (key: 'scale' | 'x' | 'y'): number =>
    shots.length === 1 ? shots[0][key] : interpolate(frame, times, shots.map((shot) => shot[key]), GLIDE)
  const x = glide('x')
  const y = glide('y')

  return (
    <AbsoluteFill style={{ overflow: 'hidden', ...style }}>
      <Video
        src={staticFile(`footage/${format ?? compositionFormat}-${clip}.mp4`)}
        trimBefore={from}
        playbackRate={rate}
        muted
        style={{ position: 'absolute', left: (target.width - width) * x, top: (target.height - height) * y, width, height, maxWidth: 'none', transformOrigin: `${x * 100}% ${y * 100}%`, scale: String(glide('scale')) }}
      />
    </AbsoluteFill>
  )
}
