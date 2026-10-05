#!/usr/bin/env node
// Stand-in for `claude -p` in tests (set CLAUDE_BIN to this file). Reads the same flags and stdin,
// answers with a fixed result per prompt file, and prints the same JSON envelope shape.
// FAKE_CLAUDE_FAIL_ONCE=<file>: the first call that sees this file missing creates it and returns a schema miss.
// FAKE_CLAUDE_LOG=<file>: appends each call's args + stdin, so tests can check what was sent.
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const flag = (name) => args[args.indexOf(name) + 1];
let input = "";
process.stdin.on("data", (d) => (input += d));
process.stdin.on("end", () => {
  const prompt = flag("--system-prompt-file") ?? "";
  if (process.env.FAKE_CLAUDE_LOG) appendFileSync(process.env.FAKE_CLAUDE_LOG, JSON.stringify({ prompt, args, input }) + "\n");

  // FAKE_CLAUDE_LIMIT=429|usage: answer with a rate limit / usage limit the first FAKE_CLAUDE_LIMIT_TIMES calls
  // (counted in the file FAKE_CLAUDE_LIMIT_COUNTER).
  if (process.env.FAKE_CLAUDE_LIMIT) {
    const counter = process.env.FAKE_CLAUDE_LIMIT_COUNTER;
    const n = counter && existsSync(counter) ? Number(readFileSync(counter, "utf8")) : 0;
    if (n < Number(process.env.FAKE_CLAUDE_LIMIT_TIMES ?? 1)) {
      if (counter) writeFileSync(counter, String(n + 1));
      const msg = process.env.FAKE_CLAUDE_LIMIT === "usage"
        ? "Claude AI usage limit reached|1760000000"
        : 'API Error: 429 {"type":"error","error":{"type":"rate_limit_error","message":"Too many requests"}}';
      return out({ type: "result", subtype: "success", is_error: true, result: msg, total_cost_usd: 0 });
    }
  }

  const failMarker = process.env.FAKE_CLAUDE_FAIL_ONCE;
  if (failMarker && !existsSync(failMarker)) {
    writeFileSync(failMarker, "1");
    return out({ type: "result", subtype: "error_max_structured_output_retries", is_error: true, result: "", total_cost_usd: 0.01 });
  }

  let result;
  const jobText = /<job>([\s\S]*?)<\/job>/.exec(input)?.[1] ?? "";
  if (prompt.endsWith("match.md")) {
    const senior = /8\+ years/.test(jobText);
    result = {
      score: senior ? 40 : 90,
      reasoning: senior ? "Needs far more experience." : "Strong React match.",
      matched_skills: ["React"],
      missing_skills: senior ? ["Kotlin"] : [],
      deal_breakers_hit: [],
      knockouts: senior ? ["Needs 8+ years; CV shows about 3."] : [],
      red_flags: /security deposit/i.test(jobText) ? ["Asks for a security deposit."] : [],
    };
  } else if (prompt.endsWith("tailor-cv.md")) {
    result = {
      cv: {
        headline: "React Developer",
        summary: "Full stack developer. Led a team of 12.",
        skills: [{ group: "Frontend", items: ["React", "Kubernetes"] }],
        experience: [
          { title: "Software Engineer", company: "Arbisoft", location: "Lahore", start: "2023", end: "Present", bullets: ["Built a dashboard used by 40 staff.", "Grew revenue by 300%."] },
          { title: "CTO", company: "Google", location: "", start: "", end: "", bullets: [] },
        ],
        projects: [],
        education: [{ degree: "BS Computer Science", school: "FAST NUCES", year: "2021" }],
        certifications: [],
        awards: [],
        languages: ["English"],
      },
      email: { subject: "Application for React Developer - Your Name", body: "Dear Hiring Team,\n\nI built a dashboard used by 40 staff. I also saved 2 million rupees.\n\nBest regards," },
      cover_letter: "Dear Hiring Manager,\n\nI built a dashboard used by 40 staff. I managed 25 engineers.\n\nBest regards,\nYour Name",
    };
  } else if (prompt.endsWith("reply.md")) {
    const email = /<email>([\s\S]*?)<\/email>/.exec(input)?.[1] ?? "";
    result = /interview|schedule a call/i.test(email) ? { kind: "interview", summary: "Asks to schedule an interview.", confidence: 0.9 }
      : /unfortunately|other candidates/i.test(email) ? { kind: "rejection", summary: "Not moving forward.", confidence: 0.9 }
      : /maybe/i.test(email) ? { kind: "interview", summary: "Unclear.", confidence: 0.4 }
      : { kind: "received", summary: "Confirms the application arrived.", confidence: 0.9 };
  } else {
    result = { results: [] };
  }
  out({ type: "result", subtype: "success", is_error: false, result: JSON.stringify(result), total_cost_usd: 0.02 });
});

function out(o) {
  process.stdout.write(JSON.stringify(o));
}
