// data/jobs.json: every job the finder has seen, keyed by id. Written atomically after every change.
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { DATA_DIR, JOBS_PATH } from "./lib/paths.js";
import { writeFileAtomic } from "./lib/atomic-write.js";
import type { FilledField } from "./apply/easy-apply.js";
import type { TailoredCv } from "./match/schema.js";

export { DATA_DIR };

export const JOB_STATUSES = [
  "not_a_fit",      // scored below match.min_score
  "to_apply",       // waiting for automatic LinkedIn Easy Apply
  "review",         // good match, waiting for you (Easy Apply button or job link)
  "email_ready",    // email + CV drafted, waiting for you to press Send
  "apply_on_site",  // only an external apply link: apply yourself
  "needs_you",      // Easy Apply stopped on a question it had no answer for
  "awaiting_ok",    // Easy Apply form filled (not sent): waiting for you to approve exactly what it shows
  "applied",
  "emailed",
  "interview",      // set by you
  "offer",          // set by you
  "rejected",       // set by you
  "closed",         // the posting is no longer open
  "duplicate",      // same company + title as a job already seen (repost); not scored again
  "hidden",         // you hid it
  "error",
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export type JobSource = "linkedin" | "rozee" | "web";

/** An email found in your inbox about this application (src/inbox/replies.ts). */
export interface Reply {
  uid: number;
  from: string;
  subject: string;
  date: string;
  kind: "interview" | "assessment" | "rejection" | "offer" | "received" | "other";
  summary: string;
}

export interface Job {
  id: string;                         // "linkedin:<id>", "rozee:<id>" or "web:<normalized url>"
  source: JobSource;
  url: string;
  title: string;
  company: string;
  location: string;
  posted_at: string | null;
  valid_through: string | null;       // closing date, when the posting gives one
  description: string;
  /** true = LinkedIn Easy Apply; false = not; null = unknown until the logged-in browser opens the job. */
  easy_apply: boolean | null;
  apply_url: string | null;           // external "apply on company site" link, if any
  emails: string[];                   // emails written in the posting itself
  found_by: string;                   // search keyword/query that found it
  score: number | null;
  reasoning: string;
  matched_skills: string[];
  missing_skills: string[];
  /** Hard requirements you don't meet (years, degree, location, work permit...). Any knock-out blocks auto apply. */
  knockouts: string[];
  /** Signs of a bad or fake posting (fees, vague company, unrealistic pay...). */
  red_flags: string[];
  /** Notes set by code, e.g. "reposted 3 times". */
  flags: string[];
  duplicate_of: string | null;
  status: JobStatus;
  cv: { pdf: string; html: string; data: TailoredCv; warnings: string[] } | null;
  cover_letter: { text: string; pdf: string } | null;
  email: { to: string; subject: string; body: string } | null;
  needs: string[];                    // questions Easy Apply could not answer
  last_error: string | null;
  applied_at: string | null;
  emailed_at: string | null;
  followed_up_at: string | null;
  last_checked_at: string | null;     // last time we checked the posting is still open
  replies: Reply[];
  /** What the Easy Apply form will send, from a fill-in that stopped before Submit. Approving sends exactly this. */
  preview: { fields: FilledField[]; checked_at: string } | null;
  /** The application email saved in your Gmail Drafts (you send it from Gmail). */
  draft: { saved_at: string; mailbox: string } | null;
  created_at: string;
  updated_at: string;
}

const DEFAULTS: Partial<Job> = {
  valid_through: null, knockouts: [], red_flags: [], flags: [], duplicate_of: null,
  cover_letter: null, followed_up_at: null, last_checked_at: null, replies: [], preview: null, draft: null,
};

export class JobStore {
  private constructor(private jobs: Record<string, Job>, private readonly path: string) {}

  /** `path` is only for tests; the app always uses data/jobs.json. */
  static async load(path = JOBS_PATH): Promise<JobStore> {
    if (!existsSync(path)) return new JobStore({}, path);
    const raw = JSON.parse(await readFile(path, "utf8")) as { jobs: Record<string, Job> };
    const jobs: Record<string, Job> = {};
    for (const [id, j] of Object.entries(raw.jobs ?? {})) jobs[id] = { ...DEFAULTS, ...j } as Job; // older files miss newer fields
    return new JobStore(jobs, path);
  }

  has(id: string): boolean {
    return id in this.jobs;
  }

  get(id: string): Job | undefined {
    return this.jobs[id];
  }

  all(): Job[] {
    return Object.values(this.jobs);
  }

  async put(job: Job): Promise<void> {
    this.jobs[job.id] = job;
    await this.save();
  }

  async update(id: string, patch: Partial<Job>): Promise<Job> {
    const job = this.jobs[id];
    if (!job) throw new Error(`no job ${id}`);
    Object.assign(job, patch, { updated_at: new Date().toISOString() });
    await this.save();
    return job;
  }

  appliedToday(): number {
    const today = new Date().toDateString();
    return this.all().filter((j) => j.applied_at && new Date(j.applied_at).toDateString() === today).length;
  }

  /** Earlier jobs with the same company + title (any source). Oldest first. */
  sameRole(job: Pick<Job, "id" | "company" | "title">): Job[] {
    const key = roleKey(job.company, job.title);
    if (!key) return [];
    return this.all()
      .filter((j) => j.id !== job.id && roleKey(j.company, j.title) === key)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  private saving: Promise<void> = Promise.resolve();

  /** Saves are chained: two writers in flight would race on the same .tmp file. */
  private save(): Promise<void> {
    this.saving = this.saving
      .catch(() => {})
      .then(() => writeFileAtomic(this.path, JSON.stringify({ version: 1, jobs: this.jobs }, null, 2)));
    return this.saving;
  }
}

/**
 * "company|title" with noise removed, so the same role posted on LinkedIn and Rozee, or reposted
 * with a new id, matches. Empty when the company is unknown (too risky to merge on title alone).
 */
export function roleKey(company: string, title: string): string {
  const c = company.toLowerCase().replace(/\b(pvt|private|ltd|limited|llc|inc|smc|co)\b\.?/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const t = title.toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, " ")                                   // "(Remote)", "[HR147]"
    .replace(/\b(urgent(ly)?|hiring|required|needed|job|jobs|opening)\b/g, " ")
    .replace(/[^\p{L}\p{N}+#]+/gu, " ").trim();
  return c && t ? `${c}|${t}` : "";
}
