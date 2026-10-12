import { useVideoConfig } from 'remotion'

export type Format = 'paysage' | 'vertical'

export const FPS = 30
export const SIZES: Readonly<Record<Format, { readonly width: number; readonly height: number }>> = {
  paysage: { width: 1920, height: 1080 },
  vertical: { width: 1080, height: 1920 },
}

/** Format de la composition en cours de rendu, déduit de ses dimensions. */
export function useFormat(): Format {
  const { width, height } = useVideoConfig()
  return height > width ? 'vertical' : 'paysage'
}

/** Choisit une valeur selon le format : la mise en page change, pas le contenu. */
export function useByFormat<T>(paysage: T, vertical: T): T {
  return useFormat() === 'vertical' ? vertical : paysage
}
