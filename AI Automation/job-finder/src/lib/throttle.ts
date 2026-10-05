// One door for every public page load (search, job posts, still-open checks): politeGoto().
//
// Per site it keeps
//   - a random gap between page loads (never two loads to one site back to back),
//   - a daily page budget,
//   - a cool-down after a rate limit or bot check: 30 min, then 1 h, 2 h ... up to 24 h, or what the
//     site's Retry-After asks for. The cool-down is saved in data/rate-limits.json, so the next run (or the
//     dashboard's buttons) leave that site alone too, instead of hitting it again and making it worse.
// It never tries to get around a block. Blocked = stop and wait.
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Page, Response } from "playwright";
import { env } from "../config/env.js";
import { writeFileAtomic } from "./atomic-write.js";
import { sleep } from "./logger.js";
import { DATA_DIR } from "./paths.js";

export class BlockedError extends Error {
  constructor(readonly host: string, message: string, readonly until: string | null = null) {
    super(message);
    this.name = "BlockedError";
  }
}

export interface SiteRule {
  minGapMs: number;
  maxGapMs: number;
  pagesPerDay: number;
}

/** Slow on purpose. LinkedIn starts answering 429 after a few fast reads; Rozee shows Cloudflare. */
export const RULES: Record<string, SiteRule> = {
  "linkedin.com": { minGapMs: 8000, maxGapMs: 16000, pagesPerDay: 150 },
  "rozee.pk": { minGapMs: 10000, maxGapMs: 20000, pagesPerDay: 80 },
  default: { minGapMs: 4000, maxGapMs: 9000, pagesPerDay: 200 },
};
/** This computer (the tests' local pages): no waiting. */
const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/;

const BASE_COOLDOWN_MS = 30 * 60_000;
const MAX_COOLDOWN_MS = 24 * 3_600_000;

interface SiteState {
  day: string;          // local date the page count belongs to
  pages: number;        // page loads today
  last_at: number;      // ms epoch of the last load
  strikes: number;      // blocks in a row; sets the cool-down length
  blocked_until: number; // ms epoch; 0 = not blocked
  reason: string;
}

export function siteOf(url: string): string {
  const host = new URL(url).hostname.toLowerCase();
  return Object.keys(RULES).find((k) => k !== "default" && (host === k || host.endsWith("." + k))) ?? host.replace(/^www\./, "");
}

export class Throttle {
  private state: Record<string, SiteState>;
  /** Called with how long it is about to wait, so the run can show "waiting 12s before linkedin.com". */
  onWait?: (ms: number, site: string) => void;
  signal?: AbortSignal;

  constructor(
    private readonly path: string,
    private readonly now: () => number = Date.now,
    private readonly wait: (ms: number, signal?: AbortSignal) => Promise<boolean> = sleep,
    private readonly random: () => number = Math.random,
    private readonly slowdown: number = env().SLOWDOWN,
  ) {
    this.state = {};
    this.reload();
  }

  private mtime = -1;
  /**
   * The dashboard and a terminal run are separate processes sharing data/rate-limits.json. Re-read it when
   * it changed on disk, so neither works from (or writes back) an old copy.
   */
  private reload(): void {
    if (!existsSync(this.path)) return;
    const m = statSync(this.path).mtimeMs;
    if (m === this.mtime) return;
    try {
      this.state = JSON.parse(readFileSync(this.path, "utf8")).sites ?? {};
      this.mtime = m;
    } catch {
      // half-written by the other process: keep what we have, read it next time
    }
  }

  private rule(site: string): SiteRule {
    const r = RULES[site] ?? RULES.default!;
    return { ...r, minGapMs: r.minGapMs * this.slowdown, maxGapMs: r.maxGapMs * this.slowdown };
  }

  private site(site: string): SiteState {
    this.reload();
    const today = new Date(this.now()).toDateString();
    const s = (this.state[site] ??= { day: today, pages: 0, last_at: 0, strikes: 0, blocked_until: 0, reason: "" });
    if (s.day !== today) {
      s.day = today;
      s.pages = 0;
    }
    return s;
  }

  /** Why this site must not be loaded right now, or null. */
  status(site: string): string | null {
    const s = this.site(site);
    if (s.blocked_until > this.now()) {
      return `${site} asked us to slow down (${s.reason}). Resting until ${new Date(s.blocked_until).toLocaleString()}.`;
    }
    if (s.pages >= this.rule(site).pagesPerDay) return `${site}: daily limit of ${this.rule(site).pagesPerDay} pages reached. It continues tomorrow.`;
    return null;
  }

