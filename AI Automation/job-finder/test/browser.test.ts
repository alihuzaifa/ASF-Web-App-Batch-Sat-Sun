// `npm test` — real browser checks, no internet: the parsers against saved copies of LinkedIn / Rozee pages
// (test/fixtures, refresh with `npm run fixtures:capture`), the Easy Apply filler against a local form,
// CV / cover letter PDFs, and the email that would be sent.
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, statSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { chromium, type Browser } from "playwright";
import { followUpDraft, sendEmail } from "../src/apply/email.js";
import { easyApply, type FilledField } from "../src/apply/easy-apply.js";
import { parseProfile } from "../src/config/profile.js";
import { renderCoverLetter, renderCv } from "../src/cv/render.js";
import { parseJobDetail, parseSearchPage } from "../src/search/linkedin.js";
import { parsePosting } from "../src/search/posting.js";
import { parseRozeeLinks } from "../src/search/rozee.js";
import nodemailer from "nodemailer";

process.env.JF_DATA_DIR ??= mkdtempSync(join(tmpdir(), "jf-browser-")); // PDFs go to a temp folder (paths.ts reads this at import)

const FIX = new URL("./fixtures/", import.meta.url);
const fixture = (name: string) => readFileSync(new URL(name, FIX), "utf8");
const profile = parseProfile(JSON.parse(readFileSync(new URL("../config/profile.example.json", import.meta.url), "utf8")));

let browser: Browser;
let server: Server;
let base = "";
const submissions: Record<string, unknown>[] = [];
let discards = 0;

before(async () => {
  browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL === "chromium" ? undefined : process.env.BROWSER_CHANNEL ?? "chrome" });
  server = createServer((req, res) => {
    if (req.method === "POST" && req.url === "/submit") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => { submissions.push(JSON.parse(body)); res.end("ok"); });
      return;
    }
    if (req.method === "POST" && req.url === "/discard") { discards++; return res.end("ok"); }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(fixture("easy-apply.html"));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
});

after(async () => {
  await browser?.close();
  server?.close();
});

async function onPage<T>(html: string, url: string, fn: (p: import("playwright").Page) => Promise<T>): Promise<T> {
  const page = await browser.newPage();
  try {
    // Serve the saved page for the main document only; images, styles and scripts are blocked (stays offline).
    await page.route("**/*", (route) =>
      route.request().url() === url ? route.fulfill({ contentType: "text/html; charset=utf-8", body: html }) : route.abort());
    await page.goto(url, { waitUntil: "domcontentloaded" });
    return await fn(page);
  } finally {
    await page.close();
  }
}

test("LinkedIn search page: job cards parse", async () => {
  const jobs = await onPage(fixture("linkedin-search.html"), "https://www.linkedin.com/jobs-guest/x", (p) => parseSearchPage(p, "React / Pakistan", false));
  assert.ok(jobs.length >= 5, `expected job cards, got ${jobs.length}`);
  for (const j of jobs) {
    assert.match(j.linkedin_id, /^\d+$/);
    assert.ok(j.title.length > 2 && j.company.length > 0, JSON.stringify(j));
    assert.equal(j.url, `https://www.linkedin.com/jobs/view/${j.linkedin_id}/`);
    assert.equal(j.easy_apply, null);
  }
});

test("LinkedIn job page: description and Easy Apply detected", async () => {
  const d = await onPage(fixture("linkedin-detail-easy-apply.html"), "https://www.linkedin.com/jobs-guest/y", parseJobDetail);
  assert.ok(d.description.length > 200, "description too short");
  assert.equal(d.easy_apply, true);
  assert.equal(d.closed, null);
  assert.doesNotMatch(d.description, /^Show more/m);
});

test("LinkedIn job page: a closed post is detected", async () => {
  const html = fixture("linkedin-detail-easy-apply.html").replace(/(<div[^>]*class="[^"]*top-card-layout[^"]*"[^>]*>)/, "$1<span>No longer accepting applications</span>");
  const d = await onPage(html, "https://www.linkedin.com/jobs-guest/z", parseJobDetail);
  assert.match(d.closed ?? "", /no longer accepting/i);
});

test("Rozee search page: job links parse", async () => {
  const jobs = await onPage(fixture("rozee-search.html"), "https://www.rozee.pk/job/jsearch/q/react", (p) => parseRozeeLinks(p, "Rozee: react"));
  assert.ok(jobs.length >= 5, `expected Rozee links, got ${jobs.length}`);
  for (const j of jobs) {
    assert.match(j.rozee_id, /^\d+$/);
    assert.match(j.url, /^https:\/\/www\.rozee\.pk\/.+-jobs-\d+$/);
    assert.ok(j.title.length > 2);
  }
  assert.equal(new Set(jobs.map((j) => j.rozee_id)).size, jobs.length, "duplicate ids");
});

