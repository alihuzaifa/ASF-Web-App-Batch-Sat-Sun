/**
 * Huzaifa Usman: Studio theme.
 *
 * Every colour, weight and canvas size comes from src/brand.tokens.json, so
 * there is exactly one place to change the look. Nothing here is hard-coded
 * twice; components import from this file, never from the JSON.
 */
import tokens from './brand.tokens.json';
import { INTER } from './fonts';

export const FPS = tokens.fps;

/** The two LinkedIn feed canvases, both 1080 wide. */
export const FORMAT = tokens.canvas;
export type FormatName = keyof typeof tokens.canvas;

export const COLORS = tokens.colors;
export const GRADIENT = tokens.gradient;

export const FONTS = {
  family: `${INTER}, -apple-system, "Segoe UI", Roboto, sans-serif`,
  heading: tokens.type.heading,
  semibold: tokens.type.semibold,
  medium: tokens.type.medium,
  body: tokens.type.body,
  letterSpacingHeading: tokens.type.letterSpacingHeading,
} as const;

export const RADIUS = { sm: 10, md: 14, lg: 20, xl: 28, pill: 999 } as const;

/** One margin, one gap. Scenes and stills read these instead of inventing
 *  their own spacing, which is what keeps a square and a portrait looking like
 *  the same brand rather than two designs. Units are u() — roughly 1/1000 of
 *  the shorter side of the canvas. */
export const LAYOUT = { padX: 92, padY: 92, gap: 40 } as const;

/** Frames at 30fps.
 *
 *  Scenes do not overlap. A cross-dissolve puts two headlines on screen at the
 *  same time, and at these type sizes that reads as a mistake rather than as a
 *  transition — so each scene fades out to the background before the next one
 *  fades in. The gap is a beat, not a gap. */
export const TIMING = {
  fade: 9,
  firstFadeIn: 18,
  lastFadeOut: 30,
} as const;

/** Crisp entrance, no bounce: settles in about half a second so a scene is
 *  static by the time a cross-dissolve reaches its midpoint. */
export const SPRING = { damping: 24, mass: 1, stiffness: 132 } as const;
