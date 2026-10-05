// Whose name goes on a LinkedIn draft: the account logged in with `npm run login`, else config/profile.json,
// else ~/.claude/linkedin/voice.md. Never a hard-coded person.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { isLoginUrl, openAccountBrowser } from "../lib/browser.js";
import { ACCOUNT_PROFILE_DIR } from "../lib/paths.js";
import { politeGoto } from "../lib/throttle.js";

export type Identity = { name: string; headline: string; from: "linkedin" | "profile" | "voice" | "none" };
type Found = { name?: string | null; headline?: string | null } | null;

/** The template's "Your Name" and empty values don't count as a name. */
export function isRealName(name: string | null | undefined): name is string {
  const n = (name ?? "").trim();
  return n.length > 0 && !/^your name$/i.test(n) && !/[{}<>]/.test(n);
}

export function pickIdentity(sources: { linkedin?: Found; profile?: Found; voice?: Found }): Identity {
  for (const from of ["linkedin", "profile", "voice"] as const) {
    const s = sources[from];
    if (s && isRealName(s.name)) return { name: s.name.trim(), headline: (s.headline ?? "").trim(), from };
  }
  return { name: "Your Name", headline: "", from: "none" };
}

export function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
}

/** "- **Name:** Sara Khan" and "- **What I do, in one sentence:** ..." from voice.md. */
export function parseVoice(md: string): Found {
  const field = (label: string) => new RegExp(`\\*\\*${label}[^*]*:\\*\\*[ \\t]*(.*)`, "i").exec(md)?.[1]?.trim() || null;
  return { name: field("Name"), headline: field("What I do") };
}

export function readVoice(path = join(homedir(), ".claude", "linkedin", "voice.md")): Found {
  return existsSync(path) ? parseVoice(readFileSync(path, "utf8")) : null;
}

/** "(3) Sara Khan | LinkedIn" -> "Sara Khan". */
export function nameFromTitle(title: string): string | null {
  return /^(?:\(\d+\)\s*)?(.+?)\s*\|\s*LinkedIn$/.exec(title.trim())?.[1] ?? null;
}

/** Reads the name and headline from the logged-in account's own profile page. null when nobody is logged in. */
export async function readLinkedInIdentity(): Promise<Found> {
  if (!existsSync(ACCOUNT_PROFILE_DIR) || readdirSync(ACCOUNT_PROFILE_DIR).length === 0) return null;
  const ctx = await openAccountBrowser({ headless: true });
  try {
    const page = ctx.pages()[0] ?? (await ctx.newPage());
    await politeGoto(page, "https://www.linkedin.com/in/me/", 45000);
    if (isLoginUrl(page.url())) return null;
    // The page markup changes often (in 2026 the name moved from h1 to an h2 with generated class names);
    // the title "Name | LinkedIn" has stayed, so the name comes from there.
    await page.waitForFunction(() => /\| LinkedIn$/.test(document.title), null, { timeout: 30000 }).catch(() => {});
    const name = nameFromTitle(await page.title());
    // The headline is the line under the name in the top card; "--" means it is empty.
    const headline = name
      ? await page.evaluate((n) => {
          const h = [...document.querySelectorAll("main h1, main h2")].find((e) => e.textContent?.trim() === n);
          const lines = (h?.closest("section")?.textContent ?? "").split(/\n/).map((l) => l.trim()).filter(Boolean);
          const i = lines.indexOf(n);
          return i >= 0 ? lines.slice(i + 1).find((l) => !/^verify/i.test(l)) ?? null : null;
        }, name).catch(() => null)
      : null;
    return { name, headline: headline && !/^-+$/.test(headline) ? headline : null };
  } finally {
    await ctx.close();
  }
}
