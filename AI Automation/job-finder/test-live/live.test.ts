// `npm run test:live` — the same checks against the real sites, over the internet, slowly (a few page loads,
// with pauses). Free unless LIVE_CLAUDE=1, which also scores and tailors one real job with the real model
// (about $0.10). Run it before handing the project over, and whenever LinkedIn or Rozee change their pages.
// Uses its own temp data folder, so its page counts never use up the budget of your real runs.
// A site that rate limits or shows a bot check is reported as SKIPPED, never "passed".
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test, type TestContext } from "node:test";
import type { Browser } from "playwright";

process.env.JF_DATA_DIR = mkdtempSync(join(tmpdir(), "jf-live-"));
const { parseProfile } = await import("../src/config/profile.js");
const { openGuestBrowser } = await import("../src/lib/browser.js");
const { jobDetail, searchPage } = await import("../src/search/linkedin.js");
const { searchRozee } = await import("../src/search/rozee.js");
const { BlockedError, readPosting } = await import("../src/search/posting.js");
const { checkStillOpen } = await import("../src/search/liveness.js");
const { matchJob, tailorCv } = await import("../src/match/index.js");
const { newJob } = await import("../src/pipeline.js");

const profile = parseProfile(JSON.parse(readFileSync(new URL("../config/profile.example.json", import.meta.url), "utf8")));
const cv = readFileSync(new URL("../test/fixtures/sample-cv.md", import.meta.url), "utf8");
// No manual pauses: every page load goes through politeGoto, which spaces loads to each site itself.
const pause = async () => {};

let browser: Browser;
let linkedinId: string | undefined;
before(async () => (browser = await openGuestBrowser()));
after(async () => browser?.close());

function skipIfBlocked(t: TestContext, err: unknown): boolean {
  if (err instanceof BlockedError) {
    t.skip(`site is limiting automated reading right now: ${(err as Error).message}`);
    return true;
  }
  return false;
}

test("LinkedIn: search returns job cards", async (t) => {
  try {
    const jobs = await searchPage(browser, "React Developer", "Pakistan", profile.search, 0);
    assert.ok(jobs.length > 0, "no jobs returned: the search page markup may have changed");
    assert.ok(jobs.every((j) => /^\d+$/.test(j.linkedin_id) && j.title));
    linkedinId = jobs[0]!.linkedin_id;
  } catch (e) {
    if (!skipIfBlocked(t, e)) throw e;
  }
});

test("LinkedIn: a job page gives a description and apply type, and reads as open", async (t) => {
  if (!linkedinId) return t.skip("no job from the search test");
  await pause();
  try {
    const d = await jobDetail(browser, linkedinId);
    assert.ok(d, "job page missing");
    assert.ok(d.description.length > 200, "description too short: the job page markup may have changed");
    assert.notEqual(d.easy_apply, undefined);
    await pause();
    const job = newJob({ id: `linkedin:${linkedinId}`, source: "linkedin", url: `https://www.linkedin.com/jobs/view/${linkedinId}/`, title: "t", company: "c",
      location: "", posted_at: null, valid_through: null, description: d.description, easy_apply: d.easy_apply, apply_url: d.apply_url, found_by: "live" }, new Date().toISOString());
    const live = await checkStillOpen(browser, job);
    if (live.open === null) return t.skip(`could not check: ${live.reason}`);
    assert.equal(live.open, true);
  } catch (e) {
    if (!skipIfBlocked(t, e)) throw e;
  }
});

let rozeeUrl: string | undefined;
test("Rozee: search returns job links", async (t) => {
  await pause();
  try {
    const jobs = await searchRozee(browser, "React Developer");
    assert.ok(jobs.length > 0, "no Rozee jobs: the page markup may have changed");
    rozeeUrl = jobs.find((j) => /^https:\/\/www\.rozee\.pk\/[a-z0-9-]+-jobs-\d+$/.test(j.url))?.url ?? jobs[0]!.url;
  } catch (e) {
    if (!skipIfBlocked(t, e)) throw e;
  }
});

test("Rozee: a job page gives title, company and description", async (t) => {
  if (!rozeeUrl) return t.skip("no job from the Rozee search test");
  await pause();
  try {
    const p = await readPosting(browser, rozeeUrl);
    assert.ok(p, `could not read ${rozeeUrl}`);
    assert.ok(p.title && p.description.length > 100, JSON.stringify({ title: p.title, len: p.description.length }));
  } catch (e) {
    if (!skipIfBlocked(t, e)) throw e;
  }
});

test("real Claude: scores and tailors one real job (LIVE_CLAUDE=1, about $0.10)", { skip: process.env.LIVE_CLAUDE === "1" ? false : "set LIVE_CLAUDE=1 to run" }, async (t) => {
  if (!linkedinId) return t.skip("no LinkedIn job to use");
  await pause();
  const d = await jobDetail(browser, linkedinId);
  assert.ok(d);
  const job = newJob({ id: `linkedin:${linkedinId}`, source: "linkedin", url: "", title: "Software role", company: "Company", location: "Pakistan",
    posted_at: null, valid_through: null, description: d.description, easy_apply: d.easy_apply, apply_url: null, found_by: "live" }, new Date().toISOString());
  const m = await matchJob(job, profile, cv);
  assert.ok(m.output.score >= 0 && m.output.score <= 100);
  assert.ok(m.output.reasoning.length > 20);
  job.matched_skills = m.output.matched_skills;
  job.missing_skills = m.output.missing_skills;
  const tl = await tailorCv(job, profile, cv);
  // Whatever the model wrote, what is left must be in the CV.
  const cvText = cv.toLowerCase();
  for (const e of tl.cv.experience) assert.ok(cvText.includes(e.company.toLowerCase()), e.company);
  for (const g of tl.cv.skills) for (const s of g.items) assert.ok(cvText.includes(s.toLowerCase()), s);
  assert.match(tl.coverLetter, /Best regards/);
  console.log(`  score ${m.output.score}, ${tl.warnings.length} lines removed, cost $${(m.costUsd + tl.costUsd).toFixed(3)}`);
});
