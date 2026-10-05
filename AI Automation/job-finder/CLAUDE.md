# Job Finder — project guide

Usage and setup for people are in README.md. This file is for working on the code.
Update it in the same change when a module, status, env var or file layout changes.

## Flow

```
profile.json ─▶ search: LinkedIn guest pages │ Rozee.pk │ claude WebSearch (optional, paid) ─▶ dedupe by id (data/jobs.json)
  ─▶ read post (guest browser) ─▶ closed? → "closed" ─▶ same company+title seen? → "duplicate" (no score)
  ─▶ match (claude -p: score, knockouts, red_flags) ─┬─ < min_score ─▶ not_a_fit
                                                    └─ good ─▶ tailor (claude -p: CV, cover letter, email)
                                                             ─▶ groundCv + groundProse ─▶ CV PDF + cover letter PDF
                                                             ─▶ nextStatus: to_apply | email_ready | review | apply_on_site
  ─▶ applyStep("prepare"): fill Easy Apply forms, stop before Submit ─▶ preview ─▶ awaiting_ok (you approve → applyOne "approve")
  ─▶ afterRun: email jobs → Gmail Drafts; Sent → emailed; inbox replies → interview / rejected / offer; summary email to you
```

## Files

```
config/profile.json         your settings (gitignored; profile.example.json is the template). zod schema in src/config/profile.ts
profile/master-cv.md        your real CV, the only source of facts (gitignored; master-cv.example.md is the template)
prompts/match.md            score + knock-out + red-flag rubric
prompts/tailor-cv.md        CV, cover letter and email writing rules
prompts/web-search.md       WebSearch provider prompt
prompts/reply.md            classifies one inbox email: interview | assessment | rejection | offer | received | other
data/rate-limits.json       per-site page counts and rests (src/lib/throttle.ts); shared by runs and the dashboard
data/inbox-state.json       IMAP uids already handled
data/jobs.json              every job seen, keyed by id (linkedin:<id> | rozee:<id> | web:<url>). src/store.ts
data/cvs/<job>/             cv.html, "<Name> CV.pdf", "<Name> Cover Letter.pdf"
data/browser-profile/       persistent Chrome profile with your LinkedIn login (npm run login)
logs/run-*.jsonl            counts, errors, apply results. No job text
src/lib/claude.ts           runClaude(): locked-down claude -p, zod-validated output, one retry on schema misses
src/lib/browser.ts          guest browser (search/read/check) vs account browser (Easy Apply only)
src/lib/throttle.ts         politeGoto(): every public page load; per-site gap, daily budget, saved rests; BlockedError
src/inbox/mail.ts           MailSource over IMAP: inbox headers/text, Sent headers, saveDraft; saveDrafts(), checkSent()
src/inbox/replies.ts        matchJob() (headers only), checkReplies() (opens + classifies matched mail)
src/notify/summary.ts       buildSummary(): the email to yourself after a run (null when nothing new)
src/replies-cli.ts          npm run replies
src/search/linkedin.ts      /jobs-guest/ search + jobPosting pages; 429 → RateLimitedError
src/search/rozee.ts         Rozee search page (JS-rendered) → job links
src/search/posting.ts       readPosting(): schema.org JobPosting JSON-LD, else visible text; closedReason(); BlockedError
src/search/liveness.ts      checkStillOpen(): open | closed | unknown (rate limit = unknown, never closed)
src/search/web.ts           claude WebSearch → posting URLs
src/match/index.ts          matchJob, tailorCv, groundCv, groundProse
src/cv/render.ts            CV / cover letter → HTML → PDF (page.pdf). Two columns: left experience/education/projects, right skills/awards; summary is not printed
src/apply/easy-apply.ts     Easy Apply form filler, answerFor(question, profile, "text" | "choice"), pickOption
src/apply/email.ts          nodemailer SMTP send (dashboard buttons only), followUpDraft (template, no model)
src/insights.ts             funnel, reply rate, skills to learn, knock-outs, per source, sent per day
src/pipeline.ts             runFind, readJob, markIfDuplicate, processJob, autoBlocker, nextStatus, applyQueue, applyStep, applyOne, afterRun
src/cli.ts                  npm run start
src/ui/server.ts            npm run ui (127.0.0.1, SSE, Host/Origin guard). busy = run | apply; emails one at a time
src/ui/index.html           Jobs / Run / Insights / Settings tabs, job drawer. Untrusted text via textContent only
src/lib/paths.ts            every file location; JF_DATA_DIR / JF_LOG_DIR / JF_PROFILE_PATH / JF_CV_PATH override them (tests only)
src/doctor.ts               npm run doctor [--claude --linkedin --email]: setup check with fixes
scripts/install-skills.ts   npm run install-skills: linkedin-skills/skills/li-* → ~/.claude/skills
scripts/capture-fixtures.ts npm run fixtures:capture: fresh LinkedIn/Rozee pages → test/fixtures
linkedin-skills/            11 li-* Claude skills (MIT, upstream add2c23 + 2 fixes listed in its README)
test/core.test.ts           grounding, answers, liveness text, reposts, statuses, follow-ups, insights
test/browser.test.ts        parsers vs saved real pages, PDFs, email message, Easy Apply vs test/fixtures/easy-apply.html
test/pipeline.test.ts       processJob end to end with test/fake-claude.mjs (CLAUDE_BIN → .mjs runs under node)
test/ui.test.ts             spawns the dashboard on a temp data dir, clicks through it, checks Host/Origin guards
test/skills.test.ts         skill frontmatter, JSON data, humanizer scripts
test/throttle.test.ts       gaps, budget, backoff ladder, Retry-After, cross-process file, Claude 429 retry vs usage limit
test/notify.test.ts         reply matching, fake inbox, statuses, read-once; summary email via stream transport
test-live/live.test.ts      npm run test:live: real LinkedIn/Rozee (+ real Claude with LIVE_CLAUDE=1); blocks → skipped
```

