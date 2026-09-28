/**
 * The video — a short, quiet cut: an opening card, two or three points, and a
 * closing card. It is the same brand as the still, moving.
 *
 * Rendered by scripts/render-video.mjs, which reads the music setting first and
 * tells you what it is about to do:
 *   npm run video -- --props=./video.props.json --out=out/video.mp4
 */
import { FPS } from './theme';

export const VIDEO = {
  format: 'square' as 'square' | 'portrait',

  eyebrow: 'Build Notes',
  headline: 'Server data and screen state are two different problems',
  keyPhrase: 'two different problems',

  points: [
    'Fetched data goes stale, fails and changes under you',
    'A query cache handles that: loading, errors, refetching',
    'UI state stays small and close to its component',
  ] as string[],

  /** The closing line. His name is already on the card, so this is the thought
   *  to leave people with, not a signature. */
  closingLine: 'Two problems, two tools.',

  /** Seconds each scene holds before the cross-dissolve. */
  hold: { intro: 3.0, point: 3.0, outro: 3.2 },
};

/** Total frames: simply every scene, because they run one after another. */
export const totalDuration = (v = VIDEO) => {
  const scenes = [v.hold.intro, ...v.points.map(() => v.hold.point), v.hold.outro];
  return scenes.reduce((n, sec) => n + Math.round(sec * FPS), 0);
};
