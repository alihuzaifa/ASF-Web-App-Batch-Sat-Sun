---
description: Render a short dark blue LinkedIn video with music for Huzaifa Usman on a given topic (square or portrait, 2x) plus a first-person caption and the music credit.
argument-hint: "<topic>"
---

# /video

Make one short video about **$ARGUMENTS**, with music, and write the caption.

The template lives in `${CLAUDE_PLUGIN_ROOT}/assets/remotion-template`. It renders
locally and posts nothing.

## Steps

1. **Read `src/brand.profile.json` first.** Same rule as the still: if a claim is
   not in there, it does not go in the video.

2. **Write the cut.** An opening headline, two to four points, and a closing
   line. Each point is one sentence that can be read in three seconds — the
   video is not a paragraph split across cards. Keep the whole thing under
   twenty seconds; three points at three seconds each is the shape that works.

3. **Save the props** to `video.props.json`, then check them:

   ```bash
   node scripts/validate-props.mjs video.props.json --video
   ```

4. **Render.** The wrapper reads the music setting and says what it is doing
   before it spends the minutes:

   ```bash
   node scripts/render-video.mjs --props=./video.props.json --out=out/video.mp4
   node scripts/verify.mjs video out/video.mp4
   ```

   `verify` fails on a silent audio track, which is the failure that otherwise
   gets noticed after posting.

5. **Deliver.** Copy it to `<project-root>/output/`, write a first-person caption
   as `<name>.caption.md`, and include the music credit from
   `src/audio.config.ts` at the end of the caption. The bed was written on this
   machine with FluidSynth and the MuseScore_General SoundFont, and the credit
   line is part of using it.

Tell him the file path, the length, and that the audio is there. Do not post
anything anywhere.
