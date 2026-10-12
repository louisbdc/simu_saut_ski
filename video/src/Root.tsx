import { Composition } from 'remotion'
import { FPS, SIZES } from './layout'
import { Presentation, TOTAL_FRAMES } from './Presentation'

/** Les deux formats de la vidéo : mêmes scènes, mise en page propre à chacun. */
export function RemotionRoot() {
  return (
    <>
      <Composition id="Paysage" component={Presentation} durationInFrames={TOTAL_FRAMES} fps={FPS} {...SIZES.paysage} />
      <Composition id="Vertical" component={Presentation} durationInFrames={TOTAL_FRAMES} fps={FPS} {...SIZES.vertical} />
    </>
  )
}
