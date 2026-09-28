import React from 'react';
import { AbsoluteFill, Audio, Sequence, staticFile, useVideoConfig, interpolate } from 'remotion';
import { COLORS, FPS, TIMING } from './theme';
import { VIDEO } from './video.config';
import { AUDIO } from './audio.config';
import { MeshBackground } from './components/MeshBackground';
import { IntroScene, PointScene, OutroScene } from './components/VideoScenes';

type Props = typeof VIDEO;

/**
 * The cut. One background runs underneath for the whole video, and the scenes
 * cross-dissolve on top of it — so the surface never flashes between scenes.
 *
 * The music is placed once, over the whole duration, with a fade at each end.
 * Volume is a function of the frame rather than a property of the file, so
 * swapping the track never means re-editing the fades.
 */
export const StudioVideo: React.FC<Props> = (props) => {
  const v = { ...VIDEO, ...props };
  const { durationInFrames } = useVideoConfig();

  const holds = [
    Math.round(v.hold.intro * FPS),
    ...v.points.map(() => Math.round(v.hold.point * FPS)),
    Math.round(v.hold.outro * FPS),
  ];

  /** One after another — no overlap, so two scenes are never on screen at once. */
  const starts: number[] = [];
  holds.reduce((at, hold, i) => {
    starts[i] = at;
    return at + hold;
  }, 0);

  const fadeInSec = AUDIO.fadeInSec;
  const fadeOutSec = AUDIO.fadeOutSec;

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.bg }}>
      <MeshBackground />

      {holds.map((hold, i) => {
        const fadeIn = i === 0 ? TIMING.firstFadeIn : TIMING.fade;
        const fadeOut = i === holds.length - 1 ? TIMING.lastFadeOut : TIMING.fade;
        const isIntro = i === 0;
        const isOutro = i === holds.length - 1;

        return (
          <Sequence key={i} from={starts[i]} durationInFrames={hold}>
            {isIntro ? (
              <IntroScene
                eyebrow={v.eyebrow}
                headline={v.headline}
                keyPhrase={v.keyPhrase}
                fadeIn={fadeIn}
                fadeOut={fadeOut}
              />
            ) : isOutro ? (
              <OutroScene
                closingLine={v.closingLine}
                fadeIn={fadeIn}
                fadeOut={fadeOut}
              />
            ) : (
              <PointScene
                index={i - 1}
                total={v.points.length}
                text={v.points[i - 1]}
                fadeIn={fadeIn}
                fadeOut={fadeOut}
              />
            )}
          </Sequence>
        );
      })}

      {AUDIO.file ? (
        <Audio
          src={staticFile(AUDIO.file)}
          loop={AUDIO.loop}
          volume={(f) =>
            interpolate(
              f,
              [
                0,
                fadeInSec * FPS,
                durationInFrames - fadeOutSec * FPS,
                durationInFrames,
              ],
              [0, AUDIO.volume, AUDIO.volume, 0],
              { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
            )
          }
        />
      ) : null}
    </AbsoluteFill>
  );
};
