// Renders docs/how-to-get-keys.mp4, the video that shows students where the
// Buffer key and the Cloudflare token come from. Run it again after changing
// the steps in video/Guide.tsx:
//
//   node scripts/make-guide-video.mjs

import { mkdtemp, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { bundle } from "@remotion/bundler"
import { renderMedia, selectComposition } from "@remotion/renderer"
import { ROOT, VIDEO_ENTRY } from "../app/lib/paths.mjs"
import { synth, toWav } from "../app/lib/music.mjs"

const pub = await mkdtemp(path.join(os.tmpdir(), "guide-"))
const serveUrl = await bundle({ entryPoint: VIDEO_ENTRY, publicDir: pub })
const probe = await selectComposition({ serveUrl, id: "Guide", inputProps: {} })
const seconds = probe.durationInFrames / probe.fps

// the music has to be inside the bundle, so it is written next to it
await writeFile(path.join(serveUrl, "public", "music.wav"), toWav(synth({ seconds: seconds + 1, bpm: 84, mood: "calm" })))
const inputProps = { music: "music.wav" }
const composition = await selectComposition({ serveUrl, id: "Guide", inputProps })

const out = path.join(ROOT, "docs", "how-to-get-keys.mp4")
await renderMedia({
  serveUrl,
  composition,
  inputProps,
  codec: "h264",
  outputLocation: out,
  crf: 26,
  audioBitrate: "96k",
  onProgress: ({ progress }) => process.stdout.write(`\r${Math.round(progress * 100)}%`),
})
console.log(`\n${out} (${Math.round(seconds)} seconds)`)
