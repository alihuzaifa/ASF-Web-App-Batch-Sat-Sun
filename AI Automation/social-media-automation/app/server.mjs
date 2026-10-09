// Social Media Automation: a small app that runs on this computer and opens in the browser.
// Start.cmd starts it. Nobody has to type a command.

import http from "node:http"
import { createReadStream, createWriteStream, existsSync } from "node:fs"
import { mkdir, readdir, readFile, rm, stat } from "node:fs/promises"
import { spawn } from "node:child_process"
import { pipeline } from "node:stream/promises"
import path from "node:path"
import { getVideoMetadata } from "@remotion/renderer"
import { BASE, DATA, MUSIC, OUTPUT, PORT, PROJECTS, ROOT, UI } from "./lib/paths.mjs"
import { loadEnv, masked, saveEnv } from "./lib/env.mjs"
import { readJson, slugify, writeJson } from "./lib/store.mjs"
import * as buffer from "./lib/buffer.mjs"
import { ensureProject, findAccount } from "./lib/cloudflare.mjs"
import { readProject } from "./lib/reader.mjs"
import { make, prepareBrowser } from "./lib/render.mjs"
import { listPosts, refresh, schedule } from "./lib/publish.mjs"
import { autopilot } from "./lib/autopilot.mjs"
import { captionsFor } from "./lib/captions.mjs"
import { hasClaude, polish } from "./lib/ai.mjs"

// ---------------------------------------------------------------- jobs
// Long work (reading a site, rendering, uploading) runs one at a time in the
// background. The page asks how it is going every second.

const jobs = new Map()
let chain = Promise.resolve()
const startJob = (label, work) => {
  const id = Math.random().toString(36).slice(2, 10)
  const job = { id, label, status: "waiting", steps: [], progress: null, result: null, error: null }
  jobs.set(id, job)
  const step = (s) => {
    job.steps.push(s)
    console.log(`  ${label}: ${s}`)
  }
  chain = chain.then(async () => {
    job.status = "running"
    try {
      job.result = await work(step, (p) => (job.progress = p))
      job.status = "done"
    } catch (e) {
      job.error = e.message
      job.status = "failed"
      console.log(`  ${label} failed: ${e.message}`)
    }
  })
  return id
}

// ---------------------------------------------------------------- data

const briefFile = (slug) => path.join(PROJECTS, slugify(slug), "brief.json")

const projects = async () => {
  if (!existsSync(PROJECTS)) return []
  const out = []
  for (const d of await readdir(PROJECTS)) {
    const b = await readJson(path.join(PROJECTS, d, "brief.json"), null)
    if (b) out.push(b)
  }
  return out.sort((a, b) => (b.readAt || "").localeCompare(a.readAt || ""))
}

const library = async () => {
  if (!existsSync(OUTPUT)) return []
  const out = []
  for (const slug of await readdir(OUTPUT)) {
    const dir = path.join(OUTPUT, slug)
    if (!(await stat(dir)).isDirectory()) continue
    for (const f of await readdir(dir)) {
      if (!f.endsWith(".json")) continue
      const info = await readJson(path.join(dir, f), null)
      if (info && existsSync(path.join(dir, info.file))) out.push(info)
    }
  }
  return out.sort((a, b) => b.madeAt.localeCompare(a.madeAt))
}

let channelCache = null
const channels = async (force = false) => {
  const env = await loadEnv()
  if (!env.BUFFER_API_KEY) return []
  if (!channelCache || force) channelCache = await buffer.allChannels(env.BUFFER_API_KEY)
  return channelCache
}

// ---------------------------------------------------------------- http helpers

const send = (res, code, body) => {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" })
  res.end(JSON.stringify(body))
}

const body = async (req) => {
  let raw = ""
  for await (const c of req) {
    raw += c
    if (raw.length > 2_000_000) throw new Error("Too much data")
  }
  return raw ? JSON.parse(raw) : {}
}

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".wav": "audio/wav",
  ".json": "application/json",
}

// Files with Range support: browsers and the renderer both seek inside videos
const serveFile = async (req, res, root, rel) => {
  const file = path.resolve(root, decodeURIComponent(rel))
  if (!file.startsWith(path.resolve(root) + path.sep) || !existsSync(file)) return send(res, 404, { error: "not found" })
  const { size } = await stat(file)
  const type = TYPES[path.extname(file).toLowerCase()] || "application/octet-stream"
  const range = req.headers.range?.match(/bytes=(\d*)-(\d*)/)
  if (range) {
    const start = range[1] ? Number(range[1]) : size - Number(range[2])
    const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1
    if (!(start >= 0 && start <= end)) {
      res.writeHead(416, { "Content-Range": `bytes */${size}` })
      return res.end()
    }
    res.writeHead(206, { "Content-Type": type, "Content-Range": `bytes ${start}-${end}/${size}`, "Accept-Ranges": "bytes", "Content-Length": end - start + 1 })
    return createReadStream(file, { start, end }).pipe(res)
  }
  res.writeHead(200, { "Content-Type": type, "Content-Length": size, "Accept-Ranges": "bytes", "Cache-Control": "no-cache" })
  createReadStream(file).pipe(res)
}

