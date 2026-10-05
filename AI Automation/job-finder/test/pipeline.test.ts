// `npm test` — the whole per-job pipeline with a fake `claude` (test/fake-claude.mjs): score → CV + cover letter
// → grounding → PDFs → status. Real browser for the PDFs, no internet, no real Claude calls.
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";
import { chromium, type Browser } from "playwright";

const tmp = mkdtempSync(join(tmpdir(), "jf-pipeline-"));
process.env.JF_DATA_DIR = join(tmp, "data");
process.env.JF_LOG_DIR = join(tmp, "logs");
process.env.CLAUDE_BIN = fileURLToPath(new URL("./fake-claude.mjs", import.meta.url));
process.env.FAKE_CLAUDE_LOG = join(tmp, "calls.jsonl");
process.env.FAKE_CLAUDE_FAIL_ONCE = join(tmp, "failed-once");

// Imported after the env is set: paths.ts and claude.ts read it once.
const { parseProfile } = await import("../src/config/profile.js");
const { newJob, processJob } = await import("../src/pipeline.js");
const { JobStore } = await import("../src/store.js");

const profile = parseProfile(JSON.parse(readFileSync(new URL("../config/profile.example.json", import.meta.url), "utf8")));
profile.apply.linkedin_auto = true; // the example ships with auto apply off; these tests cover the "on" behaviour
const MASTER = `# Your Name
Skills: React, Node.js, TypeScript
### Software Engineer, Arbisoft
Lahore | 2023 - Present
- Built a dashboard used by 40 staff.
BS Computer Science, FAST NUCES, 2021. Languages: English, Urdu`;

let browser: Browser;
before(async () => {
  browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL === "chromium" ? undefined : process.env.BROWSER_CHANNEL ?? "chrome" });
});
after(async () => browser?.close());

const emit = () => {};
const summary = () => ({ found: 0, new_jobs: 0, closed: 0, duplicates: 0, scored: 0, good_matches: 0, cvs: 0, applied: 0, email_ready: 0, needs_you: 0, awaiting_ok: 0, errors: 0, cost_usd: 0 });
const job = (id: string, description: string, over: Record<string, unknown> = {}) => ({
  ...newJob({
    id, source: "linkedin" as const, url: `https://www.linkedin.com/jobs/view/${id}/`, title: "React Developer", company: "Acme",
    location: "Lahore", posted_at: null, valid_through: null, description, easy_apply: true, apply_url: null, found_by: "test",
  }, new Date().toISOString()),
  ...over,
});

test("good match: CV, cover letter and email are made, invented facts removed, queued for auto apply", async () => {
  const store = await JobStore.load(join(tmp, "jobs-a.json"));
  const s = summary();
  const j = job("linkedin:100", "We need a React developer with 2+ years. Contact jobs@acme.pk");
  await processJob(j, profile, MASTER, browser, store, s, emit);
  const saved = store.get("linkedin:100")!;

  assert.equal(saved.score, 90);
  assert.equal(saved.status, "to_apply");                                         // 90 >= auto_min_score, no knock-outs
  assert.deepEqual(saved.emails, ["jobs@acme.pk"]);
  assert.equal(saved.email?.to, "jobs@acme.pk");                                  // recipient from the post, not the model
  assert.deepEqual(saved.cv!.data.skills[0]!.items, ["React"]);                   // "Kubernetes" is not in the CV
  assert.deepEqual(saved.cv!.data.experience.map((e) => e.company), ["Arbisoft"]); // "Google" removed
  assert.deepEqual(saved.cv!.data.experience[0]!.bullets, ["Built a dashboard used by 40 staff."]); // "300%" removed
  assert.equal(saved.cv!.data.summary, "Full stack developer.");                   // "team of 12" removed
  assert.doesNotMatch(saved.email!.body, /2 million/);
  assert.doesNotMatch(saved.cover_letter!.text, /25 engineers/);
  assert.match(saved.cover_letter!.text, /40 staff/);
  assert.ok(saved.cv!.warnings.length >= 6, saved.cv!.warnings.join("\n"));
  assert.ok(existsSync(saved.cv!.pdf) && existsSync(saved.cover_letter!.pdf));
  assert.equal(s.good_matches, 1);
  assert.ok(s.cost_usd > 0.04, "cost includes the failed first try and the retry");
});

test("the match call got the CV, preferences and job, with every tool disabled", () => {
  const calls = readFileSync(process.env.FAKE_CLAUDE_LOG!, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  const match = calls.find((c) => c.prompt.endsWith("match.md"));
  assert.ok(match);
  assert.match(match.input, /<my_cv>[\s\S]*Arbisoft[\s\S]*<\/my_cv>/);
  assert.match(match.input, /<preferences>[\s\S]*deal_breakers/);
  assert.match(match.input, /<job>[\s\S]*React developer/);
  const at = (f: string) => match.args[match.args.indexOf(f) + 1];
  assert.equal(at("--tools"), "");
  assert.equal(at("--setting-sources"), "");
  assert.ok(match.args.includes("--strict-mcp-config"));
  assert.ok(match.args.includes("--json-schema"));
});

test("knock-out: good enough to keep, but never auto applied; not a fit gets no CV", async () => {
  const store = await JobStore.load(join(tmp, "jobs-b.json"));
  const senior = job("linkedin:200", "Senior role, 8+ years required.");
  await processJob(senior, profile, MASTER, browser, store, summary(), emit);
  const saved = store.get("linkedin:200")!;
  assert.equal(saved.status, "not_a_fit");          // fake scores it 40 < min_score 65
  assert.equal(saved.cv, null);
  assert.deepEqual(saved.knockouts, ["Needs 8+ years; CV shows about 3."]);
});

test("red flag stops auto apply even with a high score", async () => {
  const store = await JobStore.load(join(tmp, "jobs-c.json"));
  await processJob(job("linkedin:300", "React developer. Pay a security deposit to start."), profile, MASTER, browser, store, summary(), emit);
  const saved = store.get("linkedin:300")!;
  assert.equal(saved.score, 90);
  assert.equal(saved.status, "review");
  assert.deepEqual(saved.red_flags, ["Asks for a security deposit."]);
});