test("Job page with schema.org JobPosting: fields and closing date", async () => {
  const name = existsSync(new URL("rozee-detail.html", FIX)) ? "rozee-detail.html" : null;
  const html = name ? fixture(name) : `<html><head><title>x</title><script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org/", "@type": "JobPosting", title: "React Native Developer", datePosted: "2026-09-26", validThrough: "2099-01-01",
    description: "<p>We need <b>React Native</b>.</p><ul><li>2-3 years</li></ul>", hiringOrganization: { name: "Acme" },
    jobLocation: { address: { addressLocality: "Lahore", addressCountry: "Pakistan" } },
  })}</script></head><body><main>Apply now</main></body></html>`;
  const p = await onPage(html, "https://www.rozee.pk/some-job-jobs-1", parsePosting);
  assert.ok(p, "no posting parsed");
  assert.ok(p.title.length > 2 && p.company.length > 0, JSON.stringify({ title: p.title, company: p.company }));
  assert.ok(p.description.length > 20);
  assert.doesNotMatch(p.description, /<[a-z]+[ >]/i, "HTML left in description");
  const expired = html.replace(/"validThrough":"[^"]+"/, '"validThrough":"2020-01-01T00:00:00+05:00"');
  const old = await onPage(expired, "https://www.rozee.pk/some-job-jobs-1", parsePosting);
  assert.match(old?.closed ?? "", /closing date passed/);
});

const cv = {
  headline: "Full Stack Developer", summary: "Builds web apps.", skills: [{ group: "Frontend", items: ["React", "TypeScript"] }],
  experience: [{ title: "Engineer", company: "Arbisoft", location: "Lahore", start: "2023", end: "Present", bullets: ["Built a dashboard <script>x</script>"] }],
  projects: [], education: [{ degree: "BS CS", school: "FAST", year: "2021" }], certifications: [], languages: ["English"],
  awards: [{ title: "Star Performer", detail: "Given for the year's best work." }],
};

test("CV and cover letter PDFs are written and readable", async () => {
  const files = await renderCv(browser, "test:job/1", cv, profile.me);
  assert.ok(statSync(files.pdf).size > 5000);
  assert.ok(readFileSync(files.pdf).subarray(0, 5).toString() === "%PDF-");
  assert.match(readFileSync(files.html, "utf8"), /&lt;script&gt;/, "CV text must be escaped");
  const cover = await renderCoverLetter(browser, "test:job/1", "Dear Hiring Manager,\n\nHello.\n\nBest regards,\nYour Name", profile.me);
  assert.ok(readFileSync(cover).subarray(0, 5).toString() === "%PDF-");
});

test("email: right recipient, subject, signature and attachments", async () => {
  const files = await renderCv(browser, "test:mail", cv, profile.me);
  const transport = nodemailer.createTransport({ streamTransport: true, buffer: true });
  let raw = "";
  const real = transport.sendMail.bind(transport);
  transport.sendMail = (async (mail: Parameters<typeof real>[0]) => {
    const info = await real(mail);
    raw = (info as unknown as { message: Buffer }).message.toString();
    return info;
  }) as typeof transport.sendMail;
  await sendEmail({ to: "hr@acme.pk", subject: "Application for React Developer", body: "Dear Hiring Team,\n\nBest regards,", attachments: [files.pdf], me: profile.me }, transport);
  assert.match(raw, /^To: hr@acme\.pk/m);
  assert.match(raw, /^Subject: Application for React Developer/m);
  assert.match(raw, /Your Name CV\.pdf/);
  assert.match(raw, /Best regards,\r?\n\r?\n--\r?\nYour Name\r?\n\+92 300 0000000/);
  assert.equal(followUpDraft({ title: "React Developer", company: "Acme", source: "linkedin", applied_at: "2026-10-01T00:00:00Z", emailed_at: null, email: null } as never, profile.me).subject,
    "Following up: React Developer - Your Name");
});

const files = () => ({ cvPdf: join(process.env.JF_DATA_DIR!, "cv-test.pdf"), coverLetter: "Dear Hiring Manager, I would like to apply." });

async function apply(query: string, submit: boolean, approved?: FilledField[]) {
  const f = files();
  if (!existsSync(f.cvPdf)) (await import("node:fs")).writeFileSync(f.cvPdf, "%PDF-1.4 test");
  const ctx = await browser.newContext();
  try {
    return await easyApply(ctx, `${base}/jobs/view/1/${query}`, f, profile, { submit, approved });
  } finally {
    await ctx.close();
  }
}

