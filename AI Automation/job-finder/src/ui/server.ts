// `npm run ui` — local dashboard on 127.0.0.1: start runs, watch them live, review jobs, send emails, Easy Apply.
// Nothing is sent anywhere unless you press a button: Send email and Approve both need a click (and a confirm in the page).
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { env } from "../config/env.js";
import { loadProfile, PROFILE_PATH, readMasterCvText, saveMasterCv, saveProfile } from "../config/profile.js";
import { emailConfigured, followUpDraft, sendEmail } from "../apply/email.js";
import { followUpDue, insights } from "../insights.js";
import { openAccountBrowser, openGuestBrowser } from "../lib/browser.js";
import { applyOne, runFind, type RunEvent } from "../pipeline.js";
import { checkStillOpen, type Liveness } from "../search/liveness.js";
import { checkReplies } from "../inbox/replies.js";
import { imapSource, saveDraftFor } from "../inbox/mail.js";
import { throttle } from "../lib/throttle.js";
import { JOB_STATUSES, JobStore } from "../store.js";

const INDEX_HTML = fileURLToPath(new URL("./index.html", import.meta.url));
const MAX_BODY = 300_000;

const StartRunSchema = z.strictObject({
  limit: z.number().int().min(1).max(200).optional(),
  noApply: z.boolean(),
  testApply: z.boolean(),
  noWeb: z.boolean(),
  noNotify: z.boolean().default(false),
});
const PatchJobSchema = z.strictObject({
  status: z.enum(JOB_STATUSES).optional(),
  email: z.strictObject({ to: z.string().max(300), subject: z.string().min(1).max(300), body: z.string().min(1).max(5000) }).optional(),
});
/** "prepare" fills the form and stops before Submit (nothing sent). "approve" sends exactly the answers you saw. */
const ApplySchema = z.strictObject({ mode: z.enum(["prepare", "approve"]), force: z.boolean().default(false) });
const DraftSchema = z.strictObject({ cover: z.boolean().default(false) });
const SendEmailSchema = z.strictObject({ cover: z.boolean().default(false), force: z.boolean().default(false) });
const FollowUpSchema = z.strictObject({ to: z.email(), subject: z.string().min(1).max(300), body: z.string().min(1).max(5000) });
const CvTextSchema = z.strictObject({ text: z.string().min(1).max(MAX_BODY) });
const ProfileBodySchema = z.strictObject({ profile: z.unknown() });

const store = await JobStore.load();
let busy: "run" | "apply" | null = null;
let stopper: AbortController | null = null;
const events: RunEvent[] = [];
const clients = new Set<ServerResponse>();

