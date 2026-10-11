import { describe, expect, test } from 'vitest'
import { DEFAULT_LINE, KICKER_LIMITS, NEW_KICKER } from '../physics/constants'
import { DEFAULT_MODEL_ID } from '../physics/presets'
import { decodeLine, encodeLine, readStoredLine, storeLine, type SavedLine } from './lineCodec'

const line: SavedLine = {
  config: { ...DEFAULT_LINE, kickers: [{ ...NEW_KICKER, inrunLength: 70.185 }, NEW_KICKER], tricks: ['spin360', 'custom:1:360:mute'], startSwitch: true },
  models: ['hard', 'pro'],
  scenario: 'hard',
}

/** Encode un contenu arbitraire comme le ferait une adresse trafiquée. */
const forged = (payload: unknown): string =>
  `v1.${btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`

const memory = (): Pick<Storage, 'getItem' | 'setItem'> => {
  const values = new Map<string, string>()
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => void values.set(key, value) }
}

describe('ligne dans une adresse', () => {
  test('une ligne encodée se relit à l’identique', () => {
    expect(decodeLine(encodeLine(line))).toEqual(line)
  })

  test('le texte encodé tient dans une adresse sans échappement', () => {
    expect(encodeLine(line)).toMatch(/^v1\.[A-Za-z0-9_-]+$/)
  })

  test('l’élan réglé garde sa précision : les réceptions ne bougent pas', () => {
    expect(decodeLine(encodeLine(line))?.config.kickers[0].inrunLength).toBe(70.185)
  })

  test.each(['', 'v1.', 'v1.pas-du-base64-valide-%%%', 'v9.abc', 'nimporte quoi'])('« %s » n’est pas une ligne', (text) => {
    expect(decodeLine(text)).toBeNull()
  })

  test('un contenu qui n’a pas la bonne forme est refusé', () => {
    expect(decodeLine(forged(null))).toBeNull()
    expect(decodeLine(forged({ k: 'bosse' }))).toBeNull()
    expect(decodeLine(forged({ k: [] }))).toBeNull()
  })

  test('une valeur manquante ou invalide prend la valeur par défaut, pas le minimum', () => {
    const decoded = decodeLine(forged({ k: [[25, 'x']] }))

    expect(decoded?.config.kickers).toHaveLength(1)
    expect(decoded?.config.kickers[0].inrunAngleDeg).toBe(25)
    expect(decoded?.config.kickers[0].inrunLength).toBe(NEW_KICKER.inrunLength)
    expect(decoded?.config.kickers[0].transitionRadius).toBe(NEW_KICKER.transitionRadius)
    expect(decoded?.config.rider).toEqual(DEFAULT_LINE.rider)
    expect(decoded?.config.tricks).toEqual(['straight'])
    expect(decoded?.models).toEqual([DEFAULT_MODEL_ID])
    expect(decoded?.scenario).toBeUndefined()
  })

  test('une valeur hors bornes est ramenée dans ses bornes', () => {
    const decoded = decodeLine(forged({ k: [[9999]] }))

    expect(decoded?.config.kickers[0].inrunAngleDeg).toBe(KICKER_LIMITS.inrunAngleDeg.max)
  })

  test('un gabarit ou un scénario inconnus sont écartés', () => {
    const decoded = decodeLine(forged({ k: [[25]], m: ['inconnu'], c: 'inconnu' }))

    expect(decoded?.models).toEqual([DEFAULT_MODEL_ID])
    expect(decoded?.scenario).toBeUndefined()
  })
})

describe('ligne enregistrée dans le navigateur', () => {
  test('la dernière ligne enregistrée est celle qu’on retrouve', () => {
    const storage = memory()

    storeLine(storage, line)

    expect(readStoredLine(storage)).toEqual(line)
  })

  test('sans rien d’enregistré, ou avec un contenu abîmé, il n’y a pas de ligne', () => {
    const storage = memory()

    expect(readStoredLine(storage)).toBeNull()
    storage.setItem('simu-saut-ski:ligne', 'abîmé')
    expect(readStoredLine(storage)).toBeNull()
  })

  test('un navigateur qui refuse le stockage ne fait rien planter', () => {
    const refusing: Pick<Storage, 'getItem' | 'setItem'> = {
      getItem: () => {
        throw new Error('refusé')
      },
      setItem: () => {
        throw new Error('refusé')
      },
    }

    expect(() => storeLine(refusing, line)).not.toThrow()
    expect(readStoredLine(refusing)).toBeNull()
  })
})
