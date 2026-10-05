// runFind(): search (LinkedIn, Rozee, web) → dedupe → read post → closed? → repost? → match score
//   → good match: tailored CV + cover letter + email draft → decide next step → auto Easy Apply for strong, clean matches.
// Reports every step as a RunEvent. Never calls process.exit.
import type { Browser, BrowserContext } from "playwright";
import { env } from "./config/env.js";
import { loadMasterCv, loadProfile, type Profile } from "./config/profile.js";
import { easyApply } from "./apply/easy-apply.js";
import { renderCoverLetter, renderCv } from "./cv/render.js";
import { openAccountBrowser, openGuestBrowser } from "./lib/browser.js";
import { ClaudeRunError } from "./lib/claude.js";
import { BlockedError, siteOf, throttle } from "./lib/throttle.js";
import type { Transporter } from "nodemailer";
import { emailConfigured, sendEmail } from "./apply/email.js";
import { checkReplies, type ReplyResult } from "./inbox/replies.js";
import { checkSent, imapSource, saveDrafts, type MailSource } from "./inbox/mail.js";
import { buildSummary } from "./notify/summary.js";
import { newRunId, randomBetween, RunLogger, sleep } from "./lib/logger.js";
import { matchJob, tailorCv } from "./match/index.js";
import { jobDetail, searchPage, type Listing } from "./search/linkedin.js";
import { checkStillOpen } from "./search/liveness.js";
import { readPosting } from "./search/posting.js";
import { searchRozee, type RozeeListing } from "./search/rozee.js";
import { webSearch, type WebHit } from "./search/web.js";
import { JobStore, type Job, type JobSource, type JobStatus } from "./store.js";

export interface RunOptions {
  /** Overrides search.max_jobs_per_run. */
  limit?: number;
  /** Skip the automatic Easy Apply step (everything else still runs). */
  noApply: boolean;
  /** Never send, even with linkedin_auto on: forms are only filled in for your approval. */
  testApply: boolean;
  /** Skip the web_queries searches (they cost money; LinkedIn and Rozee search are free). */
  noWeb: boolean;
  /** Skip the inbox check and the summary email after the run. */
  noNotify?: boolean;
}

export type RunEvent = { ts: string; run_id: string } & (
  | { type: "run_started"; limit: number }
  | { type: "searching"; what: string }
  | { type: "search_done"; found: number; fresh: number }
  | { type: "waiting"; ms: number; why: string }
  | { type: "job_started"; id: string; title: string; company: string; index: number; total: number }
  | { type: "job_skipped"; id: string; why: string }
  | { type: "job_scored"; id: string; score: number; fit: boolean; reasoning: string; knockouts: string[]; red_flags: string[] }
  | { type: "cv_ready"; id: string; pdf: string; warnings: string[] }
  | { type: "job_done"; id: string; status: JobStatus }
  | { type: "job_failed"; id: string; error: string }
  | { type: "apply_started"; id: string; title: string; company: string }
  | { type: "apply_done"; id: string; result: string; detail?: string }
  | { type: "notice"; message: string }
  | { type: "replies_done"; checked: number; matched: number; updates: ReplyResult["updates"] }
  | { type: "summary_sent"; to: string }
  | { type: "drafts_saved"; count: number }
  | { type: "run_aborted"; error: string }
  | { type: "run_finished"; summary: Summary; duration_s: number; log_file: string }
);
export type EventBody = RunEvent extends infer E ? (E extends RunEvent ? Omit<E, "ts" | "run_id"> : never) : never;

export interface Summary {
  found: number;
  new_jobs: number;
  closed: number;
  duplicates: number;
  scored: number;
  good_matches: number;
  cvs: number;
  applied: number;
  email_ready: number;
  needs_you: number;
  awaiting_ok: number; // Easy Apply forms filled in and waiting for your approval
  errors: number;
  cost_usd: number;
}

export interface RunHooks {
  onEvent?: (e: RunEvent) => void;
  signal?: AbortSignal;
  /** Share the dashboard's store so the UI sees changes live. */
  store?: JobStore;
}

type QueueItem =
  | { kind: "linkedin"; l: Listing }
  | { kind: "rozee"; r: RozeeListing }
  | { kind: "web"; h: WebHit };

/** Throttle key for LinkedIn's own daily Easy Apply limit (rested until the next morning when LinkedIn shows it). */
export const EASY_APPLY_SITE = "linkedin-easy-apply";