// ---------------------------------------------------------------- routes

const api = {
  "GET /api/state": async () => {
    const env = await loadEnv()
    let chans = []
    let channelError = null
    try {
      chans = await channels()
    } catch (e) {
      channelError = e.message
    }
    return {
      connected: masked(env),
      channels: chans,
      channelError,
      projects: await projects(),
      library: await library(),
      posts: await listPosts(),
      claude: hasClaude(),
    }
  },

  // Check every key before saving it, so a typo shows up here and not at posting time
  "POST /api/connect": async (b) => {
    const env = await loadEnv()
    const next = {}
    const out = {}
    if (b.bufferKey?.trim()) {
      const list = await buffer.allChannels(b.bufferKey.trim())
      next.BUFFER_API_KEY = b.bufferKey.trim()
      channelCache = list
      out.channels = list
    }
    const token = b.cfToken?.trim() || env.CLOUDFLARE_API_TOKEN
    if (b.accountId?.trim() || b.cfToken?.trim() || b.pagesProject?.trim()) {
      if (!token) throw new Error("Paste the Cloudflare token.")
      // a new token may belong to a different account, so look it up again
      const accountId = b.accountId?.trim() || (!b.cfToken?.trim() && env.CLOUDFLARE_ACCOUNT_ID) || (await findAccount(token)).id
      const name = slugify(b.pagesProject || env.PAGES_PROJECT || "social-media-files").slice(0, 28)
      const host = await ensureProject({ CLOUDFLARE_ACCOUNT_ID: accountId, CLOUDFLARE_API_TOKEN: token }, name)
      Object.assign(next, { CLOUDFLARE_ACCOUNT_ID: accountId, CLOUDFLARE_API_TOKEN: token, PAGES_PROJECT: name, PAGES_HOST: host })
      out.pagesHost = host
    }
    if (!Object.keys(next).length) throw new Error("Paste at least one key.")
    await saveEnv(next)
    return out
  },

  "POST /api/channels": async () => ({ channels: await channels(true) }),

  "POST /api/read": async (b) => ({ job: startJob("Read project", (step) => readProject({ website: b.website, github: b.github }, step)) }),

  "POST /api/project": async (b) => {
    const brief = b.brief
    const file = briefFile(brief?.slug)
    const old = await readJson(file, null)
    if (!old) throw new Error("That project is not there any more. Read it again.")
    const clean = {
      ...old,
      name: String(brief.name || "").trim().slice(0, 40) || old.name,
      oneLine: String(brief.oneLine || "").trim().slice(0, 140),
      forWho: String(brief.forWho || "").trim().slice(0, 60),
      hook: String(brief.hook || "").trim().slice(0, 60),
      handle: String(brief.handle || "").trim().slice(0, 50),
      website: String(brief.website || old.website).trim(),
      accent: /^#[0-9a-f]{6}$/i.test(brief.accent) ? brief.accent : old.accent,
      features: (brief.features || []).map((f) => String(f).trim().slice(0, 80)).filter(Boolean).slice(0, 5),
      pages: old.pages.map((p, i) => ({ ...p, title: String(brief.pages?.[i]?.title ?? p.title).slice(0, 40), use: brief.pages?.[i]?.use !== false })),
    }
    await writeJson(file, clean)
    return clean
  },

  "POST /api/forget": async (b) => {
    await rm(path.join(PROJECTS, slugify(b.slug)), { recursive: true, force: true })
    return { ok: true }
  },

  "POST /api/polish": async (b) => {
    const brief = await readJson(briefFile(b.slug), null)
    if (!brief) throw new Error("Project not found.")
    return polish({ ...brief, ...b.draft })
  },

  "POST /api/make": async (b) => {
    const brief = await readJson(briefFile(b.slug), null)
    if (!brief) throw new Error("Pick a project first.")
    const what = { picture: "Picture", short: "Short video", long: "Long video" }[b.kind] || "File"
    return { job: startJob(what, (step, progress) => make({ brief, kind: b.kind, shape: b.shape, post: b.post, featureIndex: b.featureIndex, recording: b.kind === "long" ? brief.recording : null }, step, progress)) }
  },

  "POST /api/remove-recording": async (b) => {
    const file = briefFile(b.slug)
    const brief = await readJson(file, null)
    if (brief?.recording) {
      await rm(path.join(PROJECTS, brief.slug, brief.recording.file), { force: true })
      delete brief.recording
      await writeJson(file, brief)
    }
    return { ok: true }
  },

  "POST /api/caption": async (b) => {
    const brief = await readJson(briefFile(b.slug), null)
    return { caption: captionsFor(brief, b) }
  },

  "POST /api/autopilot": async (b) => {
    const brief = await readJson(briefFile(b.slug), null)
    if (!brief) throw new Error("Read a project first (Project tab).")
    return { job: startJob("Do it all", (step, progress) => autopilot({ brief, ...b }, step, progress)) }
  },

  "POST /api/schedule": async (b) => ({ job: startJob("Schedule", (step) => schedule(b, step)) }),

  "POST /api/refresh": async () => ({ posts: await refresh() }),

  "POST /api/delete-file": async (b) => {
    const rel = `${b.slug}/${b.file}`
    const waiting = (await listPosts()).some((p) => p.file === rel && !["sent", "error", "deleted in Buffer"].includes(p.status))
    if (waiting) throw new Error("A scheduled post still uses this file. It can be deleted after it goes out.")
    const dir = path.join(OUTPUT, slugify(b.slug))
    const name = path.basename(b.file)
    await rm(path.join(dir, name), { force: true })
    await rm(path.join(dir, name.replace(/\.\w+$/, ".json")), { force: true })
    return { ok: true }
  },
}

