// `npm run search:preview` — one LinkedIn search page per keyword (first location only). Free, writes nothing.
import { loadProfile } from "../config/profile.js";
import { openGuestBrowser } from "../lib/browser.js";
import { JobStore } from "../store.js";
import { searchPage } from "./linkedin.js";

const profile = await loadProfile();
const store = await JobStore.load();
const browser = await openGuestBrowser();
try {
  const location = profile.search.locations[0]!;
  for (const keyword of profile.search.keywords) {
    const jobs = await searchPage(browser, keyword, location, profile.search, 0);
    console.log(`\n${keyword} in ${location}: ${jobs.length} jobs`);
    for (const j of jobs) {
      const seen = store.has(`linkedin:${j.linkedin_id}`) ? " (seen)" : "";
      console.log(`  ${j.title} - ${j.company} - ${j.location}${seen}\n    ${j.url}`);
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
} finally {
  await browser.close();
}
