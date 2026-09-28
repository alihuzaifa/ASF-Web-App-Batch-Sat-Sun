import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { COLORS, FONTS, GRADIENT, LAYOUT } from '../theme';
import { PROFILE } from '../brand';
import { Identity } from './Identity';
import { u, enter, riseStyle, intro, outro, headlineUnits, splitPhrase } from './_util';

/** Shared scene frame: the same margins as the still, plus the fades that let a
 *  scene clear the frame before the next one arrives. */
const Scene: React.FC<{
  children: React.ReactNode;
  fadeIn: number;
  fadeOut: number;
}> = ({ children, fadeIn, fadeOut }) => {
  const frame = useCurrentFrame();
  const { width, height, durationInFrames } = useVideoConfig();
  const opacity = intro(frame, fadeIn) * outro(frame, durationInFrames, fadeOut);

  return (
    <AbsoluteFill
      style={{
        fontFamily: FONTS.family,
        padding: `${u(width, height, LAYOUT.padY)}px ${u(width, height, LAYOUT.padX)}px`,
        display: 'flex',
        flexDirection: 'column',
        opacity,
      }}
    >
      {children}
    </AbsoluteFill>
  );
};

/** Opening card: the name row, the kicker, the headline. */
export const IntroScene: React.FC<{
  eyebrow: string;
  headline: string;
  keyPhrase: string;
  fadeIn: number;
  fadeOut: number;
}> = ({ eyebrow, headline, keyPhrase, fadeIn, fadeOut }) => {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const U = (n: number) => u(width, height, n);
  const { before, hit, after } = splitPhrase(headline, keyPhrase);

  return (
    <Scene fadeIn={fadeIn} fadeOut={fadeOut}>
      <div style={riseStyle(enter(frame, fps, 0), 16)}>
        <Identity width={width} height={height} />
      </div>
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: U(LAYOUT.gap),
        }}
      >
        {eyebrow ? (
          <div
            style={{
              ...riseStyle(enter(frame, fps, 6)),
              fontSize: U(28),
              fontWeight: FONTS.heading,
              letterSpacing: '0.24em',
              textTransform: 'uppercase',
              color: COLORS.accent,
            }}
          >
            {eyebrow}
          </div>
        ) : null}
        <div
          style={{
            ...riseStyle(enter(frame, fps, 12), 28),
            fontSize: U(headlineUnits(headline)),
            lineHeight: 1.07,
            fontWeight: FONTS.heading,
            letterSpacing: FONTS.letterSpacingHeading,
            color: COLORS.text,
          }}
        >
          {before}
          <span
            style={{
              backgroundImage: GRADIENT.brand,
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              color: 'transparent',
            }}
          >
            {hit}
          </span>
          {after}
        </div>
      </div>
    </Scene>
  );
};

/** One point, held long enough to read. */
export const PointScene: React.FC<{
  index: number;
  total: number;
  text: string;
  fadeIn: number;
  fadeOut: number;
}> = ({ index, total, text, fadeIn, fadeOut }) => {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const U = (n: number) => u(width, height, n);

  return (
    <Scene fadeIn={fadeIn} fadeOut={fadeOut}>
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: U(LAYOUT.gap),
        }}
      >
        <div
          style={{
            ...riseStyle(enter(frame, fps, 0)),
            display: 'flex',
            alignItems: 'center',
            gap: U(20),
          }}
        >
          <div
            style={{
              fontSize: U(30),
              fontWeight: FONTS.heading,
              color: COLORS.accent,
              letterSpacing: '0.1em',
            }}
          >
            {String(index + 1).padStart(2, '0')}
          </div>
          <div
            style={{
              height: Math.max(2, U(3)),
              flex: 1,
              borderRadius: 999,
              background: `linear-gradient(to right, ${COLORS.accent} ${((index + 1) / total) * 100}%, ${COLORS.border} ${((index + 1) / total) * 100}%)`,
            }}
          />
        </div>
        <div
          style={{
            ...riseStyle(enter(frame, fps, 8), 26),
            fontSize: U(headlineUnits(text, 70)),
            lineHeight: 1.16,
            fontWeight: FONTS.heading,
            letterSpacing: FONTS.letterSpacingHeading,
            color: COLORS.text,
          }}
        >
          {text}
        </div>
      </div>
    </Scene>
  );
};

/** Closing card: the name row, one line, and where to find him. The name is
 *  already in the row, so it is not said twice. */
export const OutroScene: React.FC<{
  closingLine: string;
  fadeIn: number;
  fadeOut: number;
}> = ({ closingLine, fadeIn, fadeOut }) => {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const U = (n: number) => u(width, height, n);

  return (
    <Scene fadeIn={fadeIn} fadeOut={fadeOut}>
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'flex-start',
          gap: U(26),
        }}
      >
        <div style={riseStyle(enter(frame, fps, 0), 18)}>
          <Identity width={width} height={height} />
        </div>
        <div
          style={{
            ...riseStyle(enter(frame, fps, 8), 22),
            fontSize: U(52),
            lineHeight: 1.18,
            fontWeight: FONTS.heading,
            letterSpacing: FONTS.letterSpacingHeading,
            backgroundImage: GRADIENT.brand,
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            color: 'transparent',
          }}
        >
          {closingLine}
        </div>
        <div
          style={{
            ...riseStyle(enter(frame, fps, 20), 14),
            fontSize: U(28),
            color: COLORS.dim,
            fontWeight: FONTS.medium,
          }}
        >
          {PROFILE.github}
        </div>
      </div>
    </Scene>
  );
};
