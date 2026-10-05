// `npm test` — the dashboard, end to end: starts `npm run ui` on a temp data folder with seeded jobs,
// then clicks through it in a real browser. Also checks the local-only guards. No internet.
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";
import { request } from "node:http";
import { chromium, type Browser, type Page } from "playwright";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), "jf-ui-"));
const data = join(tmp, "data");
const port = 31000 + Math.floor(Math.random() * 2000);
const base = `http://localhost:${port}`;
const now = new Date();
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString();

function seedJob(id: string, over: Record<string, unknown>) {
  return {
    id, source: "linkedin", url: "https://www.linkedin.com/jobs/view/1/", title: "React Developer", company: "Acme", location: "Lahore",
    posted_at: null, valid_through: null, description: "We need React.", easy_apply: true, apply_url: null, emails: [], found_by: "t",
    score: 85, reasoning: "Good match.", matched_skills: ["React"], missing_skills: ["GraphQL"], knockouts: [], red_flags: [], flags: [],
    duplicate_of: null, status: "review", cv: null, cover_letter: null, email: null, needs: [], last_error: null,
    applied_at: null, emailed_at: null, followed_up_at: null, last_checked_at: null, created_at: daysAgo(10), updated_at: daysAgo(10), ...over,
  };
}

let server: ChildProcess;
let browser: Browser;
let page: Page;

before(async () => {
  mkdirSync(data, { recursive: true });
  const cvDir = join(data, "cvs", "a");
  mkdirSync(cvDir, { recursive: true });
  writeFileSync(join(cvDir, "cv.pdf"), "%PDF-1.4 test");
  const jobs = {
    // A web job whose page is this test server's 404, so the "still open?" check before sending stays local.
    "linkedin:a": seedJob("linkedin:a", {
      source: "web", url: `${base}/no-such-job`, status: "email_ready", emails: ["hr@acme.pk"], score: 92, draft: { saved_at: daysAgo(0), mailbox: "[Gmail]/Drafts" },
      cv: { pdf: join(cvDir, "cv.pdf"), html: "", data: {}, warnings: ['removed skill not in your CV: "Rails"'] },
      cover_letter: { text: "Dear Hiring Manager,\n\nHello.", pdf: join(cvDir, "cv.pdf") },
      email: { to: "hr@acme.pk", subject: "Application for React Developer", body: "Dear Hiring Team,\n\nBest regards," },
    }),
    "linkedin:b": seedJob("linkedin:b", { status: "needs_you", needs: ["Do you have a security clearance?"], knockouts: ["Needs 5+ years"] }),
    "linkedin:c": seedJob("linkedin:c", { status: "emailed", emailed_at: daysAgo(9), title: "Frontend Engineer", email: { to: "jobs@b.pk", subject: "Application", body: "x" } }),
    "rozee:d": seedJob("rozee:d", { source: "rozee", status: "not_a_fit", score: 30, title: "PHP Developer" }),
    "linkedin:e": seedJob("linkedin:e", {
      status: "awaiting_ok", score: 60, title: "Next.js Developer",
      cv: { pdf: join(cvDir, "cv.pdf"), html: "", data: {}, warnings: [] },
      preview: { checked_at: daysAgo(0), fields: [
        { step: 1, question: "Mobile phone number", answer: "+92 300 0000000", how: "your settings" },
        { step: 2, question: "Resume", answer: "Your Name CV.pdf", how: "CV file" },
      ] },
    }),
  };
  writeFileSync(join(data, "jobs.json"), JSON.stringify({ version: 1, jobs }));
  const profilePath = join(tmp, "profile.json");
  copyFileSync(join(ROOT, "config", "profile.example.json"), profilePath);
  writeFileSync(join(tmp, "cv.md"), "# My CV\n");

  server = spawn(process.execPath, [join(ROOT, "node_modules", "tsx", "dist", "cli.mjs"), join(ROOT, "src", "ui", "server.ts")], {
    cwd: tmp, // so the real .env is not loaded: no SMTP, nothing can be sent
    env: { ...process.env, JF_DATA_DIR: data, JF_LOG_DIR: join(tmp, "logs"), JF_PROFILE_PATH: profilePath, JF_CV_PATH: join(tmp, "cv.md"), UI_PORT: String(port), SMTP_USER: "", SMTP_PASS: "" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("server did not start")), 30000);
    server.stdout!.on("data", (d) => String(d).includes("dashboard") && (clearTimeout(t), resolve()));
    server.on("exit", (c) => reject(new Error(`server exited ${c}`)));
  });
  browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL === "chromium" ? undefined : process.env.BROWSER_CHANNEL ?? "chrome" });
  page = await browser.newPage({ viewport: { width: 1250, height: 900 } });
  page.on("dialog", (d) => d.accept());
  await page.goto(base);
  await page.waitForSelector("#rows tr");
});