  /** Waits for this site's turn. Throws BlockedError when the site is resting or today's budget is used. */
  async before(url: string): Promise<void> {
    const site = siteOf(url);
    const why = this.status(site);
    if (why) throw new BlockedError(site, why, this.site(site).blocked_until ? new Date(this.site(site).blocked_until).toISOString() : null);
    const s = this.site(site);
    const r = this.rule(site);
    const gap = r.minGapMs + Math.floor(this.random() * (r.maxGapMs - r.minGapMs + 1));
    const left = s.last_at + gap - this.now();
    if (left > 0) {
      this.onWait?.(left, site);
      if (!(await this.wait(left, this.signal))) throw new BlockedError(site, "stopped");
      // While we waited, another process may have loaded a page or hit a limit: check again.
      const later = this.status(site);
      if (later) throw new BlockedError(site, later);
    }
    const now = this.site(site); // fresh object: reload() may have replaced `s` during the wait
    now.pages++;
    now.last_at = this.now();
    await this.save();
  }

  /** The site rate limited us or showed a bot check: rest it (longer each time), honouring Retry-After. */
  async blocked(url: string, reason: string, retryAfterSec?: number): Promise<BlockedError> {
    const site = siteOf(url);
    const s = this.site(site);
    s.strikes++;
    const backoff = Math.min(BASE_COOLDOWN_MS * 2 ** (s.strikes - 1), MAX_COOLDOWN_MS);
    const asked = retryAfterSec && retryAfterSec > 0 ? Math.min(retryAfterSec * 1000, MAX_COOLDOWN_MS) : 0;
    s.blocked_until = this.now() + Math.max(backoff, asked);
    s.reason = reason;
    await this.save();
    return new BlockedError(site, `${site} is limiting automated reading (${reason}). Resting it until ${new Date(s.blocked_until).toLocaleString()}; the next runs skip it until then.`, new Date(s.blocked_until).toISOString());
  }

  /** Rest a site until a given time (used for LinkedIn's daily Easy Apply limit: until tomorrow morning). */
  async rest(site: string, untilMs: number, reason: string): Promise<void> {
    const s = this.site(site);
    s.blocked_until = Math.max(s.blocked_until, untilMs);
    s.reason = reason;
    await this.save();
  }

  /** A normal page after a rest: start the next cool-down from 30 min again. */
  async ok(url: string): Promise<void> {
    const s = this.site(siteOf(url));
    if (s.strikes && s.blocked_until <= this.now()) {
      s.strikes = 0;
      s.reason = "";
      await this.save();
    }
  }

  snapshot(): Record<string, { pages_today: number; resting_until: string | null; reason: string }> {
    const out: Record<string, { pages_today: number; resting_until: string | null; reason: string }> = {};
    this.reload();
    for (const site of Object.keys(this.state)) {
      const s = this.site(site);
      out[site] = { pages_today: s.pages, resting_until: s.blocked_until > this.now() ? new Date(s.blocked_until).toISOString() : null, reason: s.reason };
    }
    return out;
  }

  private saving: Promise<void> = Promise.resolve();
  private save(): Promise<void> {
    this.saving = this.saving.catch(() => {}).then(() => writeFileAtomic(this.path, JSON.stringify({ version: 1, sites: this.state }, null, 2)));
    return this.saving;
  }
}

let shared: Throttle | undefined;
/** The process-wide throttle (the run and the dashboard share it, and it is saved to disk). */
export function throttle(): Throttle {
  return (shared ??= new Throttle(join(DATA_DIR, "rate-limits.json")));
}

const CHALLENGE = /just a moment|attention required|verify you are human|security check/i;

/**
 * page.goto through the throttle. Rate limits (429, LinkedIn's 999) and bot-check pages put the site to rest
 * and throw BlockedError. Other HTTP errors are returned to the caller as usual.
 */
export async function politeGoto(page: Page, url: string, timeoutMs: number): Promise<Response | null> {
  if (LOCAL.test(new URL(url).hostname)) return page.goto(url, { timeout: timeoutMs, waitUntil: "domcontentloaded" });
  const t = throttle();
  await t.before(url);
  const res = await page.goto(url, { timeout: timeoutMs, waitUntil: "domcontentloaded" });
  const status = res?.status() ?? 0;
  const title = await page.title().catch(() => "");
  if (status === 429 || status === 999 || CHALLENGE.test(title) || ((status === 403 || status === 503) && /cloudflare|captcha/i.test(await page.content().catch(() => "")))) {
    const retryAfter = Number(res?.headers()["retry-after"]);
    throw await t.blocked(url, status === 429 || status === 999 ? `HTTP ${status}` : "bot check page", Number.isFinite(retryAfter) ? retryAfter : undefined);
  }
  if (status && status < 400) await t.ok(url);
  return res;
}
