// Capture les séquences du site utilisées par la vidéo.
// Usage : node capture/run.mjs [paysage|vertical] [séquence...] ; sans argument, tout est capturé.
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { FOOTAGE_DIR, FORMATS, openSession } from './session.mjs'

/** Fenêtre plus large pour les écrans chargés : la scène 3D garde de la place autour des panneaux. */
const WIDE = { viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1.2 }
const HIDE_MENU = '#menu { display: none !important; }'
const HIDE_SANDBOX_UI = '#dock, .lil-gui, #live, #topbar { display: none !important; }'
const HIDE_LESSON_UI = '#lesson, #lesson-rail, #live, #topbar { display: none !important; }'
const LESSON = 'backflipTuck'
const SPIN_LESSON = 'spin360'
const FREEZE_LABEL = 'Arrêts sur image'

const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)

async function goTo(session, hash, view) {
  await session.page.evaluate((target) => {
    window.location.hash = target
  }, hash)
  await session.page.waitForFunction((expected) => document.body.dataset.view === expected, view)
}

/** Fait défiler un conteneur jusqu'à centrer une cible, une image à la fois. */
async function scrollTo(session, containerSelector, targetSelector, frames) {
  const { from, to } = await session.page.evaluate(
    ([container, target]) => {
      const box = document.querySelector(container)
      const item = document.querySelector(target)
      const offset = item.getBoundingClientRect().top - box.getBoundingClientRect().top
      const wanted = box.scrollTop + offset - (box.clientHeight - item.offsetHeight) / 2
      return { from: box.scrollTop, to: Math.max(0, Math.min(wanted, box.scrollHeight - box.clientHeight)) }
    },
    [containerSelector, targetSelector],
  )
  for (let index = 1; index <= frames; index += 1) {
    await session.page.evaluate(([container, top]) => {
      document.querySelector(container).scrollTop = top
    }, [containerSelector, from + (to - from) * easeInOut(index / frames)])
    await session.record(1)
  }
}

/** Glisse le curseur d'un réglage de la piste libre, de sa position à `share` (0 à 1) de sa course. */
async function dragSlider(session, label, share, frames) {
  const box = await session.page.evaluate((name) => {
    const controller = [...document.querySelectorAll('.lil-gui .lil-controller.lil-number')].find((item) => item.querySelector('.lil-name')?.textContent?.startsWith(name))
    const slider = controller?.querySelector('.lil-slider')
    const fill = controller?.querySelector('.lil-fill')
    if (!slider || !fill) return null
    const rect = slider.getBoundingClientRect()
    return { left: rect.left, width: rect.width, y: rect.top + rect.height / 2, start: fill.getBoundingClientRect().width / rect.width }
  }, label)
  if (!box) throw new Error(`Réglage introuvable dans la piste libre : ${label}`)
  const at = (value) => box.left + box.width * value
  await session.page.mouse.move(at(box.start), box.y)
  await session.record(6)
  await session.page.mouse.down()
  for (let index = 1; index <= frames; index += 1) {
    await session.page.mouse.move(at(box.start + (share - box.start) * easeInOut(index / frames)), box.y)
    await session.record(1)
  }
  await session.page.mouse.up()
}

/** Même saut de la piste libre, sans interface, vu par une caméra : touche 1, 2 ou 3. */
const cameraClip = (key) => ({
  hash: '#/piste',
  options: { css: HIDE_SANDBOX_UI },
  play: async (session) => {
    await session.page.keyboard.press(key)
    await session.page.keyboard.press('r')
    await session.record(360)
  },
})

