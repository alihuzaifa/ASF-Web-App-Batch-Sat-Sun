// `npm test` — the rules that keep applications truthful and safe. No network, no Claude calls.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { answerFor, pickOption } from "../src/apply/easy-apply.js";
import { followUpDraft } from "../src/apply/email.js";
import { parseProfile } from "../src/config/profile.js";
import { followUpDue, insights } from "../src/insights.js";
import { groundCv, groundProse } from "../src/match/index.js";
import type { TailoredCv } from "../src/match/schema.js";
import { applyQueue, autoBlocker, findEmails, markIfDuplicate, newJob, nextStatus } from "../src/pipeline.js";
import { closedReason, htmlToText } from "../src/search/posting.js";
import { JobStore, roleKey, type Job } from "../src/store.js";

const profile = parseProfile(JSON.parse(readFileSync(new URL("../config/profile.example.json", import.meta.url), "utf8")));
profile.apply.linkedin_auto = true; // the example ships with auto apply off; these tests cover the "on" behaviour
const MASTER = `Skills: React, Node.js, JavaScript, C++, C#.
### Software Engineer, Arbisoft
- Built a dashboard used by 40 staff; cut response time by 35%.
BS Computer Science, FAST NUCES, 2021. Languages: English, Urdu`;

const cv = (over: Partial<TailoredCv>): TailoredCv => ({
  headline: "Dev", summary: "Engineer.", skills: [], experience: [], projects: [], education: [], certifications: [], awards: [], languages: [], ...over,
});

const job = (over: Partial<Job> = {}): Job => ({
  ...newJob({
    id: "linkedin:1", source: "linkedin", url: "https://www.linkedin.com/jobs/view/1/", title: "React Developer", company: "Acme",
    location: "Lahore", posted_at: null, valid_through: null, description: "We need React.", easy_apply: true, apply_url: null, found_by: "x",
  }, "2026-10-01T00:00:00.000Z"),
  ...over,
});

test("groundCv keeps real facts and removes invented ones", () => {
  const r = groundCv(cv({
    summary: "Engineer. Led 12 people.",
    skills: [{ group: "a", items: ["React", "Java", "C++", "C#", "Kubernetes", "node.js"] }],
    experience: [
      { title: "Software Engineer", company: "Arbisoft", location: "", start: "", end: "", bullets: ["used by 40 staff", "grew revenue 300%"] },
      { title: "CTO", company: "Google", location: "", start: "", end: "", bullets: [] },
    ],
    education: [{ degree: "BS", school: "FAST NUCES", year: "2021" }, { degree: "MS", school: "MIT", year: "" }],
    certifications: ["AWS Solutions Architect"],
    awards: [{ title: "Software Engineer", detail: "Picked as the best of 40 staff." }, { title: "Turing Award", detail: "" }, { title: "Arbisoft", detail: "Won out of 900 teams." }],
  }), MASTER);
  assert.deepEqual(r.cv.skills[0]!.items, ["React", "C++", "C#", "node.js"]); // "Java" is not "JavaScript"
  assert.deepEqual(r.cv.experience.map((e) => e.company), ["Arbisoft"]);
  assert.deepEqual(r.cv.experience[0]!.bullets, ["used by 40 staff"]);
  assert.deepEqual(r.cv.education.map((e) => e.school), ["FAST NUCES"]);
  assert.deepEqual(r.cv.certifications, []);
  assert.deepEqual(r.cv.awards.map((a) => a.title), ["Software Engineer"]); // invented name and invented number both go
  assert.equal(r.cv.summary, "Engineer.");
  assert.ok(r.warnings.length >= 6);
});

test("groundProse drops sentences with numbers from nowhere, keeps the job's own numbers", () => {
  const r = groundProse("I cut response time by 35%. I managed 20 engineers.\n\nYou need 3+ years, which I have.", MASTER, "Minimum 3 years required");
  assert.equal(r.text, "I cut response time by 35%.\n\nYou need 3+ years, which I have.");
  assert.equal(r.warnings.length, 1);
});

