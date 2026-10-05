// Reads your Gmail (IMAP, same app password as sending) for replies to applications and updates each job:
// interview / assessment → "interview", rejection → "rejected", offer → "offer".
//
// Privacy: only the sender, subject and date of recent mail are read first. A message's text is opened
// (and sent to Claude to classify) only when it looks like it is about a job you applied to.
// The Inbox is opened read-only (src/inbox/mail.ts).
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { env } from "../config/env.js";
import { writeFileAtomic } from "../lib/atomic-write.js";
import { runClaude } from "../lib/claude.js";
import { DATA_DIR, PROMPTS_DIR } from "../lib/paths.js";
import type { Job, JobStatus, JobStore, Reply } from "../store.js";
import type { MailHeader, MailSource } from "./mail.js";

export { imapSource, type MailHeader, type MailSource } from "./mail.js";

const FREE_MAIL = /^(gmail|googlemail|yahoo|ymail|outlook|hotmail|live|msn|icloud|me|aol|proton|protonmail)\./;
const MAX_TEXT = 4000;

const norm = (s: string) => s.toLowerCase().replace(/\b(pvt|private|ltd|limited|llc|inc|smc|co|technologies|technology|solutions|software|group)\b/g, "").replace(/[^a-z0-9]+/g, "");
const domainOf = (addr: string) => addr.split("@")[1] ?? "";
const domainLabel = (d: string) => d.replace(/^(mail|email|careers|jobs|hr|talent|recruiting|notifications?)\./, "").split(".")[0] ?? "";

/**
 * Which job a message is about, or null. Strongest evidence first:
 *   3 = sent from the address you emailed, 2 = same company domain, 1 = company name in sender domain / LinkedIn or
 *   job-board notice naming the company in the subject.
 */
export function matchJob(h: MailHeader, jobs: Job[]): Job | null {
  let best: { job: Job; score: number } | null = null;
  const dom = domainOf(h.from);
  const label = norm(domainLabel(dom));
  const subject = norm(h.subject);
  const viaBoard = /(^|\.)(linkedin\.com|rozee\.pk|indeed\.com|glassdoor\.com|bayt\.com|mustakbil\.com)$/.test(dom);
  for (const job of jobs) {
    const sentAt = new Date(job.emailed_at ?? job.applied_at ?? 0).getTime();
    if (h.date.getTime() < sentAt - 3600_000) continue; // older than the application
    const company = norm(job.company);
    let score = 0;
    const to = job.email?.to?.toLowerCase();
    if (to && h.from === to) score = 3;
    else if (to && dom && dom === domainOf(to) && !FREE_MAIL.test(dom)) score = 2;
    else if (company.length >= 4 && label.length >= 4 && !FREE_MAIL.test(dom) && (label.includes(company) || company.includes(label))) score = 1;
    else if (viaBoard && company.length >= 4 && subject.includes(company)) score = 1;
    if (score && (!best || score > best.score || (score === best.score && sentAt > new Date(best.job.emailed_at ?? best.job.applied_at ?? 0).getTime()))) {
      best = { job, score };
    }
  }
  return best?.job ?? null;
}

const ReplyOutput = z.strictObject({
  kind: z.enum(["interview", "assessment", "rejection", "offer", "received", "other"]),
  summary: z.string().trim().min(1).max(300),
  confidence: z.number().min(0).max(1),
});
export type ReplyKind = z.infer<typeof ReplyOutput>["kind"];

const NEXT: Partial<Record<ReplyKind, JobStatus>> = { interview: "interview", assessment: "interview", rejection: "rejected", offer: "offer" };

export interface ReplyResult {
  checked: number;
  matched: number;
  updates: Array<{ id: string; title: string; company: string; kind: ReplyKind; summary: string; status: JobStatus }>;
  cost_usd: number;
}

interface InboxState {
  seen: number[]; // IMAP uids already handled
}
const STATE_PATH = () => join(DATA_DIR, "inbox-state.json");

export async function checkReplies(store: JobStore, source: MailSource, opts: { days?: number; now?: Date } = {}): Promise<ReplyResult> {
  const now = opts.now ?? new Date();
  const sent = store.all().filter((j) => j.emailed_at || j.applied_at);
  const result: ReplyResult = { checked: 0, matched: 0, updates: [], cost_usd: 0 };
  if (!sent.length) return result;
  const oldest = Math.min(...sent.map((j) => new Date(j.emailed_at ?? j.applied_at!).getTime()));
  const since = new Date(Math.max(oldest - 86_400_000, now.getTime() - (opts.days ?? 60) * 86_400_000));
  const state: InboxState = existsSync(STATE_PATH()) ? JSON.parse(readFileSync(STATE_PATH(), "utf8")) : { seen: [] };
  const seen = new Set(state.seen);

  const headers = (await source.headers(since)).filter((h) => !seen.has(h.uid)).sort((a, b) => a.date.getTime() - b.date.getTime());
  result.checked = headers.length;
  const { MATCH_MODEL, CLAUDE_TIMEOUT_MS } = env();
  try {
    for (const h of headers) {
      seen.add(h.uid);
      const job = matchJob(h, sent);
      if (!job) continue;
      result.matched++;
      const text = (await source.text(h.uid)).slice(0, MAX_TEXT);
      const r = await runClaude({
        systemPromptFile: join(PROMPTS_DIR, "reply.md"),
        input: `<application>\n${JSON.stringify({ title: job.title, company: job.company, applied_on: job.emailed_at ?? job.applied_at })}\n</application>\n\n<email>\n${JSON.stringify({ from: `${h.fromName} <${h.from}>`, subject: h.subject, date: h.date.toISOString(), text })}\n</email>`,
        schema: ReplyOutput,
        model: MATCH_MODEL,
        timeoutMs: CLAUDE_TIMEOUT_MS,
        maxBudgetUsd: 0.2,
      });
      result.cost_usd += r.costUsd;
      const reply: Reply = { uid: h.uid, from: h.from, subject: h.subject.slice(0, 300), date: h.date.toISOString(), kind: r.output.kind, summary: r.output.summary };
      const next = r.output.confidence >= 0.6 ? NEXT[r.output.kind] : undefined;
      // An offer is final: a later automated "position filled" mail does not undo it.
      const status = next && job.status !== "offer" ? next : job.status;
      await store.update(job.id, { replies: [...(job.replies ?? []), reply], status }); // also updates `job` (same object)
      result.updates.push({ id: job.id, title: job.title, company: job.company, kind: r.output.kind, summary: r.output.summary, status });
    }
  } finally {
    await writeFileAtomic(STATE_PATH(), JSON.stringify({ seen: [...seen].slice(-5000) }));
  }
  return result;
}
