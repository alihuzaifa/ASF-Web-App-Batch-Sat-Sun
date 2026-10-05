// Two claude -p calls per job: a cheap match score for every job, then CV + email only for jobs worth applying to.
import { join } from "node:path";
import { PROMPTS_DIR } from "../lib/paths.js";
import { env } from "../config/env.js";
import type { Profile } from "../config/profile.js";
import { runClaude } from "../lib/claude.js";
import type { Job } from "../store.js";
import { MatchOutput, TailorOutput, type TailoredCv } from "./schema.js";

const MATCH_PROMPT = join(PROMPTS_DIR, "match.md");
const TAILOR_PROMPT = join(PROMPTS_DIR, "tailor-cv.md");
const MAX_DESCRIPTION = 10_000;

function jobBlock(job: Job): string {
  const j = {
    title: job.title,
    company: job.company,
    location: job.location,
    posted_at: job.posted_at,
    description: job.description.slice(0, MAX_DESCRIPTION),
  };
  return `<job>\n${JSON.stringify(j, null, 2)}\n</job>`;
}

export async function matchJob(job: Job, profile: Profile, masterCv: string) {
  const { MATCH_MODEL, CLAUDE_TIMEOUT_MS, CLAUDE_MAX_BUDGET_USD } = env();
  return runClaude({
    systemPromptFile: MATCH_PROMPT,
    input: [
      `<preferences>\n${JSON.stringify({ ...profile.match, wanted_roles: profile.search.keywords, wanted_locations: profile.search.locations }, null, 2)}\n</preferences>`,
      `<my_cv>\n${masterCv}\n</my_cv>`,
      jobBlock(job),
    ].join("\n\n"),
    schema: MatchOutput,
    model: MATCH_MODEL,
    timeoutMs: CLAUDE_TIMEOUT_MS,
    maxBudgetUsd: CLAUDE_MAX_BUDGET_USD,
  });
}

export async function tailorCv(job: Job, profile: Profile, masterCv: string) {
  const { TAILOR_MODEL, CLAUDE_TIMEOUT_MS, CLAUDE_MAX_BUDGET_USD } = env();
  const res = await runClaude({
    systemPromptFile: TAILOR_PROMPT,
    input: [
      `<me>\n${JSON.stringify({ name: profile.me.name, location: profile.me.location }, null, 2)}\n</me>`,
      `<my_cv>\n${masterCv}\n</my_cv>`,
      jobBlock(job),
      `<match>\n${JSON.stringify({ matched_skills: job.matched_skills, missing_skills: job.missing_skills }, null, 2)}\n</match>`,
    ].join("\n\n"),
    schema: TailorOutput,
    model: TAILOR_MODEL,
    timeoutMs: CLAUDE_TIMEOUT_MS,
    maxBudgetUsd: CLAUDE_MAX_BUDGET_USD,
  });
  const { cv, warnings } = groundCv(res.output.cv, masterCv);
  const body = groundProse(res.output.email.body, masterCv, job.description);
  const cover = groundProse(res.output.cover_letter, masterCv, job.description);
  warnings.push(...body.warnings.map((w) => `email: ${w}`), ...cover.warnings.map((w) => `cover letter: ${w}`));
  return { cv, email: { ...res.output.email, body: body.text }, coverLetter: cover.text, warnings, costUsd: res.costUsd };
}

/**
 * Email body / cover letter: drop any sentence with a number that is not in your CV. A number from the job
 * post may be quoted back only with the word it had there ("3+ years" → "3 years" is fine, but the post's
 * "2+ years" does not make "saved 2 million" fine).
 */
export function groundProse(text: string, masterCv: string, jobText: string): { text: string; warnings: string[] } {
  const fromCv = new Set(masterCv.match(NUM) ?? []);
  const fromJob = new Set(numberWords(jobText));
  const warnings: string[] = [];
  const paragraphs = text.split(/\n\s*\n/).map((p) =>
    p.split(/(?<=[.!?])\s+/).filter((s) => {
      const quoted = new Set(numberWords(s).filter((nw) => fromJob.has(nw)).map((nw) => nw.split(" ")[0]!));
      const bad = (s.match(NUM) ?? []).filter((n) => !fromCv.has(n) && !quoted.has(n));
      if (bad.length) warnings.push(`removed sentence with numbers not in your CV (${bad.join(", ")}): "${s.trim()}"`);
      return bad.length === 0;
    }).join(" ").trim());
  return { text: paragraphs.filter(Boolean).join("\n\n"), warnings };
}

const NUM = /\d+(?:[.,]\d+)?/g;

/** "3+ years of React" → ["3 years"]: each number with the word right after it (skipping +, %, -, "to 5"). */
function numberWords(text: string): string[] {
  const out: string[] = [];
  for (const m of text.toLowerCase().matchAll(/(\d+(?:[.,]\d+)?)\s*(?:\+|%|-\s*\d+|to\s+\d+)?\s*([a-z]+)/g)) out.push(`${m[1]} ${m[2]}`);
  return out;
}

// Lowercase, punctuation → spaces (keeping + # . for C++, C#, Node.js), sentence-ending dots dropped.
const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}+#.]+/gu, " ").replace(/\.+(?=\s|$)/g, "").trim();

/**
 * The CV goes out under your name without you reading it (auto apply), so the model is not trusted to stay truthful.
 * Anything that names a fact (employer, job title, school, project, certificate, skill, number) must
 * literally appear in profile/master-cv.md, or it is removed and a warning is kept on the job.
 */
export function groundCv(cv: TailoredCv, masterCv: string): { cv: TailoredCv; warnings: string[] } {
  const source = ` ${norm(masterCv)} `;
  const sourceNumbers = new Set(masterCv.match(/\d+(?:[.,]\d+)?/g) ?? []);
  const warnings: string[] = [];
  // Whole words only, so "Java" is not found inside "JavaScript".
  const inSource = (s: string) => source.includes(` ${norm(s)} `);
  const keep = (what: string, s: string) => {
    if (inSource(s)) return true;
    warnings.push(`removed ${what} not in your CV: "${s}"`);
    return false;
  };
  const numbersOk = (what: string, s: string) => {
    const bad = (s.match(/\d+(?:[.,]\d+)?/g) ?? []).filter((n) => !sourceNumbers.has(n));
    if (bad.length) warnings.push(`removed ${what} with numbers not in your CV (${bad.join(", ")}): "${s}"`);
    return bad.length === 0;
  };

  const out: TailoredCv = {
    ...cv,
    summary: numbersOk("summary", cv.summary) ? cv.summary : cv.summary.replace(/[^.]*\d[^.]*\.\s*/g, "").trim(),
    skills: cv.skills
      .map((g) => ({ group: g.group, items: g.items.filter((i) => keep("skill", i)) }))
      .filter((g) => g.items.length),
    experience: cv.experience
      .filter((e) => keep("employer", e.company) && keep("job title", e.title))
      .map((e) => ({ ...e, bullets: e.bullets.filter((b) => numbersOk("bullet", b)) })),
    projects: cv.projects
      .filter((p) => keep("project", p.name))
      .map((p) => ({ ...p, bullets: p.bullets.filter((b) => numbersOk("project bullet", b)) })),
    education: cv.education.filter((e) => keep("school", e.school)),
    certifications: cv.certifications.filter((c) => keep("certification", c)),
    awards: cv.awards.filter((a) => keep("award", a.title) && numbersOk("award", `${a.title} ${a.detail}`)),
    languages: cv.languages.filter((l) => keep("language", l)),
  };
  return { cv: out, warnings };
}
