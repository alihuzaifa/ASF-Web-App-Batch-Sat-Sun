// `npm test` — the bundled LinkedIn skills: every skill is well formed, its data files parse,
// and the humanizer scripts really run and clean a draft.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const SKILLS = fileURLToPath(new URL("../linkedin-skills/skills/", import.meta.url));
const names = readdirSync(SKILLS).filter((n) => n.startsWith("li-"));

/** `python` on Windows (python3 there is a Store alias), `python3` elsewhere. null if neither runs. */
function python(): string | null {
  for (const cmd of process.platform === "win32" ? ["python", "py", "python3"] : ["python3", "python"]) {
    const r = spawnSync(cmd, ["--version"], { encoding: "utf8", timeout: 10000 });
    if (r.status === 0 && /Python 3/.test(r.stdout + r.stderr)) return cmd;
  }
  return null;
}

test("all eleven skills are present and well formed", () => {
  assert.equal(names.length, 11, names.join(", "));
  for (const n of names) {
    const md = readFileSync(join(SKILLS, n, "SKILL.md"), "utf8");
    const front = /^---\n([\s\S]*?)\n---/.exec(md.replace(/\r\n/g, "\n"))?.[1] ?? "";
    assert.match(front, new RegExp(`^name: ${n}$`, "m"), `${n}: name in frontmatter`);
    assert.match(front, /^description: /m, `${n}: description`);
  }
});

test("skill data files are valid JSON", () => {
  for (const f of ["li-post/hooks.json", "li-human/slop.json", "li-profile/rubric.json"]) {
    assert.doesNotThrow(() => JSON.parse(readFileSync(join(SKILLS, f), "utf8")), f);
  }
});

const py = python();

test("humanizer cleans a draft and the detector scores it", { skip: py ? false : "Python 3 not found (only /li-human needs it)" }, () => {
  const dir = mkdtempSync(join(tmpdir(), "jf-human-"));
  const draft = join(dir, "draft.txt");
  writeFileSync(draft, "In today’s fast-paced world, it’s crucial to leverage robust tools — let that sink in.​ We delve into seamless synergy.\n");
  const h = spawnSync(py!, [join(SKILLS, "li-human", "humanize.py"), draft], { encoding: "utf8" });
  assert.equal(h.status, 0, h.stderr);
  const clean = h.stdout.trim();
  assert.equal(clean, "Right now, it's important to use solid tools. We look at clean overlap.");
  assert.doesNotMatch(clean, /[—’​]/); // no em dash, curly quote or zero-width space left
  const d = spawnSync(py!, [join(SKILLS, "li-human", "detect.py"), draft, "--json"], { encoding: "utf8" });
  assert.equal(d.status, 0, d.stderr);
  assert.ok(JSON.parse(d.stdout), "detect.py --json prints JSON");
});

test("LinkedIn drafts carry the user's own name: login, then settings, then voice.md, never a fixed person", async () => {
  const { pickIdentity, parseVoice, initials, isRealName, nameFromTitle } = await import("../src/linkedin/identity.js");
  assert.equal(nameFromTitle("(3) Sara Khan | LinkedIn"), "Sara Khan");
  assert.equal(nameFromTitle("LinkedIn Login, Sign in"), null);
  const li = { name: "Sara Khan", headline: "Frontend developer" };
  assert.deepEqual(pickIdentity({ linkedin: li, profile: { name: "Other" } }), { ...li, from: "linkedin" });
  assert.deepEqual(pickIdentity({ linkedin: null, profile: { name: "Bilal Ahmed" } }), { name: "Bilal Ahmed", headline: "", from: "profile" });
  assert.equal(pickIdentity({ linkedin: null, profile: { name: "Your Name" }, voice: parseVoice("- **Name:** Hina Raza\n- **What I do, in one sentence:** I build mobile apps") }).name, "Hina Raza");
  assert.equal(pickIdentity({ profile: { name: "Your Name" }, voice: parseVoice("- **Name:**\n- **What I do, in one sentence:**") }).from, "none");
  assert.equal(isRealName("{{name}}"), false);
  assert.equal(initials("sara  khan malik"), "SK");
});