after(async () => {
  await browser?.close();
  server?.kill();
});

test("jobs list: filters and counts", async () => {
  const chips = await page.locator("#chips").innerText();
  assert.match(chips, /Good matches \(4\)/);
  assert.match(chips, /Waiting for your OK \(1\)/);
  assert.match(chips, /Follow up due \(1\)/);
  assert.match(chips, /Not a fit \(1\)/);
  assert.equal(await page.locator("#rows tr").count(), 4);
  assert.match(await page.locator("#rows tr").first().innerText(), /92/); // sorted by score
  assert.equal(await page.locator("#rows tr").nth(1).locator(".bad").count(), 1); // knock-out marker
});

test("job drawer: CV, cover letter, warnings, email draft", async () => {
  await page.locator("#rows tr").first().click();
  const d = page.locator("#drawer");
  await d.getByText("Open CV (PDF)").waitFor();
  assert.equal(await d.getByText("Open cover letter (PDF)").count(), 1);
  assert.match(await d.innerText(), /1 line removed because they were not in your real CV/);
  assert.match(await d.innerText(), /Saved in your Gmail \[Gmail\]\/Drafts on .*with your CV attached/);
  assert.match(await page.locator("#rows tr").first().innerText(), /Draft in Gmail/);
  assert.equal(await d.locator("input[type=text]").first().inputValue(), "hr@acme.pk");
  const pdf = await page.request.get(`${base}/api/jobs/${encodeURIComponent("linkedin:a")}/cv`);
  assert.equal(pdf.headers()["content-type"], "application/pdf");
});

test("Waiting for your OK: the drawer lists every answer and offers Approve; nothing was sent", async () => {
  await page.keyboard.press("Escape");
  await page.locator(".chip", { hasText: "Waiting for your OK" }).click();
  await page.locator("#rows tr").first().click();
  const d = page.locator("#drawer");
  await d.getByText("The form is filled in but NOT sent").waitFor();
  const table = await d.locator("table").innerText();
  assert.match(table, /Mobile phone number\s+\+92 300 0000000\s+your settings/);
  assert.match(table, /Resume\s+Your Name CV\.pdf\s+CV file/);
  assert.equal(await d.getByRole("button", { name: "Approve and send" }).count(), 1);
  assert.equal(await d.getByRole("button", { name: "Fill in again" }).count(), 1);
  const jobs = JSON.parse(readFileSync(join(data, "jobs.json"), "utf8")).jobs;
  assert.equal(jobs["linkedin:e"].applied_at, null);
  await page.keyboard.press("Escape");
  await page.locator(".chip", { hasText: "Good matches" }).click();
  await page.locator("#rows tr").first().click(); // back to the email job for the next test
  await page.locator("#drawer").getByText("Open CV (PDF)").waitFor();
});

test("approving without a filled-in form is refused by the server", async () => {
  const r = await fetch(`${base}/api/jobs/${encodeURIComponent("linkedin:b")}/apply`, {
    method: "POST", headers: { origin: base, "content-type": "application/json" }, body: JSON.stringify({ mode: "approve" }),
  });
  assert.equal(r.status, 400);
  assert.match((await r.json()).error, /Fill in the form first/);
});

