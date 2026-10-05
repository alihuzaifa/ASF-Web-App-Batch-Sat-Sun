// `npm run fixtures:capture` — saves fresh copies of real LinkedIn / Rozee pages into test/fixtures/,
// so `npm test` checks the parsers against what those sites serve today. Run it when a site changes its markup.
// Reads public pages only, slowly, with the logged-out guest browser.
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { openGuestBrowser } from "../src/lib/browser.js";
import { ROOT } from "../src/lib/paths.js";

const OUT = join(ROOT, "test", "fixtures");
await mkdir(OUT, { recursive: true });

const browser = await openGuestBrowser();
const pause = () => new Promise((r) => setTimeout(r, 8000));

async function save(name: string, url: string, waitFor?: string) {
  const page = await browser.newPage();
  try {
    const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    if (waitFor) await page.waitForSelector(waitFor, { state: "attached", timeout: 30000 });
    await page.waitForTimeout(1500);
    const status = res?.status() ?? 0;
    if (status >= 400) throw new Error(`${name}: HTTP ${status}`);
    // Drop scripts (except JSON-LD) so the saved page is static and small.
    await page.evaluate(() => document.querySelectorAll("script:not([type='application/ld+json']), iframe").forEach((s) => s.remove()));
    const html = await page.content();
    await writeFile(join(OUT, name), html);
    console.log(`saved ${name} (${url})`);
    return html;
  } finally {
    await page.close();
  }
}

try {
  const searchUrl = "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=React%20Developer&location=Pakistan&f_TPR=r604800&start=0";
  await save("linkedin-search.html", searchUrl, "div.base-card");
  await pause();
  const easy = "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=React%20Developer&location=Pakistan&f_TPR=r604800&f_AL=true&start=0";
  const p = await browser.newPage();
  await p.goto(easy, { waitUntil: "domcontentloaded" });
  const id = /jobPosting:(\d+)/.exec(await p.content())?.[1];
  await p.close();
  if (!id) throw new Error("no Easy Apply job found to capture");
  await pause();
  await save("linkedin-detail-easy-apply.html", `https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${id}`);
  await pause();
  const rozee = await save("rozee-search.html", "https://www.rozee.pk/job/jsearch/q/react%20developer", "a[href*='-jobs-']");
  const path = /href="(?:https:)?\/\/www\.rozee\.pk(\/[a-z0-9-]*-jobs-\d+)/.exec(rozee)?.[1]; // plain slug: Rozee's own emoji slugs 404
  if (!path) throw new Error("no Rozee job link found");
  await pause();
  await save("rozee-detail.html", `https://www.rozee.pk${path}`, "script[type='application/ld+json']");
} finally {
  await browser.close();
}
