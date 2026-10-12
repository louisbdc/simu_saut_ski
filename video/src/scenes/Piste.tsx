import { AbsoluteFill } from 'remotion'
import { Footage, type Shot } from '../components/Footage'
import { Caption, Pill } from '../components/Kinetic'
import { useFormat } from '../layout'
import { COLORS } from '../theme'

/** La capture commence avant que le curseur « Hauteur du kick » ne bouge, et elle est un peu accélérée pour aller jusqu'à la chute. */
const CLIP_START = 70
const CLIP_RATE = 1.25
/** Instants du plan, en images : zoom sur le réglage, puis sur le verdict, puis retour à la piste. */
const TUNING = { from: 26, to: 74 } as const
const VERDICT = { from: 100, to: 156 } as const
const BACK_TO_SLOPE = 184

/** En paysage, la caméra zoome sur le panneau de réglages puis sur le résultat du calcul. */
const PAYSAGE_SHOTS: readonly Shot[] = [
  { at: 0, scale: 1, x: 0.5, y: 0.5 },
  { at: TUNING.from, scale: 1.9, x: 0.97, y: 0.6 },
  { at: TUNING.to, scale: 1.9, x: 0.97, y: 0.6 },
  { at: VERDICT.from, scale: 1.6, x: 0.05, y: 0.86 },
  { at: VERDICT.to, scale: 1.6, x: 0.05, y: 0.86 },
  { at: BACK_TO_SLOPE, scale: 1, x: 0.5, y: 0.5 },
]
/** En vertical, l'image ne montre qu'une tranche de l'écran : elle glisse du panneau au résultat. */
const VERTICAL_SHOTS: readonly Shot[] = [
  { at: 0, scale: 1, x: 0.55, y: 0.5 },
  { at: TUNING.from, scale: 1.2, x: 1, y: 0.42 },
  { at: TUNING.to, scale: 1.2, x: 1, y: 0.42 },
  { at: VERDICT.from, scale: 1.25, x: 0, y: 0.9 },
  { at: VERDICT.to, scale: 1.25, x: 0, y: 0.9 },
  { at: BACK_TO_SLOPE, scale: 1, x: 0.5, y: 0.5 },
]

/** Piste libre : on change une bosse, la simulation recalcule et dit si la ligne passe encore. */
export function Piste() {
  const vertical = useFormat() === 'vertical'
  const size = vertical ? 50 : 54
  return (
    <AbsoluteFill style={{ background: COLORS.night }}>
      <Footage clip="piste" format="paysage" from={CLIP_START} rate={CLIP_RATE} shots={vertical ? VERTICAL_SHOTS : PAYSAGE_SHOTS} />
      {/* En vertical, le réglage occupe le haut de l'image et le verdict le bas : chaque légende se pose à l'opposé. */}
      <AbsoluteFill style={{ display: 'flex', flexDirection: 'column', gap: 34, alignItems: vertical ? 'center' : 'flex-start', justifyContent: vertical ? 'flex-end' : 'flex-start', padding: vertical ? '0 0 330px' : '150px 0 0 100px' }}>
        <Pill text="Piste libre" size={vertical ? 34 : 36} at={4} until={VERDICT.from - 16} />
        <Caption text="Règle chaque bosse" size={size} at={TUNING.from + 4} until={TUNING.to} />
      </AbsoluteFill>
      <AbsoluteFill style={{ display: 'flex', flexDirection: 'column', alignItems: vertical ? 'center' : 'flex-start', padding: vertical ? '290px 0 0' : '150px 0 0 100px' }}>
        <Caption text="La physique dit si ça passe" size={size} at={VERDICT.from + 4} until={VERDICT.to + 14} />
      </AbsoluteFill>
    </AbsoluteFill>
  )
}
