// Reads a project from its website and (optionally) its GitHub repo, and fills in
// a first draft of the answers so the person only has to fix them.
//
// The website is opened in Edge or Chrome, whichever this computer has. Edge is on
// every Windows 11 machine, so nothing has to be downloaded. Each page gets three
// pictures: the top of the page, the whole page (for the long video's scroll), and
// the phone view (for the tall shapes).

import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { chromium } from "playwright-core"
import { PROJECTS } from "./paths.mjs"
import { slugify } from "./store.mjs"

const MAX_PAGES = 6
const MAX_FULL_HEIGHT = 7000

export const launchBrowser = async () => {
  for (const channel of ["msedge", "chrome"]) {
    try {
      return await chromium.launch({ channel, headless: true })
    } catch {
      // try the next one
    }
  }
  throw new Error("Could not open Edge or Chrome. Install Google Chrome and try again.")
}

const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim()

// Cut at a sentence or a word, never in the middle of one
export const shorten = (s, max) => {
  if (s.length <= max) return s
  const cut = s.slice(0, max)
  const stop = cut.lastIndexOf(". ")
  if (stop > max * 0.5) return cut.slice(0, stop + 1)
  return cut
    .slice(0, cut.lastIndexOf(" "))
    .replace(/(\s+(and|or|the|a|an|for|with|to|of|in|on))+$/i, "")
    .replace(/[,;:]$/, "")
}

// ---------------------------------------------------------------- GitHub

