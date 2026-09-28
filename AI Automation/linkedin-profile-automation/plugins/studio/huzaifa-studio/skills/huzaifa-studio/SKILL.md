---
name: huzaifa-studio
description: Render Huzaifa Usman's LinkedIn visuals, a dark blue image still (insight / list / stat / quote / showcase) or a short video scored with music, via the local Remotion template. One brief, two LinkedIn canvases (square / portrait). Ultra-HD stills. Auto-triggers on "make an image", "render a still", "make a video", "video with music", "LinkedIn post graphic", "showcase this".
invoke: huzaifa-studio
---

# Huzaifa Usman: LinkedIn Studio

Two things come out of this plugin: an **image still** and a **short video with
music**. Both are rendered locally with Remotion, in his colours, from facts that
are written down rather than guessed.

## Where everything is

```
assets/remotion-template/
  src/brand.profile.json   the facts — the only thing copy may claim
  src/brand.tokens.json    the palette, type scale and canvases
  src/image.config.ts      what the still says, by default
  src/video.config.ts      what the video says, by default
  src/audio.config.ts      the music bed and its credit
  scripts/validate-props.mjs   check a brief before rendering it
  scripts/verify.mjs           check the file after rendering it
  scripts/render-video.mjs     render the cut, loudly, with the music named
  scripts/make-music.mjs       rewrite the music bed from scratch
```

## The rules that matter

**Facts come from the profile.** `brand.profile.json` holds his name, handle,
stack and repositories, and a `doNotClaim` list. His published title is
"Software Developer"; he has not published a length of experience, employers or
any audience numbers, so nothing may imply them. When a
brief needs a fact that is not in the file, ask him and put it in the file first.

**One brief, one canvas.** `format` picks square (1080×1080), portrait
(1080×1350), the two shapes the LinkedIn feed shows at full width. The type
sizes adjust to the copy on both, so the same words work on any of them.

**Type is sized from the copy, not measured in the browser.** A long brief comes
out smaller, never clipped. That is why the character limits in
`props.schema.json` are real limits and not suggestions.

**Nothing ships unverified.** `verify.mjs` looks at the file that was actually
written: the canvas size, whether a still is suspiciously small, and whether a
video has audio that is not silence. A render that was not verified is not done.

## The voice

First person. Plain words. Short sentences. He builds MERN apps, React and
TypeScript front-ends and React Native apps, and the posts that work on LinkedIn
are the ones that explain one real problem and how it was solved. No hype, no thread-bro rhythm, no engagement bait, no emoji.

Good: *"Server data and screen state are two different problems. One store for
both is where most of the mess comes from."*

Not this: *"🚀 5 GAME-CHANGING JavaScript tips that will TRANSFORM your career!"*

## The two commands

- `/image <topic>` — one still, plus a caption.
- `/video <topic>` — one short video with music, plus a caption and the music
  credit.

Both write into `<project-root>/output/`. Neither posts anything: the studio
writes a PNG, an MP4 and a caption to disk, and stops there.

## The music

`public/audio/studio-bed.mp3` was written and rendered on this machine with
FluidSynth against the MuseScore_General SoundFont (MIT), so there is nothing to
clear before posting — but the credit in `src/audio.config.ts` belongs in the
post. `npm run` has no shortcut for it on purpose; to make a new bed, run
`node scripts/make-music.mjs`.

## When something is wrong

- **The card looks empty** — the copy is probably longer than the schema allows;
  run the validator before blaming the render.
- **The video is silent** — `verify.mjs video` will say so. Check that
  `src/audio.config.ts` points at a file that exists in `public/audio/`.
- **The colours drifted** — `npm run brand:check` compares the template's brand
  files with the copies in `shared/brand/`. `npm run brand:sync` fixes it.
