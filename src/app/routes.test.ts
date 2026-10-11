import { describe, expect, test } from 'vitest'
import { parseRoute, routeHash, type Route } from './routes'

describe('routes', () => {
  test('une adresse sans ancre ouvre le menu', () => {
    expect(parseRoute('')).toEqual({ view: 'menu' })
    expect(parseRoute('#/')).toEqual({ view: 'menu' })
  })

  test('chaque écran a son ancre', () => {
    expect(parseRoute('#/piste')).toEqual({ view: 'sandbox' })
    expect(parseRoute('#/tutos')).toEqual({ view: 'tutorials' })
    expect(parseRoute('#/tutos/spin360')).toEqual({ view: 'lesson', lesson: 'spin360' })
  })

  test('une ancre inconnue ramène au menu', () => {
    expect(parseRoute('#/nimporte/quoi')).toEqual({ view: 'menu' })
  })

  test('une barre finale ne change pas l’écran', () => {
    expect(parseRoute('#/tutos/')).toEqual({ view: 'tutorials' })
  })

  test.each<Route>([
    { view: 'menu' },
    { view: 'sandbox' },
    { view: 'tutorials' },
    { view: 'lesson', lesson: 'backflip' },
  ])('l’ancre de %o se relit à l’identique', (route) => {
    expect(parseRoute(routeHash(route))).toEqual(route)
  })
})
