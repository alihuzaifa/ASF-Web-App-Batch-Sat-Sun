// Turns a brief into a picture or a video with Remotion, on this computer.
//
// The video templates are bundled once per run of the app. Pictures, music and
// screen recordings reach the renderer over http from our own server, so a new
// project never needs a new bundle.

import { mkdir, stat, writeFile } from "node:fs/promises"
import path from "node:path"
import { bundle } from "@remotion/bundler"
import { ensureBrowser, renderMedia, renderStill, selectComposition } from "@remotion/renderer"
import { BASE, OUTPUT, VIDEO_ENTRY } from "./paths.mjs"
import { track } from "./music.mjs"
import { captionsFor } from "./captions.mjs"
import { MAX_FILE } from "./cloudflare.mjs"

let served = null
const bundled = async (onStep) => {
  if (!served) {
    onStep("Preparing the video templates (only slow the first time)")
    served = bundle({ entryPoint: VIDEO_ENTRY, webpackOverride: (c) => c }).catch((e) => {
      served = null
      throw e
    })
  }
  return served
}

let browserReady = null
export const prepareBrowser = (onStep = () => {}) => {
  if (!browserReady) {
    browserReady = ensureBrowser({
      onBrowserDownload: () => {
        onStep("Downloading the render browser once (about 100 MB)")
        return { version: null, onProgress: () => {} }
      },
    }).catch((e) => {
      browserReady = null
      throw e
    })
  }
  return browserReady
}

/**
 * Bitrate that keeps the file under Cloudflare's 25 MB limit with room to spare.
 * Short videos stay sharp; long ones trade a little sharpness for fitting.
 */
export const videoBitrate = (seconds) => {
  // 20 MB, not 25: the container and audio add a little, and Pages refuses anything over 25
  const budgetKbps = (20 * 8 * 1024) / Math.max(1, seconds)
  const kbps = Math.floor(Math.min(7000, budgetKbps - 160))
  if (kbps < 500) throw new Error(`A ${Math.round(seconds)} second video cannot fit in 25 MB. Use fewer pages or a shorter recording.`)
  return `${kbps}k`
}

const stamp = () => new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-")

/**
 * kind: "picture" | "short" | "long"
 * For a picture, `post` is launch | feature | list and `featureIndex` picks the feature.
 */
export const make = async ({ brief, kind, shape, post = "launch", featureIndex = 0, recording = null }, onStep = () => {}, onProgress = () => {}) => {
  const serveUrl = await bundled(onStep)
  await prepareBrowser(onStep)

  const assetBase = `${BASE}/files/projects/${brief.slug}/`
  // `section` pictures are extra views of the home page; the long video already scrolls it
  const pages = brief.pages.filter((p) => p.use !== false && !(kind === "long" && p.section))
  if (!pages.length) throw new Error("Pick at least one page on the Project tab.")
  const props = {
    brief: { ...brief, pages, features: brief.features.filter((f) => f && f.trim()) },
    assetBase,
    shape,
    kind: post,
    featureIndex,
    bpm: kind === "long" ? 84 : 100,
    recording: kind === "long" && recording ? { url: `${assetBase}${recording.file}`, seconds: recording.seconds } : null,
  }

  const dir = path.join(OUTPUT, brief.slug)
  await mkdir(dir, { recursive: true })
  const base = `${kind === "picture" ? post : kind}-${shape}-${stamp()}`
  const chromiumOptions = { gl: "angle" }

  if (kind === "picture") {
    onStep("Drawing the picture")
    const composition = await selectComposition({ serveUrl, id: "Post", inputProps: props, chromiumOptions })
    // JPEG, because Instagram's API refuses PNG. 1080 wide is what the feed shows.
    const file = path.join(dir, `${base}.jpg`)
    await renderStill({ serveUrl, composition, inputProps: props, output: file, imageFormat: "jpeg", jpegQuality: 92, scale: 1, chromiumOptions })
    return finish({ brief, file, kind, post, featureIndex, shape, seconds: 0 })
  }

  const id = kind === "long" ? "Tour" : "Short"
  const first = await selectComposition({ serveUrl, id, inputProps: props, chromiumOptions })
  const seconds = first.durationInFrames / first.fps
  onStep(`Writing ${Math.round(seconds)} seconds of music`)
  const music = await track({ seconds: seconds + 1, bpm: props.bpm, mood: kind === "long" ? "calm" : "upbeat" })
  props.music = `${BASE}/files/music/${music}`
  const composition = await selectComposition({ serveUrl, id, inputProps: props, chromiumOptions })

  // A long video over ~100 seconds renders at 720p so it stays sharp inside 25 MB
  const scale = kind === "long" && seconds > 100 ? 2 / 3 : 1
  const file = path.join(dir, `${base}.mp4`)
  onStep(`Recording the video (${Math.round(seconds)} seconds long). This takes a few minutes.`)
  await renderMedia({
    serveUrl,
    composition,
    inputProps: props,
    codec: "h264",
    outputLocation: file,
    videoBitrate: videoBitrate(seconds),
    audioBitrate: "128k",
    scale,
    concurrency: null,
    chromiumOptions,
    onProgress: ({ progress }) => onProgress(progress),
  })
  return finish({ brief, file, kind, post, featureIndex, shape, seconds })
}

const finish = async ({ brief, file, kind, post, featureIndex, shape, seconds }) => {
  const { size } = await stat(file)
  if (size < 10000) throw new Error("The file came out empty. Try again.")
  if (size > MAX_FILE) throw new Error(`The file is ${(size / 1048576).toFixed(1)} MB, over the 25 MB limit.`)
  const caption = captionsFor(brief, { kind, post, featureIndex })
  const info = { file: path.basename(file), slug: brief.slug, kind, post, shape, seconds: Math.round(seconds), size, caption, madeAt: new Date().toISOString() }
  await writeFile(file.replace(/\.\w+$/, ".json"), JSON.stringify(info, null, 2) + "\n", "utf8")
  return info
}
