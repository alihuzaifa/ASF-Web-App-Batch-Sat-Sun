// Two browsers, kept apart on purpose:
// - guest: logged out, no cookies. Used for searching and reading job posts, so heavy reading never touches your account.
// - account: a persistent profile in data/browser-profile where you logged in once with `npm run login`. Used only for Easy Apply.
import { chromium, type Browser, type BrowserContext } from "playwright";
import { ACCOUNT_PROFILE_DIR } from "./paths.js";
import { env } from "../config/env.js";

export { ACCOUNT_PROFILE_DIR };

function channel(): string | undefined {
  const c = env().BROWSER_CHANNEL;
  return c === "chromium" ? undefined : c;
}

export async function openGuestBrowser(): Promise<Browser> {
  return chromium.launch({ headless: env().HEADLESS, channel: channel() });
}

export async function openAccountBrowser(opts: { headless?: boolean } = {}): Promise<BrowserContext> {
  return chromium.launchPersistentContext(ACCOUNT_PROFILE_DIR, {
    headless: opts.headless ?? env().HEADLESS,
    channel: channel(),
    viewport: { width: 1280, height: 900 },
  });
}

/** True for LinkedIn login / auth-wall / checkpoint URLs. */
export function isLoginUrl(url: string): boolean {
  return /linkedin\.com\/(authwall|login|uas\/login|checkpoint|signup)/i.test(url);
}
