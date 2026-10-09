// Scheduling: put the file on Cloudflare Pages, check it is really there, then
// ask Buffer to post it at the chosen time on the chosen channels.

import { copyFile, link, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import path from "node:path"
import { OUTPUT, POSTS, PROJECTS, STAGE } from "./paths.mjs"
import { loadEnv } from "./env.mjs"
import { readJson, writeJson } from "./store.mjs"
import * as buffer from "./buffer.mjs"
import { deploy, waitLive } from "./cloudflare.mjs"
import { fitFor } from "./captions.mjs"

// A file stays uploaded until this long after its post was due, in case Buffer retries
const KEEP_AFTER_DUE_MS = 3 * 24 * 3600 * 1000

export const listPosts = () => readJson(POSTS, [])

const mediaKind = (file) => (/\.mp4$/i.test(file) ? "video" : "image")

/**
 * Every file a scheduled post still needs, plus the new one. Pages deletes
 * anything a deployment leaves out, so this list is the whole site every time.
 */
export const filesToKeep = (posts, extra, now = Date.now()) => {
  const keep = new Set(extra ? [extra] : [])
  for (const p of posts) {
    if (p.status === "error" || p.status === "deleted in Buffer") continue
    if (!p.dueAt || new Date(p.dueAt).getTime() + KEEP_AFTER_DUE_MS > now) keep.add(p.file)
  }
  return [...keep].sort()
}

const stage = async (files) => {
  await rm(STAGE, { recursive: true, force: true })
  for (const rel of files) {
    const from = path.join(OUTPUT, rel)
    if (!existsSync(from)) throw new Error(`${rel} is missing from the output folder, but a scheduled post still needs it.`)
    const to = path.join(STAGE, rel)
    await mkdir(path.dirname(to), { recursive: true })
    await link(from, to).catch(() => copyFile(from, to))
  }
  // a plain list at the root, so the site address shows something instead of a 404
  const rows = files.map((f) => `<li><a href="${f}">${f}</a></li>`).join("\n")
  await writeFile(
    path.join(STAGE, "index.html"),
    `<!doctype html><meta charset="utf-8"><title>Media</title><style>body{font:15px/1.7 system-ui;max-width:44rem;margin:3rem auto;padding:0 1rem}</style><h1>Media</h1><p>${files.length} files waiting to be posted. This is file storage, not a website.</p><ul>${rows}</ul>`,
    "utf8",
  )
}

export const schedule = async ({ slug, file, channelIds, when, dueAt, caption }, onStep = () => {}) => {
  const env = await loadEnv()
  if (!env.BUFFER_API_KEY) throw new Error("Connect Buffer first (Connect tab).")
  if (!env.CLOUDFLARE_API_TOKEN || !env.PAGES_PROJECT || !env.PAGES_HOST) throw new Error("Connect Cloudflare first (Connect tab).")
  if (!channelIds?.length) throw new Error("Pick at least one place to post.")
  if (when === "time") {
    if (!dueAt || Number.isNaN(Date.parse(dueAt))) throw new Error("Pick a date and time.")
    if (Date.parse(dueAt) < Date.now() + 2 * 60 * 1000) throw new Error("Pick a time at least a few minutes from now.")
  }

  const rel = `${slug}/${file}`
  const info = JSON.parse(await readFile(path.join(OUTPUT, slug, file.replace(/\.\w+$/, ".json")), "utf8"))
  const brief = await readJson(path.join(PROJECTS, slug, "brief.json"), null)
  const isVideo = mediaKind(file) === "video"
  const vertical = info.shape === "story"

  onStep("Checking your Buffer channels")
  const all = await buffer.allChannels(env.BUFFER_API_KEY)
  const chosen = channelIds.map((id) => all.find((c) => c.id === id)).filter(Boolean)
  if (chosen.length !== channelIds.length) throw new Error("A channel you picked is no longer in Buffer. Open Connect and check again.")
  const problems = chosen
    .map((c) => ({ c, why: buffer.refuse({ service: c.service, isVideo, seconds: info.seconds, vertical }) }))
    .filter((x) => x.why)
  if (problems.length) throw new Error(problems.map((x) => `${x.c.displayName || x.c.name}: ${x.why}`).join("\n"))

  const posts = await listPosts()
  const already = posts.filter((p) => p.file === rel && channelIds.includes(p.channelId) && (when !== "time" || p.dueAt === new Date(dueAt).toISOString()))
  if (already.length && when === "time") throw new Error("This file is already scheduled at that time on those channels.")

  onStep("Uploading to Cloudflare Pages")
  const keep = filesToKeep(posts, rel)
  await stage(keep)
  await deploy(env, STAGE, env.PAGES_PROJECT, (l) => /Uploaded|Success|Deployment complete|✨/.test(l) && onStep(l))

  const url = `https://${env.PAGES_HOST}/${rel.split("/").map(encodeURIComponent).join("/")}`
  onStep("Checking the file is online")
  if (!(await waitLive(url, mediaKind(file)))) throw new Error(`The upload finished but ${url} is not serving the file yet. Try again in a minute.`)

  const asset = isVideo ? { video: { url, metadata: { thumbnailOffset: 1500 } } } : { image: { url } }
  const results = []
  for (const c of chosen) {
    onStep(`Scheduling on ${c.service}: ${c.displayName || c.name}`)
    try {
      const made = await buffer.createPost(env.BUFFER_API_KEY, {
        channelId: c.id,
        text: fitFor(c.service, caption, brief),
        dueAt: when === "time" ? new Date(dueAt).toISOString() : null,
        assets: [asset],
        metadata: buffer.metadataFor({ service: c.service, isVideo, seconds: info.seconds, vertical, title: brief?.name ? `${brief.name}: ${brief.oneLine}` : file }),
      })
      const row = {
        bufferId: made.id,
        channelId: c.id,
        channel: c.displayName || c.name,
        service: c.service,
        file: rel,
        url,
        dueAt: made.dueAt,
        status: made.status || "scheduled",
        createdAt: new Date().toISOString(),
      }
      posts.push(row)
      results.push({ ok: true, ...row })
    } catch (e) {
      results.push({ ok: false, channel: c.displayName || c.name, service: c.service, error: e.message })
    }
  }
  await writeJson(POSTS, posts)
  return { url, results }
}

/** Ask Buffer what happened to each post that has not finished yet. */
export const refresh = async () => {
  const env = await loadEnv()
  const posts = await listPosts()
  for (const p of posts) {
    if (["sent", "error"].includes(p.status) || !p.bufferId) continue
    try {
      const s = await buffer.postStatus(env.BUFFER_API_KEY, p.bufferId)
      p.status = s.status
      p.dueAt = s.dueAt || p.dueAt
      p.error = s.error?.message || null
    } catch (e) {
      if (/not found/i.test(e.message)) p.status = "deleted in Buffer"
    }
  }
  await writeJson(POSTS, posts)
  return posts
}
