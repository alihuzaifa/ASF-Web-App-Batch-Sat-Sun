// `npm run doctor [-- --claude] [--linkedin] [--email]` — checks the setup step by step and says how to fix
// each problem. The flags run the slower checks: a tiny real Claude call (about $0.01), opening LinkedIn
// with your saved login, and logging in to your email server (nothing is sent).
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { z } from "zod";
import { emailConfigured, verifySmtp } from "./apply/email.js";
import { imapSource } from "./inbox/replies.js";
import { env } from "./config/env.js";
import { loadMasterCv, loadProfile } from "./config/profile.js";
import { isLoginUrl, openAccountBrowser, openGuestBrowser } from "./lib/browser.js";
import { claudeBin, runClaude } from "./lib/claude.js";
import { ACCOUNT_PROFILE_DIR, PROMPTS_DIR, ROOT } from "./lib/paths.js";

const { values: flags } = parseArgs({
  options: { claude: { type: "boolean", default: false }, linkedin: { type: "boolean", default: false }, email: { type: "boolean", default: false } },
});

let failed = 0;
const ok = (msg: string) => console.log(`  OK    ${msg}`);
const warn = (msg: string, fix: string) => console.log(`  NOTE  ${msg}\n        -> ${fix}`);
const bad = (msg: string, fix: string) => (failed++, console.log(`  FIX   ${msg}\n        -> ${fix}`));
const section = (t: string) => console.log(`\n${t}`);

section("Basics");
const major = Number(process.versions.node.split(".")[0]);
if (major >= 22) ok(`Node.js ${process.versions.node}`);
else bad(`Node.js ${process.versions.node} is too old`, "install Node.js 22 or newer from https://nodejs.org");

try {
  env();
  ok(".env settings are valid");
} catch (e) {
  bad((e as Error).message, "fix the line in .env (copy .env.example to .env if you have none)");
}
if (!existsSync(join(ROOT, ".env"))) warn("no .env file, using defaults", "copy .env.example to .env (needed for email)");

section("Browser");
try {
  const b = await openGuestBrowser();
  await b.close();
  ok(`browser opens (${env().BROWSER_CHANNEL})`);
} catch (e) {
  bad(`browser does not open: ${(e as Error).message.split("\n")[0]}`,
    "install Google Chrome, or set BROWSER_CHANNEL=chromium in .env and run: npx playwright install chromium");
}

section("Claude Code");
const bin = claudeBin();
const v = spawnSync(bin, ["--version"], { encoding: "utf8", timeout: 30000 });
if (v.status === 0) ok(`Claude Code found: ${v.stdout.trim()}`);
else bad("Claude Code (the `claude` command) was not found", "install it (https://claude.com/claude-code), run `claude` once and log in");
if (flags.claude && v.status === 0) {
  try {
    const r = await runClaude({
      systemPromptFile: join(PROMPTS_DIR, "match.md"),
      input: "<preferences>{}</preferences>\n<my_cv>Test</my_cv>\n<job>{\"title\":\"Test\",\"description\":\"Health check, score 0.\"}</job>",
      schema: z.object({ score: z.number() }).passthrough(),
      model: env().MATCH_MODEL, timeoutMs: 120000, maxBudgetUsd: 0.2,
    });
    ok(`Claude answers (cost $${r.costUsd.toFixed(4)})`);
  } catch (e) {
    bad(`a test Claude call failed: ${(e as Error).message.slice(0, 200)}`, "run `claude` in a terminal and make sure you are logged in");
  }
} else if (v.status === 0) warn("did not test a real Claude call", "run `npm run doctor -- --claude` once (costs about $0.01)");

section("Your details");
try {
  const p = await loadProfile();
  if (p.me.name === "Your Name" || /your\.email|example/.test(p.me.email) || p.me.phone.includes("0000000")) {
    bad("config/profile.json still has the example name, email or phone", "put your own details in config/profile.json (or the Settings tab)");
  } else ok(`config/profile.json: ${p.me.name}, ${p.search.keywords.length} job titles, ${p.search.locations.join(", ")}`);
  if (p.apply.linkedin_auto) warn(`auto apply is ON (score ${p.apply.auto_min_score}+, ${p.apply.max_per_day} a day)`, "first run with --test-apply and read the results");
  else ok(`auto apply is off: strong matches wait for you to press Apply now (turn it on with "linkedin_auto": true once the CVs look right)`);
} catch (e) {
  bad((e as Error).message, "copy config/profile.example.json to config/profile.json and fill it in");
}
try {
  const cv = await loadMasterCv();
  ok(`profile/master-cv.md: ${cv.length} characters`);
} catch (e) {
  bad((e as Error).message, "write your full real CV in profile/master-cv.md");
}

section("LinkedIn login (needed only for Easy Apply)");
if (!existsSync(ACCOUNT_PROFILE_DIR)) warn("not logged in yet", "run `npm run login`, log in to LinkedIn in the window, then close it");
else if (flags.linkedin) {
  try {
    const ctx = await openAccountBrowser({ headless: true });
    const page = await ctx.newPage();
    await page.goto("https://www.linkedin.com/feed/", { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(2000);
    const loggedIn = !isLoginUrl(page.url()) && /\/feed/.test(page.url());
    await ctx.close();
    if (loggedIn) ok("LinkedIn login works");
    else bad("the saved LinkedIn login has expired", "run `npm run login` again");
  } catch (e) {
    bad(`could not open LinkedIn: ${(e as Error).message.split("\n")[0]}`, "close any open Job Finder browser window and try again");
  }
} else ok("login saved (check it with `npm run doctor -- --linkedin`)");

section("Email (needed only for Send email)");
if (!emailConfigured()) warn("email is not set up", "set SMTP_USER and SMTP_PASS (a Gmail app password) in .env");
else if (flags.email) {
  try {
    await verifySmtp();
    ok(`email login works (${env().SMTP_USER})`);
  } catch (e) {
    bad(`email login failed: ${(e as Error).message.slice(0, 160)}`, "check SMTP_USER / SMTP_PASS; Gmail needs an app password, not your normal password");
  }
  try {
    const mail = await imapSource();
    await mail.close();
    ok("inbox can be read for replies (read-only)");
  } catch (e) {
    bad(`could not read the inbox: ${(e as Error).message.slice(0, 160)}`, "the same app password reads mail; for non-Gmail set IMAP_HOST / IMAP_PORT in .env");
  }
} else ok(`email set up for ${env().SMTP_USER} (check the login with \`npm run doctor -- --email\`)`);

section("LinkedIn writing skills (optional)");
const installed = existsSync(join(homedir(), ".claude", "skills")) ? readdirSync(join(homedir(), ".claude", "skills")).filter((n) => n.startsWith("li-")) : [];
if (installed.length >= 11) ok(`${installed.length} li-* skills installed`);
else warn(`${installed.length} of 11 skills installed`, "run `npm run install-skills`");
const py = (process.platform === "win32" ? ["python", "py"] : ["python3", "python"])
  .find((c) => /Python 3/.test(spawnSync(c, ["--version"], { encoding: "utf8", timeout: 10000 }).stdout ?? ""));
if (py) ok(`Python found (${py}) for /li-human`);
else warn("Python 3 not found", "install Python 3 if you want /li-human's scripts; the other skills work without it");

console.log(failed ? `\n${failed} thing(s) to fix before the first run.` : "\nAll required checks passed. Next: npm run start -- --limit 5 --test-apply");
process.exit(failed ? 1 : 0);
