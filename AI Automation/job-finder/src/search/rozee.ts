// Rozee.pk search results, read through Playwright (the list is filled in by JavaScript).
// Applying on Rozee needs a Rozee account, so Rozee jobs become "Apply on site" (or "Email ready" when the post has an email).
import type { Browser, Page } from "playwright";
import { env } from "../config/env.js";
import { politeGoto } from "../lib/throttle.js";

export interface RozeeListing {
  rozee_id: string;
  title: string;
  url: string;
  found_by: string;
}

export async function searchRozee(browser: Browser, keyword: string): Promise<RozeeListing[]> {
  const page = await browser.newPage();
  try {
    const res = await politeGoto(page, `https://www.rozee.pk/job/jsearch/q/${encodeURIComponent(keyword)}`, env().PAGE_TIMEOUT_MS);
    if (!res) throw new Error("Rozee search: no response");
    if (res.status() >= 400) throw new Error(`Rozee search HTTP ${res.status()}`);
    await page.waitForSelector("a[href*='-jobs-']", { timeout: 15000 }).catch(() => {});
    return await parseRozeeLinks(page, `Rozee: ${keyword}`);
  } finally {
    await page.close();
  }
}

/** Job links on a loaded Rozee results page. Exported for tests. */
export async function parseRozeeLinks(page: Page, foundBy: string): Promise<RozeeListing[]> {
  const links = await page.$$eval("a[href*='-jobs-']", (as) =>
    as.map((a) => ({ href: (a as HTMLAnchorElement).href, text: a.textContent?.replace(/\s+/g, " ").trim() ?? "" })));
  const out = new Map<string, RozeeListing>();
  for (const { href, text } of links) {
    const m = /^https:\/\/www\.rozee\.pk\/[^?#]*-jobs-(\d+)/.exec(href);
    if (!m || out.has(m[1]!)) continue;
    const url = href.split("?")[0]!;
    out.set(m[1]!, { rozee_id: m[1]!, title: text || titleFromSlug(url), url, found_by: foundBy });
  }
  return [...out.values()];
}

function titleFromSlug(url: string): string {
  const slug = url.split("/").pop()!.replace(/-jobs-\d+$/, "");
  let s = slug;
  try {
    s = decodeURIComponent(slug);
  } catch {
    // Rozee slugs sometimes hold cut-off emoji bytes
  }
  return s.replace(/-/g, " ");
}
