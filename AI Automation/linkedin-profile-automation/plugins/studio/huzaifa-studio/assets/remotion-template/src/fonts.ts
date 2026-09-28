/**
 * Inter, actually loaded. Naming a font in CSS is not loading it: the render
 * would fall back to whatever the machine has and the output would differ from
 * one computer to the next. @remotion/google-fonts holds the render (delayRender)
 * until the glyphs are applied, so every measurement below reads real Inter
 * metrics and the same brief produces the same pixels anywhere.
 */
import { loadFont } from '@remotion/google-fonts/Inter';

export const { fontFamily: INTER } = loadFont('normal', {
  weights: ['400', '500', '600', '700', '800'],
  subsets: ['latin'],
});
