import { loadFont as loadFredoka } from '@remotion/google-fonts/Fredoka'
import { loadFont as loadNunito } from '@remotion/google-fonts/Nunito'

/** Couleurs du site (voir `src/style.css`) : bleu nuit alpin, neige, orange et jaune soleil. */
export const COLORS = {
  night: '#10243e',
  nightDeep: '#0b1a2e',
  panel: 'rgba(16, 36, 62, 0.9)',
  panelEdge: 'rgba(255, 255, 255, 0.16)',
  sun: '#ffc93c',
  pole: '#ff7a1a',
  snow: '#f4f8fc',
  glacier: '#9db9d6',
  ink: '#4a1d00',
} as const

export const DISPLAY_FONT = loadFredoka('normal', { weights: ['600', '700'], subsets: ['latin'] }).fontFamily
export const BODY_FONT = loadNunito('normal', { weights: ['700', '800'], subsets: ['latin'] }).fontFamily

/** Ombre « autocollant » des titres du site : un liseré sombre net, puis une ombre portée douce. */
export const stickerShadow = (depth: number): string => `0 ${depth}px 0 ${COLORS.nightDeep}, 0 ${depth * 3}px ${depth * 6}px rgba(8, 22, 40, 0.55)`
