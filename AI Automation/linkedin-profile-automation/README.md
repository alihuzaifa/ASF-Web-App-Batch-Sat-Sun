# Huzaifa Usman: LinkedIn Studio Marketplace

A Claude Code plugin marketplace that makes LinkedIn posts for **Huzaifa Usman**
(software developer, Karachi, `github.com/huzaifa1012`): an **image still** and a
**short video scored with music**. Dark blue on near-black, a dim mesh background, Inter.

Only LinkedIn: the two canvases are the ones the LinkedIn feed shows at full width,
square 1080×1080 and portrait 1080×1350.

Everything renders locally with Remotion. Nothing is uploaded, nothing is posted,
and no image or music model is called from this repo.

## Install the plugin

```
/plugin marketplace add <path-to-this-folder>
/plugin install huzaifa-studio@huzaifa-marketplace
```

Then set the template up once (or double-click `setup.cmd`):

```bash
cd plugins/studio/huzaifa-studio/assets/remotion-template
npm install
```

Rendering needs **Node 18+** and **ffmpeg on PATH** (ffmpeg checks the video afterwards).

## Use it

```
/image server data and screen state are two different problems
/video why React Query and Redux Toolkit do different jobs
```

Both write into `output/`: a PNG or MP4, plus a LinkedIn caption written in his voice.

## What comes out

| | canvas | scale | file |
|---|---|---|---|
| still | square 1080×1080, portrait 1080×1350 | 4x | PNG |
| video | same two | 2x | MP4, ~15s, with music |

Five kinds of card: `insight` (a thought with a short body), `list` (3-5 checks),
`stat` (one number), `quote` (a point of view), `showcase` (one repository).

## Doing it by hand

```bash
cd plugins/studio/huzaifa-studio/assets/remotion-template

npm run studio                       # open Remotion Studio
node scripts/validate-props.mjs props.json
npm run image                        # still -> out/image.png at 4x
npm run video                        # video -> out/video.mp4 at 2x, with music
node scripts/verify.mjs image out/image.png
node scripts/verify.mjs video out/video.mp4
npm run typecheck
npm run brand:check                  # has the brand drifted from shared/brand?
```

## The brand

`src/brand.profile.json` is the only source of anything a card claims about him. It
was filled in from the GitHub API on 2026-09-28 and carries a `doNotClaim` list: no
seniority title, no length of experience, no employers or clients, no follower
counts. Where a fact is missing the field is `null` on purpose: fill it in there
first, then write it into copy.

`src/brand.tokens.json` is the palette (accent `#2563eb`, light `#60a5fa`, background
`#050b1a`), the type scale and the two canvases. `npm run brand:sync` mirrors both
files to `shared/brand/`; `npm run brand:check` fails if they have drifted.

## The music

`public/audio/studio-bed.mp3` was written on this machine with FluidSynth and the
MuseScore_General SoundFont (MIT). The credit line in `src/audio.config.ts` goes in
the post description. `node scripts/make-music.mjs` writes a new one.

## Layout

```
.claude-plugin/marketplace.json
plugins/studio/huzaifa-studio/
  commands/image.md · commands/video.md
  skills/huzaifa-studio/SKILL.md
  assets/remotion-template/      the Remotion project
shared/brand/                    mirrored copy of the brand files
output/                          what the commands produce
```

MIT licensed.
