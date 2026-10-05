import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { z } from "zod";

export type ClaudeErrorKind = "timeout" | "process" | "envelope" | "claude_error" | "parse" | "schema" | "rate_limit";

export class ClaudeRunError extends Error {
  constructor(readonly kind: ClaudeErrorKind, message: string, readonly costUsd = 0) {
    super(message);
    this.name = "ClaudeRunError";
  }
}

/** API-side limits: 429 rate_limit_error, 529 overloaded. Short; worth waiting a minute and trying again. */
const SHORT_LIMIT = /rate.?limit|too many requests|\b429\b|overloaded|\b529\b/i;
/** The account's usage limit ("Claude AI usage limit reached", "limit will reset at ..."). Hours; never retried. */
const USAGE_LIMIT = /usage limit|limit (has been )?reached|limit will reset|out of (extra )?usage|credit balance/i;

const retryWaitsMs = () => (process.env.CLAUDE_RETRY_WAIT_MS ? [Number(process.env.CLAUDE_RETRY_WAIT_MS), Number(process.env.CLAUDE_RETRY_WAIT_MS)] : [60_000, 150_000]);

const EnvelopeSchema = z.object({
  type: z.literal("result"),
  subtype: z.string(),
  is_error: z.boolean(),
  result: z.string().optional(),
  structured_output: z.unknown().optional(),
  total_cost_usd: z.number().optional(),
});

export interface ClaudeRunOptions<T extends z.ZodType> {
  systemPromptFile: string;
  input: string;
  schema: T;
  model: string;
  timeoutMs: number;
  maxBudgetUsd?: number;
  tools?: string[];
}

/**
 * One headless Claude Code call, locked down the same way as the lead-gen pipeline:
 * no tools unless listed, no MCP servers, no settings or hooks, empty cwd so no CLAUDE.md loads.
 * Output is validated against `schema`; anything else is an error.
 */
export async function runClaude<T extends z.ZodType>(opts: ClaudeRunOptions<T>): Promise<{ output: z.infer<T>; costUsd: number }> {
  let spent = 0;
  let schemaRetries = 1;
  const limitWaits = retryWaitsMs();
  for (;;) {
    try {
      const r = await runOnce(opts);
      return { output: r.output, costUsd: r.costUsd + spent };
    } catch (err) {
      if (!(err instanceof ClaudeRunError)) throw err;
      spent += err.costUsd;
      const withCost = () => new ClaudeRunError(err.kind, err.message, spent);
      // The model sometimes misses the output schema a few times in a row (error_max_structured_output_retries);
      // one fresh call almost always succeeds.
      if ((err.kind === "schema" || err.kind === "parse" || (err.kind === "claude_error" && /structured_output/.test(err.message))) && schemaRetries-- > 0) continue;
      // A short API limit: wait (1 min, then 2.5 min) and try again. A usage limit is left to the caller, which stops the run.
      if (err.kind === "rate_limit" && !USAGE_LIMIT.test(err.message) && limitWaits.length) {
        await new Promise((r) => setTimeout(r, limitWaits.shift()));
        continue;
      }
      throw withCost();
    }
  }
}

async function runOnce<T extends z.ZodType>(opts: ClaudeRunOptions<T>): Promise<{ output: z.infer<T>; costUsd: number }> {
  const tools = (opts.tools ?? []).join(",");
  const args = [
    "-p",
    "--output-format", "json",
    "--system-prompt-file", opts.systemPromptFile,
    "--tools", tools,
    "--allowedTools", tools,
    "--strict-mcp-config",
    "--setting-sources", "",
    "--no-session-persistence",
    "--model", opts.model,
    "--json-schema", JSON.stringify(z.toJSONSchema(opts.schema, { target: "draft-7" })),
  ];
  if (opts.maxBudgetUsd) args.push("--max-budget-usd", String(opts.maxBudgetUsd));

  const cwd = await mkdtemp(join(tmpdir(), "jobfinder-claude-"));
  try {
    const { stdout, stderr, code } = await spawnWithTimeout(args, opts.input, cwd, opts.timeoutMs);
    let envelope: z.infer<typeof EnvelopeSchema>;
    try {
      envelope = EnvelopeSchema.parse(JSON.parse(stdout));
    } catch {
      const text = stdout || stderr;
      const limited = SHORT_LIMIT.test(text) || USAGE_LIMIT.test(text);
      throw new ClaudeRunError(limited ? "rate_limit" : "envelope", `exit ${code}; ${limited ? "" : "unparseable output: "}${truncate(text, 300)}`);
    }
    const costUsd = envelope.total_cost_usd ?? 0;
    if (envelope.is_error || envelope.subtype !== "success") {
      const msg = `${envelope.subtype}: ${truncate(envelope.result ?? "", 300)}`;
      const limited = SHORT_LIMIT.test(envelope.result ?? "") || USAGE_LIMIT.test(envelope.result ?? "");
      throw new ClaudeRunError(limited ? "rate_limit" : "claude_error", msg, costUsd);
    }
    let candidate: unknown;
    try {
      candidate = JSON.parse((envelope.result ?? "").replace(/^```(?:json)?\s*|\s*```$/g, ""));
    } catch {
      candidate = envelope.structured_output;
    }
    if (candidate === undefined) throw new ClaudeRunError("parse", `result is not JSON: ${truncate(envelope.result ?? "", 300)}`, costUsd);
    const parsed = opts.schema.safeParse(candidate);
    if (!parsed.success) throw new ClaudeRunError("schema", z.prettifyError(parsed.error), costUsd);
    return { output: parsed.data, costUsd };
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

function spawnWithTimeout(args: string[], input: string, cwd: string, timeoutMs: number) {
  return new Promise<{ stdout: string; stderr: string; code: number | null }>((resolve, reject) => {
    // CLAUDE_BIN may point at a .mjs/.js script (the tests' fake claude); run it with this Node.
    const program = claudeBin();
    const [cmd, argv] = /\.m?js$/.test(program) ? [process.execPath, [program, ...args]] : [program, args];
    const child = spawn(cmd, argv, { cwd, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 5000).unref();
    }, timeoutMs);
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(new ClaudeRunError("process", `failed to start claude: ${err.message}`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut) reject(new ClaudeRunError("timeout", `claude -p exceeded ${timeoutMs}ms`));
      else resolve({ stdout, stderr, code });
    });
    child.stdin.end(input);
  });
}

let bin: string | undefined;

/**
 * On Windows `claude` on PATH is an npm `.cmd` shim, which `spawn` can't run without a shell
 * (and cmd.exe would mangle the JSON schema argument). The shim just calls a native exe, so run that directly.
 */
export function claudeBin(): string {
  if (bin) return bin;
  bin = process.env.CLAUDE_BIN || "claude";
  if (!process.env.CLAUDE_BIN && process.platform === "win32") {
    for (const dir of (process.env.PATH ?? "").split(delimiter)) {
      const exe = join(dir, "node_modules", "@anthropic-ai", "claude-code", "bin", "claude.exe");
      if (existsSync(join(dir, "claude.cmd")) && existsSync(exe)) {
        bin = exe;
        break;
      }
      if (existsSync(join(dir, "claude.exe"))) {
        bin = join(dir, "claude.exe");
        break;
      }
    }
  }
  return bin;
}

const truncate = (s: string, n: number) => (s.length > n ? s.slice(0, n) + "…" : s);
