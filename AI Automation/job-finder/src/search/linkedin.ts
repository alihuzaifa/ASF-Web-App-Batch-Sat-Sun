// LinkedIn's public (logged-out) job pages, read through Playwright:
//   search: /jobs-guest/jobs/api/seeMoreJobPostings/search  → list of job cards, 10 per page
//   detail: /jobs-guest/jobs/api/jobPosting/<id>            → description + apply button
// Both answer 429 when read too fast; every load goes through politeGoto (src/lib/throttle.ts), which spaces
// them out and rests LinkedIn after a limit.
import type { Browser, Page } from "playwright";
import { env } from "../config/env.js";
import type { Profile } from "../config/profile.js";
import { politeGoto } from "../lib/throttle.js";
import { closedReason } from "./posting.js";

export interface Listing {
  linkedin_id: string;
  title: string;
  company: string;
  location: string;
  posted_at: string | null;
  url: string;
  easy_apply: boolean | null;
  found_by: string;
}

export interface JobDetail {
  description: string;
  easy_apply: boolean | null;
  apply_url: string | null;
  closed: string | null; // why it's closed, or null when still open
}

export function searchUrl(keyword: string, location: string, s: Profile["search"], start: number): string {
  const p = new URLSearchParams({ keywords: keyword, location, f_TPR: `r${s.posted_within_days * 86400}`, start: String(start) });
  if (s.easy_apply_only) p.set("f_AL", "true");
  if (s.remote_only) p.set("f_WT", "2");
  return `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?${p}`;
}

async function load(page: Page, url: string): Promise<boolean> {
  const res = await politeGoto(page, url, env().PAGE_TIMEOUT_MS); // throws BlockedError on 429 / 999
  const status = res?.status() ?? 0;
  if (status === 400 || status === 404) return false; // past the last page / job removed
  if (status >= 400) throw new Error(`HTTP ${status} on ${url}`);
  return true;
}

export async function searchPage(browser: Browser, keyword: string, location: string, s: Profile["search"], start: number): Promise<Listing[]> {
  const page = await browser.newPage();
  try {
    if (!(await load(page, searchUrl(keyword, location, s, start)))) return [];
    return await parseSearchPage(page, `${keyword} / ${location}`, s.easy_apply_only);
  } finally {
    await page.close();
  }
}

/** Job cards on a loaded search page. Exported for tests (saved pages in test/fixtures). */
export async function parseSearchPage(page: Page, foundBy: string, easyApplyOnly: boolean): Promise<Listing[]> {
  const cards = await page.$$eval("div.base-card[data-entity-urn]", (els) =>
    els.map((el) => ({
      urn: el.getAttribute("data-entity-urn") ?? "",
      title: el.querySelector(".base-search-card__title")?.textContent?.trim() ?? "",
      company: el.querySelector(".base-search-card__subtitle")?.textContent?.trim() ?? "",
      location: el.querySelector(".job-search-card__location")?.textContent?.trim() ?? "",
      posted_at: el.querySelector("time")?.getAttribute("datetime") ?? null,
    })),
  );
  return cards.flatMap((c) => {
    const id = /jobPosting:(\d+)/.exec(c.urn)?.[1];
    if (!id || !c.title) return [];
    return [{
      linkedin_id: id,
      title: c.title,
      company: c.company,
      location: c.location,
      posted_at: c.posted_at,
      url: `https://www.linkedin.com/jobs/view/${id}/`,
      easy_apply: easyApplyOnly ? true : null,
      found_by: foundBy,
    }];
  });
}

export async function jobDetail(browser: Browser, linkedinId: string): Promise<JobDetail | null> {
  const page = await browser.newPage();
  try {
    if (!(await load(page, `https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${linkedinId}`))) return null;
    return await parseJobDetail(page);
  } finally {
    await page.close();
  }
}

/** Description, apply type and open/closed from a loaded job page. Exported for tests. */
export async function parseJobDetail(page: Page): Promise<JobDetail> {
  const d = await page.evaluate(() => {
    const desc = document.querySelector(".description__text--rich, .show-more-less-html__markup") as HTMLElement | null;
    desc?.querySelectorAll("button").forEach((b) => b.remove()); // "Show more" / "Show less"
    const criteria = [...document.querySelectorAll(".description__job-criteria-item")]
      .map((li) => li.textContent?.replace(/\s+/g, " ").trim())
      .filter(Boolean);
    const apply = document.querySelector(".apply-button, [data-tracking-control-name*='apply-link']");
    return {
      description: desc?.innerText.trim() ?? "",
      topCard: (document.querySelector(".top-card-layout, .topcard") as HTMLElement | null)?.innerText ?? "",
      criteria,
      tracking: apply?.getAttribute("data-tracking-control-name") ?? "",
      href: apply instanceof HTMLAnchorElement ? apply.href : null,
    };
  });
  const offsite = /offsite/i.test(d.tracking);
  return {
    description: [d.description, ...d.criteria].filter(Boolean).join("\n\n"),
    easy_apply: /onsite/i.test(d.tracking) ? true : offsite ? false : null,
    apply_url: offsite && d.href ? unwrapExternal(d.href) : null,
    closed: closedReason(d.topCard, null),
  };
}

/** LinkedIn wraps offsite apply links as ...externalApply/...?url=<real url>. */
function unwrapExternal(href: string): string {
  try {
    const inner = new URL(href).searchParams.get("url");
    return inner && /^https?:\/\//.test(inner) ? inner : href;
  } catch {
    return href;
  }
}
