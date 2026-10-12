import { AbsoluteFill } from 'remotion'
import { Footage } from '../components/Footage'
import { Caption, Pill, Pop, Scrim, Stack, Title } from '../components/Kinetic'
import { useFormat } from '../layout'
import { BODY_FONT, COLORS } from '../theme'

const SITE_NAME: readonly string[] = ['Simulateur', 'de kickers']
/** Même voile que le menu du site : sombre à gauche, la piste visible à droite. */
const SIDE_SCRIM = 'radial-gradient(120% 90% at 0% 55%, rgba(16, 36, 62, 0.92) 0%, rgba(16, 36, 62, 0.62) 42%, rgba(16, 36, 62, 0) 72%)'
const BOTTOM_SCRIM = 'linear-gradient(180deg, rgba(16, 36, 62, 0) 28%, rgba(16, 36, 62, 0.9) 74%)'
const OUTRO_SCRIM = 'linear-gradient(180deg, rgba(16, 36, 62, 0.5), rgba(16, 36, 62, 0.78))'
/** Image de la capture d'ouverture où reprend le plan de fin, pour ne pas revoir le même passage. */
const OUTRO_START = 110

/** Ouverture : la piste en fond, le nom du site qui arrive mot par mot. */
export function Intro() {
  const vertical = useFormat() === 'vertical'
  return (
    <AbsoluteFill style={{ background: COLORS.night }}>
      <Footage clip="hero" shots={[{ at: 0, scale: 1.2, x: 0.62, y: 0.42 }, { at: 120, scale: 1.03, x: 0.5, y: 0.5 }]} />
      <Scrim gradient={vertical ? BOTTOM_SCRIM : SIDE_SCRIM} />
      <AbsoluteFill style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: vertical ? 'flex-end' : 'center', gap: vertical ? 34 : 30, padding: vertical ? '0 70px 330px' : '0 0 0 130px' }}>
        <Pill text="Ski freestyle" size={vertical ? 30 : 32} at={8} />
        <Title lines={SITE_NAME} size={vertical ? 150 : 190} at={14} />
        <Pop at={46} style={{ marginTop: vertical ? 20 : 26 }}>
          <span style={{ fontFamily: BODY_FONT, fontWeight: 800, fontSize: vertical ? 44 : 46, color: COLORS.glacier }}>Construis ta ligne. Apprends chaque figure.</span>
        </Pop>
      </AbsoluteFill>
    </AbsoluteFill>
  )
}

/** Le vrai menu du site, avec ses deux entrées. */
export function Menu() {
  const vertical = useFormat() === 'vertical'
  return (
    <AbsoluteFill style={{ background: COLORS.night }}>
      <Footage clip="menu" shots={vertical ? [{ at: 0, scale: 1, x: 0.5, y: 0.5 }, { at: 80, scale: 1.14, x: 0.5, y: 0.82 }] : [{ at: 0, scale: 1, x: 0.5, y: 0.5 }, { at: 80, scale: 1.16, x: 0.18, y: 0.66 }]} />
      <AbsoluteFill style={{ display: 'flex', flexDirection: 'row', alignItems: 'flex-start', justifyContent: vertical ? 'center' : 'flex-end', padding: vertical ? '240px 0 0' : '130px 150px 0 0' }}>
        <Caption lead="2" text="façons de jouer" size={vertical ? 52 : 56} at={26} />
      </AbsoluteFill>
    </AbsoluteFill>
  )
}

/** Fin : retour sur la piste, le nom du site et une invitation à essayer. */
export function Outro() {
  const vertical = useFormat() === 'vertical'
  return (
    <AbsoluteFill style={{ background: COLORS.night }}>
      <Footage clip="hero" from={OUTRO_START} shots={[{ at: 0, scale: 1.04, x: 0.5, y: 0.5 }, { at: 110, scale: 1.18, x: 0.55, y: 0.45 }]} />
      <Scrim gradient={OUTRO_SCRIM} />
      <Stack style={{ gap: vertical ? 50 : 44 }}>
        <Pill text="À toi de jouer" size={vertical ? 34 : 36} at={6} />
        <Title lines={SITE_NAME} size={vertical ? 150 : 200} at={12} align="center" />
        <div style={{ display: 'flex', flexDirection: vertical ? 'column' : 'row', alignItems: 'center', gap: 26, marginTop: 20 }}>
          <Caption lead="▶" text="Piste libre" size={vertical ? 50 : 52} at={40} />
          <Caption lead="★" text="Tutos" size={vertical ? 50 : 52} at={46} />
        </div>
      </Stack>
    </AbsoluteFill>
  )
}
