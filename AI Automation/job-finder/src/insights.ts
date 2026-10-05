// Numbers for the Insights tab, worked out from data/jobs.json. No model calls.
import type { Job, JobSource } from "./store.js";

const SENT = new Set(["applied", "emailed", "interview", "offer", "rejected"]);
const ANSWERED = new Set(["interview", "offer", "rejected"]);

export function wasSent(j: Job): boolean {
  return SENT.has(j.status) || Boolean(j.applied_at || j.emailed_at);
}

/** Applied/emailed, no reply status yet, not followed up, and older than `days`. */
export function followUpDue(j: Job, days: number, now = Date.now()): boolean {
  if (!(j.status === "applied" || j.status === "emailed") || j.followed_up_at) return false;
  const when = j.emailed_at ?? j.applied_at;
  return Boolean(when && now - new Date(when).getTime() >= days * 86_400_000);
}

export function insights(jobs: Job[], followUpDays: number, now = Date.now()) {
  const scored = jobs.filter((j) => j.score !== null && j.status !== "duplicate");
  const good = scored.filter((j) => !["not_a_fit"].includes(j.status));
  const sent = jobs.filter(wasSent);
  const answered = sent.filter((j) => ANSWERED.has(j.status));

  const count = (items: string[], top = 12) => {
    const m = new Map<string, { label: string; n: number }>();
    for (const raw of items) {
      const key = raw.toLowerCase().replace(/\(.*?\)/g, "").replace(/[^\p{L}\p{N}+#. ]+/gu, " ").replace(/\s+/g, " ").trim();
      if (!key) continue;
      const e = m.get(key) ?? { label: raw.replace(/\s*\(.*?\)\s*/g, " ").trim(), n: 0 };
      e.n++;
      m.set(key, e);
    }
    return [...m.values()].sort((a, b) => b.n - a.n).slice(0, top);
  };

  const sources: JobSource[] = ["linkedin", "rozee", "web"];
  const bySource = sources.map((s) => {
    const js = jobs.filter((j) => j.source === s);
    return {
      source: s,
      found: js.length,
      good: js.filter((j) => good.includes(j)).length,
      sent: js.filter(wasSent).length,
      interviews: js.filter((j) => j.status === "interview" || j.status === "offer").length,
    };
  });

  const days: { day: string; sent: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now - i * 86_400_000);
    const key = d.toDateString();
    days.push({
      day: d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
      sent: sent.filter((j) => [j.applied_at, j.emailed_at].some((t) => t && new Date(t).toDateString() === key)).length,
    });
  }

  const buckets = [0, 20, 40, 60, 80].map((lo) => ({
    range: `${lo}-${lo + 19 + (lo === 80 ? 1 : 0)}`,
    n: scored.filter((j) => j.score! >= lo && (lo === 80 ? j.score! <= 100 : j.score! < lo + 20)).length,
  }));

  return {
    funnel: {
      seen: jobs.length,
      closed: jobs.filter((j) => j.status === "closed").length,
      duplicates: jobs.filter((j) => j.status === "duplicate").length,
      scored: scored.length,
      good_matches: good.length,
      sent: sent.length,
      interviews: jobs.filter((j) => j.status === "interview" || j.status === "offer").length,
      offers: jobs.filter((j) => j.status === "offer").length,
      rejected: jobs.filter((j) => j.status === "rejected").length,
    },
    reply_rate: sent.length ? Math.round((answered.length / sent.length) * 100) : null,
    follow_ups_due: jobs.filter((j) => followUpDue(j, followUpDays, now)).length,
    by_source: bySource,
    // Skills good-but-not-perfect jobs keep asking for: the best things to learn next.
    skills_to_learn: count(scored.filter((j) => (j.score ?? 0) >= 50).flatMap((j) => j.missing_skills)),
    knockouts: count(scored.flatMap((j) => j.knockouts), 8),
    red_flags: scored.filter((j) => j.red_flags.length).length,
    score_buckets: buckets,
    sent_per_day: days,
  };
}
