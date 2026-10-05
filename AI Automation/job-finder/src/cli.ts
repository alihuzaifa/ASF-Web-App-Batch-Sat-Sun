// `npm run start [-- --limit N] [--no-apply] [--test-apply] [--no-web] [--no-notify]`
import { parseArgs } from "node:util";
import { runFind, type RunEvent } from "./pipeline.js";

const { values: args } = parseArgs({
  options: {
    limit: { type: "string" },
    "no-apply": { type: "boolean", default: false },
    "test-apply": { type: "boolean", default: false },
    "no-web": { type: "boolean", default: false },
    "no-notify": { type: "boolean", default: false },
  },
});

const stop = new AbortController();
process.on("SIGINT", () => {
  if (stop.signal.aborted) process.exit(130);
  stop.abort();
  console.warn("\nStopping after the current step (Ctrl-C again to force)...");
});

function print(e: RunEvent) {
  switch (e.type) {
    case "searching": return console.log(`search  ${e.what}`);
    case "search_done": return console.log(`found ${e.found} jobs, ${e.fresh} new\n`);
    case "waiting": return e.ms >= 15000 && console.log(`  waiting ${Math.round(e.ms / 1000)}s ${e.why}`);
    case "job_started": return console.log(`[${e.index + 1}/${e.total}] ${e.title} - ${e.company}`);
    case "job_skipped": return console.log(`  skipped: ${e.why}`);
    case "job_scored":
      console.log(`  score ${e.score} ${e.fit ? "GOOD MATCH" : "not a fit"}  ${e.reasoning.slice(0, 160)}`);
      for (const k of e.knockouts) console.log(`  knock-out: ${k}`);
      for (const r of e.red_flags) console.log(`  red flag: ${r}`);
      return;
    case "cv_ready": return console.log(`  CV  ${e.pdf}${e.warnings.length ? `  (${e.warnings.length} lines removed: not in your CV)` : ""}`);
    case "job_done": return e.status !== "not_a_fit" && console.log(`  -> ${e.status}`);
    case "job_failed": return console.log(`  error: ${e.error.slice(0, 200)}`);
    case "apply_started": return console.log(`apply  ${e.title} - ${e.company}`);
    case "apply_done": return console.log(`  -> ${e.result}${e.detail ? `: ${e.detail}` : ""}`);
    case "notice": return console.log(`! ${e.message}`);
    case "replies_done":
      console.log(`inbox: ${e.checked} new emails, ${e.matched} about your applications`);
      for (const u of e.updates) console.log(`  ${u.kind}: ${u.title} - ${u.company}. ${u.summary}`);
      return;
    case "summary_sent": return console.log(`summary emailed to ${e.to}`);
    case "drafts_saved": return console.log(`${e.count} application email(s) saved in your Gmail Drafts: check and send them from Gmail`);
    case "run_aborted": return console.error(`\nRun stopped: ${e.error}`);
  }
}

const limit = args.limit === undefined ? undefined : Number(args.limit);
const { summary: s, exit_code } = await runFind(
  { limit, noApply: args["no-apply"]!, testApply: args["test-apply"]!, noWeb: args["no-web"]!, noNotify: args["no-notify"]! },
  { onEvent: print, signal: stop.signal },
);
console.log(`
---- Summary ----
found        ${s.found} (${s.new_jobs} new, ${s.closed} closed, ${s.duplicates} reposts)
scored       ${s.scored}
good match   ${s.good_matches}  (CVs made: ${s.cvs})
applied      ${s.applied}
email ready  ${s.email_ready}  (saved to Gmail Drafts when email is set up; send them from Gmail)
waiting OK   ${s.awaiting_ok}  (Easy Apply forms filled in, not sent: approve them in the dashboard)
needs you    ${s.needs_you}
errors       ${s.errors}
cost         $${s.cost_usd.toFixed(4)}
`);
process.exit(exit_code);
