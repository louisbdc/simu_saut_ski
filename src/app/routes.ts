/**
 * Écrans du site et leur ancre dans l'adresse : le bouton « précédent » du navigateur revient à
 * l'écran d'avant, et une adresse copiée rouvre le même écran.
 */
export type Route =
  | { readonly view: 'menu' }
  /** `line` : ligne partagée par un lien, à charger en arrivant. */
  | { readonly view: 'sandbox'; readonly line?: string }
  | { readonly view: 'tutorials' }
  | { readonly view: 'lesson'; readonly lesson: string }

export type View = Route['view']

const SANDBOX_SEGMENT = 'piste'
const TUTORIALS_SEGMENT = 'tutos'

/** Écran désigné par l'ancre de l'adresse ; une ancre inconnue ramène au menu. */
export function parseRoute(hash: string): Route {
  const segments = hash
    .replace(/^#/, '')
    .split('/')
    .filter((segment) => segment !== '')
    .map(decodeURIComponent)
  const [first, second, ...rest] = segments
  if (rest.length > 0) return { view: 'menu' }
  if (first === SANDBOX_SEGMENT) return second === undefined ? { view: 'sandbox' } : { view: 'sandbox', line: second }
  if (first !== TUTORIALS_SEGMENT) return { view: 'menu' }
  return second === undefined ? { view: 'tutorials' } : { view: 'lesson', lesson: second }
}

export function routeHash(route: Route): string {
  switch (route.view) {
    case 'menu':
      return '#/'
    case 'sandbox':
      return route.line ? `#/${SANDBOX_SEGMENT}/${encodeURIComponent(route.line)}` : `#/${SANDBOX_SEGMENT}`
    case 'tutorials':
      return `#/${TUTORIALS_SEGMENT}`
    case 'lesson':
      return `#/${TUTORIALS_SEGMENT}/${encodeURIComponent(route.lesson)}`
  }
}
