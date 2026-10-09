// Cloudflare Pages holds the pictures and videos so Buffer can fetch them.
//
// Why Pages: no card needed (R2 asks for one), no bandwidth cap on static files,
// and business use is allowed. Same choice as ghaznawi-marketing.
//
// Four things that have bitten before, all handled here:
//  1. A missing file does not 404. Pages answers 200 with an HTML page, so the
//     content type is checked, never the status alone.
//  2. The CDN keeps serving a removed file, so every check carries a cache buster.
//  3. Every deployment is a full snapshot. A file left out is deleted, so every
//     file a scheduled post still needs is sent again each time.
//  4. `--branch main` is required. Without it wrangler names the deployment after
//     the checked-out git branch, it lands as a preview, and the live host keeps
//     serving the old files while wrangler says "Deployment complete".
//
// One file may not be larger than 25 MB.

import { spawn } from "node:child_process"
import path from "node:path"
import { ROOT } from "./paths.mjs"

export const MAX_FILE = 25 * 1024 * 1024

const api = async (env, method, route, body) => {
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}${route}`, {
    method,
    headers: { Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
  })
  const json = await res.json().catch(() => null)
  return { status: res.status, json }
}

const explain = (r) => {
  const msg = r.json?.errors?.map((e) => e.message).join("; ") || `status ${r.status}`
  if (r.status === 401 || r.status === 403 || /auth|header|token/i.test(msg))
    return `Cloudflare did not accept the token or account ID (${msg}). The token needs "Account · Cloudflare Pages · Edit".`
  return `Cloudflare said: ${msg}`
}

/**
 * The account ID, found from the token alone, so a student only has to paste
 * one thing. If the token can see several accounts the first one is used.
 */
export const findAccount = async (token) => {
  const res = await fetch("https://api.cloudflare.com/client/v4/accounts?per_page=5", {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(30000),
  })
  const json = await res.json().catch(() => null)
  if (res.status === 401 || res.status === 403 || json?.success === false) throw new Error(explain({ status: res.status, json }))
  const first = json?.result?.[0]
  if (!first) throw new Error("The token works but cannot see any account. Make it again with \"Account · Cloudflare Pages · Edit\" on your account.")
  return { id: first.id, name: first.name }
}

/**
 * Make sure the Pages project exists, and return the host it is served on.
 *
 * The `*.pages.dev` name is shared by everyone on Cloudflare, so if the name is
 * taken Cloudflare adds a few letters. The real host comes back as `subdomain`
 * and that is what gets saved, not a guess from the project name.
 */
export const ensureProject = async (env, name) => {
  const found = await api(env, "GET", `/pages/projects/${name}`)
  if (found.status === 200) return found.json.result.subdomain
  if (found.status !== 404) throw new Error(explain(found))

  const made = await api(env, "POST", "/pages/projects", { name, production_branch: "main" })
  if (made.status !== 200) throw new Error(explain(made))
  return made.json.result.subdomain
}

/** Upload a folder as the whole site. Resolves with wrangler's output. */
export const deploy = (env, dir, project, onLine = () => {}) =>
  new Promise((resolve, reject) => {
    const wrangler = path.join(ROOT, "node_modules", "wrangler", "bin", "wrangler.js")
    const child = spawn(
      process.execPath,
      [wrangler, "pages", "deploy", dir, "--project-name", project, "--branch", "main", "--commit-dirty=true"],
      {
        cwd: dir,
        env: {
          ...process.env,
          CLOUDFLARE_ACCOUNT_ID: env.CLOUDFLARE_ACCOUNT_ID,
          CLOUDFLARE_API_TOKEN: env.CLOUDFLARE_API_TOKEN,
          WRANGLER_SEND_METRICS: "false",
          CI: "1",
        },
      },
    )
    let out = ""
    const take = (b) => {
      const s = b.toString()
      out += s
      for (const l of s.split(/\r?\n/)) if (l.trim()) onLine(l.trim())
    }
    child.stdout.on("data", take)
    child.stderr.on("data", take)
    child.on("error", reject)
    child.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(`Upload to Cloudflare failed.\n${out.slice(-1500)}`))))
  })

/** Is a real file of this kind behind the link? */
export const isLive = async (url, wanted) => {
  try {
    const r = await fetch(`${url}?b=${Date.now()}`, { method: "HEAD", signal: AbortSignal.timeout(25000) })
    return r.ok && (r.headers.get("content-type") ?? "").startsWith(wanted)
  } catch {
    return false
  }
}

/** Wait for the CDN to pick a new file up. */
export const waitLive = async (url, wanted, tries = 12) => {
  for (let i = 0; i < tries; i++) {
    if (await isLive(url, wanted)) return true
    await new Promise((r) => setTimeout(r, 5000))
  }
  return false
}
