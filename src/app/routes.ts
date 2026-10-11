/**
 * Écrans du site et leur ancre dans l'adresse : le bouton « précédent » du navigateur revient à
 * l'écran d'avant, et une adresse copiée rouvre le même écran.
 */
export type Route =
  | { readonly view: 'menu' }
  | { readonly view: 'sandbox' }
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
  if (first === SANDBOX_SEGMENT && second === undefined) return { view: 'sandbox' }
  if (first !== TUTORIALS_SEGMENT || rest.length > 0) return { view: 'menu' }
  return second === undefined ? { view: 'tutorials' } : { view: 'lesson', lesson: second }
}

export function routeHash(route: Route): string {
  switch (route.view) {
    case 'menu':
      return '#/'
    case 'sandbox':
      return `#/${SANDBOX_SEGMENT}`
    case 'tutorials':
      return `#/${TUTORIALS_SEGMENT}`
    case 'lesson':
      return `#/${TUTORIALS_SEGMENT}/${encodeURIComponent(route.lesson)}`
  }
}