function broadcast(name: string, data: unknown) {
  const msg = `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const c of clients) c.write(msg);
}
function onEvent(e: RunEvent) {
  events.push(e);
  if (events.length > 2000) events.shift();
  broadcast("run", e);
  if (e.type === "job_done" || e.type === "apply_done") broadcast("jobs_changed", {});
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  if (!/^application\/json/.test(req.headers["content-type"] ?? "")) throw new HttpError(415, "send application/json");
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > MAX_BODY) throw new HttpError(413, "body too large");
    chunks.push(c as Buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    throw new HttpError(400, "invalid JSON");
  }
}

class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

function parse<T extends z.ZodType>(schema: T, v: unknown): z.infer<T> {
  const r = schema.safeParse(v);
  if (!r.success) throw new HttpError(400, z.prettifyError(r.error));
  return r.data;
}

/** Re-reads the public post. Closed → status "closed"; open → just stamps last_checked_at. */
async function liveCheck(id: string): Promise<Liveness> {
  const browser = await openGuestBrowser();
  try {
    const live = await checkStillOpen(browser, job(id));
    const now = new Date().toISOString();
    if (live.open === false) await store.update(id, { status: "closed", last_error: live.reason, last_checked_at: now });
    else if (live.open) await store.update(id, { last_checked_at: now });
    return live;
  } finally {
    await browser.close().catch(() => {});
  }
}

/** Sending to a closed job wastes the application. 409 tells the page to ask "send anyway?" (force). */
async function refuseIfClosed(id: string, force: boolean) {
  if (force) return;
  const live = await liveCheck(id);
  if (live.open === false) throw new HttpError(409, `This job looks closed (${live.reason}). Press again and choose "send anyway" if you are sure.`);
}

/** One email at a time (a double click must not send twice). Independent of runs. */
let sending = false;
async function sendGuarded(send: () => Promise<unknown>) {
  if (sending) throw new HttpError(409, "another email is being sent");
  sending = true;
  try {
    await send();
  } finally {
    sending = false;
  }
}

function job(id: string) {
  const j = store.get(id);
  if (!j) throw new HttpError(404, "job not found");
  return j;
}

async function handle(req: IncomingMessage, res: ServerResponse) {
  const port = env().UI_PORT;
  // Local only: reject other Host headers (DNS rebinding) and cross-site writes.
  if (!new RegExp(`^(localhost|127\\.0\\.0\\.1):${port}$`).test(req.headers.host ?? "")) throw new HttpError(403, "bad host");
  if (req.method !== "GET" && req.headers.origin !== `http://${req.headers.host}`) throw new HttpError(403, "bad origin");

  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  const path = url.pathname;
  const m = /^\/api\/jobs\/([^/]+)(?:\/([a-z-]+))?$/.exec(path);
  const id = m ? decodeURIComponent(m[1]!) : "";

  if (req.method === "GET" && path === "/") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    return res.end(await readFile(INDEX_HTML));
  }

  if (req.method === "GET" && path === "/api/events") {
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" });
    res.write(`event: reset\ndata: {}\n\n`);
    for (const e of events) res.write(`event: run\ndata: ${JSON.stringify(e)}\n\n`);
    res.write(`event: busy\ndata: ${JSON.stringify({ busy })}\n\n`);
    clients.add(res);
    req.on("close", () => clients.delete(res));
    return;
  }

  if (req.method === "GET" && path === "/api/jobs") {
    const jobs = store.all().sort((a, b) => b.created_at.localeCompare(a.created_at));
    const followUpDays = await loadProfile().then((p) => p.apply.follow_up_days, () => 7);
    return json(res, 200, { jobs, busy, applied_today: store.appliedToday(), follow_up_days: followUpDays });
  }

  if (m && req.method === "GET" && (m[2] === "cv" || m[2] === "cover")) {
    const j = job(id);
    const pdf = m[2] === "cv" ? j.cv?.pdf : j.cover_letter?.pdf;
    if (!pdf || !existsSync(pdf)) throw new HttpError(404, `no ${m[2] === "cv" ? "CV" : "cover letter"} for this job`);
    res.writeHead(200, { "content-type": "application/pdf", "content-disposition": `inline; filename="${m[2]}.pdf"` });
    return res.end(await readFile(pdf));
  }

  if (req.method === "GET" && path === "/api/insights") {
    const profile = await loadProfile();
    return json(res, 200, insights(store.all(), profile.apply.follow_up_days));
  }

  if (m && req.method === "POST" && m[2] === "check") {
    job(id);
    const live = await liveCheck(id);
    broadcast("jobs_changed", {});
    return json(res, 200, live);
  }

  if (m && req.method === "GET" && m[2] === "follow-up") {
    const j = job(id);
    const profile = await loadProfile();
    return json(res, 200, { ...followUpDraft(j, profile.me), due: followUpDue(j, profile.apply.follow_up_days) });
  }

  if (m && req.method === "POST" && m[2] === "send-follow-up") {
    const draft = parse(FollowUpSchema, await readJson(req));
    const j = job(id);
    if (j.followed_up_at) throw new HttpError(409, `already followed up on ${j.followed_up_at}`);
    if (!j.cv) throw new HttpError(400, "this job has no CV");
    await sendGuarded(() => loadProfile().then((p) => sendEmail({ ...draft, attachments: [j.cv!.pdf], me: p.me })));
    const updated = await store.update(id, { followed_up_at: new Date().toISOString() });
    broadcast("jobs_changed", {});
    return json(res, 200, updated);
  }

  if (m && req.method === "PATCH" && !m[2]) {
    const body = parse(PatchJobSchema, await readJson(req));
    job(id);
    const updated = await store.update(id, body);
    broadcast("jobs_changed", {});
    return json(res, 200, updated);
  }

  if (m && req.method === "POST" && m[2] === "draft") {
    const { cover } = parse(DraftSchema, await readJson(req));
    const j = job(id);
    if (!j.cv || !j.email) throw new HttpError(400, "this job has no CV or email draft");
    if (!z.email().safeParse(j.email.to).success) throw new HttpError(400, "set a valid To address first");
    if (!emailConfigured()) throw new HttpError(400, "Email is not set up: add SMTP_USER and SMTP_PASS to .env");
    let mail;
    try {
      mail = await imapSource();
      const profile = await loadProfile();
      const mailbox = await saveDraftFor(store, id, mail, profile.me, cover);
      broadcast("jobs_changed", {});
      return json(res, 200, { mailbox, job: store.get(id) });
    } catch (e) {
      if (e instanceof HttpError) throw e;
      throw new HttpError(502, `Could not save the draft: ${(e as Error).message.slice(0, 200)}`);
    } finally {
      await mail?.close().catch(() => {});
    }
  }

  if (m && req.method === "POST" && m[2] === "send-email") {
    const { cover, force } = parse(SendEmailSchema, await readJson(req));
    const j = job(id);
    if (!j.cv || !j.email) throw new HttpError(400, "this job has no CV or email draft");
    if (!z.email().safeParse(j.email.to).success) throw new HttpError(400, "set a valid To address first");
    if (j.emailed_at) throw new HttpError(409, `already emailed on ${j.emailed_at}`);
    await refuseIfClosed(id, force);
    const attachments = [j.cv.pdf, ...(cover && j.cover_letter ? [j.cover_letter.pdf] : [])];
    await sendGuarded(() => loadProfile().then((p) => sendEmail({ ...j.email!, attachments, me: p.me })));
    const updated = await store.update(id, { status: "emailed", emailed_at: new Date().toISOString() });
    broadcast("jobs_changed", {});
    return json(res, 200, updated);
  }

  if (m && req.method === "POST" && m[2] === "apply") {
    const { mode, force } = parse(ApplySchema, await readJson(req));
    const j = job(id);
    if (j.source !== "linkedin") throw new HttpError(400, "Easy Apply is only for LinkedIn jobs");
    if (busy) throw new HttpError(409, `busy: ${busy} in progress`);
    if (mode === "approve") {
      if (!j.preview) throw new HttpError(400, "Fill in the form first (Check the form), then approve what it shows.");
      await refuseIfClosed(id, force);
    }
    busy = "apply";
    broadcast("busy", { busy });
    const ctx = await openAccountBrowser().catch((e) => {
      busy = null;
      broadcast("busy", { busy });
      throw e;
    });
    try {
      const profile = await loadProfile();
      const runId = "manual";
      const result = await applyOne(ctx, j, profile, store, mode, (e) => onEvent({ ts: new Date().toISOString(), run_id: runId, ...e } as RunEvent));
      broadcast("jobs_changed", {});
      return json(res, 200, { result, job: store.get(id) });
    } finally {
      await ctx.close().catch(() => {});
      busy = null;
      broadcast("busy", { busy });
    }
  }

  if (req.method === "POST" && path === "/api/runs") {
    const opts = parse(StartRunSchema, await readJson(req));
    if (busy) throw new HttpError(409, `busy: ${busy} in progress`);
    busy = "run";
    stopper = new AbortController();
    events.length = 0;
    broadcast("reset", {});
    broadcast("busy", { busy });
    void runFind(opts, { onEvent, signal: stopper.signal, store }).finally(() => {
      busy = null;
      stopper = null;
      broadcast("busy", { busy });
      broadcast("jobs_changed", {});
    });
    return json(res, 202, { started: true });
  }

  if (req.method === "POST" && path === "/api/replies/check") {
    if (busy) throw new HttpError(409, `busy: ${busy} in progress`);
    if (!emailConfigured()) throw new HttpError(400, "Email is not set up: add SMTP_USER and SMTP_PASS to .env");
    busy = "run";
    broadcast("busy", { busy });
    let mail;
    try {
      mail = await imapSource();
      const r = await checkReplies(store, mail);
      broadcast("jobs_changed", {});
      return json(res, 200, r);
    } catch (e) {
      throw new HttpError(502, `Could not read your inbox: ${(e as Error).message.slice(0, 200)}`);
    } finally {
      await mail?.close().catch(() => {});
      busy = null;
      broadcast("busy", { busy });
    }
  }

  if (req.method === "GET" && path === "/api/limits") {
    return json(res, 200, throttle().snapshot());
  }

  if (req.method === "POST" && path === "/api/runs/stop") {
    stopper?.abort();
    return json(res, 200, { stopping: Boolean(stopper) });
  }

  if (req.method === "GET" && path === "/api/settings") {
    const profileText = existsSync(PROFILE_PATH) ? await readFile(PROFILE_PATH, "utf8") : "";
    let profileError: string | null = null;
    await loadProfile().catch((e: Error) => (profileError = e.message));
    return json(res, 200, { profile: profileText, profile_error: profileError, cv: await readMasterCvText(), email_configured: emailConfigured() });
  }

  if (req.method === "PUT" && path === "/api/settings/profile") {
    const { profile } = parse(ProfileBodySchema, await readJson(req));
    try {
      await saveProfile(profile);
    } catch (e) {
      throw new HttpError(400, (e as Error).message);
    }
    return json(res, 200, { saved: true });
  }

  if (req.method === "PUT" && path === "/api/settings/cv") {
    const { text } = parse(CvTextSchema, await readJson(req));
    await saveMasterCv(text);
    return json(res, 200, { saved: true });
  }

  throw new HttpError(404, "not found");
}

const server = createServer((req, res) => {
  handle(req, res).catch((err) => {
    const status = err instanceof HttpError ? err.status : 500;
    if (!res.headersSent) json(res, status, { error: (err as Error).message });
    else res.end();
  });
});

server.listen(env().UI_PORT, "127.0.0.1", () => {
  console.log(`Job Finder dashboard: http://localhost:${env().UI_PORT}`);
});