const itemId = (q: QueueItem) => (q.kind === "linkedin" ? `linkedin:${q.l.linkedin_id}` : q.kind === "rozee" ? `rozee:${q.r.rozee_id}` : `web:${q.h.url}`);

export async function runFind(opts: RunOptions, hooks: RunHooks = {}): Promise<{ summary: Summary; exit_code: 0 | 1 }> {
  const runId = newRunId();
  const logger = new RunLogger(runId);
  const started = Date.now();
  const summary: Summary = {
    found: 0, new_jobs: 0, closed: 0, duplicates: 0, scored: 0, good_matches: 0, cvs: 0,
    applied: 0, email_ready: 0, needs_you: 0, awaiting_ok: 0, errors: 0, cost_usd: 0,
  };
  const notices: string[] = []; // repeated in the summary email
  const emit = (e: EventBody) => {
    if (e.type === "notice") notices.push(e.message);
    try {
      hooks.onEvent?.({ ts: new Date().toISOString(), run_id: runId, ...e } as RunEvent);
    } catch {
      // a broken listener must never break a run
    }
  };
  const stopped = () => hooks.signal?.aborted ?? false;
  const fail = (id: string, err: unknown) => {
    summary.errors++;
    if (err instanceof ClaudeRunError) summary.cost_usd += err.costUsd;
    const msg = (err as Error).message;
    logger.log("error", "job_failed", { id, error: msg.slice(0, 500) });
    emit({ type: "job_failed", id, error: msg });
  };
  // Page loads wait inside politeGoto (src/lib/throttle.ts); show those waits, and let Stop cut them short.
  const gate = throttle();
  gate.onWait = (ms, site) => emit({ type: "waiting", ms, why: `before the next ${site} page` });
  gate.signal = hooks.signal;
  /** Sites that limited us during this run: their remaining jobs wait for a later run. */
  const resting = new Set<string>();
  const onBlocked = (err: BlockedError) => {
    if (resting.has(err.host)) return;
    resting.add(err.host);
    logger.log("warn", "site_resting", { site: err.host, until: err.until });
    emit({ type: "notice", message: err.message });
  };
  let claudeLimited = false;

  let guest: Browser | undefined;
  let exit_code: 0 | 1 = 0;
  try {
    const profile = await loadProfile();
    const masterCv = await loadMasterCv();
    const store = hooks.store ?? (await JobStore.load());
    const limit = opts.limit ?? profile.search.max_jobs_per_run;
    if (!Number.isInteger(limit) || limit < 1) throw new Error("--limit must be a positive integer");
    emit({ type: "run_started", limit });
    logger.log("info", "run_started", { limit, ...opts });

    guest = await openGuestBrowser();
    const queue: QueueItem[] = [];
    const seen = new Set<string>();
    const add = (q: QueueItem) => {
      const id = itemId(q);
      if (seen.has(id)) return;
      seen.add(id);
      summary.found++;
      if (!store.has(id)) queue.push(q);
    };
    const full = () => queue.length >= limit;

    // --- search 1: LinkedIn (free)
    if (profile.search.sources.linkedin) {
      outer: for (const keyword of profile.search.keywords) {
        for (const location of profile.search.locations) {
          for (let start = 0; start < 50; start += 10) {
            if (stopped() || full() || resting.has("linkedin.com")) break outer;
            emit({ type: "searching", what: `LinkedIn: ${keyword} in ${location}${start ? ` (page ${start / 10 + 1})` : ""}` });
            try {
              const page = await searchPage(guest, keyword, location, profile.search, start);
              for (const l of page) add({ kind: "linkedin", l });
              if (page.length < 10) break;
            } catch (err) {
              if (err instanceof BlockedError) {
                onBlocked(err);
                break outer;
              }
              fail(`search:${keyword}`, err);
              break;
            }
          }
        }
      }
    }

    // --- search 2: Rozee.pk (free). One page per keyword; the score handles location.
    if (profile.search.sources.rozee) {
      for (const keyword of profile.search.keywords) {
        if (stopped() || full() || resting.has("rozee.pk")) break;
        emit({ type: "searching", what: `Rozee: ${keyword}` });
        try {
          for (const r of await searchRozee(guest, keyword)) add({ kind: "rozee", r });
        } catch (err) {
          if (err instanceof BlockedError) {
            onBlocked(err);
            break;
          }
          fail(`rozee:${keyword}`, err);
        }
      }
    }

    // --- search 3: web (claude WebSearch, costs money)
    if (!opts.noWeb) {
      for (const query of profile.search.web_queries) {
        if (stopped() || full() || claudeLimited) break;
        emit({ type: "searching", what: `Web: ${query}` });
        try {
          const r = await webSearch(query, profile);
          summary.cost_usd += r.costUsd;
          for (const h of r.hits) if (!/linkedin\.com|rozee\.pk/.test(h.url)) add({ kind: "web", h });
        } catch (err) {
          if (err instanceof ClaudeRunError && err.kind === "rate_limit") {
            claudeLimited = true;
            emit({ type: "notice", message: `Claude is limiting requests (${err.message.slice(0, 160)}). Skipping the web search this run.` });
            break;
          }
          fail(`web:${query}`, err);
        }
      }
    }

    const work = queue.slice(0, limit);
    summary.new_jobs = work.length;
    emit({ type: "search_done", found: summary.found, fresh: work.length });

    // --- each new job
    for (const [i, item] of work.entries()) {
      if (stopped() || claudeLimited) break;
      if (resting.has(siteOf(item.kind === "linkedin" ? item.l.url : item.kind === "rozee" ? item.r.url : item.h.url))) continue;
      const id = itemId(item);
      const head = item.kind === "linkedin" ? item.l : item.kind === "rozee" ? { title: item.r.title, company: "" } : item.h;
      emit({ type: "job_started", id, title: head.title, company: head.company, index: i, total: work.length });

      let job: Job;
      try {
        const read = await readJob(guest, item);
        if (!read) {
          emit({ type: "job_skipped", id, why: "could not read the post; will try again next run" });
          continue;
        }
        job = read;
      } catch (err) {
        if (err instanceof BlockedError) {
          onBlocked(err); // its remaining jobs stay unread and come back next run
          continue;
        }
        fail(id, err);
        continue;
      }

      if (job.status === "closed") {
        summary.closed++;
        await store.put(job);
        emit({ type: "job_skipped", id, why: job.last_error ?? "closed" });
        continue;
      }
      if (await markIfDuplicate(job, store)) {
        summary.duplicates++;
        emit({ type: "job_skipped", id, why: `same job as one already seen (${job.duplicate_of})` });
        continue;
      }

      try {
        await processJob(job, profile, masterCv, guest, store, summary, emit);
      } catch (err) {
        if (err instanceof ClaudeRunError && err.kind === "rate_limit") {
          // Claude's own limit: not this job's fault. Leave it unsaved so the next run scores it.
          claudeLimited = true;
          summary.cost_usd += err.costUsd;
          logger.log("warn", "claude_limited", { error: err.message.slice(0, 300) });
          emit({ type: "notice", message: `Claude is limiting requests (${err.message.slice(0, 160)}). Stopping here; the rest are scored next run.` });
          break;
        }
        fail(job.id, err);
        await store.put({ ...job, status: "error", last_error: (err as Error).message.slice(0, 500) });
      }
    }

    // --- Easy Apply: fill in forms for your approval (never sends). Only with linkedin_auto on, strong clean
    //     matches are sent first (unless --test-apply, which never sends).
    if (!opts.noApply && !stopped()) {
      if (profile.apply.linkedin_auto && !opts.testApply) await applyStep("auto", profile, store, guest, summary, emit, logger, hooks.signal);
      if (!stopped()) await applyStep("prepare", profile, store, guest, summary, emit, logger, hooks.signal);
    }

    // --- replies in your inbox, then the summary email to yourself
    if (!opts.noNotify && !stopped()) await afterRun(profile, store, summary, new Date(started), notices, claudeLimited, emit, logger);
  } catch (err) {
    exit_code = 1;
    logger.log("error", "run_aborted", { error: (err as Error).message });
    emit({ type: "run_aborted", error: (err as Error).message });
  }

  await guest?.close().catch(() => {});
  gate.onWait = undefined; // the dashboard shares this throttle after the run
  gate.signal = undefined;
  const duration_s = Math.round((Date.now() - started) / 1000);
  summary.cost_usd = Math.round(summary.cost_usd * 10000) / 10000;
  logger.log("info", "run_summary", { ...summary, duration_s, exit_code });
  emit({ type: "run_finished", summary, duration_s, log_file: logger.file });
  return { summary, exit_code };
}

