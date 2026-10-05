// Reads one public job page (Rozee, company career pages, job boards). Uses the page's schema.org
// JobPosting JSON-LD when it has one (most boards do, for Google Jobs), else the visible text.
import type { Browser, Page } from "playwright";
import { env } from "../config/env.js";
import { BlockedError, politeGoto } from "../lib/throttle.js";

export { BlockedError };

export interface Posting {
  title: string;
  company: string;
  location: string;
  posted_at: string | null;
  valid_through: string | null;
  description: string;
  closed: string | null; // why we think it's closed, or null
}

/** Phrases job pages show once a posting stops taking applications. */
const CLOSED_PATTERNS = [
  /no longer accepting applications/i,
  /(this|the) (job|position|vacancy|posting|role) (is|has) (no longer available|expired|been filled|been closed|closed)/i,
  /(job|position|vacancy) (has )?expired/i,
  /applications? (are|is) (now )?closed/i,
  /this job (post(ing)?|ad) (is|has been) (removed|deactivated)/i,
  /job not found/i,
];

export function closedReason(text: string, validThrough: string | null, now = new Date()): string | null {
  if (validThrough) {
    const end = new Date(validThrough);
    if (!Number.isNaN(end.getTime()) && end.getTime() < now.getTime() - 86_400_000) return `closing date passed (${validThrough.slice(0, 10)})`;
  }
  const hit = CLOSED_PATTERNS.find((re) => re.test(text.slice(0, 20000)));
  return hit ? `page says: "${hit.exec(text)![0]}"` : null;
}

interface JsonLdPosting {
  title?: string;
  description?: string;
  datePosted?: string;
  validThrough?: string;
  hiringOrganization?: { name?: string } | string;
  jobLocation?: unknown;
  jobLocationType?: string;
}

/**
 * `notFoundIsClosed`: for a job we read before, a 404 means it was taken down (closed). For a link just
 * found in search it usually means a broken link (Rozee's own emoji URLs 404), so it is only "unreadable".
 * Throws BlockedError when the site is rate limiting or resting (see src/lib/throttle.ts).
 */
export async function readPosting(browser: Browser, url: string, opts: { notFoundIsClosed: boolean } = { notFoundIsClosed: false }): Promise<Posting | null> {
  const page = await browser.newPage();
  try {
    let res;
    try {
      res = await politeGoto(page, url, env().PAGE_TIMEOUT_MS);
    } catch (err) {
      if (err instanceof BlockedError) throw err;
      return null; // timeout, DNS, network
    }
    if (!res) return null;
    if (res.status() === 404 || res.status() === 410) return opts.notFoundIsClosed ? gone("page not found (HTTP " + res.status() + ")") : null;
    if (res.status() >= 400) return null;
    await page.waitForTimeout(2000); // client-rendered boards
    // One more look (same page, no new request) for boards that fill the post in late.
    return (await parsePosting(page)) ?? (await page.waitForTimeout(3000), await parsePosting(page));
  } finally {
    await page.close();
  }
}

function gone(reason: string): Posting {
  return { title: "", company: "", location: "", posted_at: null, valid_through: null, description: "", closed: reason };
}

/** Posting fields from a loaded page (JSON-LD first). Exported for tests. */
export async function parsePosting(page: Page): Promise<Posting | null> {
  const { ld, text, h1 } = await page.evaluate(() => {
    const blocks = [...document.querySelectorAll("script[type='application/ld+json']")].map((s) => s.textContent ?? "");
    const main = document.querySelector("main, article, [role=main]") as HTMLElement | null;
    return { ld: blocks, text: (main ?? document.body).innerText, h1: document.querySelector("h1")?.textContent?.trim() ?? "" };
  });
  const posting = ld.flatMap(parseJsonLd).find((p) => p.title || p.description);
  const visible = text.replace(/\n{3,}/g, "\n\n").trim();

  if (posting) {
    const description = htmlToText(posting.description ?? "") || visible;
    return {
      title: (posting.title ?? h1).trim(),
      company: (typeof posting.hiringOrganization === "string" ? posting.hiringOrganization : posting.hiringOrganization?.name ?? "").trim(),
      location: locationText(posting.jobLocation, posting.jobLocationType),
      posted_at: posting.datePosted ?? null,
      valid_through: posting.validThrough ?? null,
      description: description.slice(0, 15000),
      closed: closedReason(visible, posting.validThrough ?? null),
    };
  }
  if (visible.length < 300) return null;
  return { title: h1, company: "", location: "", posted_at: null, valid_through: null, description: visible.slice(0, 15000), closed: closedReason(visible, null) };
}

function parseJsonLd(raw: string): JsonLdPosting[] {
  try {
    const data = JSON.parse(raw);
    const items: unknown[] = Array.isArray(data) ? data : data["@graph"] ? data["@graph"] : [data];
    return items.filter((i): i is JsonLdPosting => typeof i === "object" && i !== null && (i as { "@type"?: string })["@type"] === "JobPosting");
  } catch {
    return [];
  }
}

function locationText(loc: unknown, type?: string): string {
  const one = (l: unknown): string => {
    const a = (l as { address?: Record<string, string> })?.address;
    if (!a) return "";
    return [a.addressLocality, a.addressRegion, a.addressCountry].filter((x) => typeof x === "string" && x).join(", ");
  };
  const parts = (Array.isArray(loc) ? loc.map(one) : [one(loc)]).filter(Boolean);
  if (type === "TELECOMMUTE") parts.push("Remote");
  return [...new Set(parts)].join(" / ");
}

export function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h\d)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
}