test("send email with no SMTP set up fails safely and nothing changes", async () => {
  const d = page.locator("#drawer");
  const asked: string[] = [];
  const onDialog = (dl: import("playwright").Dialog) => asked.push(dl.message());
  page.on("dialog", onDialog);
  await d.getByRole("button", { name: "Send from here instead" }).click();
  await page.waitForFunction(() => /SMTP/.test(document.getElementById("toast")!.innerText), null, { timeout: 30000 });
  page.off("dialog", onDialog);
  assert.match(asked[0] ?? "", /Send this email with your CV to hr@acme.pk/);
  assert.match(asked[1] ?? "", /looks closed[\s\S]*Send anyway/);              // the post 404s → asked before sending
  assert.match(await page.locator("#toast").innerText(), /SMTP_USER and SMTP_PASS are not set/);
  const jobs = JSON.parse(readFileSync(join(data, "jobs.json"), "utf8")).jobs;
  assert.equal(jobs["linkedin:a"].emailed_at, null);
  await page.keyboard.press("Escape");
});

test("status buttons: hide and mark interview", async () => {
  await page.locator(".chip", { hasText: "Follow up due" }).click();
  await page.locator("#rows tr").first().click();
  const d = page.locator("#drawer");
  await d.getByRole("button", { name: /Write follow-up email/ }).click();
  await d.getByRole("button", { name: "Send follow-up" }).waitFor();
  assert.match(await d.locator("textarea").inputValue(), /I applied for the Frontend Engineer role at Acme by email/);
  await d.getByRole("button", { name: "Got an interview" }).click();
  await page.waitForFunction(() => /Interview \(1\)/.test(document.getElementById("chips")!.innerText));
  await page.keyboard.press("Escape");
  const jobs = JSON.parse(readFileSync(join(data, "jobs.json"), "utf8")).jobs;
  assert.equal(jobs["linkedin:c"].status, "interview");
});

test("insights tab shows the funnel", async () => {
  await page.evaluate(() => (location.hash = "insights"));
  await page.waitForFunction(() => document.getElementById("funnel")!.children.length > 0);
  const f = await page.locator("#funnel").innerText();
  assert.match(f, /5\s*jobs seen/);
  assert.match(f, /1\s*interviews/);
  assert.match(await page.locator("#skills").innerText(), /GraphQL/);
});

test("settings: invalid settings are refused, the file is untouched", async () => {
  await page.evaluate(() => (location.hash = "settings"));
  await page.waitForFunction(() => (document.getElementById("profileText") as HTMLTextAreaElement).value.length > 100);
  const before = readFileSync(join(tmp, "profile.json"), "utf8");
  await page.locator("#profileText").fill('{"me": {"name": ""}}');
  await page.getByRole("button", { name: "Save settings" }).click();
  await page.waitForFunction(() => document.getElementById("toast")!.style.display === "block");
  assert.equal(readFileSync(join(tmp, "profile.json"), "utf8"), before);
});

test("run tab: inbox check without email set up explains what to do; site limits are shown", async () => {
  writeFileSync(join(data, "rate-limits.json"), JSON.stringify({ version: 1, sites: {
    "linkedin.com": { day: new Date().toDateString(), pages: 12, last_at: 0, strikes: 1, blocked_until: Date.now() + 3600_000, reason: "HTTP 429" },
  } }));
  await page.evaluate(() => (location.hash = "run"));
  await page.getByRole("button", { name: "Check my inbox for replies" }).click();
  await page.waitForFunction(() => /Email is not set up/.test(document.getElementById("toast")!.innerText));
  const limits = await (await fetch(`${base}/api/limits`)).json();
  assert.ok("linkedin.com" in limits);
});

test("local-only guards: other sites and hosts are refused", async () => {
  const fromOtherSite = await fetch(`${base}/api/runs`, { method: "POST", headers: { origin: "https://evil.example", "content-type": "application/json" }, body: "{}" });
  assert.equal(fromOtherSite.status, 403);
  // fetch() never sends a custom Host header, so use http.request (a DNS-rebinding page would arrive with its own host).
  const wrongHost = await new Promise<number>((resolve, reject) =>
    request({ host: "127.0.0.1", port, path: "/api/jobs", headers: { host: `evil.example:${port}` } }, (res) => resolve(res.statusCode ?? 0)).on("error", reject).end());
  assert.equal(wrongHost, 403);
  const notJson = await fetch(`${base}/api/runs`, { method: "POST", headers: { origin: base }, body: "x" });
  assert.equal(notJson.status, 415);
});
