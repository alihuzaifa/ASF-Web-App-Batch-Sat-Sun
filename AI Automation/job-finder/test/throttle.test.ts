// `npm test` — the rate-limit guard (src/lib/throttle.ts) and Claude's limit handling. No network, no real waiting.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { z } from "zod";
import { BlockedError, siteOf, Throttle } from "../src/lib/throttle.js";

/** A throttle on a fake clock: waits just move the clock forward and are recorded. */
function fake(path = join(mkdtempSync(join(tmpdir(), "jf-throttle-")), "rate-limits.json"), start = new Date("2026-10-01T10:00:00").getTime()) {
  const clock = { now: start };
  const waits: number[] = [];
  const t = new Throttle(path, () => clock.now, async (ms) => (waits.push(ms), (clock.now += ms), true), () => 0.5, 1);
  return { t, clock, waits, path };
}

test("sites are grouped by domain", () => {
  assert.equal(siteOf("https://pk.linkedin.com/jobs/view/1"), "linkedin.com");
  assert.equal(siteOf("https://www.linkedin.com/jobs-guest/x"), "linkedin.com");
  assert.equal(siteOf("https://www.rozee.pk/a-jobs-1"), "rozee.pk");
  assert.equal(siteOf("https://www.example.com/x"), "example.com");
});

test("two loads to one site are always spaced out; different sites do not wait for each other", async () => {
  const { t, waits } = fake();
  await t.before("https://www.linkedin.com/a");
  await t.before("https://www.rozee.pk/b");          // other site: no wait
  assert.deepEqual(waits, []);
  await t.before("https://www.linkedin.com/c");      // same site right away: waits the gap (8-16 s, here 12 s)
  assert.deepEqual(waits, [12000]);
});

test("a rate limit rests the site, longer each time, and the rest survives a restart", async () => {
  const { t, clock, path } = fake();
  const e1 = await t.blocked("https://www.linkedin.com/a", "HTTP 429");
  assert.ok(e1 instanceof BlockedError);
  await assert.rejects(t.before("https://www.linkedin.com/b"), (e: Error) => e instanceof BlockedError && /Resting until/.test(e.message));

  // A new process (the next run) reads the saved state and still leaves LinkedIn alone.
  const again = new Throttle(path, () => clock.now, async () => true, () => 0.5, 1);
  await assert.rejects(again.before("https://www.linkedin.com/b"), BlockedError);
  assert.ok(JSON.parse(readFileSync(path, "utf8")).sites["linkedin.com"].blocked_until > clock.now);

  clock.now += 31 * 60_000;                            // first rest: 30 min
  await t.before("https://www.linkedin.com/b");
  await t.blocked("https://www.linkedin.com/b", "HTTP 429"); // second strike: 60 min
  clock.now += 31 * 60_000;
  await assert.rejects(t.before("https://www.linkedin.com/c"), BlockedError);
  clock.now += 30 * 60_000;
  await t.before("https://www.linkedin.com/c");
  await t.ok("https://www.linkedin.com/c");            // a normal page resets the ladder
  assert.equal(JSON.parse(readFileSync(path, "utf8")).sites["linkedin.com"].strikes, 0);
});

test("two processes (dashboard + terminal run) see each other's limits through the file", async () => {
  const a = fake();
  const b = new Throttle(a.path, () => a.clock.now, async () => true, () => 0.5, 1); // the other process
  await b.before("https://www.rozee.pk/x");      // b creates the file
  await new Promise((r) => setTimeout(r, 20));    // mtime must move on filesystems with coarse timestamps
  await a.t.blocked("https://www.linkedin.com/a", "HTTP 429");
  await new Promise((r) => setTimeout(r, 20));
  await assert.rejects(b.before("https://www.linkedin.com/b"), BlockedError); // b sees a's block
  assert.equal(a.t.snapshot()["rozee.pk"]!.pages_today, 1);                     // a sees b's page, and kept it
});

test("Retry-After is honoured when longer than our own rest", async () => {
  const { t, clock } = fake();
  await t.blocked("https://www.rozee.pk/a", "HTTP 429", 3 * 3600);
  clock.now += 2 * 3600_000;
  await assert.rejects(t.before("https://www.rozee.pk/b"), BlockedError);
  clock.now += 3600_000 + 1000;
  await t.before("https://www.rozee.pk/b");
});

test("the daily page budget stops a site until the next day", async () => {
  const { t, clock } = fake();
  for (let i = 0; i < 80; i++) await t.before("https://www.rozee.pk/x"); // Rozee: 80 pages a day
  await assert.rejects(t.before("https://www.rozee.pk/y"), (e: Error) => /daily limit of 80 pages/.test(e.message));
  clock.now = new Date("2026-10-02T09:00:00").getTime();
  await t.before("https://www.rozee.pk/y");
});

test("rest() holds a site until a given time (LinkedIn's daily Easy Apply limit)", async () => {
  const { t, clock } = fake();
  await t.rest("linkedin-easy-apply", clock.now + 20 * 3600_000, 'LinkedIn says: "reached the daily limit"');
  assert.match(t.status("linkedin-easy-apply")!, /reached the daily limit/);
  clock.now += 21 * 3600_000;
  assert.equal(t.status("linkedin-easy-apply"), null);
});

test("Claude: a short rate limit is waited out and retried; a usage limit stops at once", async () => {
  const tmp = mkdtempSync(join(tmpdir(), "jf-claude-limit-"));
  process.env.CLAUDE_BIN = fileURLToPath(new URL("./fake-claude.mjs", import.meta.url));
  process.env.CLAUDE_RETRY_WAIT_MS = "10";
  delete process.env.FAKE_CLAUDE_FAIL_ONCE;
  const { runClaude, ClaudeRunError } = await import("../src/lib/claude.js");
  const opts = { systemPromptFile: join(tmp, "match.md"), input: "<job>{}</job>", schema: z.object({ score: z.number() }).passthrough(), model: "sonnet", timeoutMs: 30000 };

  process.env.FAKE_CLAUDE_LIMIT = "429";
  process.env.FAKE_CLAUDE_LIMIT_TIMES = "2";
  process.env.FAKE_CLAUDE_LIMIT_COUNTER = join(tmp, "count-a");
  const ok = await runClaude(opts);
  assert.equal(ok.output.score, 90); // two 429s, then success on the third try

  process.env.FAKE_CLAUDE_LIMIT = "usage";
  process.env.FAKE_CLAUDE_LIMIT_TIMES = "99";
  process.env.FAKE_CLAUDE_LIMIT_COUNTER = join(tmp, "count-b");
  await assert.rejects(runClaude(opts), (e: unknown) => e instanceof ClaudeRunError && e.kind === "rate_limit");
  assert.equal(readFileSync(join(tmp, "count-b"), "utf8"), "1"); // not retried
  delete process.env.FAKE_CLAUDE_LIMIT;
});