/** Reads the full post. null = couldn't read (retried next run). A closed post comes back with status "closed". */
async function readJob(guest: Browser, item: QueueItem): Promise<Job | null> {
  const now = new Date().toISOString();
  if (item.kind === "linkedin") {
    const l = item.l;
    const d = await jobDetail(guest, l.linkedin_id);
    if (!d) return null;
    const job = newJob({
      id: `linkedin:${l.linkedin_id}`, source: "linkedin", url: l.url, title: l.title, company: l.company,
      location: l.location, posted_at: l.posted_at, valid_through: null, description: d.description,
      easy_apply: d.easy_apply ?? l.easy_apply, apply_url: d.apply_url, found_by: l.found_by,
    }, now);
    if (d.closed) return { ...job, status: "closed", last_error: d.closed };
    return d.description ? job : null;
  }
  const url = item.kind === "rozee" ? item.r.url : item.h.url;
  const p = await readPosting(guest, url);
  if (!p) return null;
  const source: JobSource = item.kind;
  const job = newJob({
    id: item.kind === "rozee" ? `rozee:${item.r.rozee_id}` : `web:${url}`, source, url,
    title: p.title || (item.kind === "rozee" ? item.r.title : item.h.title),
    company: p.company || (item.kind === "web" ? item.h.company : ""),
    location: p.location, posted_at: p.posted_at, valid_through: p.valid_through, description: p.description,
    easy_apply: false, apply_url: url, found_by: item.kind === "rozee" ? item.r.found_by : item.h.found_by,
  }, now);
  if (p.closed) return { ...job, status: "closed", last_error: p.closed };
  return p.description ? job : null;
}

