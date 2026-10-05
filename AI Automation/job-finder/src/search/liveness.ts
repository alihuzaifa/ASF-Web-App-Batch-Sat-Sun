// "Is this job still open?" — checked again right before anything is sent (auto apply, Apply now, Send email),
// because a job found days ago may have closed since. Free: reads the public page, no Claude call.
import type { Browser } from "playwright";
import type { Job } from "../store.js";
import { jobDetail } from "./linkedin.js";
import { readPosting } from "./posting.js";

export type Liveness = { open: true } | { open: false; reason: string } | { open: null; reason: string };

export async function checkStillOpen(browser: Browser, job: Job): Promise<Liveness> {
  try {
    if (job.source === "linkedin") {
      const d = await jobDetail(browser, job.id.replace(/^linkedin:/, ""));
      if (!d) return { open: false, reason: "the job page is gone" };
      return d.closed ? { open: false, reason: d.closed } : { open: true };
    }
    const p = await readPosting(browser, job.url, { notFoundIsClosed: true });
    if (!p) return { open: null, reason: "could not read the page" };
    return p.closed ? { open: false, reason: p.closed } : { open: true };
  } catch (err) {
    // Rate limits and network trouble mean "don't know", never "closed".
    return { open: null, reason: (err as Error).message.slice(0, 200) };
  }
}
