import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { writeFileAtomic } from "../lib/atomic-write.js";
import { MASTER_CV_PATH, PROFILE_PATH } from "../lib/paths.js";

export { MASTER_CV_PATH, PROFILE_PATH };

const text = z.string().trim();
const list = z.array(z.string().trim().min(1));

export const ProfileSchema = z.strictObject({
  me: z.strictObject({
    name: text.min(1),
    email: z.email(),
    phone: text,
    location: text,
    linkedin: text,
    github: text,
    website: text,
  }),
  search: z.strictObject({
    sources: z.strictObject({ linkedin: z.boolean(), rozee: z.boolean() }),
    keywords: list.min(1),
    locations: list.min(1),
    posted_within_days: z.number().int().min(1).max(30),
    remote_only: z.boolean(),
    easy_apply_only: z.boolean(),
    max_jobs_per_run: z.number().int().min(1).max(200),
    /** Optional web searches (claude -p + WebSearch) for postings outside LinkedIn, e.g. "send CV to" jobs. */
    web_queries: list,
  }),
  match: z.strictObject({
    what_i_want: text,
    must_have: list,
    deal_breakers: list,
    min_score: z.number().int().min(0).max(100),
  }),
  apply: z.strictObject({
    linkedin_auto: z.boolean(),
    auto_min_score: z.number().int().min(0).max(100),
    max_per_day: z.number().int().min(0).max(100),
    /** Put each ready application email into your Gmail Drafts (with the CV) for you to check and send. */
    gmail_drafts: z.boolean().default(true),
    /** Days after applying/emailing with no reply before the job shows under "Follow up". */
    follow_up_days: z.number().int().min(1).max(60),
  }),
  /** After each run: read replies from your inbox, and email yourself a short summary. Both need SMTP in .env. */
  notify: z.strictObject({
    check_replies: z.boolean(),
    summary_email: z.boolean(),
  }).default({ check_replies: true, summary_email: true }),
  /** Answers for LinkedIn Easy Apply questions. A required question with no answer here stops that application. */
  answers: z.strictObject({
    years_of_experience: z.number().int().min(0).max(60),
    skill_years: z.record(z.string(), z.number().int().min(0).max(60)),
    notice_period: text,
    expected_salary: text,
    current_salary: text,
    questions: z.array(z.strictObject({ match: text.min(1), answer: text.min(1) })),
  }),
});

export type Profile = z.infer<typeof ProfileSchema>;

export async function loadProfile(): Promise<Profile> {
  if (!existsSync(PROFILE_PATH)) {
    throw new Error("config/profile.json is missing. Copy config/profile.example.json to config/profile.json and fill it in.");
  }
  return parseProfile(JSON.parse(await readFile(PROFILE_PATH, "utf8")));
}

export function parseProfile(raw: unknown): Profile {
  const parsed = ProfileSchema.safeParse(raw);
  if (!parsed.success) throw new Error(`config/profile.json is invalid:\n${z.prettifyError(parsed.error)}`);
  for (const q of parsed.data.answers.questions) {
    try {
      new RegExp(q.match, "i");
    } catch {
      throw new Error(`answers.questions: "${q.match}" is not a valid regex`);
    }
  }
  return parsed.data;
}

export async function saveProfile(raw: unknown): Promise<Profile> {
  const profile = parseProfile(raw);
  await writeFileAtomic(PROFILE_PATH, JSON.stringify(profile, null, 2) + "\n");
  return profile;
}

export async function readMasterCvText(): Promise<string> {
  return existsSync(MASTER_CV_PATH) ? readFile(MASTER_CV_PATH, "utf8") : "";
}

export async function loadMasterCv(): Promise<string> {
  if (!existsSync(MASTER_CV_PATH)) {
    throw new Error("profile/master-cv.md is missing. Copy profile/master-cv.example.md to profile/master-cv.md and write your real CV in it.");
  }
  const cv = (await readFile(MASTER_CV_PATH, "utf8")).trim();
  if (cv.length < 200 || cv.includes("REPLACE ME")) {
    throw new Error("profile/master-cv.md still looks like the template. Write your real CV in it first.");
  }
  return cv;
}

export async function saveMasterCv(text: string): Promise<void> {
  await writeFileAtomic(MASTER_CV_PATH, text.trim() + "\n");
}