test("answerFor answers truthfully or not at all", () => {
  assert.equal(answerFor("How many years of experience do you have with React?", profile), "3");
  assert.equal(answerFor("Do you have at least 5 years of experience with React?", profile, "choice"), "No");
  assert.equal(answerFor("Do you have 2+ years of experience with TypeScript?", profile, "choice"), "Yes");
  assert.equal(answerFor("Do you have experience with React?", profile, "choice"), "Yes");
  assert.equal(answerFor("Do you have experience with Kotlin?", profile, "choice"), undefined);
  assert.equal(answerFor("Do you have a security clearance?", profile, "choice"), undefined);
  assert.equal(answerFor("Will you require visa sponsorship?", profile, "choice"), "No");
  assert.equal(answerFor("What is your expected salary?", profile), undefined); // empty in the example
});

test("pickOption matches text and numeric ranges", () => {
  const opts = ["Select an option", "0-1", "2-4", "5+"];
  assert.equal(pickOption(opts, "3"), "2-4");
  assert.equal(pickOption(opts, "7"), "5+");
  assert.equal(pickOption(["Select an option", "Yes", "No"], "yes"), "Yes");
  assert.equal(pickOption(["Select an option", "Yes", "No"], "Maybe"), undefined);
});

test("findEmails only takes real addresses from the post", () => {
  assert.deepEqual(findEmails("Send CV to HR@Acme.pk. or careers@acme.com, noreply@x.com logo@2x.png"), ["hr@acme.pk", "careers@acme.com"]);
});

test("closedReason spots closed posts and passed closing dates", () => {
  const now = new Date("2026-10-01");
  assert.match(closedReason("No longer accepting applications", null, now)!, /no longer accepting/i);
  assert.match(closedReason("", "2026-09-01", now)!, /closing date passed/);
  assert.equal(closedReason("We are hiring!", "2026-12-01", now), null);
});

test("htmlToText keeps line breaks and bullets", () => {
  assert.equal(htmlToText("<p>Hi&amp;bye</p><ul><li>One</li><li>Two</li></ul>"), "Hi&bye\n- One\n- Two");
});

test("roleKey merges the same role across sites and reposts", () => {
  assert.equal(roleKey("Acme (Pvt) Ltd", "React Developer (Remote)"), roleKey("acme", "React Developer - Urgent Hiring"));
  assert.equal(roleKey("", "React Developer"), ""); // unknown company: never merged
});

test("the job list is saved even when the data folder does not exist yet", async () => {
  const path = join(mkdtempSync(join(tmpdir(), "jf-test-")), "not", "made", "yet", "jobs.json");
  const store = await JobStore.load(path);
  await store.put(job({ id: "linkedin:1" }));
  assert.equal(JSON.parse(readFileSync(path, "utf8")).jobs["linkedin:1"].id, "linkedin:1");
});

test("reposts become duplicates, and 3+ reposts flag a ghost job", async () => {
  const store = await JobStore.load(join(mkdtempSync(join(tmpdir(), "jf-test-")), "jobs.json"));
  const first = job({ id: "linkedin:1", score: 85, status: "review", created_at: "2026-09-01T00:00:00.000Z" });
  await store.put(first);
  const second = job({ id: "linkedin:2", created_at: "2026-09-10T00:00:00.000Z" });
  assert.equal(await markIfDuplicate(second, store), true);
  assert.equal(store.get("linkedin:2")!.status, "duplicate");
  assert.equal(store.get("linkedin:2")!.duplicate_of, "linkedin:1");
  assert.equal(await markIfDuplicate(job({ id: "linkedin:3" }), store), true);
  assert.ok(store.get("linkedin:1")!.flags.some((f) => f.includes("ghost")));
  assert.equal(autoBlocker(store.get("linkedin:1")!), "possible ghost job");
  // a role whose only earlier copy closed is scored again
  const store2 = await JobStore.load(join(mkdtempSync(join(tmpdir(), "jf-test-")), "jobs.json"));
  await store2.put(job({ id: "linkedin:9", status: "closed" }));
  const reopened = job({ id: "linkedin:10" });
  assert.equal(await markIfDuplicate(reopened, store2), false);
  assert.match(reopened.flags[0]!, /posted again after closing/);
});

