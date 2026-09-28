# public/audio

The music bed for the video lives here.

`studio-bed.mp3` was written and rendered on this machine with FluidSynth and the
MuseScore_General SoundFont (MIT), so there is nothing to clear before posting.
The credit line is in `src/audio.config.ts` and belongs in the post description.

If you swap the track, use one you are allowed to use commercially, put the
source in `credit` the same day, and check the render with:

```bash
node scripts/verify.mjs video out/video.mp4
```

Everything in this folder except this README is gitignored — audio is a binary
that does not belong in diffs.
