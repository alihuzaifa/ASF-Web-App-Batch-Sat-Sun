// `npm test` — reading replies from the inbox (with a fake inbox and the fake claude) and the summary email.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import nodemailer from "nodemailer";

const tmp = mkdtempSync(join(tmpdir(), "jf-notify-"));
process.env.JF_DATA_DIR = join(tmp, "data");
process.env.JF_LOG_DIR = join(tmp, "logs");
process.env.CLAUDE_BIN = fileURLToPath(new URL("./fake-claude.mjs", import.meta.url));
delete process.env.FAKE_CLAUDE_FAIL_ONCE;

const { parseProfile } = await import("../src/config/profile.js");
const { checkReplies, matchJob } = await import("../src/inbox/replies.js");
const { afterRun, newJob } = await import("../src/pipeline.js");
const { buildSummary } = await import("../src/notify/summary.js");
const { JobStore } = await import("../src/store.js");
const { RunLogger } = await import("../src/lib/logger.js");
type MailHeader = import("../src/inbox/replies.js").MailHeader;

const profile = parseProfile(JSON.parse(readFileSync(new URL("../config/profile.example.json", import.meta.url), "utf8")));
const applied = "2026-09-20T10:00:00.000Z";

function job(id: string, over: Record<string, unknown>) {
  return { ...newJob({ id, source: "linkedin" as const, url: "https://x", title: "React Developer", company: "Acme", location: "Lahore",
    posted_at: null, valid_through: null, description: "x", easy_apply: true, apply_url: null, found_by: "t" }, applied), created_at: applied, ...over };
}
const h = (uid: number, from: string, subject: string, date = "2026-09-25T09:00:00Z"): MailHeader => ({ uid, from, fromName: "", subject, date: new Date(date) });

/** A fake mailbox: records which message texts were opened and what was put into Drafts. */
function inbox(messages: Array<MailHeader & { text: string }>, sent: Array<{ to: string[]; subject: string; date: Date }> = []) {
  const opened: number[] = [];
  const drafts: string[] = [];
  return {
    opened,
    drafts,
    source: {
      headers: async () => messages.map(({ text: _t, ...rest }) => rest),
      text: async (uid: number) => (opened.push(uid), messages.find((m) => m.uid === uid)!.text),
      sent: async () => sent,
      saveDraft: async (raw: Buffer) => (drafts.push(raw.toString()), "[Gmail]/Drafts"),
      close: async () => {},
    },
  };
}

test("matching a reply to the right application", () => {
  const emailed = job("a", { status: "emailed", emailed_at: applied, company: "Arbisoft", email: { to: "hr@arbisoft.com", subject: "s", body: "b" } });
  const linked = job("b", { status: "applied", applied_at: applied, company: "Systems Limited" });
  const jobs = [emailed, linked];
  assert.equal(matchJob(h(1, "hr@arbisoft.com", "Re: Application"), jobs)?.id, "a");               // the address you wrote to
  assert.equal(matchJob(h(2, "talent@arbisoft.com", "Interview"), jobs)?.id, "a");                // same company domain
  assert.equal(matchJob(h(3, "careers@systemsltd.com", "Your application"), jobs)?.id, "b");      // company name in the domain
  assert.equal(matchJob(h(7, "careers@othercorp.com", "Your application"), jobs), null);         // unrelated company: no guess
  assert.equal(matchJob(h(4, "jobs-noreply@linkedin.com", "Your application to React Developer at Systems Limited"), jobs)?.id, "b");
  assert.equal(matchJob(h(5, "someone@gmail.com", "Arbisoft opening"), jobs), null);             // free mail is never matched by name
  assert.equal(matchJob(h(6, "hr@arbisoft.com", "Old thread", "2026-09-01T00:00:00Z"), jobs), null); // before you applied
});

