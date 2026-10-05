// `npm run login` — opens the Easy Apply browser profile so you can log in to LinkedIn yourself, once.
// Your password is typed by you into LinkedIn and never stored by this project; only the browser's own cookies are kept in data/browser-profile.
import { openAccountBrowser } from "./lib/browser.js";

const ctx = await openAccountBrowser({ headless: false });
const page = ctx.pages()[0] ?? (await ctx.newPage());
await page.goto("https://www.linkedin.com/login");
console.log("Log in to LinkedIn in the window that opened. Close the window when you see your feed.");
await new Promise<void>((resolve) => ctx.on("close", () => resolve()));
console.log("Saved. Easy Apply will use this login.");