export function newJob(
  j: Pick<Job, "id" | "source" | "url" | "title" | "company" | "location" | "posted_at" | "valid_through" | "description" | "easy_apply" | "apply_url" | "found_by">,
  now: string,
): Job {
  return {
    ...j,
    emails: findEmails(j.description),
    score: null, reasoning: "", matched_skills: [], missing_skills: [], knockouts: [], red_flags: [], flags: [],
    duplicate_of: null, status: "review", cv: null, cover_letter: null, email: null, needs: [], last_error: null,
    applied_at: null, emailed_at: null, followed_up_at: null, last_checked_at: now, replies: [], preview: null, draft: null, created_at: now, updated_at: now,
  };
}

/**
 * Repost / same role on two sites: store it as "duplicate" of the first one (no new score, no second application),
 * and flag the original once it has been posted 3+ times, a common sign of a ghost job that never gets filled.
 */
export async function markIfDuplicate(job: Job, store: JobStore): Promise<boolean> {
  const earlier = store.sameRole(job).filter((j) => j.status !== "duplicate");
  const first = earlier.find((j) => j.status !== "closed");
  if (!first) {
    // Only closed copies before: the role reopened. Score it again, but say so.
    if (earlier.length) job.flags.push(`posted again after closing (${earlier.length + 1} times)`);
    return false;
  }
  const times = store.sameRole(job).length + 1;
  const sameSite = first.source === job.source;
  await store.put({
    ...job, status: "duplicate", duplicate_of: first.id, score: first.score, reasoning: first.reasoning,
    flags: [sameSite ? `reposted (seen ${times} times)` : `also posted on ${first.source}`],
  });
  if (sameSite && times >= 3) {
    const note = `reposted ${times} times: may be a ghost job that never gets filled`;
    await store.update(first.id, { flags: [...first.flags.filter((f) => !f.startsWith("reposted")), note] });
  }
  return true;
}

/** Emails written in the posting. Only these are ever used as recipients (the model is never asked for one). */
export function findEmails(text: string): string[] {
  const found = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];
  return [...new Set(found.map((e) => e.toLowerCase().replace(/\.$/, "")))]
    .filter((e) => !/no-?reply|example\.com|sentry|wixpress|\.png$|\.jpg$/.test(e))
    .slice(0, 5);
}

