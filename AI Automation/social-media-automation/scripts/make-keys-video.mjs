// Renders docs/how-to-get-keys.mp4 from the screenshots in docs/walkthrough/.
//
//   node scripts/make-keys-video.mjs
//
// scenes.json is the order and the words. manifest.json says, for every
// screenshot, where the thing to click is. Screenshots are taken with keys and
// personal details already blurred; check every PNG before committing a new one.

import { copyFile, mkdtemp, readFile, writeFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { bundle } from "@remotion/bundler"
import { renderMedia, selectComposition } from "@remotion/renderer"
import { ROOT, VIDEO_ENTRY } from "../app/lib/paths.mjs"
import { synth, toWav } from "../app/lib/music.mjs"

const dir = path.join(ROOT, "docs", "walkthrough")
const order = JSON.parse(await readFile(path.join(dir, "scenes.json"), "utf8"))
const shots = JSON.parse(await readFile(path.join(dir, "manifest.json"), "utf8"))

const scenes = []
for (const s of order) {
  if (s.kind !== "shot") {
    scenes.push(s)
    continue
  }
  const m = shots[s.shot]
  if (!m || !existsSync(path.join(dir, m.file))) {
    console.log(`skipping ${s.shot}: no screenshot yet`)
    continue
  }
  const { shot, ...rest } = s
  scenes.push({ ...rest, file: m.file, width: m.width, height: m.height, boxes: m.boxes })
}

const pub = await mkdtemp(path.join(os.tmpdir(), "keys-"))
for (const s of scenes) if (s.file) await copyFile(path.join(dir, s.file), path.join(pub, s.file))
const serveUrl = await bundle({ entryPoint: VIDEO_ENTRY, publicDir: pub })

const probe = await selectComposition({ serveUrl, id: "Walkthrough", inputProps: { scenes } })
const seconds = probe.durationInFrames / probe.fps
await writeFile(path.join(serveUrl, "public", "music.wav"), toWav(synth({ seconds: seconds + 1, bpm: 84, mood: "calm" })))
const inputProps = { scenes, music: "music.wav" }
const composition = await selectComposition({ serveUrl, id: "Walkthrough", inputProps })

// pass another path to try a version without touching the one in docs/
const out = path.resolve(process.argv[2] || path.join(ROOT, "docs", "how-to-get-keys.mp4"))
await renderMedia({
  serveUrl,
  composition,
  inputProps,
  codec: "h264",
  outputLocation: out,
  crf: 24,
  audioBitrate: "96k",
  onProgress: ({ progress }) => process.stdout.write(`\r${Math.round(progress * 100)}%`),
})
console.log(`\n${out} (${Math.round(seconds)} seconds, ${scenes.filter((s) => s.kind === "shot").length} screenshots)`)
