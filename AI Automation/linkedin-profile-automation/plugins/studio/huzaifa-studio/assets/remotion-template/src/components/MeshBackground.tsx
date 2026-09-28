import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
import { COLORS } from '../theme';

/**
 * The background: a dim mesh of dots with two slow blue glows drifting
 * behind it. Quiet on purpose — it has to sit under 90 words of text at full
 * opacity without competing with them, and it has to loop without a seam.
 *
 * `still` freezes it at a chosen frame so the image still and the video read
 * as the same surface.
 */
export const MeshBackground: React.FC<{ still?: boolean }> = ({ still = false }) => {
  const frame = useCurrentFrame();
  const { width, height, durationInFrames } = useVideoConfig();
  const t = still ? 0.22 : frame / Math.max(durationInFrames, 1);

  const cell = Math.round(Math.min(width, height) / 22);
  const dot = Math.max(1.4, Math.min(width, height) / 620);

  /** Two glows, moving on different paths so the pattern never repeats
   *  visibly inside one cut. */
  const gx1 = interpolate(t, [0, 1], [0.22, 0.42]) * width;
  const gy1 = interpolate(t, [0, 1], [0.18, 0.34]) * height;
  const gx2 = interpolate(t, [0, 1], [0.84, 0.62]) * width;
  const gy2 = interpolate(t, [0, 1], [0.78, 0.9]) * height;

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.bg, overflow: 'hidden' }}>
      {/* deep vignette so the corners stay quiet */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(120% 90% at 50% 8%, ${COLORS.surface} 0%, ${COLORS.bg} 52%, ${COLORS.bgDeep} 100%)`,
        }}
      />
      {/* the mesh */}
      <AbsoluteFill
        style={{
          backgroundImage: `radial-gradient(${COLORS.border} ${dot}px, transparent ${dot}px)`,
          backgroundSize: `${cell}px ${cell}px`,
          backgroundPosition: `${(t * cell).toFixed(2)}px ${(t * cell * 0.5).toFixed(2)}px`,
          opacity: 0.55,
        }}
      />
      {/* the glows */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(38% 30% at ${gx1}px ${gy1}px, ${COLORS.accent}26 0%, transparent 70%)`,
        }}
      />
      <AbsoluteFill
        style={{
          background: `radial-gradient(34% 26% at ${gx2}px ${gy2}px, ${COLORS.accent2}1f 0%, transparent 72%)`,
        }}
      />
    </AbsoluteFill>
  );
};
