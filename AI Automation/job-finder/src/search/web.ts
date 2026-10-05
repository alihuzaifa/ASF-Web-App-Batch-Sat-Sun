// Jobs outside LinkedIn and Rozee: claude -p with only WebSearch finds posting URLs; the pipeline then reads
// each page with readPosting() (src/search/posting.ts). Mainly for postings that say "send your CV to <email>", which LinkedIn search rarely surfaces.
import { join } from "node:path";
import { PROMPTS_DIR } from "../lib/paths.js";
import { z } from "zod";
import { env } from "../config/env.js";
import type { Profile } from "../config/profile.js";
import { runClaude } from "../lib/claude.js";

const PROMPT = join(PROMPTS_DIR, "web-search.md");

const WebSearchOutput = z.object({
  results: z.array(z.object({ url: z.string().min(1), title: z.string(), company: z.string(), snippet: z.string() })).max(20),
});

export interface WebHit {
  url: string;
  title: string;
  company: string;
  found_by: string;
}

export async function webSearch(query: string, profile: Profile): Promise<{ hits: WebHit[]; costUsd: number }> {
  const { SEARCH_MODEL, CLAUDE_TIMEOUT_MS, CLAUDE_MAX_BUDGET_USD } = env();
  const request = {
    query,
    roles: profile.search.keywords,
    locations: profile.search.locations,
    posted_within_days: profile.search.posted_within_days,
    max_results: 10,
  };
  const { output, costUsd } = await runClaude({
    systemPromptFile: PROMPT,
    input: `<request>\n${JSON.stringify(request, null, 2)}\n</request>`,
    schema: WebSearchOutput,
    model: SEARCH_MODEL,
    timeoutMs: CLAUDE_TIMEOUT_MS,
    maxBudgetUsd: CLAUDE_MAX_BUDGET_USD,
    tools: ["WebSearch"],
  });
  const hits = output.results.flatMap((r) => {
    const url = normalizeUrl(r.url);
    return url ? [{ url, title: r.title, company: r.company, found_by: query }] : [];
  });
  return { hits, costUsd };
}

export function normalizeUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    u.hash = "";
    for (const k of [...u.searchParams.keys()]) if (/^utm_|^ref$|^trk/.test(k)) u.searchParams.delete(k);
    return u.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}
