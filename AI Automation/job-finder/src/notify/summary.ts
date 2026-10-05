// The short email you get after a run: what is new, what waits for you, which replies came in.
// Sent to your own address (profile me.email) only. Nothing is sent when there is nothing new.
import type { Profile } from "../config/profile.js";
import type { ReplyResult } from "../inbox/replies.js";
import { followUpDue } from "../insights.js";
import type { Summary } from "../pipeline.js";
import type { Job } from "../store.js";

const KIND_WORD: Record<string, string> = {
  interview: "Interview", assessment: "Test / assignment", rejection: "Rejected", offer: "OFFER", received: "Received", other: "Other",
};

export function buildSummary(opts: {
  summary: Summary;
  jobs: Job[];
  since: Date;
  replies: ReplyResult | null;
  notices: string[];
  profile: Profile;
  dashboardUrl: string;
}): { subject: string; body: string } | null {
  const { summary: s, jobs, since, replies, notices, profile } = opts;
  const isNew = (j: Job) => new Date(j.created_at) >= since;
  const good = jobs.filter((j) => isNew(j) && j.score !== null && !["not_a_fit", "duplicate", "closed"].includes(j.status))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const appliedNow = jobs.filter((j) => j.applied_at && new Date(j.applied_at) >= since);
  const emailReady = jobs.filter((j) => j.status === "email_ready");
  const drafts = emailReady.filter((j) => j.draft);
  const awaiting = jobs.filter((j) => j.status === "awaiting_ok").sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const needsYou = jobs.filter((j) => j.status === "needs_you");
  const followUps = jobs.filter((j) => followUpDue(j, profile.apply.follow_up_days));
  const updates = replies?.updates.filter((u) => u.kind !== "other") ?? [];

  if (!good.length && !appliedNow.length && !updates.length && !emailReady.length && !awaiting.length && !needsYou.length && !followUps.length) return null;

  const line = (j: Job) => `- ${j.score ?? "-"}  ${j.title}${j.company ? ` - ${j.company}` : ""}${j.location ? ` (${j.location})` : ""}`;
  const parts: string[] = [];
  if (updates.length) {
    parts.push("REPLIES", ...updates.map((u) => `- ${KIND_WORD[u.kind]}: ${u.title}${u.company ? ` - ${u.company}` : ""}. ${u.summary}`), "");
  }
  if (appliedNow.length) parts.push(`APPLIED (${appliedNow.length})`, ...appliedNow.map(line), "");
  if (good.length) parts.push(`NEW GOOD MATCHES (${good.length})`, ...good.slice(0, 15).map(line), ...(good.length > 15 ? [`- and ${good.length - 15} more`] : []), "");
  if (awaiting.length) {
    parts.push(`WAITING FOR YOUR OK (${awaiting.length}): LinkedIn forms filled in, nothing sent yet`);
    for (const j of awaiting.slice(0, 10)) {
      const answers = (j.preview?.fields ?? []).filter((f) => f.how === "your settings").map((f) => `${f.question}: ${f.answer.slice(0, 40)}`);
      parts.push(line(j), ...(answers.length ? [`    ${answers.slice(0, 4).join(" | ")}${answers.length > 4 ? " | ..." : ""}`] : []));
    }
    parts.push("  Approve or change them in the dashboard.", "");
  }
  const todo: string[] = [];
  if (drafts.length) todo.push(`- ${drafts.length} application email${drafts.length > 1 ? "s" : ""} in your Gmail Drafts, with the CV attached: check and send from Gmail`);
  if (emailReady.length > drafts.length) todo.push(`- ${emailReady.length - drafts.length} email${emailReady.length - drafts.length > 1 ? "s" : ""} ready in the dashboard (no address yet, or email not set up)`);
  if (needsYou.length) todo.push(`- ${needsYou.length} Easy Apply form${needsYou.length > 1 ? "s" : ""} stopped on a question you have not answered yet`);
  if (followUps.length) todo.push(`- ${followUps.length} follow-up${followUps.length > 1 ? "s" : ""} due`);
  if (todo.length) parts.push("WAITING FOR YOU", ...todo, "");
  if (notices.length) parts.push("NOTES", ...notices.map((n) => `- ${n}`), "");
  parts.push(`This run: ${s.found} jobs seen, ${s.new_jobs} new, ${s.scored} scored, cost $${s.cost_usd.toFixed(2)}.`);
  parts.push(`Open the dashboard: ${opts.dashboardUrl} (start it with npm run ui)`);

  const head = [
    updates.some((u) => u.kind === "offer") ? "Offer" : updates.some((u) => u.kind === "interview" || u.kind === "assessment") ? "Interview reply" : "",
    appliedNow.length ? `${appliedNow.length} applied` : "",
    good.length ? `${good.length} new good match${good.length > 1 ? "es" : ""}` : "",
    awaiting.length ? `${awaiting.length} waiting for your OK` : "",
    emailReady.length ? `${emailReady.length} email${emailReady.length > 1 ? "s" : ""} to send` : "",
  ].filter(Boolean);
  return { subject: `Job Finder: ${head.length ? head.join(", ") : "things waiting for you"}`, body: parts.join("\n") };
}
