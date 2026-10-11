/**
 * Veille du rendu : quand rien ne bouge (lecture en pause, caméra immobile), on ne redessine plus.
 * Tout ce qui peut changer l'image réveille le rendu pour un court délai de grâce.
 */
export interface IdleGate {
  /** Garde le rendu éveillé jusqu'à `now + hold` millisecondes (délai de grâce par défaut). */
  readonly wake: (now: number, hold?: number) => void
  readonly isAwake: (now: number) => boolean
}

export function createIdleGate(defaultHold: number): IdleGate {
  let awakeUntil = -Infinity
  return {
    wake: (now: number, hold: number = defaultHold): void => {
      awakeUntil = Math.max(awakeUntil, now + hold)
    },
    isAwake: (now: number): boolean => now <= awakeUntil,
  }
}