test("replies update the job, only matched emails are opened, and nothing is read twice", async () => {
  const store = await JobStore.load(join(tmp, "jobs-r.json"));
  await store.put(job("linkedin:1", { status: "emailed", emailed_at: applied, company: "Arbisoft", email: { to: "hr@arbisoft.com", subject: "s", body: "b" } }));
  await store.put(job("linkedin:2", { status: "applied", applied_at: applied, company: "Netsol" }));
  await store.put(job("linkedin:3", { status: "applied", applied_at: applied, company: "Contour" }));
  const box = inbox([
    { ...h(10, "newsletter@shop.pk", "Big sale"), text: "private stuff" },
    { ...h(11, "hr@arbisoft.com", "Re: Application"), text: "We would like to schedule a call for an interview." },
    { ...h(12, "jobs-noreply@linkedin.com", "Your application to React Developer at Netsol"), text: "Unfortunately we chose other candidates." },
    { ...h(13, "talent@contour.com", "Hello"), text: "maybe we talk" }, // low confidence: noted, status unchanged
  ]);
  const r = await checkReplies(store, box.source, { now: new Date("2026-09-30") });
  assert.equal(r.checked, 4);
  assert.equal(r.matched, 3);
  assert.deepEqual(box.opened.sort(), [11, 12, 13]); // the newsletter was never opened
  assert.equal(store.get("linkedin:1")!.status, "interview");
  assert.equal(store.get("linkedin:2")!.status, "rejected");
  assert.equal(store.get("linkedin:3")!.status, "applied");
  assert.equal(store.get("linkedin:1")!.replies[0]!.kind, "interview");
  const again = await checkReplies(store, inbox([{ ...h(11, "hr@arbisoft.com", "Re: Application"), text: "interview" }]).source, { now: new Date("2026-09-30") });
  assert.equal(again.checked, 0);
  assert.equal(store.get("linkedin:1")!.replies.length, 1);
});

test("an offer is not undone by a later automatic mail", async () => {
  const store = await JobStore.load(join(tmp, "jobs-o.json"));
  await store.put(job("linkedin:9", { status: "offer", applied_at: applied, company: "Acme", email: { to: "hr@acme.pk", subject: "s", body: "b" } }));
  await checkReplies(store, inbox([{ ...h(50, "hr@acme.pk", "Update"), text: "Unfortunately the position is filled." }]).source, { now: new Date("2026-09-30") });
  assert.equal(store.get("linkedin:9")!.status, "offer");
});

const summaryBase = { found: 20, new_jobs: 8, closed: 1, duplicates: 2, scored: 5, good_matches: 2, cvs: 2, applied: 1, email_ready: 1, needs_you: 0, awaiting_ok: 0, errors: 0, cost_usd: 0.42 };

test("summary email: what is new and what waits, sent to you only; nothing new = no email", async () => {
  const since = new Date("2026-10-01T08:00:00Z");
  const store = await JobStore.load(join(tmp, "jobs-s.json"));
  await store.put(job("linkedin:20", { score: 88, status: "applied", applied_at: "2026-10-01T09:00:00Z", created_at: "2026-10-01T08:30:00Z", title: "Frontend Engineer", company: "Arbisoft" }));
  await store.put(job("linkedin:21", { score: 75, status: "email_ready", created_at: "2026-10-01T08:31:00Z", company: "Netsol" }));
  await store.put(job("linkedin:22", { score: 30, status: "not_a_fit", created_at: "2026-10-01T08:32:00Z" }));

  const transport = nodemailer.createTransport({ streamTransport: true, buffer: true });
  const sent: string[] = [];
  const real = transport.sendMail.bind(transport);
  transport.sendMail = (async (m: Parameters<typeof real>[0]) => { const i = await real(m); sent.push((i as unknown as { message: Buffer }).message.toString()); return i; }) as typeof transport.sendMail;
  const events: string[] = [];
  const empty = inbox([]);
  await afterRun(profile, store, summaryBase, since, ["linkedin.com is limiting automated reading."], false, (e) => events.push(e.type), new RunLogger("t"), { source: empty.source, transport });

  assert.equal(sent.length, 1);
  const mail = sent[0]!;
  assert.match(mail, /^To: your\.email@gmail\.com/m);              // profile.me.email: your own address
  assert.match(mail, /^Subject: Job Finder: 1 applied, 2 new good matches, 1 email to send/m);
  assert.match(mail, /Frontend Engineer - Arbisoft/);
  assert.match(mail, /1 email ready in the dashboard \(no address yet, or email not set up\)/);
  assert.match(mail, /linkedin\.com is limiting/);
  assert.doesNotMatch(mail, /30 {2}React Developer/);              // not-a-fit jobs are left out
  assert.ok(events.includes("summary_sent"));

  const quiet = await JobStore.load(join(tmp, "jobs-q.json"));
  assert.equal(buildSummary({ summary: { ...summaryBase, found: 0, new_jobs: 0 }, jobs: quiet.all(), since, replies: null, notices: [], profile, dashboardUrl: "x" }), null);
});

const { saveDrafts, checkSent } = await import("../src/inbox/mail.js");
const { writeFileSync } = await import("node:fs");

