// `npm run examples:linkedin [-- --no-linkedin]` — two sample posts (a text post and a 10-slide carousel)
// showing what the bundled LinkedIn skills produce, under the name of whoever is using this copy:
// the LinkedIn account from `npm run login`, else config/profile.json, else ~/.claude/linkedin/voice.md.
// Output goes to data/linkedin-examples/. Nothing is posted anywhere.
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { chromium } from "playwright";
import { env } from "../src/config/env.js";
import { loadProfile } from "../src/config/profile.js";
import { initials, pickIdentity, readLinkedInIdentity, readVoice, type Identity } from "../src/linkedin/identity.js";
import { DATA_DIR, ROOT } from "../src/lib/paths.js";

const { values: flags } = parseArgs({ options: { "no-linkedin": { type: "boolean", default: false } } });
const OUT = join(DATA_DIR, "linkedin-examples");
const HUMAN = join(ROOT, "linkedin-skills", "skills", "li-human");

const POST_1 = `My job applications are filled by a tool. It isn't allowed to press Submit.

Auto-apply sounds great until a form asks "Do you have at least 5 years of experience with React?" and the honest answer is No. A tool that just wants to finish the form will tick Yes, and you find out in the interview.

So mine fills, then stops.

Before anything goes out I get a table with every question on the form, the answer it picked, and where that answer came from (my settings, my CV, or something LinkedIn pre-filled).

I press Approve. It sends only if the form still matches what I saw. If LinkedIn slipped in a new question, nothing goes.

Email jobs work the same way. The email and a CV rewritten for that job land in my Gmail Drafts, and I hit Send myself.

Slower? Yes. Fewer applications? Also yes.

But I've read every one.

Which step of your job search would you never hand to a tool?`;

const POST_2 = `My job search tool does 6 things. It's allowed to finish 1 of them.

It searches LinkedIn and Rozee.pk, scores each job 0 to 100 against my CV, rewrites the CV and fills the Easy Apply form. Then it waits.

Swipe for how each step works, and the 1 rule that stops it lying for me.`;

const SLIDES: [string, string, string][] = [
  ["cover", "It fills the form.<br>I press Send.", "How my job search tool works, and why it waits for me"],
  ["THE POINT", "Why it waits", "One wrong Yes on an application form can follow you into the interview."],
  ["STEP 1", "It finds the jobs", "LinkedIn, Rozee.pk and the open web. Closed and reposted listings are dropped."],
  ["STEP 2", "It scores each one", "0 to 100 against my CV. Requirements I don't meet are flagged, not hidden."],
  ["STEP 3", "It rewrites my CV", "A new PDF for each job, built only from my real CV. Every skill is checked against it."],
  ["STEP 4", "It fills, then stops", "Easy Apply is filled up to Submit. I see every question and every answer."],
  ["STEP 5", "I approve, or nothing goes", "If the form changed since I looked, it sends nothing and shows me the new one."],
  ["STEP 6", "Email goes to Drafts", "The email and CV wait in my Gmail Drafts. I press Send myself."],
  ["RECAP", "The whole thing", "Find · Score · Rewrite CV · Fill · <b>I approve</b> · Send"],
  ["cta", "Which step would you keep manual?", "Tell me in the comments."],
];

function python(): string | null {
  for (const cmd of process.platform === "win32" ? ["python", "py", "python3"] : ["python3", "python"]) {
    const r = spawnSync(cmd, ["--version"], { encoding: "utf8", timeout: 10000 });
    if (r.status === 0 && /Python 3/.test(r.stdout + r.stderr)) return cmd;
  }
  return null;
}