const parseGithub = (url) => {
  const m = String(url || "").match(/github\.com\/([^/\s]+)\/([^/\s#?]+)/i)
  return m ? { owner: m[1], repo: m[2].replace(/\.git$/, "") } : null
}

/** Feature lines from the README: bullets under a heading that sounds like features. */
export const featuresFromReadme = (md) => {
  const lines = md.split(/\r?\n/)
  const out = []
  let inside = false
  for (const line of lines) {
    if (/^#{1,4}\s/.test(line)) {
      inside = /feature|what it does|highlights|why|what you get/i.test(line)
      continue
    }
    if (!inside) continue
    const m = line.match(/^\s*[-*+]\s+(.*)/)
    if (m) {
      const text = clean(m[1].replace(/\*\*|__|`|!\[[^\]]*\]\([^)]*\)|\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/^[^\w]+/u, ""))
      if (text.length > 6 && text.length < 120) out.push(text)
    }
    if (out.length >= 5) break
  }
  return out
}

const readGithub = async (url) => {
  const g = parseGithub(url)
  if (!g) return null
  const headers = { "User-Agent": "social-media-automation", Accept: "application/vnd.github+json" }
  const repo = await fetch(`https://api.github.com/repos/${g.owner}/${g.repo}`, { headers }).then((r) => (r.ok ? r.json() : null))
  if (!repo) throw new Error("Could not open that GitHub link. Is the repo public?")
  const readme = await fetch(`https://api.github.com/repos/${g.owner}/${g.repo}/readme`, {
    headers: { ...headers, Accept: "application/vnd.github.raw" },
  }).then((r) => (r.ok ? r.text() : ""))
  return {
    name: repo.name.replace(/[-_]+/g, " "),
    description: clean(repo.description),
    homepage: repo.homepage || "",
    stars: repo.stargazers_count,
    language: repo.language,
    topics: repo.topics || [],
    features: featuresFromReadme(readme),
    owner: g.owner,
  }
}

// ---------------------------------------------------------------- website

const settle = async (page) => {
  await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {})
  // walk down the page so lazy images load, then back to the top
  await page.evaluate(async () => {
    const step = window.innerHeight * 0.8
    for (let y = 0; y < Math.min(document.body.scrollHeight, 7000); y += step) {
      window.scrollTo(0, y)
      await new Promise((r) => setTimeout(r, 120))
    }
    window.scrollTo(0, 0)
  })
  await page.waitForTimeout(600)
}

const facts = (page) =>
  page.evaluate(() => {
    const meta = (n) =>
      document.querySelector(`meta[name="${n}"]`)?.content || document.querySelector(`meta[property="${n}"]`)?.content || ""
    const text = (sel) => [...document.querySelectorAll(sel)].map((e) => e.innerText.replace(/\s+/g, " ").trim()).filter(Boolean)
    const origin = location.origin
    const links = []
    for (const a of document.querySelectorAll("nav a[href], header a[href], a[href]")) {
      try {
        const u = new URL(a.href, location.href)
        if (u.origin !== origin) continue
        u.hash = ""
        const label = a.innerText.replace(/\s+/g, " ").trim()
        if (!label || label.length > 30) continue
        if (/login|sign ?in|sign ?up|register|logout|privacy|terms|cookie/i.test(label + u.pathname)) continue
        links.push({ href: u.href, label })
      } catch {}
    }
    // the accent colour: theme-color if the site sets one, else the first coloured button
    let accent = meta("theme-color")
    if (!accent) {
      for (const el of document.querySelectorAll("button, a[class*=btn], a[class*=button], [class*=primary]")) {
        const bg = getComputedStyle(el).backgroundColor
        const m = bg.match(/rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)/)
        if (!m || (m[4] !== undefined && +m[4] < 0.5)) continue
        const [r, g, b] = [+m[1], +m[2], +m[3]]
        const max = Math.max(r, g, b)
        const min = Math.min(r, g, b)
        if (max - min > 60) {
          accent = "#" + [r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("")
          break
        }
      }
    }
    return {
      title: document.title,
      description: meta("description") || meta("og:description"),
      siteName: meta("og:site_name"),
      h1: text("h1")[0] || "",
      h2: text("h2, h3").slice(0, 12),
      links,
      accent,
      height: document.documentElement.scrollHeight,
    }
  })

const pageTitle = (f, fallback) => clean((f.h1 || f.title || fallback).split(/[|·–—-]/)[0]).slice(0, 40)

/**
 * Open the website and take the pictures.
 * `onStep` gets a short sentence for every thing it does, for the progress box.
 */
export const readProject = async ({ website, github }, onStep = () => {}) => {
  let gh = null
  if (github) {
    onStep("Reading the GitHub repo")
    gh = await readGithub(github)
  }
  let url = clean(website) || gh?.homepage
  if (!url) throw new Error("Add the website link. Without it there is nothing to take pictures of.")
  if (!/^https?:\/\//i.test(url)) url = "https://" + url

  const firstGuess = slugify(gh?.name || new URL(url).hostname.replace(/^www\./, "").split(".")[0])
  const slug = firstGuess
  const dir = path.join(PROJECTS, slug)
  await mkdir(dir, { recursive: true })

  onStep("Opening the website")
  const browser = await launchBrowser()
  const pages = []
  let home
  try {
    const desk = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
    const phone = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    })
    const p = await desk.newPage()
    const m = await phone.newPage()

    const res = await p.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 }).catch((e) => {
      throw new Error(`The website did not open: ${e.message.split("\n")[0]}`)
    })
    if (res && res.status() >= 400) throw new Error(`The website answered ${res.status()}. Check the link.`)
    await settle(p)
    home = await facts(p)

    const seen = new Set([p.url().replace(/\/$/, "")])
    const queue = [{ href: p.url(), label: "Home" }]
    for (const l of home.links) {
      const key = l.href.replace(/\/$/, "")
      if (seen.has(key)) continue
      seen.add(key)
      queue.push(l)
      if (queue.length >= MAX_PAGES) break
    }

    for (let i = 0; i < queue.length; i++) {
      const { href, label } = queue[i]
      onStep(`Taking pictures of page ${i + 1} of ${queue.length}: ${label}`)
      try {
        if (i > 0) {
          await p.goto(href, { waitUntil: "domcontentloaded", timeout: 30000 })
          await settle(p)
        }
        const f = i === 0 ? home : await facts(p)
        const shot = `shot-${i + 1}.png`
        const full = `full-${i + 1}.png`
        const mobile = `phone-${i + 1}.png`
        await p.screenshot({ path: path.join(dir, shot) })
        const fullHeight = Math.min(f.height, MAX_FULL_HEIGHT)
        await p.screenshot({ path: path.join(dir, full), fullPage: true, clip: { x: 0, y: 0, width: 1440, height: fullHeight } })
        await m.goto(href, { waitUntil: "domcontentloaded", timeout: 30000 })
        await settle(m)
        await m.screenshot({ path: path.join(dir, mobile) })
        pages.push({
          title: i === 0 ? "Home" : clean(label) || pageTitle(f, `Page ${i + 1}`),
          url: href,
          shot,
          full,
          mobile,
          fullHeight,
          use: true,
        })
      } catch (e) {
        onStep(`Skipped ${label}: ${e.message.split("\n")[0]}`)
      }
    }

    // A one-page site gives the short video nothing to cut between, so take a
    // few more pictures further down the home page. They are marked `section`
    // and the long video skips them (it already scrolls the whole page).
    const homeHeight = pages[0]?.fullHeight ?? 0
    const extra = Math.min(4 - pages.length, Math.floor(homeHeight / 900) - 1)
    if (extra > 0) {
      onStep("Taking a few more pictures further down the home page")
      await p.goto(pages[0].url, { waitUntil: "domcontentloaded", timeout: 30000 })
      await settle(p)
      await m.goto(pages[0].url, { waitUntil: "domcontentloaded", timeout: 30000 })
      await settle(m)
      for (let k = 1; k <= extra; k++) {
        const y = Math.round((homeHeight - 900) * (k / (extra + 1)) + 450)
        await p.evaluate((top) => window.scrollTo(0, top), y)
        await m.evaluate((top) => window.scrollTo(0, top), Math.round(y * 0.9))
        await p.waitForTimeout(500)
        const shot = `section-${k}.png`
        const mobile = `phone-section-${k}.png`
        await p.screenshot({ path: path.join(dir, shot) })
        await m.screenshot({ path: path.join(dir, mobile) })
        pages.push({ title: "Home", url: pages[0].url, shot, full: pages[0].full, mobile, fullHeight: homeHeight, section: true, use: true })
      }
    }
  } finally {
    await browser.close()
  }

  if (!pages.length) throw new Error("No page could be photographed.")

  const name = clean(gh?.name ? gh.name.replace(/\b\w/g, (c) => c.toUpperCase()) : home.siteName || pageTitle(home, firstGuess))
  const oneLine = shorten(clean(gh?.description || home.description || home.h1), 110)
  const features = (gh?.features?.length ? gh.features : home.h2.filter((h) => h.length > 8 && h.length < 70)).slice(0, 4)

  const brief = {
    slug,
    name,
    oneLine,
    forWho: "",
    features: features.length ? features : ["", "", ""],
    hook: "I built this.",
    handle: gh?.owner ? `github.com/${gh.owner}` : "",
    website: url,
    github: github || "",
    accent: /^#[0-9a-f]{6}$/i.test(home.accent) ? home.accent : "#6d5efc",
    pages,
    readAt: new Date().toISOString(),
  }
  await writeFile(path.join(dir, "brief.json"), JSON.stringify(brief, null, 2) + "\n", "utf8")
  onStep("Done. Check the answers below and fix anything that is wrong.")
  return brief
}