## Rules the code depends on

- Facts in a tailored CV must appear in master-cv.md (`groundCv`: whole-word match for names/skills, every number must exist in the source). Email and cover letter: sentences with numbers in neither the CV nor the post are dropped (`groundProse`). Do not loosen these: auto apply sends unread.
- Easy Apply answers come only from `answerFor()` (profile.json). Yes/No years and "do you have experience with X" are computed from `skill_years`; no answer for a required field → discard, `needs_you`. Never add model-guessed answers.
- Auto apply requires: score ≥ `auto_min_score`, LinkedIn, no knockouts, no red_flags, no ghost flag (`autoBlocker`), still open, not already applied to the same role (`roleKey`).
- Emails: recipients only from `findEmails` over the post or typed by the user; sending only via `POST /api/jobs/:id/send-email` and `/send-follow-up`. Send and Apply re-check the post first; 409 "looks closed" → the page asks, then retries with `force`.
- Guest and account browsers stay separate. Search/read/check never use the logged-in profile.
- Every public page load must go through `politeGoto` (never a bare `page.goto` to a job site), including Easy Apply's logged-in load. 429 / 999 / bot-check pages rest the site (30 min doubling to 24 h, or Retry-After) in data/rate-limits.json; `BlockedError` means "stop reading that site this run". Never add stealth, UA spoofing or challenge solving.
- Claude `rate_limit` errors: short API limits are retried inside runClaude (60 s, 150 s; `CLAUDE_RETRY_WAIT_MS` in tests); usage limits are thrown and the run stops scoring (jobs stay unsaved, scored next run).
- The inbox is opened read-only; only headers are read until `matchJob` ties a message to a sent application. Never send unmatched mail to Claude.
- Nothing is sent without approval by default. `applyStep("prepare")` fills Easy Apply forms with `submit: false` and stores `job.preview` (every field, incl. LinkedIn's own values) → status `awaiting_ok`. Approve = `applyOne(..., "approve")`, which sends only if `fieldKeys` of the new fill equal the preview; otherwise `changed`, nothing sent. `applyStep("auto")` runs only with `linkedin_auto: true` (default false, `max_per_day` 5).
- Email jobs go to Gmail Drafts (`saveDrafts`, IMAP APPEND; the only write to the mailbox); `checkSent` marks a job emailed when Sent has a message to the same address with the same subject. `/send-email` remains as a confirmed manual button.
- `roleKey` returns "" when the company is unknown, so roles are never merged on title alone.
- LinkedIn guest markup (2026-10-01): cards `div.base-card[data-entity-urn]`; detail `.description__text--rich`; apply button `data-tracking-control-name` `...apply-link-simple_onsite` = Easy Apply, `...offsite...` = external. Rozee: links `-jobs-<id>`, detail has JobPosting JSON-LD with `validThrough`. Rozee shows Cloudflare after many fast reads.
- Logged-in Easy Apply selectors (`button.jobs-apply-button`, dialog buttons by aria-label) are tested only against test/fixtures/easy-apply.html, not a live account; they are the most likely thing to need fixing. Use `--test-apply`. `Locator.isVisible()` never waits; use `appears()`.
- On Windows `claude` is a `.cmd` shim; `claudeBin()` runs the native `claude.exe` behind it (set `CLAUDE_BIN` to override).

## Env (.env, gitignored)

`HEADLESS`, `BROWSER_CHANNEL` (chrome|msedge|chromium), `SLOWDOWN` (multiplies the per-site gaps in src/lib/throttle.ts), `APPLY_DELAY_MIN_MS/MAX_MS`,
`PAGE_TIMEOUT_MS`, `MATCH_MODEL`, `TAILOR_MODEL`, `SEARCH_MODEL`, `CLAUDE_TIMEOUT_MS`, `CLAUDE_MAX_BUDGET_USD`,
`SMTP_HOST/PORT/USER/PASS`, `IMAP_HOST/PORT` (replies; same login), `UI_PORT` (3100). `.env` is read once per process.

## Checks

`npm run typecheck`, `npm test` (60 checks, no network, no Claude calls), `npm run test:live` (real sites).
