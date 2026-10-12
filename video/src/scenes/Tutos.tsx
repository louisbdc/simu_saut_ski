import { AbsoluteFill, Sequence } from 'remotion'
import { Footage } from '../components/Footage'
import { Caption, Pill } from '../components/Kinetic'
import { useFormat } from '../layout'
import { COLORS } from '../theme'

/** Nombre de leçons du site (`LESSONS.length` dans `src/tutorials/lessons.ts`) : à tenir à jour si la liste change. */
const LESSON_COUNT = 13
const LIST_RATE = 1.35

/** La liste des tutos, qui défile jusqu'au backflip. */
export function Tutos() {
  const vertical = useFormat() === 'vertical'
  return (
    <AbsoluteFill style={{ background: COLORS.night }}>
      <Footage clip="tutos" rate={LIST_RATE} shots={[{ at: 0, scale: 1, x: 0.5, y: 0.5 }, { at: 110, scale: vertical ? 1.06 : 1.1, x: 0.3, y: 0.6 }]} />
      <AbsoluteFill style={{ display: 'flex', flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: vertical ? 260 : 90 }}>
        <Caption lead={String(LESSON_COUNT)} text="figures, de la verte à la double noire" size={vertical ? 44 : 54} at={14} until={94} />
      </AbsoluteFill>
    </AbsoluteFill>
  )
}

/** Durée du premier plan de la leçon, celui des consignes ; le second montre la figure d'une traite. */
const STEPS_FRAMES = 80
/** Arrivée sur l'étape « Impulsion » dans les captures de la leçon : avec l'interface en paysage, sans en vertical. */
const STEPS_START = { paysage: 290, vertical: 370 } as const
/** Le backflip sans arrêts sur image : du départ de la courbe à la réception, un peu accéléré. */
const FLIP_START = 115
const FLIP_RATE = 1.45

/** Une leçon : les consignes étape par étape, puis la figure entière au ralenti avec ses repères. */
export function Lesson() {
  const format = useFormat()
  const vertical = format === 'vertical'
  return (
    <AbsoluteFill style={{ background: COLORS.night }}>
      <Sequence durationInFrames={STEPS_FRAMES} premountFor={30}>
        <Footage clip={vertical ? 'lesson-clean' : 'lesson'} from={STEPS_START[format]} shots={[{ at: 0, scale: 1, x: 0.5, y: 0.5 }, { at: STEPS_FRAMES, scale: 1.1, x: 0.4, y: 0.42 }]} />
        <AbsoluteFill style={{ display: 'flex', flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center', paddingTop: vertical ? 230 : 44 }}>
          <Caption text="Chaque étape décortiquée" size={vertical ? 50 : 50} at={10} until={STEPS_FRAMES - 12} />
        </AbsoluteFill>
      </Sequence>
      <Sequence from={STEPS_FRAMES} premountFor={30}>
        <Footage clip="flip-clean" from={FLIP_START} rate={FLIP_RATE} shots={[{ at: 0, scale: 1.16, x: 0.5, y: 0.45 }, { at: 170, scale: 1, x: 0.5, y: 0.5 }]} />
        <AbsoluteFill style={{ display: 'flex', flexDirection: 'row', alignItems: 'flex-start', justifyContent: vertical ? 'center' : 'flex-start', padding: vertical ? '210px 0 0' : '90px 0 0 100px' }}>
          <Pill text="Au ralenti" size={vertical ? 34 : 36} at={6} />
        </AbsoluteFill>
        <AbsoluteFill style={{ display: 'flex', flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: vertical ? 280 : 90 }}>
          <Caption text="Où regarder. Quand lancer. Comment poser." size={vertical ? 40 : 52} at={56} until={150} />
        </AbsoluteFill>
      </Sequence>
    </AbsoluteFill>
  )
}
