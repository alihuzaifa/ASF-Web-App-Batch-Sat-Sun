// Builds and sends emails (application or follow-up). Sending only ever happens after you press Send in the
// dashboard; otherwise the same message is saved to your Gmail Drafts for you to send (src/inbox/mail.ts).
import { basename } from "node:path";
import nodemailer, { type Transporter } from "nodemailer";
import type Mail from "nodemailer/lib/mailer/index.js";
import MailComposer from "nodemailer/lib/mail-composer/index.js";
import { env } from "../config/env.js";
import type { Profile } from "../config/profile.js";
import type { Job } from "../store.js";

export function emailConfigured(): boolean {
  const e = env();
  return Boolean(e.SMTP_USER && e.SMTP_PASS);
}

function smtp(): Transporter {
  const e = env();
  if (!emailConfigured()) throw new Error("SMTP_USER and SMTP_PASS are not set in .env");
  return nodemailer.createTransport({
    host: e.SMTP_HOST,
    port: e.SMTP_PORT,
    secure: e.SMTP_PORT === 465,
    auth: { user: e.SMTP_USER, pass: e.SMTP_PASS },
  });
}

/** Logs in to the SMTP server without sending anything. Used by `npm run doctor`. */
export async function verifySmtp(): Promise<void> {
  await smtp().verify();
}

export interface OutgoingEmail {
  to: string; subject: string; body: string; attachments: string[]; me: Profile["me"];
}

/** The message itself, the same for "send now" and "save as Gmail draft". */
export function buildMessage(opts: OutgoingEmail): Mail.Options {
  const signature = [opts.me.name, opts.me.phone, opts.me.email, opts.me.linkedin].filter(Boolean).join("\n");
  return {
    from: `"${opts.me.name}" <${env().SMTP_USER || opts.me.email}>`,
    replyTo: opts.me.email,
    to: opts.to,
    subject: opts.subject,
    text: `${opts.body.trim()}\n\n--\n${signature}\n`,
    attachments: opts.attachments.map((path) => ({ filename: basename(path), path })),
  };
}

export async function sendEmail(opts: OutgoingEmail, transport: Transporter = smtp()): Promise<string> {
  const info = await transport.sendMail(buildMessage(opts));
  return info.messageId;
}

/** The complete email as raw MIME bytes (with attachments), for putting into the Drafts folder. Nothing is sent. */
export function rawMessage(opts: OutgoingEmail): Promise<Buffer> {
  return new MailComposer({ ...buildMessage(opts), date: new Date() }).compile().build();
}

/** Plain follow-up a week or so after applying. A template, not a model call: it only restates facts. */
export function followUpDraft(job: Job, me: Profile["me"]): { to: string; subject: string; body: string } {
  const when = job.emailed_at ?? job.applied_at;
  const date = when ? new Date(when).toLocaleDateString("en-GB", { day: "numeric", month: "long" }) : "recently";
  const where = job.emailed_at ? "by email" : job.source === "linkedin" ? "through LinkedIn" : "on your website";
  return {
    to: job.email?.to ?? "",
    subject: job.email?.subject ? `Re: ${job.email.subject}` : `Following up: ${job.title} - ${me.name}`,
    body: [
      "Dear Hiring Team,",
      "",
      `I applied for the ${job.title} role${job.company ? ` at ${job.company}` : ""} ${where} on ${date}, and wanted to check whether there is any update.`,
      "",
      "I am still very interested in the role and happy to share anything else you need, or to talk at a time that suits you. My CV is attached again for convenience.",
      "",
      "Best regards,",
    ].join("\n"),
  };
}