test("Easy Apply, fill in only: shows every answer it would send, sends nothing", async () => {
  submissions.length = 0;
  const d0 = discards;
  const r = await apply("", false);
  assert.equal(r.kind, "tested");
  const fields = r.kind === "tested" ? r.fields : [];
  const got = Object.fromEntries(fields.map((f) => [f.question, `${f.answer} [${f.how}]`]));
  assert.deepEqual(got, {
    "First name": "Test [filled by LinkedIn]",                 // LinkedIn's own value is shown too
    "Mobile phone number": "+92 300 0000000 [your settings]",
    "Resume": "cv-test.pdf [CV file]",
    "How many years of experience do you have with React?": "3 [your settings]",
    "Are you legally authorized to work in Pakistan?": "Yes [your settings]",
    "Do you have at least 5 years of experience with React?": "No [your settings]",
    "Cover letter": "Dear Hiring Manager, I would like to apply. [cover letter]",
    "Follow the company": "No [unticked]",
  });
  assert.deepEqual([...new Set(fields.map((f) => f.step))], [1, 2, 3, 4]);
  assert.equal(submissions.length, 0);
  assert.equal(discards, d0 + 1);
});

test("Easy Apply, approve: sends exactly the approved answers", async () => {
  const preview = await apply("", false);
  submissions.length = 0;
  const r = await apply("", true, preview.kind === "tested" ? preview.fields : []);
  assert.equal(r.kind, "applied");
  assert.equal(submissions.length, 1);
  const s = submissions[0]!;
  assert.equal(s.fn, "Test");                      // prefilled by LinkedIn: left alone
  assert.equal(s.ph, "+92 300 0000000");           // from profile
  assert.equal(s.cv, "cv-test.pdf");               // tailored CV uploaded
  assert.equal(s.yrs, "3");                        // skill_years.react
  assert.equal(s.auth, "auth-y");                  // answers.questions: authorized -> Yes
  assert.equal(s.five, "No");                      // 5+ years React? 3 < 5, so the truthful No
  assert.equal(s.cl, "Dear Hiring Manager, I would like to apply.");
  assert.equal(s["follow-company-checkbox"], false); // "follow company" unticked
});

test("Easy Apply, approve: if the form changed since you looked, nothing is sent", async () => {
  const preview = await apply("", false);
  submissions.length = 0;
  const d0 = discards;
  const r = await apply("?extra=1", true, preview.kind === "tested" ? preview.fields : []); // LinkedIn added a question
  assert.equal(r.kind, "changed");
  assert.deepEqual(r.kind === "changed" ? r.differences : [], ["new or different: What is your notice period? = 2 weeks"]);
  assert.equal(submissions.length, 0);
  assert.equal(discards, d0 + 1);
});

test("Easy Apply: unknown required question stops without sending", async () => {
  submissions.length = 0;
  const r = await apply("?unknown=1", false);
  assert.equal(r.kind, "needs_you");
  assert.deepEqual(r.kind === "needs_you" ? r.questions : [], ["Do you have an active security clearance?"]);
  assert.equal(submissions.length, 0);
});

test("Easy Apply: already applied and external-only jobs are recognised", async () => {
  assert.deepEqual(await apply("?applied=1", false), { kind: "already_applied" });
  assert.deepEqual(await apply("?external=1", false), { kind: "not_easy_apply", apply_url: "https://careers.acme.example/apply/1" });
});

test("approval flow on a job: fill in → Waiting for your OK → approve → Applied", async () => {
  const { JobStore } = await import("../src/store.js");
  const { applyOne, newJob } = await import("../src/pipeline.js");
  const store = await JobStore.load(join(process.env.JF_DATA_DIR!, "jobs-approve.json"));
  const f = files();
  const j = { ...newJob({ id: "linkedin:77", source: "linkedin", url: `${base}/jobs/view/77/`, title: "React Developer", company: "Acme", location: "",
    posted_at: null, valid_through: null, description: "x", easy_apply: true, apply_url: null, found_by: "t" }, new Date().toISOString()),
    status: "review" as const, cv: { pdf: f.cvPdf, html: "", data: {} as never, warnings: [] }, cover_letter: { text: f.coverLetter, pdf: f.cvPdf } };
  await store.put(j);
  const ctx = await browser.newContext();
  try {
    submissions.length = 0;
    await assert.rejects(applyOne(ctx, store.get("linkedin:77")!, profile, store, "approve", () => {}), /fill in the form first/);
    assert.equal(await applyOne(ctx, store.get("linkedin:77")!, profile, store, "prepare", () => {}), "tested");
    assert.equal(store.get("linkedin:77")!.status, "awaiting_ok");
    assert.equal(store.get("linkedin:77")!.preview!.fields.length, 8);
    assert.equal(submissions.length, 0);
    assert.equal(await applyOne(ctx, store.get("linkedin:77")!, profile, store, "approve", () => {}), "applied");
    assert.equal(store.get("linkedin:77")!.status, "applied");
    assert.ok(store.get("linkedin:77")!.applied_at);
    assert.equal(submissions.length, 1);
  } finally {
    await ctx.close();
  }
});
