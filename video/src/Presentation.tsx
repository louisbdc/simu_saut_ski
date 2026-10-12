import { TransitionSeries, linearTiming, type TransitionPresentation } from '@remotion/transitions'
import { fade } from '@remotion/transitions/fade'
import { slide } from '@remotion/transitions/slide'
import { Fragment, type ComponentType } from 'react'
import { AbsoluteFill } from 'remotion'
import { Cameras } from './scenes/Cameras'
import { Intro, Menu, Outro } from './scenes/Openers'
import { Piste } from './scenes/Piste'
import { Lesson, Tutos } from './scenes/Tutos'
import { COLORS } from './theme'

type Cut = 'slide' | 'fade'

interface Scene {
  readonly id: string
  readonly component: ComponentType
  readonly frames: number
  /** Transition vers la scène suivante. */
  readonly cut: Cut
}

/** Le montage, dans l'ordre. Les durées sont en images, à 30 images par seconde. */
const SCENES: readonly Scene[] = [
  { id: 'intro', component: Intro, frames: 120, cut: 'fade' },
  { id: 'menu', component: Menu, frames: 80, cut: 'slide' },
  { id: 'piste', component: Piste, frames: 220, cut: 'slide' },
  { id: 'cameras', component: Cameras, frames: 130, cut: 'slide' },
  { id: 'tutos', component: Tutos, frames: 110, cut: 'fade' },
  { id: 'lesson', component: Lesson, frames: 250, cut: 'fade' },
  { id: 'outro', component: Outro, frames: 110, cut: 'fade' },
]
const TRANSITION_FRAMES = 12

/** Durée totale : les scènes se chevauchent le temps de chaque transition. */
export const TOTAL_FRAMES = SCENES.reduce((total, scene) => total + scene.frames, 0) - (SCENES.length - 1) * TRANSITION_FRAMES

const presentationOf = (cut: Cut): TransitionPresentation<Record<string, unknown>> =>
  (cut === 'slide' ? slide({ direction: 'from-right' }) : fade()) as TransitionPresentation<Record<string, unknown>>

/** La vidéo entière ; chaque scène adapte sa mise en page au format de la composition. */
export function Presentation() {
  return (
    <AbsoluteFill style={{ background: COLORS.night }}>
      <TransitionSeries>
        {SCENES.map((scene, index) => (
          <Fragment key={scene.id}>
            <TransitionSeries.Sequence durationInFrames={scene.frames}>
              <scene.component />
            </TransitionSeries.Sequence>
            {index < SCENES.length - 1 ? <TransitionSeries.Transition presentation={presentationOf(scene.cut)} timing={linearTiming({ durationInFrames: TRANSITION_FRAMES })} /> : null}
          </Fragment>
        ))}
      </TransitionSeries>
    </AbsoluteFill>
  )
}
