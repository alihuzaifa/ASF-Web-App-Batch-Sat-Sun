import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { LOG_DIR } from "./paths.js";

/** One JSONL file per run: counts, errors and warnings. Job text and CVs stay in data/. */
export class RunLogger {
  readonly file: string;
  constructor(readonly runId: string) {
    mkdirSync(LOG_DIR, { recursive: true });
    this.file = join(LOG_DIR, `run-${runId}.jsonl`);
  }
  log(level: "info" | "warn" | "error", event: string, data: Record<string, unknown> = {}): void {
    appendFileSync(this.file, JSON.stringify({ ts: new Date().toISOString(), run_id: this.runId, level, event, ...data }) + "\n");
  }
}

export function newRunId(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

export function randomBetween(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

/** Resolves true after `ms`, or false as soon as `signal` aborts. */
export function sleep(ms: number, signal?: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve(false);
    const onAbort = () => {
      clearTimeout(t);
      resolve(false);
    };
    const t = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve(true);
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
