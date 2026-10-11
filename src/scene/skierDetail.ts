/**
 * Niveau de détail du skieur. De près, on voit le mannequin ; de loin, ses vêtements le cachent
 * presque entièrement et un corps en capsules, bien moins coûteux, fait la même silhouette.
 */

/** Distance caméra-skieur au-delà de laquelle le corps simplifié suffit, en mètres. */
export const FAR_VIEW_FROM = 38
/** Distance en deçà de laquelle on revient au mannequin : l'écart évite de clignoter autour du seuil. */
export const NEAR_VIEW_UNDER = 32

/** Le skieur est-il vu de loin ? Entre les deux seuils, il garde le niveau de détail qu'il avait. */
export function isFarView(wasFar: boolean, distance: number): boolean {
  if (distance >= FAR_VIEW_FROM) return true
  if (distance <= NEAR_VIEW_UNDER) return false
  return wasFar
}
