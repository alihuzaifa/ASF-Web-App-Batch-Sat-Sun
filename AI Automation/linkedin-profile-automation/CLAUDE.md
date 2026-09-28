# Huzaifa Usman: LinkedIn Studio, rules for this repo

This repo makes two things for Huzaifa Usman's LinkedIn: an image still and a short
video with music, both rendered on this machine. LinkedIn only, so the canvases are
square 1080x1080 and portrait 1080x1350. Theme is dark blue (`src/brand.tokens.json`).

## Facts

`plugins/studio/huzaifa-studio/assets/remotion-template/src/brand.profile.json` is
the only source for anything a card claims about him. It was filled in from the
GitHub API (github.com/huzaifa1012) on 2026-09-28 and nothing may be added to it
from memory.

- If a brief needs a fact that is not in the file, **ask**, put it in the file,
  then write the copy. Do not fill the gap with something plausible.
- The `doNotClaim` list is not advisory. `scripts/validate-props.mjs` catches the
  obvious phrasings; the rest is on whoever writes the copy.

## Voice

First person, plain, short sentences. Posts explain one real problem from MERN,
React, TypeScript or React Native work and how it was solved. No hype, no
engagement bait, no emoji, nothing that reads as marketing.

## Rendering

- Validate before rendering: `node scripts/validate-props.mjs props.json` (add
  `--video` for the video).
- Verify after rendering: `node scripts/verify.mjs image|video <path>`. **Do not
  report a render as finished without it.**
- If a card looks too small, the copy is too long: shorten it rather than raising
  the limits in `props.schema.json`.
- Stills render at 4x, video at 2x.

## Music

The bed in `public/audio/` was generated here with FluidSynth and the
MuseScore_General SoundFont (MIT). The credit in `src/audio.config.ts` goes in the
post description every time.

## Nothing goes live

The studio writes files to `output/` and stops. It does not post to LinkedIn, it
does not upload anywhere. If Ali wants something sent somewhere, he will say so.

## Git

Branch, one-line commit message, open a PR. Never commit to the default branch,
never merge.
