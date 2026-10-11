/**
 * Ressources GPU créées une seule fois et réutilisées à chaque reconstruction de la scène :
 * elles sont marquées pour que le nettoyage d'un groupe retiré ne les libère pas.
 */
interface Markable {
  readonly userData: Record<string, unknown>
}

const SHARED_FLAG = 'shared'

export function markShared<T extends Markable>(asset: T): T {
  asset.userData[SHARED_FLAG] = true
  return asset
}

export const isShared = (asset: Markable): boolean => asset.userData[SHARED_FLAG] === true