export async function processJob(
  job: Job, profile: Profile, masterCv: string, browser: Browser, store: JobStore, summary: Summary, emit: (e: EventBody) => void,
): Promise<void> {
  const m = await matchJob(job, profile, masterCv);
  summary.cost_usd += m.costUsd;
  summary.scored++;
  const fit = m.output.score >= profile.match.min_score;
  Object.assign(job, {
    score: m.output.score,
    reasoning: m.output.reasoning,
    matched_skills: m.output.matched_skills,
    missing_skills: m.output.missing_skills,
    knockouts: m.output.knockouts,
    red_flags: m.output.red_flags,
  });
  emit({ type: "job_scored", id: job.id, score: m.output.score, fit, reasoning: m.output.reasoning, knockouts: m.output.knockouts, red_flags: m.output.red_flags });
  if (!fit) {
    await store.put({ ...job, status: "not_a_fit" });
    emit({ type: "job_done", id: job.id, status: "not_a_fit" });
    return;
  }
  summary.good_matches++;

  const t = await tailorCv(job, profile, masterCv);
  summary.cost_usd += t.costUsd;
  const files = await renderCv(browser, job.id, t.cv, profile.me);
  const coverPdf = await renderCoverLetter(browser, job.id, t.coverLetter, profile.me);
  summary.cvs++;
  job.cv = { ...files, data: t.cv, warnings: t.warnings };
  job.cover_letter = { text: t.coverLetter, pdf: coverPdf };
  job.email = { to: job.emails[0] ?? "", subject: t.email.subject, body: t.email.body };
  emit({ type: "cv_ready", id: job.id, pdf: files.pdf, warnings: t.warnings });

  job.status = nextStatus(job, profile);
  if (job.status === "email_ready") summary.email_ready++;
  await store.put(job);
  emit({ type: "job_done", id: job.id, status: job.status });
}

/** Why this job must not be applied to automatically, or null if it may. */
export function autoBlocker(job: Job): string | null {
  if (job.knockouts.length) return `knock-out: ${job.knockouts[0]}`;
  if (job.red_flags.length) return `red flag: ${job.red_flags[0]}`;
  if (job.flags.some((f) => f.includes("ghost"))) return "possible ghost job";
  return null;
}

/** Where a good match goes next. Strong, clean LinkedIn matches are queued for auto apply; the rest wait for you. */
export function nextStatus(job: Job, profile: Profile): JobStatus {
  const strong = (job.score ?? 0) >= profile.apply.auto_min_score;
  const linkedinEasy = job.source === "linkedin" && job.easy_apply !== false;
  if (linkedinEasy && profile.apply.linkedin_auto && strong && !autoBlocker(job)) return "to_apply";
  if (job.emails.length) return "email_ready";
  if (linkedinEasy) return "review";
  return "apply_on_site";
}

/** How many Easy Apply forms one run fills in for your approval (each one is a few LinkedIn page loads). */
export const PREPARE_PER_RUN = 10;

/**
 * Jobs the Easy Apply step works on, best score first.
 *   "prepare": good LinkedIn matches not yet filled in. The form is filled and stopped before Submit;
 *              you see every answer and approve it (the default way of working).
 *   "auto":    only when you switched on linkedin_auto: strong, clean matches are sent without asking.
 */
export function applyQueue(jobs: Job[], mode: "prepare" | "auto"): Job[] {
  const easy = (j: Job) => j.source === "linkedin" && j.easy_apply !== false && j.cv;
  const pick = mode === "auto"
    ? (j: Job) => j.status === "to_apply"
    : (j: Job) => (j.status === "review" || j.status === "to_apply") && !j.preview;
  return jobs.filter((j) => easy(j) && pick(j)).sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}

/**
 * The Easy Apply step of a run. `mode` "prepare" never sends anything. "auto" sends (only with linkedin_auto on).
 * Either way each job is first checked to be still open and not a role you already applied to.
 */
