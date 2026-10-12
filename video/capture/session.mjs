import { execFile } from 'node:child_process'
import { mkdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { chromium } from 'playwright'

const run = promisify(execFile)
const here = path.dirname(fileURLToPath(import.meta.url))

export const FPS = 30
export const SITE_URL = process.env.SITE_URL ?? 'http://localhost:5173'
export const FOOTAGE_DIR = path.join(here, '..', 'public', 'footage')
const FRAMES_DIR = path.join(here, '.frames')
const FRAME_MS = 1000 / FPS
const JPEG_QUALITY = 95
/** Images avancées sans capture après le chargement, le temps que la scène et les polices se posent. */
const WARMUP_FRAMES = 45
const SHOT_TIMEOUT_MS = 8000
const SHOT_ATTEMPTS = 4

/** Formats de capture : la fenêtre est petite et la densité de pixels élevée, pour que l'interface reste lisible en vidéo. */
export const FORMATS = {
  paysage: { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5 },
  vertical: { viewport: { width: 540, height: 960 }, deviceScaleFactor: 2 },
}

/**
 * Ouvre le site avec l'horloge virtuelle et rend de quoi le piloter image par image.
 * `record` avance le temps d'une image, la capture, puis recommence. `window` remplace la fenêtre
 * du format, et `css` s'ajoute à la page (pour masquer l'interface sur un plan de scène seule).
 */
export async function openSession(formatName, hash, { window: windowOverride, css } = {}) {
  const format = windowOverride ?? FORMATS[formatName]
  if (!format) throw new Error(`Format de capture inconnu : ${formatName}`)
  const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
  const context = await browser.newContext({ ...format, reducedMotion: 'no-preference' })
  const page = await context.newPage()
  await page.addInitScript({ path: path.join(here, 'virtualTime.js') })
  await page.goto(`${SITE_URL}/${hash}`, { waitUntil: 'networkidle' })
  await page.evaluate(() => document.fonts.ready)
  if (css) await page.addStyleTag({ content: css })

  const advance = async (frames = 1) => {
    for (let index = 0; index < frames; index += 1) await page.evaluate((ms) => window.__advance(ms), FRAME_MS)
  }
  await advance(WARMUP_FRAMES)

  /** Capture l'écran ; le navigateur sans fenêtre cale parfois sur une image, un nouvel essai le débloque. */
  const shoot = async (file) => {
    for (let attempt = 1; ; attempt += 1) {
      try {
        await page.screenshot({ path: file, type: 'jpeg', quality: JPEG_QUALITY, timeout: SHOT_TIMEOUT_MS })
        return
      } catch (error) {
        if (attempt >= SHOT_ATTEMPTS) throw new Error(`Capture impossible après ${SHOT_ATTEMPTS} essais : ${file}`, { cause: error })
        process.stderr.write(`Capture bloquée (essai ${attempt}), nouvel essai : ${path.basename(file)}\n`)
      }
    }
  }

  let clip = null
  const startClip = async (name) => {
    const dir = path.join(FRAMES_DIR, `${formatName}-${name}`)
    await rm(dir, { recursive: true, force: true })
    await mkdir(dir, { recursive: true })
    clip = { name, dir, count: 0 }
  }
  const record = async (frames) => {
    if (!clip) throw new Error('Aucune séquence en cours : appeler startClip avant record')
    for (let index = 0; index < frames; index += 1) {
      await advance()
      const file = path.join(clip.dir, `${String(clip.count).padStart(5, '0')}.jpg`)
      await shoot(file)
      clip.count += 1
    }
  }
  /** Assemble les images de la séquence en cours en MP4, chaque image étant une image clé pour un calage exact. */
  const endClip = async () => {
    if (!clip) throw new Error('Aucune séquence en cours à terminer')
    await mkdir(FOOTAGE_DIR, { recursive: true })
    const output = path.join(FOOTAGE_DIR, `${formatName}-${clip.name}.mp4`)
    await run('ffmpeg', ['-y', '-framerate', String(FPS), '-i', path.join(clip.dir, '%05d.jpg'), '-c:v', 'libx264', '-crf', '18', '-preset', 'slow', '-g', '1', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', output])
    const done = { file: output, frames: clip.count }
    await rm(clip.dir, { recursive: true, force: true })
    clip = null
    return done
  }

  return { page, advance, startClip, record, endClip, close: () => browser.close() }
}
