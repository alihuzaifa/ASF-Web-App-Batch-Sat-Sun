// Optional: if Claude Code is installed on this computer, it can rewrite the
// answers into sharper copy. Without it the app works the same, the person just
// writes the answers themselves.

import { spawn, spawnSync } from "node:child_process"

export const hasClaude = () => spawnSync(process.platform === "win32" ? "where" : "which", ["claude"], { encoding: "utf8" }).status === 0

const PROMPT = (brief) => `You write the words for a short launch video and posts about a software project.
Use ONLY the facts below. Do not invent numbers, users, customers, awards or claims.
Plain, short, confident sentences. No emoji, no hype words like "revolutionary", "game-changing", "seamless".

Facts:
name: ${brief.name}
one line: ${brief.oneLine}
for who: ${brief.forWho}
features: ${brief.features.filter(Boolean).join(" | ")}
pages on the site: ${brief.pages.map((p) => p.title).join(", ")}
website: ${brief.website}

Reply with JSON only, no code fence:
{"hook": "<4 to 6 words that open the video, like 'I built this in a weekend.' only if true; otherwise 'I built this.'>",
 "oneLine": "<what it is, under 90 characters>",
 "forWho": "<who it is for, under 40 characters, or empty>",
 "features": ["<3 to 4 things it does, each under 48 characters, starting with a verb>"]}`

export const polish = (brief) =>
  new Promise((resolve, reject) => {
    const child = spawn("claude", ["-p", "--output-format", "text"], { shell: true })
    let out = ""
    let err = ""
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error("Claude took too long. Try again or write the answers yourself."))
    }, 180000)
    child.stdout.on("data", (b) => (out += b))
    child.stderr.on("data", (b) => (err += b))
    child.on("close", (code) => {
      clearTimeout(timer)
      if (code !== 0) return reject(new Error(`Claude did not answer: ${err.slice(0, 300)}`))
      const m = out.match(/\{[\s\S]*\}/)
      if (!m) return reject(new Error("Claude's answer could not be read. Try again."))
      try {
        const j = JSON.parse(m[0])
        resolve({
          hook: String(j.hook || brief.hook).slice(0, 60),
          oneLine: String(j.oneLine || brief.oneLine).slice(0, 110),
          forWho: String(j.forWho ?? brief.forWho).slice(0, 60),
          features: (Array.isArray(j.features) ? j.features : brief.features).map((f) => String(f).slice(0, 70)).slice(0, 4),
        })
      } catch {
        reject(new Error("Claude's answer could not be read. Try again."))
      }
    })
    child.stdin.end(PROMPT(brief))
  })
