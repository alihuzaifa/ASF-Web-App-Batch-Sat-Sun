import React from 'react';
import { Composition } from 'remotion';
import { StudioImage } from './components/StudioImage';
import { StudioVideo } from './StudioVideo';
import { FPS, FORMAT } from './theme';
import { IMAGE } from './image.config';
import { VIDEO, totalDuration } from './video.config';

/**
 * Two compositions, two LinkedIn canvases each.
 *
 * The canvas is chosen by the `format` field in the props rather than by
 * registering four compositions, so one brief renders square or portrait
 * without a second code path.
 */
export const RemotionRoot: React.FC = () => {
  const image = FORMAT[IMAGE.format];
  const video = FORMAT[VIDEO.format];

  return (
    <>
      <Composition
        id="Image"
        component={StudioImage}
        durationInFrames={1}
        fps={FPS}
        width={image.width}
        height={image.height}
        defaultProps={IMAGE}
        calculateMetadata={({ props }) => {
          const canvas = FORMAT[props.format] ?? image;
          return { width: canvas.width, height: canvas.height, durationInFrames: 1, fps: FPS };
        }}
      />
      <Composition
        id="Video"
        component={StudioVideo}
        durationInFrames={totalDuration()}
        fps={FPS}
        width={video.width}
        height={video.height}
        defaultProps={VIDEO}
        calculateMetadata={({ props }) => {
          const canvas = FORMAT[props.format] ?? video;
          return {
            width: canvas.width,
            height: canvas.height,
            durationInFrames: totalDuration(props),
            fps: FPS,
          };
        }}
      />
    </>
  );
};