/** Runs the real detector from /li-human on the text. */
function humanCheck(text: string, file: string): string {
  const py = python();
  if (!py) return "humanizer not run: Python 3 not found";
  writeFileSync(file, text);
  const out = spawnSync(py, [join(HUMAN, "detect.py"), file], { encoding: "utf8", timeout: 30000 }).stdout ?? "";
  const n = (re: RegExp) => re.exec(out)?.[1] ?? "?";
  return [
    `em dashes      ${n(/(\d+) em dash/)}`,
    `AI stock words ${n(/(\d+) stock terms/)}`,
    `hidden chars   ${n(/(\d+) invisible/)}`,
    `HUMAN SCORE    ${n(/HUMAN SCORE\s+#*\.*\s+([\d.]+)/)}  ${n(/HUMAN SCORE.*?(PASS|REVIEW|FLAGGED)/)}`,
  ].join("\n");
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const BASE = `*{box-sizing:border-box;margin:0}body{font-family:Inter,"Segoe UI",Arial,sans-serif;color:#1d2226}`;
const FONT = `<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet">`;
const CARD = `.card{background:#fff;border:1px solid #dcdcdc;border-radius:10px;width:600px;padding:18px 0 0}
.who{display:flex;gap:10px;padding:0 18px 12px;align-items:center}.av{width:48px;height:48px;flex:none;border-radius:50%;background:#2f5d50;color:#fff;display:grid;place-items:center;font-weight:700}
.who b{display:block;font-size:15px}.who span{font-size:12px;color:#666}.txt{padding:0 18px 14px;font-size:14.5px;line-height:1.45}
.bar{display:flex;justify-content:space-around;border-top:1px solid #e6e6e6;padding:12px;font-size:13px;color:#555;font-weight:600}`;
const SIDE = `.page{display:flex;gap:40px;padding:48px;background:#f3f2ef;align-items:flex-start}
.notes{width:520px}.notes h1{font-size:30px;margin-bottom:6px}.notes .sub{color:#555;margin-bottom:26px;font-size:16px}
.step{background:#fff;border-radius:10px;padding:16px 18px;margin-bottom:14px;border-left:4px solid #2f5d50}
.step h3{font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:#2f5d50;margin-bottom:8px}
.step p,.step li{font-size:14.5px;line-height:1.5}.step ol{padding-left:20px}.pick{font-weight:600;margin-top:8px}
.mono{font-family:Consolas,monospace;font-size:13px;white-space:pre;background:#1d2226;color:#e8e8e8;padding:12px;border-radius:8px;margin-top:6px;line-height:1.5}
.no{color:#a33;font-weight:600}`;
const SLIDE_CSS = `.s{width:1080px;height:1350px;background:#f7f5f0;padding:110px 100px;position:relative;display:flex;flex-direction:column;justify-content:center;page-break-after:always}
.s.dark{background:#2f5d50;color:#fff}.k{font-size:34px;font-weight:700;color:#2f5d50;margin-bottom:30px;letter-spacing:.04em}
.s h2{font-size:92px;line-height:1.05;font-weight:800;margin-bottom:44px}.s p{font-size:44px;line-height:1.35;color:#3a4045}.dark p{color:#e6efe9}
.ft{position:absolute;bottom:60px;left:100px;right:100px;display:flex;justify-content:space-between;font-size:28px;color:#777}.dark .ft{color:#cfe3da}`;

function postCard(me: Identity, text: string, extra = ""): string {
  const sub = [me.headline, "now"].filter(Boolean).map(esc).join(" · ");
  return `<div class="card"><div class="who"><div class="av">${esc(initials(me.name))}</div><div><b>${esc(me.name)}</b><span>${sub}</span></div></div>
<div class="txt">${esc(text).replace(/\n/g, "<br>")}</div>${extra}
<div class="bar"><span>Like</span><span>Comment</span><span>Repost</span><span>Send</span></div></div>`;
}

function deckHtml(me: Identity): string {
  const slides = SLIDES.map(([k, h, t], i) => {
    const dark = k === "cover" || k === "cta";
    return `<section class="s${dark ? " dark" : ""}">${dark ? "" : `<div class="k">${k}</div>`}<h2>${h}</h2><p>${t}</p>
<div class="ft"><span>${esc(me.name)}</span><span>${i + 1}/${SLIDES.length}</span></div></section>`;
  }).join("");
  return `<!doctype html><html><head><meta charset="utf-8">${FONT}<style>${BASE}@page{size:1080px 1350px;margin:0}${SLIDE_CSS}</style></head><body>${slides}</body></html>`;
}

async function main() {
  let profile: { name?: string } | null = null;
  try {
    profile = { name: (await loadProfile()).me.name };
  } catch {}
  let linkedin = null;
  if (!flags["no-linkedin"]) {
    try {
      linkedin = await readLinkedInIdentity();
    } catch (e) {
      console.log(`Could not read your LinkedIn name (${(e as Error).message.split("\n")[0]}). Using your settings instead.`);
    }
  }
  const me = pickIdentity({ linkedin, profile, voice: readVoice() });
  if (me.from === "none") console.log('No name found. Log in with `npm run login`, or set "me.name" in config/profile.json. Using "Your Name" for now.');
  else console.log(`Name on the posts: ${me.name} (from ${me.from === "linkedin" ? "your LinkedIn login" : me.from === "profile" ? "config/profile.json" : "voice.md"})`);

  mkdirSync(join(OUT, "carousel-slides"), { recursive: true });
  const check1 = humanCheck(POST_1, join(OUT, "post-1.txt"));
  const check2 = humanCheck(POST_2, join(OUT, "post-2.txt"));

  const ch = env().BROWSER_CHANNEL;
  const browser = await chromium.launch({ headless: true, channel: ch === "chromium" ? undefined : ch });
  try {
    const pg = await browser.newPage({ viewport: { width: 1080, height: 1350 } });
    await pg.setContent(deckHtml(me), { waitUntil: "networkidle", timeout: 20000 }).catch(() => {});
    const shots: string[] = [];
    const els = await pg.$$("section");
    for (let i = 0; i < els.length; i++) {
      const f = join(OUT, "carousel-slides", `slide-${String(i + 1).padStart(2, "0")}.png`);
      await els[i]!.screenshot({ path: f });
      shots.push(f);
    }
    await pg.pdf({ path: join(OUT, "example-2-carousel.pdf"), width: "1080px", height: "1350px", printBackground: true });
    const img = (f: string) => `data:image/png;base64,${readFileSync(f).toString("base64")}`;

    const page1 = `<!doctype html><html><head><meta charset="utf-8">${FONT}<style>${BASE}${CARD}${SIDE}</style></head><body><div class="page">
<div class="notes"><h1>Example 1: a text post</h1><div class="sub">Skill used: <b>/li-post</b>, then <b>/li-human</b></div>
<div class="step"><h3>1. What you give it</h3><p>"Post about how I apply for jobs. A tool fills LinkedIn forms but waits for my OK before sending."</p></div>
<div class="step"><h3>2. Three hook options (from 21 formulas)</h3><ol>
<li><b>#14 Pattern Interrupt:</b> My job applications are filled by a tool. It isn't allowed to press Submit.</li>
<li><b>#1 Contrarian Take:</b> Auto-apply tools are the fastest way to apply badly.</li>
<li><b>#15 The Warning:</b> Before you turn on auto-apply, read what it says about you.</li></ol>
<p class="pick">Picked #14: it's true and it makes people read line 2.</p></div>
<div class="step"><h3>3. Humanizer check (runs for real)</h3><div class="mono">${esc(check1)}</div></div>
<div class="step"><h3>4. Ready to paste</h3><div class="mono">length:  ${POST_1.length} characters
hook:    #14 Pattern Interrupt
post at: Tue or Wed morning</div></div>
<div class="step"><h3>It never posts</h3><p class="no">You copy the text and post it yourself. It doesn't invent numbers: anything it doesn't know is left as {{your number}}.</p></div>
</div>${postCard(me, POST_1)}</div></body></html>`;

    const page2 = `<!doctype html><html><head><meta charset="utf-8">${FONT}<style>${BASE}${CARD}${SIDE}
.grid{display:grid;grid-template-columns:repeat(5,200px);gap:12px;margin-top:16px}.grid img{width:200px;height:250px;border-radius:6px;border:1px solid #ccc}
.right{display:flex;flex-direction:column}</style></head><body><div class="page">
<div class="notes"><h1>Example 2: a carousel</h1><div class="sub">Skill used: <b>/li-carousel</b>, then <b>/li-human</b></div>
<div class="step"><h3>1. What you give it</h3><p>"Explain step by step how my job search tool works."</p></div>
<div class="step"><h3>2. It plans the slides</h3><p>A cover of 6 words or fewer, one idea per slide, at most 25 words under each headline, a recap slide people can screenshot, and one action at the end. 10 slides, all numbered, your name on every one.</p></div>
<div class="step"><h3>3. Text above the carousel</h3><div class="mono">${esc(check2)}</div></div>
<div class="step"><h3>4. The files</h3><p>A PDF at 1080×1350 (the size LinkedIn shows biggest in the feed), ready to upload as a document post. Each slide is also saved as a PNG.</p></div>
<div class="step"><h3>It never posts</h3><p class="no">You upload the PDF yourself.</p></div>
</div><div class="right">${postCard(me, POST_2, `<img src="${img(shots[0]!)}" style="width:100%;display:block">`)}
<div class="grid">${shots.map((f) => `<img src="${img(f)}">`).join("")}</div></div></div></body></html>`;

    const pg2 = await browser.newPage({ viewport: { width: 1300, height: 900 }, deviceScaleFactor: 2 });
    await pg2.setContent(page1, { waitUntil: "networkidle", timeout: 20000 }).catch(() => {});
    await pg2.screenshot({ path: join(OUT, "example-1-text-post.png"), fullPage: true });
    await pg2.setViewportSize({ width: 1700, height: 900 });
    await pg2.setContent(page2, { waitUntil: "networkidle", timeout: 20000 }).catch(() => {});
    await pg2.screenshot({ path: join(OUT, "example-2-carousel.png"), fullPage: true });
  } finally {
    await browser.close();
  }
  console.log(`Saved to ${OUT}`);
}

await main();
