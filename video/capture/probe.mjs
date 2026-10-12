// Repérage : une image fixe de chaque écran dans chaque format, pour préparer le découpage.
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { FORMATS, openSession } from './session.mjs'

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '.probe')
const SCREENS = [
  ['menu', '#/'],
  ['piste', '#/piste'],
  ['tutos', '#/tutos'],
  ['backflip', '#/tutos/backflipTuck'],
]

await mkdir(out, { recursive: true })
for (const format of Object.keys(FORMATS)) {
  for (const [name, hash] of SCREENS) {
    const started = Date.now()
    const session = await openSession(format, hash)
    for (const frames of [60, 90]) {
      await session.advance(frames)
      await session.page.screenshot({ path: path.join(out, `${format}-${name}-${frames}.jpg`), type: 'jpeg', quality: 85 })
    }
    await session.close()
    process.stdout.write(`${format} ${name} : ${Date.now() - started} ms\n`)
  }
}
