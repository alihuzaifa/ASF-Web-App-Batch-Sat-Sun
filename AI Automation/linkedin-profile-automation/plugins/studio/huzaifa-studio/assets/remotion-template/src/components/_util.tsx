import React from 'react';
import { spring, interpolate, Easing } from 'remotion';
import { SPRING } from '../theme';

/** One scale unit: 1/1000 of the shorter side of the canvas. Sizes written in
 *  u() mean the same thing on a square and a portrait. */
export const u = (width: number, height: number, n: number) =>
  (Math.min(width, height) / 1000) * n;

/** The brand entrance: firm, no bounce, settled in about half a second. */
export const enter = (frame: number, fps: number, delay = 0) =>
  spring({ frame: frame - delay, fps, config: { ...SPRING } });

/** Fade and rise from a spring value. */
export const riseStyle = (s: number, rise = 22): React.CSSProperties => ({
  opacity: s,
  transform: `translateY(${(1 - s) * rise}px)`,
});

/** Scene entrance — stays low, then eases in. The mirror of outro(), so during
 *  a cross-dissolve both scenes are dim at the midpoint instead of stacked. */
export const intro = (frame: number, fade: number): number =>
  interpolate(frame, [0, fade], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.in(Easing.cubic),
  });

/** Scene exit — drops out fast across the last `fade` frames. */
export const outro = (frame: number, durationInFrames: number, fade: number): number =>
  interpolate(frame, [durationInFrames - fade, durationInFrames], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });

/** Headline size that reacts to how much was written. Long headlines get a
 *  smaller face instead of a clipped one. Returns u() units. */
export const headlineUnits = (text: string, base = 68) => {
  const n = text.length;
  if (n <= 34) return base;
  if (n <= 48) return base * 0.88;
  if (n <= 64) return base * 0.76;
  if (n <= 84) return base * 0.66;
  return base * 0.58;
};

/** Body size, in u() units, chosen from how much was written. The schema caps
 *  the length, so these three steps cover everything a card can hold. */
export const bodyUnits = (text: string) => {
  const n = text.length;
  if (n <= 240) return 29;
  if (n <= 350) return 27;
  return 25;
};

/** Point size for the list card: five points get a smaller face than three. */
export const pointUnits = (count: number) => (count <= 3 ? 30 : count === 4 ? 28 : 26);

/** How many lines a string takes at a given size and column width. Inter sits
 *  near 0.5em average for body text and a little wider for the heavy weights,
 *  which is close enough to plan a layout with — and unlike measuring the DOM,
 *  it gives the same answer on every machine, every time. */
export const linesFor = (text: string, fontPx: number, columnPx: number, em = 0.5) =>
  Math.max(1, Math.ceil((text.length * fontPx * em) / columnPx));

/** Height of a block of text, including its line height. */
export const blockHeight = (text: string, fontPx: number, columnPx: number, lineHeight: number, em = 0.5) =>
  linesFor(text, fontPx, columnPx, em) * fontPx * lineHeight;

/** Splits a line so one phrase can be painted in the brand gradient. Falls back
 *  to the last word when the phrase is not in the line. */
export const splitPhrase = (line: string, phrase: string) => {
  const at = phrase ? line.toLowerCase().indexOf(phrase.toLowerCase()) : -1;
  if (at === -1) {
    const cut = line.lastIndexOf(' ');
    if (cut === -1) return { before: '', hit: line, after: '' };
    return { before: line.slice(0, cut + 1), hit: line.slice(cut + 1), after: '' };
  }
  return {
    before: line.slice(0, at),
    hit: line.slice(at, at + phrase.length),
    after: line.slice(at + phrase.length),
  };
};
