// The parts that decide what gets posted where. No network, no rendering.

import { test } from "node:test"
import assert from "node:assert/strict"
import { metadataFor, refuse } from "../app/lib/buffer.mjs"
import { filesToKeep } from "../app/lib/publish.mjs"
import { videoBitrate } from "../app/lib/render.mjs"
import { captionsFor, fitFor } from "../app/lib/captions.mjs"
import { synth, toWav } from "../app/lib/music.mjs"
import { featuresFromReadme, shorten } from "../app/lib/reader.mjs"
import { dueAtFor, weekPlan } from "../app/lib/autopilot.mjs"

const brief = {
  name: "Shop Ledger",
  oneLine: "Keeps a small shop's money in and money out.",
  forWho: "small shop owners",
  hook: "I built this.",
  features: ["Records every sale", "Shows who owes you", ""],
  website: "https://shop-ledger.example",
}

test("instagram and facebook always get a post type", () => {
  assert.deepEqual(metadataFor({ service: "instagram", isVideo: true }), { instagram: { type: "reel", shouldShareToFeed: true } })
  assert.deepEqual(metadataFor({ service: "instagram", isVideo: false }), { instagram: { type: "post", shouldShareToFeed: true } })
  assert.equal(metadataFor({ service: "facebook", isVideo: true, vertical: true, seconds: 30 }).facebook.type, "reel")
  // facebook reels stop at 90 seconds, and a wide video is not a reel
  assert.equal(metadataFor({ service: "facebook", isVideo: true, vertical: true, seconds: 120 }).facebook.type, "post")
  assert.equal(metadataFor({ service: "facebook", isVideo: true, vertical: false, seconds: 30 }).facebook.type, "post")
  assert.equal(metadataFor({ service: "linkedin", isVideo: true }), undefined)
})

test("youtube gets a title no longer than its limit", () => {
  const m = metadataFor({ service: "youtube", isVideo: true, title: "x".repeat(300) })
  assert.ok(m.youtube.title.length <= 100)
  assert.equal(m.youtube.categoryId, "28")
})

test("files that cannot go to a channel are refused before uploading", () => {
  assert.match(refuse({ service: "youtube", isVideo: false }), /only takes video/)
  assert.match(refuse({ service: "pinterest", isVideo: false }), /not supported/)
  assert.match(refuse({ service: "twitter", isVideo: true, seconds: 200 }), /2 minutes/)
  assert.equal(refuse({ service: "instagram", isVideo: true, seconds: 40 }), null)
})

test("every file a waiting post needs stays on the site", () => {
  const now = Date.parse("2026-10-09T00:00:00Z")
  const posts = [
    { file: "a/old.mp4", dueAt: "2026-09-01T00:00:00Z", status: "sent" },
    { file: "a/soon.mp4", dueAt: "2026-10-10T00:00:00Z", status: "scheduled" },
    { file: "a/yesterday.jpg", dueAt: "2026-10-08T00:00:00Z", status: "sent" },
    { file: "a/failed.jpg", dueAt: "2026-10-12T00:00:00Z", status: "error" },
  ]
  assert.deepEqual(filesToKeep(posts, "a/new.jpg", now), ["a/new.jpg", "a/soon.mp4", "a/yesterday.jpg"])
})

test("the bitrate keeps any video under the 25 MB limit", () => {
  for (const secs of [10, 26, 60, 120, 240]) {
    const kbps = parseInt(videoBitrate(secs), 10)
    const mb = ((kbps + 160) * secs) / 8 / 1024
    assert.ok(mb < 21, `${secs}s comes to ${mb.toFixed(1)} MB`)
  }
  assert.throws(() => videoBitrate(400), /cannot fit/)
})

test("captions only say what the person said", () => {
  const c = captionsFor(brief, { kind: "short" })
  assert.match(c, /Shop Ledger/)
  assert.match(c, /- Records every sale\n- Shows who owes you\n/)
  assert.match(c, /Made for small shop owners/)
  assert.match(c, /https:\/\/shop-ledger\.example/)
  assert.doesNotMatch(c, /- \n/)
  assert.match(captionsFor(brief, { kind: "picture", post: "feature", featureIndex: 1 }), /^Shop Ledger: Shows who owes you/)
})

test("X gets a caption that fits in 280 characters", () => {
  const long = captionsFor({ ...brief, features: Array(6).fill("A long feature line that goes on and on") }, { kind: "long" })
  const x = fitFor("twitter", long, brief)
  assert.ok(x.length <= 280)
  assert.match(x, /shop-ledger\.example$/)
  assert.equal(fitFor("instagram", long, brief), long)
})

test("music comes out as a valid stereo wav peaking near -1 dB", () => {
  const wav = toWav(synth({ seconds: 3, bpm: 100, mood: "upbeat" }))
  assert.equal(wav.toString("ascii", 0, 4), "RIFF")
  assert.equal(wav.readUInt16LE(22), 2)
  assert.equal(wav.readUInt32LE(24), 44100)
  let peak = 0
  for (let o = 44; o < wav.length; o += 2) peak = Math.max(peak, Math.abs(wav.readInt16LE(o)))
  assert.ok(peak > 28000 && peak < 30000, `peak ${peak}`)
})

test("long text is cut at a word, not in the middle of one", () => {
  const s = shorten("Web framework built on Web Standards for Cloudflare Workers, Fastly Compute, Deno, Bun, and others", 70)
  assert.ok(s.length <= 70)
  assert.doesNotMatch(s, /(\band|,)$/)
  assert.equal(shorten("short", 70), "short")
})

test("features are read from the README's features list only", () => {
  const md = "# App\n\nIntro\n\n## Features\n\n- **Fast** search with [filters](http://x)\n- ok\n* Works offline\n\n## Install\n\n- npm install"
  assert.deepEqual(featuresFromReadme(md), ["Fast search with filters", "Works offline"])
})

test("the week plan alternates pictures and videos and uses each feature once", () => {
  const plan = weekPlan(brief)
  assert.deepEqual(
    plan.map((p) => p.kind),
    ["picture", "short", "picture", "long", "picture", "picture"],
  )
  assert.deepEqual(plan.filter((p) => p.post === "feature").map((p) => p.featureIndex), [0, 1])
})

test("10:00 means 10:00 on the student's clock", () => {
  // Karachi is UTC+5, so the browser reports an offset of -300 minutes
  assert.equal(dueAtFor({ startDate: "2026-10-10", time: "10:00", offset: -300 }, 0), "2026-10-10T05:00:00.000Z")
  assert.equal(dueAtFor({ startDate: "2026-10-31", time: "21:30", offset: -300 }, 1), "2026-11-01T16:30:00.000Z")
})
