// `npm run replies` — check your inbox for replies to applications right now (also runs after every `npm run start`).
import { emailConfigured } from "./apply/email.js";
import { checkReplies, imapSource } from "./inbox/replies.js";
import { JobStore } from "./store.js";

if (!emailConfigured()) {
  console.error("Email is not set up. Put SMTP_USER and SMTP_PASS (a Gmail app password) in .env first.");
  process.exit(1);
}
const store = await JobStore.load();
const mail = await imapSource();
try {
  const r = await checkReplies(store, mail);
  console.log(`${r.checked} new emails checked, ${r.matched} about your applications, cost $${r.cost_usd.toFixed(3)}`);
  for (const u of r.updates) console.log(`  ${u.kind.padEnd(10)} ${u.title} - ${u.company}: ${u.summary}  -> ${u.status}`);
} finally {
  await mail.close();
}