/** Coupe les arrêts sur image d'une leçon : le saut se déroule d'une traite, au ralenti de chaque étape. */
async function disableFreezes(session) {
  const found = await session.page.evaluate((label) => {
    const toggle = [...document.querySelectorAll('#lesson-rail button')].find((item) => item.textContent === label)
    if (!toggle) return false
    if (toggle.getAttribute('aria-pressed') === 'true') toggle.click()
    // « Saut entier » relance la lecture depuis le départ, sans les arrêts.
    document.querySelector('#lesson-rail .steps button')?.click()
    return true
  }, FREEZE_LABEL)
  if (!found) throw new Error(`Bouton « ${FREEZE_LABEL} » introuvable dans la leçon`)
}

/** Une leçon sans son interface : la figure et ses repères 3D seuls, avec ou sans arrêts sur image. */
const cleanLessonClip = (lesson, { freezes }) => ({
  hash: `#/tutos/${lesson}`,
  options: { css: HIDE_LESSON_UI },
  play: async (session) => {
    if (!freezes) {
      await disableFreezes(session)
    }
    await session.record(freezes ? 540 : 600)
  },
})

const CLIPS = {
  hero: {
    hash: '#/',
    options: { css: HIDE_MENU },
    play: async (session) => {
      await session.record(240)
    },
  },
  menu: {
    hash: '#/tutos',
    play: async (session) => {
      await goTo(session, '#/', 'menu')
      await session.record(105)
      await session.page.hover('#menu a[href="#/piste"]')
      await session.record(30)
    },
  },
  piste: {
    formats: ['paysage'],
    hash: '#/piste',
    options: { window: WIDE },
    play: async (session) => {
      await session.page.keyboard.press('r')
      await session.record(110)
      await dragSlider(session, 'Hauteur du kick', 0.3, 34)
      await session.record(200)
    },
  },
  'cam-side': cameraClip('1'),
  'cam-chase': cameraClip('2'),
  'cam-tv': cameraClip('3'),
  tutos: {
    hash: '#/',
    play: async (session) => {
      await goTo(session, '#/tutos', 'tutorials')
      await session.record(50)
      await scrollTo(session, '#tutorials', `#tutorials a[href="#/tutos/${LESSON}"]`, 80)
      await session.page.hover(`#tutorials a[href="#/tutos/${LESSON}"]`)
      await session.record(22)
    },
  },
  lesson: {
    formats: ['paysage'],
    hash: `#/tutos/${LESSON}`,
    options: { window: WIDE },
    play: async (session) => {
      await session.record(540)
    },
  },
  'lesson-clean': cleanLessonClip(LESSON, { freezes: true }),
  'flip-clean': cleanLessonClip(LESSON, { freezes: false }),
  'spin-clean': cleanLessonClip(SPIN_LESSON, { freezes: false }),
}

const [, , ...args] = process.argv
const formats = args.filter((arg) => arg in FORMATS)
const names = args.filter((arg) => !(arg in FORMATS))
const unknown = names.filter((name) => !(name in CLIPS))
if (unknown.length > 0) throw new Error(`Séquences inconnues : ${unknown.join(', ')}. Connues : ${Object.keys(CLIPS).join(', ')}`)

const indexFile = path.join(FOOTAGE_DIR, 'index.json')
const readIndex = async () => {
  try {
    return JSON.parse(await readFile(indexFile, 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') return {}
    throw error
  }
}

for (const format of formats.length > 0 ? formats : Object.keys(FORMATS)) {
  for (const name of names.length > 0 ? names : Object.keys(CLIPS)) {
    const clip = CLIPS[name]
    if (clip.formats && !clip.formats.includes(format)) continue
    const started = Date.now()
    const session = await openSession(format, clip.hash, clip.options)
    try {
      await session.startClip(name)
      await clip.play(session)
      const { frames } = await session.endClip()
      await writeFile(indexFile, `${JSON.stringify({ ...(await readIndex()), [`${format}-${name}`]: { frames } }, null, 2)}\n`)
      process.stdout.write(`${format}-${name} : ${frames} images en ${Math.round((Date.now() - started) / 1000)} s\n`)
    } finally {
      await session.close()
    }
  }
}
