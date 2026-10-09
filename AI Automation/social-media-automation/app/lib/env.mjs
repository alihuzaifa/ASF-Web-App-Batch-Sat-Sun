// The keys. They live in `.env.local` next to Start.cmd, which git ignores.
// Nothing here ever sends a key anywhere except the service it belongs to.

import { readFile, writeFile } from "node:fs/promises"
import { ENV_FILE } from "./paths.mjs"

const KEYS = ["BUFFER_API_KEY", "CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_TOKEN", "PAGES_PROJECT", "PAGES_HOST"]

export const loadEnv = async () => {
  const out = {}
  try {
    for (const line of (await readFile(ENV_FILE, "utf8")).split(/\r?\n/)) {
      const at = line.indexOf("=")
      if (at > 0 && !line.startsWith("#")) out[line.slice(0, at).trim()] = line.slice(at + 1).trim()
    }
  } catch {
    // no file yet: the Connect tab fills it
  }
  return out
}

export const saveEnv = async (values) => {
  const merged = { ...(await loadEnv()), ...values }
  const lines = [
    "# Social Media Automation keys. Never send this file to anyone and never commit it.",
    ...KEYS.filter((k) => merged[k]).map((k) => `${k}=${merged[k]}`),
    "",
  ]
  await writeFile(ENV_FILE, lines.join("\n"), "utf8")
  return merged
}

// What the browser is allowed to see: whether a key is there, never the key.
export const masked = (env) => ({
  buffer: Boolean(env.BUFFER_API_KEY),
  cloudflare: Boolean(env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_API_TOKEN),
  accountId: env.CLOUDFLARE_ACCOUNT_ID || "",
  pagesProject: env.PAGES_PROJECT || "",
  pagesHost: env.PAGES_HOST || "",
})
