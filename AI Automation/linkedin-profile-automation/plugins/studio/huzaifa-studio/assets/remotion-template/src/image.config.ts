/**
 * The image still — the one place to edit what a card says.
 *
 * Every field here can also be passed at render time without touching the
 * file, which is how the /image command works:
 *   npx remotion still src/index.ts Image out/image.png --scale=4 --props=./props.json
 * Input props are merged over these defaults.
 *
 * kind:
 *   'insight'  headline + subhead + a short paragraph (the default)
 *   'list'     headline + 3-5 numbered points
 *   'stat'     one number, said once, with a label
 *   'quote'    a point of view in his own words
 *   'showcase' one project: what it is, what it does, what it taught him
 *
 * format: square 1080x1080 · portrait 1080x1350 (the two LinkedIn feed shapes)
 *
 * keyPhrase must be a substring of headline; it is the part rendered in the
 * brand gradient. If it is not found, the last word is used instead.
 */
export const IMAGE = {
  kind: 'insight' as 'insight' | 'list' | 'stat' | 'quote' | 'showcase',
  format: 'square' as 'square' | 'portrait',

  eyebrow: 'Build Notes',
  headline: 'Server data and screen state are two different problems',
  keyPhrase: 'two different problems',
  subhead: 'One store for both is where most of the mess comes from.',
  subheadAccent: 'most of the mess',

  body:
    'Data that lives on the server can go stale, fail to load or change under you. A sidebar being open cannot. React Query is built for the first kind: caching, refetching, loading and error states. Redux Toolkit or plain component state is enough for the second. Keeping them apart makes both smaller.',

  points: [
    'Put fetched data in a query cache, not a global store',
    'Keep UI state close to the component that owns it',
    'Handle loading and error states on the same screen',
    'Invalidate the query after a write instead of patching by hand',
  ] as string[],

  stat: { value: '37', label: 'public repositories on GitHub since 2021' },

  quote:
    'A feature is not done when the happy path works. It is done when the slow network and the failed request look deliberate.',

  showcase: {
    project: 'RichMailer',
    what: 'A web app for managing email operations.',
    built: 'React, TypeScript and Vite, with React Query and Redux Toolkit.',
    learned: 'Server data and screen state need different tools.',
  },

  footerTags: [] as string[],
};