test("Gmail drafts: each ready email goes into Drafts once, with the CV attached; nothing is sent", async () => {
  const store = await JobStore.load(join(tmp, "jobs-d.json"));
  const pdf = join(tmp, "Your Name CV.pdf");
  writeFileSync(pdf, "%PDF-1.4 test cv");
  const cv = { pdf, html: "", data: {} as never, warnings: [] };
  await store.put(job("linkedin:30", { status: "email_ready", cv, email: { to: "hr@arbisoft.com", subject: "Application for React Developer - Your Name", body: "Dear Hiring Team,\n\nBest regards," } }));
  await store.put(job("linkedin:31", { status: "email_ready", cv, email: { to: "", subject: "s", body: "b" } })); // no address yet
  await store.put(job("linkedin:32", { status: "review", cv, email: { to: "a@b.pk", subject: "s", body: "b" } }));   // not an email job
  const box = inbox([]);
  const saved = await saveDrafts(store, box.source, profile.me);
  assert.deepEqual(saved.map((s) => s.id), ["linkedin:30"]);
  assert.equal(box.drafts.length, 1);
  const raw = box.drafts[0]!;
  assert.match(raw, /^To: hr@arbisoft\.com/m);
  assert.match(raw, /^Subject: Application for React Developer - Your Name/m);
  assert.match(raw, /filename="Your Name CV\.pdf"/);
  assert.match(raw, /Best regards,\r?\n\r?\n--\r?\nYour Name/);
  assert.equal(store.get("linkedin:30")!.draft!.mailbox, "[Gmail]/Drafts");
  assert.equal(store.get("linkedin:30")!.status, "email_ready");  // still waiting for you to send it
  assert.equal(store.get("linkedin:30")!.emailed_at, null);
  assert.equal((await saveDrafts(store, box.source, profile.me)).length, 0); // not drafted twice
});

test("a draft you sent from Gmail is noticed in Sent and the job becomes Email sent", async () => {
  const store = await JobStore.load(join(tmp, "jobs-sent.json"));
  const draft = { saved_at: "2026-10-01T09:00:00.000Z", mailbox: "[Gmail]/Drafts" };
  await store.put(job("linkedin:40", { status: "email_ready", draft, email: { to: "hr@arbisoft.com", subject: "Application for React Developer", body: "b" } }));
  await store.put(job("linkedin:41", { status: "email_ready", draft, email: { to: "jobs@netsol.com", subject: "Application for QA", body: "b" } }));
  const marked = await checkSent(store, inbox([], [
    { to: ["hr@arbisoft.com"], subject: "Application for React Developer", date: new Date("2026-10-01T11:00:00Z") },
    { to: ["jobs@netsol.com"], subject: "Something else", date: new Date("2026-10-01T11:00:00Z") },
  ]).source);
  assert.deepEqual(marked, ["linkedin:40"]);
  assert.equal(store.get("linkedin:40")!.status, "emailed");
  assert.equal(store.get("linkedin:40")!.emailed_at, "2026-10-01T11:00:00.000Z");
  assert.equal(store.get("linkedin:41")!.status, "email_ready");
});

test("summary lists the forms waiting for your OK with their answers, and the Gmail drafts", () => {
  const since = new Date("2026-10-01T08:00:00Z");
  const fields = [
    { step: 1, question: "Mobile phone number", answer: "+92 300 0000000", how: "your settings" as const },
    { step: 3, question: "How many years of experience do you have with React?", answer: "3", how: "your settings" as const },
  ];
  const s = buildSummary({
    summary: summaryBase, since, replies: null, notices: [], profile, dashboardUrl: "http://localhost:3100",
    jobs: [
      job("linkedin:50", { status: "awaiting_ok", score: 86, created_at: "2026-10-01T08:10:00Z", preview: { fields, checked_at: "2026-10-01T08:20:00Z" } }),
      job("linkedin:51", { status: "email_ready", score: 70, created_at: "2026-10-01T08:11:00Z", draft: { saved_at: "x", mailbox: "[Gmail]/Drafts" } }),
    ] as never,
  })!;
  assert.match(s.subject, /1 waiting for your OK/);
  assert.match(s.body, /WAITING FOR YOUR OK \(1\): LinkedIn forms filled in, nothing sent yet/);
  assert.match(s.body, /How many years of experience do you have with React\?: 3/);
  assert.match(s.body, /1 application email in your Gmail Drafts, with the CV attached/);
});
