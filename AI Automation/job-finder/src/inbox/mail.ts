// Your mailbox over IMAP (same Gmail app password as sending). Three jobs, one connection:
//   - read new mail headers in the Inbox, and open the text of the ones about your applications (replies.ts)
//   - read the Sent folder, to notice when you sent a draft from Gmail
//   - put application emails into Drafts, so you check and send them yourself from Gmail
// The Inbox and Sent are opened read-only: nothing there is changed, moved or marked read.
// The only thing ever written is a new draft in Drafts.
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { env } from "../config/env.js";
import { rawMessage, type OutgoingEmail } from "../apply/email.js";
import type { JobStore } from "../store.js";

export interface MailHeader {
  uid: number;
  from: string; // address, lowercase
  fromName: string;
  subject: string;
  date: Date;
}

export interface SentHeader {
  to: string[]; // addresses, lowercase
  subject: string;
  date: Date;
}

/** Where mail comes from and goes. The real one is IMAP; tests pass a fake. */
export interface MailSource {
  headers(since: Date): Promise<MailHeader[]>;
  text(uid: number): Promise<string>;
  sent(since: Date): Promise<SentHeader[]>;
  /** Adds one raw message to the Drafts folder. Returns the folder's name. Never sends. */
  saveDraft(raw: Buffer): Promise<string>;
  close(): Promise<void>;
}

export async function imapSource(): Promise<MailSource> {
  const e = env();
  if (!e.SMTP_USER || !e.SMTP_PASS) throw new Error("SMTP_USER and SMTP_PASS are not set in .env (the same app password reads mail)");
  const client = new ImapFlow({ host: e.IMAP_HOST, port: e.IMAP_PORT, secure: true, auth: { user: e.SMTP_USER, pass: e.SMTP_PASS }, logger: false });
  await client.connect();
  const boxes = await client.list();
  const special = (use: string, name: RegExp) => boxes.find((b) => b.specialUse === use)?.path ?? boxes.find((b) => name.test(b.path))?.path;
  const sentBox = special("\\Sent", /sent/i);
  const draftsBox = special("\\Drafts", /draft/i);

  async function readOnly<T>(path: string, fn: () => Promise<T>): Promise<T> {
    const lock = await client.getMailboxLock(path, { readOnly: true });
    try {
      return await fn();
    } finally {
      lock.release();
    }
  }

  return {
    headers: (since) => readOnly("INBOX", async () => {
      const uids = await client.search({ since }, { uid: true });
      if (!uids || !uids.length) return [];
      const msgs = await client.fetchAll(uids, { envelope: true, uid: true }, { uid: true });
      return msgs.flatMap((m) => {
        const f = m.envelope?.from?.[0];
        if (!f?.address) return [];
        return [{ uid: m.uid, from: f.address.toLowerCase(), fromName: f.name ?? "", subject: m.envelope?.subject ?? "", date: new Date(m.envelope?.date ?? 0) }];
      });
    }),
    text: (uid) => readOnly("INBOX", async () => {
      const m = await client.fetchOne(String(uid), { source: true }, { uid: true });
      if (!m || !m.source) return "";
      const parsed = await simpleParser(m.source);
      return (parsed.text ?? (typeof parsed.html === "string" ? parsed.html.replace(/<[^>]+>/g, " ") : "")).replace(/\s+\n/g, "\n").trim();
    }),
    sent: async (since) => {
      if (!sentBox) return [];
      return readOnly(sentBox, async () => {
        const uids = await client.search({ since }, { uid: true });
        if (!uids || !uids.length) return [];
        const msgs = await client.fetchAll(uids, { envelope: true, uid: true }, { uid: true });
        return msgs.map((m) => ({
          to: (m.envelope?.to ?? []).map((a) => (a.address ?? "").toLowerCase()).filter(Boolean),
          subject: m.envelope?.subject ?? "",
          date: new Date(m.envelope?.date ?? 0),
        }));
      });
    },
    saveDraft: async (raw) => {
      if (!draftsBox) throw new Error("could not find a Drafts folder in this mailbox");
      await client.append(draftsBox, raw, ["\\Draft", "\\Seen"]);
      return draftsBox;
    },
    close: async () => {
      await client.logout().catch(() => {});
    },
  };
}

const subjectKey = (s: string) => s.toLowerCase().replace(/^\s*((re|fwd?|aw)\s*:\s*)+/g, "").replace(/\s+/g, " ").trim();

/**
 * Puts each ready application email (job status "Email ready", a valid To, not yet drafted or sent) into
 * your Gmail Drafts with the CV attached. You open Gmail, read it, change it if you like, and press Send.
 */
export async function saveDrafts(store: JobStore, source: MailSource, me: OutgoingEmail["me"]): Promise<Array<{ id: string; to: string }>> {
  const saved: Array<{ id: string; to: string }> = [];
  for (const job of store.all()) {
    if (job.status !== "email_ready" || job.draft || job.emailed_at || !job.cv || !job.email) continue;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(job.email.to)) continue; // no address yet: you add one in the dashboard
    await saveDraftFor(store, job.id, source, me);
    saved.push({ id: job.id, to: job.email.to });
  }
  return saved;
}

export async function saveDraftFor(store: JobStore, id: string, source: MailSource, me: OutgoingEmail["me"], withCover = false): Promise<string> {
  const job = store.get(id);
  if (!job?.cv || !job.email) throw new Error("this job has no CV or email yet");
  const raw = await rawMessage({ ...job.email, attachments: [job.cv.pdf, ...(withCover && job.cover_letter ? [job.cover_letter.pdf] : [])], me });
  const mailbox = await source.saveDraft(raw);
  await store.update(id, { draft: { saved_at: new Date().toISOString(), mailbox } });
  return mailbox;
}

/**
 * Notices drafts you sent from Gmail: a message in Sent, to the job's address, with the same subject,
 * after the draft was saved. The job then becomes "Email sent" (and follow-up reminders start).
 */
export async function checkSent(store: JobStore, source: MailSource): Promise<string[]> {
  const waiting = store.all().filter((j) => j.draft && !j.emailed_at && j.email);
  if (!waiting.length) return [];
  const since = new Date(Math.min(...waiting.map((j) => new Date(j.draft!.saved_at).getTime())) - 86_400_000);
  const sent = await source.sent(since);
  const marked: string[] = [];
  for (const job of waiting) {
    const to = job.email!.to.toLowerCase();
    const hit = sent.find((m) => m.to.includes(to) && subjectKey(m.subject) === subjectKey(job.email!.subject) && m.date >= new Date(new Date(job.draft!.saved_at).getTime() - 60_000));
    if (!hit) continue;
    await store.update(job.id, { status: "emailed", emailed_at: hit.date.toISOString() });
    marked.push(job.id);
  }
  return marked;
}
