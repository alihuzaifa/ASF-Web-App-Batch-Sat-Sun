import { config as loadDotenv } from "dotenv";
import { z } from "zod";

loadDotenv({ quiet: true });

const boolish = z
  .enum(["true", "false", "1", "0"])
  .transform((v) => v === "true" || v === "1");

const EnvSchema = z
  .object({
    HEADLESS: boolish.default(true),
    /** "chrome" uses the installed Google Chrome; "chromium" uses Playwright's bundled browser. */
    BROWSER_CHANNEL: z.enum(["chrome", "msedge", "chromium"]).default("chrome"),
    /** Multiplies every per-site gap in src/lib/throttle.ts. 2 = twice as slow. */
    SLOWDOWN: z.coerce.number().min(1).max(10).default(1),
    APPLY_DELAY_MIN_MS: z.coerce.number().int().nonnegative().default(30000),
    APPLY_DELAY_MAX_MS: z.coerce.number().int().nonnegative().default(60000),
    PAGE_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
    MATCH_MODEL: z.string().min(1).default("sonnet"),
    TAILOR_MODEL: z.string().min(1).default("sonnet"),
    SEARCH_MODEL: z.string().min(1).default("sonnet"),
    CLAUDE_TIMEOUT_MS: z.coerce.number().int().positive().default(180000),
    CLAUDE_MAX_BUDGET_USD: z.coerce.number().positive().default(0.5),
    SMTP_HOST: z.string().default("smtp.gmail.com"),
    SMTP_PORT: z.coerce.number().int().positive().default(465),
    SMTP_USER: z.string().default(""),
    SMTP_PASS: z.string().default(""),
    /** Reading replies uses the same login as sending (SMTP_USER / SMTP_PASS). */
    IMAP_HOST: z.string().default("imap.gmail.com"),
    IMAP_PORT: z.coerce.number().int().positive().default(993),
    UI_PORT: z.coerce.number().int().min(1).max(65535).default(3100),
  })
  .refine((e) => e.APPLY_DELAY_MAX_MS >= e.APPLY_DELAY_MIN_MS, { message: "APPLY_DELAY_MAX_MS must be >= APPLY_DELAY_MIN_MS" });

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | undefined;

export function env(): Env {
  if (!cached) {
    const parsed = EnvSchema.safeParse(process.env);
    if (!parsed.success) throw new Error(`Invalid .env: ${z.prettifyError(parsed.error)}`);
    cached = parsed.data;
  }
  return cached;
}