const uploadRecording = async (req, url) => {
  const slug = slugify(url.searchParams.get("slug"))
  const file = briefFile(slug)
  const brief = await readJson(file, null)
  if (!brief) throw new Error("Pick a project first.")
  const ext = (path.extname(url.searchParams.get("name") || "") || ".mp4").toLowerCase()
  if (![".mp4", ".webm", ".mov"].includes(ext)) throw new Error("Use an .mp4, .webm or .mov file.")
  const name = `recording${ext}`
  const target = path.join(PROJECTS, slug, name)
  await mkdir(path.dirname(target), { recursive: true })
  await pipeline(req, createWriteStream(target))
  let seconds
  try {
    seconds = (await getVideoMetadata(target)).durationInSeconds
  } catch {
    await rm(target, { force: true })
    throw new Error("That file could not be read as a video.")
  }
  if (!seconds || seconds > 240) {
    await rm(target, { force: true })
    throw new Error("Keep the recording under 4 minutes, so the whole video fits the 25 MB limit.")
  }
  brief.recording = { file: name, seconds: Math.round(seconds * 10) / 10 }
  await writeJson(file, brief)
  return brief.recording
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, BASE)
  try {
    if (url.pathname === "/" || url.pathname === "/index.html") return serveFile(req, res, UI, "index.html")
    if (/^\/(app\.js|style\.css)$/.test(url.pathname)) return serveFile(req, res, UI, url.pathname.slice(1))
    if (url.pathname === "/docs/how-to-get-keys.mp4") return serveFile(req, res, path.join(ROOT, "docs"), "how-to-get-keys.mp4")
    if (url.pathname.startsWith("/files/projects/")) return serveFile(req, res, PROJECTS, url.pathname.slice(16))
    if (url.pathname.startsWith("/files/music/")) return serveFile(req, res, MUSIC, url.pathname.slice(13))
    if (url.pathname.startsWith("/files/output/")) return serveFile(req, res, OUTPUT, url.pathname.slice(14))
    if (url.pathname.startsWith("/api/job/")) {
      const job = jobs.get(url.pathname.slice(9))
      return job ? send(res, 200, job) : send(res, 404, { error: "That job is gone. Start it again." })
    }
    if (req.method === "POST" && url.pathname === "/api/upload") return send(res, 200, await uploadRecording(req, url))
    const route = api[`${req.method} ${url.pathname}`]
    if (!route) return send(res, 404, { error: "not found" })
    send(res, 200, await route(req.method === "POST" ? await body(req) : {}))
  } catch (e) {
    send(res, 400, { error: e.message })
  }
})

const openBrowser = () => {
  if (process.env.NO_BROWSER) return
  const cmd = process.platform === "win32" ? ["cmd", ["/c", "start", "", BASE]] : process.platform === "darwin" ? ["open", [BASE]] : ["xdg-open", [BASE]]
  spawn(cmd[0], cmd[1], { detached: true, stdio: "ignore" }).unref()
}

server.on("error", (e) => {
  if (e.code === "EADDRINUSE") {
    console.log(`Social Media Automation is already running. Opening ${BASE}`)
    openBrowser()
    process.exit(0)
  }
  throw e
})

await mkdir(DATA, { recursive: true })
server.listen(PORT, "127.0.0.1", () => {
  console.log(`\n  Social Media Automation is running at ${BASE}`)
  console.log("  Keep this window open while you use it. Close it to stop.\n")
  openBrowser()
  // get the render browser ready in the background, so the first video is not slower
  prepareBrowser((s) => console.log(`  ${s}`)).catch((e) => console.log(`  Render browser not ready yet: ${e.message}`))
})