test("knock-outs and red flags stop auto apply", () => {
  const strong = job({ score: 90 });
  assert.equal(nextStatus(strong, profile), "to_apply");
  assert.equal(nextStatus(job({ score: 90, knockouts: ["Needs 5+ years"] }), profile), "review");
  assert.equal(nextStatus(job({ score: 90, red_flags: ["asks for a fee"] }), profile), "review");
  assert.equal(nextStatus(job({ score: 70 }), profile), "review"); // below auto_min_score
  assert.equal(nextStatus(job({ score: 90, source: "rozee", easy_apply: false, emails: ["hr@a.pk"] }), profile), "email_ready");
  assert.equal(nextStatus(job({ score: 90, source: "web", easy_apply: false }), profile), "apply_on_site");
});

test("Easy Apply queue: 'prepare' fills in every good LinkedIn match once; 'auto' sends only 'Will auto apply'", () => {
  const cv = { pdf: "x", html: "x", data: {} as never, warnings: [] };
  const preview = { fields: [], checked_at: "2026-10-01T00:00:00Z" };
  const jobs = [
    job({ id: "linkedin:a", status: "to_apply", score: 85, cv }),
    job({ id: "linkedin:b", status: "review", score: 90, cv }),
    job({ id: "linkedin:e", status: "awaiting_ok", score: 92, cv, preview }),    // already filled in: waits for you
    job({ id: "linkedin:f", status: "review", score: 70, cv, preview }),         // already filled in once
    job({ id: "rozee:c", source: "rozee", easy_apply: false, status: "apply_on_site", score: 95, cv }),
    job({ id: "linkedin:d", status: "to_apply", score: 99, cv: null }),          // no CV yet
  ];
  assert.deepEqual(applyQueue(jobs, "prepare").map((j) => j.id), ["linkedin:b", "linkedin:a"]);
  assert.deepEqual(applyQueue(jobs, "auto").map((j) => j.id), ["linkedin:a"]);
});

test("follow-ups are due after the configured days, once", () => {
  const now = new Date("2026-10-10T00:00:00Z").getTime();
  const j = job({ status: "emailed", emailed_at: "2026-10-01T00:00:00.000Z", email: { to: "hr@a.pk", subject: "Application for React Developer", body: "" } });
  assert.equal(followUpDue(j, 7, now), true);
  assert.equal(followUpDue({ ...j, followed_up_at: "2026-10-09T00:00:00.000Z" }, 7, now), false);
  assert.equal(followUpDue(j, 14, now), false);
  const d = followUpDraft(j, profile.me);
  assert.equal(d.to, "hr@a.pk");
  assert.equal(d.subject, "Re: Application for React Developer");
  assert.match(d.body, /React Developer role at Acme by email/);
});

test("insights counts the funnel", () => {
  const s = insights([
    job({ id: "a", score: 90, status: "applied", applied_at: "2026-10-01T00:00:00.000Z", missing_skills: ["GraphQL"] }),
    job({ id: "b", score: 75, status: "interview", applied_at: "2026-10-01T00:00:00.000Z", missing_skills: ["GraphQL (required)"] }),
    job({ id: "c", score: 30, status: "not_a_fit", knockouts: ["Needs 8 years"] }),
  ], 7, new Date("2026-10-02").getTime());
  assert.equal(s.funnel.sent, 2);
  assert.equal(s.funnel.interviews, 1);
  assert.equal(s.reply_rate, 50);
  assert.deepEqual(s.skills_to_learn[0], { label: "GraphQL", n: 2 });
  assert.equal(s.knockouts[0]!.n, 1);
});