export async function applyStep(
  mode: "prepare" | "auto", profile: Profile, store: JobStore, guest: Browser, summary: Summary,
  emit: (e: EventBody) => void, logger: RunLogger, signal?: AbortSignal,
): Promise<void> {
  const queue = applyQueue(store.all(), mode);
  if (!queue.length) return;
  const resting = throttle().status(EASY_APPLY_SITE);
  if (resting) {
    emit({ type: "notice", message: `${resting} ${queue.length} jobs wait.` });
    return;
  }
  const cap = mode === "auto" ? profile.apply.max_per_day - store.appliedToday() : PREPARE_PER_RUN;
  if (cap <= 0) {
    emit({ type: "notice", message: `Daily limit reached (${profile.apply.max_per_day} applications). ${queue.length} jobs wait for tomorrow.` });
    return;
  }
  const e = env();
  let ctx: BrowserContext | undefined;
  let done = 0;
  try {
    for (const job of queue) {
      if (signal?.aborted || done >= cap) break;
      // Earlier runs' jobs may have closed since, or turned out to be reposts of something already applied to.
      const live = await checkStillOpen(guest, job);
      if (live.open === false) {
        await store.update(job.id, { status: "closed", last_error: live.reason, last_checked_at: new Date().toISOString() });
        emit({ type: "job_skipped", id: job.id, why: `closed: ${live.reason}` });
        continue;
      }
      if (store.sameRole(job).some((j) => j.status === "applied" || j.status === "emailed")) {
        await store.update(job.id, { status: "duplicate", flags: [...job.flags, "you already applied to this role"] });
        emit({ type: "job_skipped", id: job.id, why: "already applied to the same role" });
        continue;
      }
      if (done > 0) {
        const ms = randomBetween(e.APPLY_DELAY_MIN_MS, e.APPLY_DELAY_MAX_MS);
        emit({ type: "waiting", ms, why: mode === "auto" ? "between applications" : "between forms" });
        if (!(await sleep(ms, signal))) break;
      }
      ctx ??= await openAccountBrowser();
      const r = await applyOne(ctx, job, profile, store, mode, emit);
      done++;
      if (r === "applied") summary.applied++;
      if (r === "tested") summary.awaiting_ok++;
      if (r === "needs_you") summary.needs_you++;
      logger.log("info", "apply_done", { id: job.id, mode, result: r });
      if (r === "not_logged_in") {
        emit({ type: "notice", message: "Not logged in to LinkedIn. Run `npm run login` once, then try again." });
        break;
      }
      if (r === "limit") {
        emit({ type: "notice", message: throttle().status(EASY_APPLY_SITE) ?? throttle().status("linkedin.com") ?? "LinkedIn is limiting. The remaining applications wait for the next run." });
        break;
      }
    }
  } finally {
    await ctx?.close().catch(() => {});
  }
}

/**
 * One Easy Apply attempt and the status change it causes. Shared by the run and the dashboard buttons.
 *   "prepare": fill in, stop before Submit, save what would be sent → "awaiting_ok". Nothing is sent.
 *   "approve": you pressed Approve. Fill in again and send only if the form gives exactly the approved answers.
 *   "auto":    linkedin_auto is on: fill in and send.
 */
export async function applyOne(
  ctx: BrowserContext, job: Job, profile: Profile, store: JobStore, mode: "prepare" | "approve" | "auto", emit: (e: EventBody) => void,
): Promise<string> {
  if (!job.cv) throw new Error("this job has no CV yet");
  if (mode === "approve" && !job.preview) throw new Error("nothing to approve yet: fill in the form first");
  emit({ type: "apply_started", id: job.id, title: job.title, company: job.company });
  const r = await easyApply(ctx, job.url, { cvPdf: job.cv.pdf, coverLetter: job.cover_letter?.text ?? null }, profile, {
    submit: mode !== "prepare",
    approved: mode === "approve" ? job.preview!.fields : undefined,
  });
  const now = new Date().toISOString();
  const fallback: JobStatus = job.emails.length ? "email_ready" : job.apply_url ? "apply_on_site" : "review";
  switch (r.kind) {
    case "tested":
      await store.update(job.id, { status: "awaiting_ok", preview: { fields: r.fields, checked_at: now }, needs: [], last_error: null });
      break;
    case "changed":
      // The form is not what you approved: show the new version and ask again. Nothing was sent.
      await store.update(job.id, {
        status: "awaiting_ok", preview: { fields: r.fields, checked_at: now }, needs: [],
        last_error: `The form changed since you looked at it, so nothing was sent. Check the new answers and approve again. (${r.differences.slice(0, 3).join("; ")})`,
      });
      break;
    case "applied":
      await store.update(job.id, { status: "applied", applied_at: now, needs: [], last_error: null, preview: { fields: r.fields, checked_at: now } });
      break;
    case "already_applied":
      await store.update(job.id, { status: "applied", applied_at: job.applied_at ?? now, needs: [] });
      break;
    case "needs_you":
      await store.update(job.id, { status: "needs_you", needs: r.questions, preview: { fields: r.fields, checked_at: now } });
      break;
    case "not_easy_apply":
      await store.update(job.id, { status: fallback, easy_apply: false, apply_url: r.apply_url ?? job.apply_url });
      break;
    case "failed":
      await store.update(job.id, { status: "needs_you", needs: [], last_error: r.error });
      break;
    case "limit": {
      // The job keeps its status and is tried again later. LinkedIn's own daily limit: no Easy Apply until tomorrow 8am.
      if (/LinkedIn says/.test(r.reason)) {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(8, 0, 0, 0);
        await throttle().rest(EASY_APPLY_SITE, tomorrow.getTime(), r.reason);
      }
      break;
    }
    case "not_logged_in":
      break; // nothing changes
  }
  const detail = r.kind === "needs_you" ? r.questions.join(" | ") : r.kind === "failed" ? r.error : r.kind === "limit" ? r.reason
    : r.kind === "changed" ? r.differences.join(" | ") : r.kind === "tested" ? `${r.fields.length} fields filled, waiting for your OK` : undefined;
  emit({ type: "apply_done", id: job.id, result: r.kind, detail });
  return r.kind;
}

