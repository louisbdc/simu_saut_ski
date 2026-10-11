import { routeHash, type Route } from '../app/routes'
import { LESSONS } from '../tutorials/lessons'
import { el } from './dom'

export interface MenuEntry {
  /** Pictogramme du bouton : un seul caractère. */
  readonly icon: string
  readonly title: string
  readonly description: string
  readonly route: Route
}

/** Entrées du menu d'accueil, dans l'ordre d'affichage. Un nouvel écran s'ajoute ici, avec sa route. */
export const MENU_ENTRIES: readonly MenuEntry[] = [
  {
    icon: '▶',
    title: 'Piste libre',
    description: 'Dessine ta ligne, règle chaque bosse, choisis tes figures et regarde si ça passe.',
    route: { view: 'sandbox' },
  },
  {
    icon: '★',
    title: 'Tutos',
    description: `${LESSONS.length} figures expliquées étape par étape, au ralenti, chacune sur une bosse faite pour elle.`,
    route: { view: 'tutorials' },
  },
]

function entryItem(entry: MenuEntry): HTMLLIElement {
  const link = el('a', { attributes: { href: routeHash(entry.route) } }, [
    el('span', { className: 'entry-icon', text: entry.icon, attributes: { 'aria-hidden': 'true' } }),
    el('span', { className: 'entry-text' }, [
      el('span', { className: 'entry-title', text: entry.title }),
      el('span', { className: 'entry-description', text: entry.description }),
    ]),
    el('span', { className: 'entry-arrow', text: '→', attributes: { 'aria-hidden': 'true' } }),
  ])
  return el('li', {}, [link])
}

/** Écran d'accueil : le titre et la liste des écrans du site, par-dessus la piste qui tourne en fond. */
export function createMenu(): HTMLElement {
  return el('main', { attributes: { id: 'menu' } }, [
    el('div', { className: 'menu-body' }, [
      el('p', { className: 'eyebrow', text: 'Ski freestyle' }),
      el('h1', { text: 'Simulateur de kickers' }),
      el('nav', { attributes: { 'aria-label': 'Écrans du site' } }, [
        el('ol', { className: 'menu-entries' }, MENU_ENTRIES.map((entry) => entryItem(entry))),
      ]),
    ]),
  ])
}