/** After a run: read replies (if email is set up and notify.check_replies), then email yourself a summary. Never fails the run. */
export async function afterRun(
  profile: Profile, store: JobStore, summary: Summary, since: Date, notices: string[], claudeLimited: boolean,
  emit: (e: EventBody) => void, logger: RunLogger,
  deps: { source?: MailSource; transport?: Transporter } = {}, // tests pass a fake inbox and mail transport
): Promise<ReplyResult | null> {
  const { source, transport } = deps;
  if (!emailConfigured() && !(source && transport)) return null;
  let replies: ReplyResult | null = null;
  let mail: MailSource | undefined;
  try {
    mail = source ?? (await imapSource());
  } catch (err) {
    logger.log("warn", "mail_failed", { error: (err as Error).message.slice(0, 300) });
    emit({ type: "notice", message: `Could not open your mailbox: ${(err as Error).message.slice(0, 200)}` });
  }
  if (mail) {
    const step = async (what: string, fn: () => Promise<void>) => {
      try {
        await fn();
      } catch (err) {
        logger.log("warn", `${what}_failed`, { error: (err as Error).message.slice(0, 300) });
        emit({ type: "notice", message: `Could not ${what}: ${(err as Error).message.slice(0, 200)}` });
      }
    };
    // 1. Application emails into your Gmail Drafts (with the CV). You send them from Gmail.
    if (profile.apply.gmail_drafts) {
      await step("save Gmail drafts", async () => {
        const saved = await saveDrafts(store, mail!, profile.me);
        if (saved.length) emit({ type: "drafts_saved", count: saved.length });
      });
    }
    // 2. Drafts you already sent from Gmail → "Email sent".
    await step("check your Sent folder", async () => {
      const marked = await checkSent(store, mail!);
      if (marked.length) emit({ type: "notice", message: `${marked.length} draft${marked.length > 1 ? "s were" : " was"} sent from Gmail; marked as Email sent.` });
    });
    // 3. Replies in your inbox.
    if (profile.notify.check_replies && !claudeLimited) {
      await step("check your inbox for replies", async () => {
        replies = await checkReplies(store, mail!);
        summary.cost_usd += replies.cost_usd;
        logger.log("info", "replies_done", { checked: replies.checked, matched: replies.matched, updates: replies.updates.length });
        emit({ type: "replies_done", checked: replies.checked, matched: replies.matched, updates: replies.updates });
      });
    }
    if (!source) await mail.close().catch(() => {});
  }
  if (profile.notify.summary_email) {
    const mailBody = buildSummary({ summary, jobs: store.all(), since, replies, notices, profile, dashboardUrl: `http://localhost:${env().UI_PORT}` });
    if (mailBody) {
      try {
        await sendEmail({ to: profile.me.email, subject: mailBody.subject, body: mailBody.body, attachments: [], me: profile.me }, transport);
        emit({ type: "summary_sent", to: profile.me.email });
      } catch (err) {
        logger.log("warn", "summary_failed", { error: (err as Error).message.slice(0, 300) });
        emit({ type: "notice", message: `Could not send the summary email: ${(err as Error).message.slice(0, 200)}` });
      }
    }
  }
  return replies;
}
