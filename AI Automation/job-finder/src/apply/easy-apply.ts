// LinkedIn Easy Apply in your logged-in browser profile (data/browser-profile, set up with `npm run login`).
//
// It fills only what it knows: your contact details and the answers in config/profile.json `answers`.
// It never guesses. If a required question has no answer, it closes the form without sending,
// and the job becomes "needs_you" with the question text, so you can add an answer and retry.
// test mode goes all the way to the Submit button and then discards.
import { basename } from "node:path";
import type { BrowserContext, Locator, Page } from "playwright";
import { isLoginUrl } from "../lib/browser.js";
import { BlockedError, politeGoto } from "../lib/throttle.js";
import type { Profile } from "../config/profile.js";

/** One thing the form will send, as shown to you for approval. */
export interface FilledField {
  step: number;        // 1-based form page
  question: string;
  answer: string;
  how: "your settings" | "filled by LinkedIn" | "CV file" | "cover letter" | "unticked";
}

export type EasyApplyResult =
  | { kind: "applied"; fields: FilledField[] }
  | { kind: "tested"; fields: FilledField[] }   // reached Submit without sending: this is what would be sent
  | { kind: "changed"; fields: FilledField[]; differences: string[] } // form differs from what you approved: not sent
  | { kind: "needs_you"; questions: string[]; fields: FilledField[] }
  | { kind: "already_applied" }
  | { kind: "not_easy_apply"; apply_url: string | null }
  | { kind: "not_logged_in" }
  | { kind: "limit"; reason: string }            // LinkedIn's daily Easy Apply limit, a 429, or our own rest period
  | { kind: "failed"; error: string };

const MAX_STEPS = 12;

/** What LinkedIn shows when you have applied to too many jobs for today. */
const DAILY_LIMIT = /reached (the |your |today'?s )?(daily )?(easy apply )?(application )?limit|limit (for|of) today|(easy apply|application) limit for today|applying to (too many|a lot of) jobs/i;

async function limitShown(page: Page): Promise<string | null> {
  const text = await page.locator("body").innerText({ timeout: 3000 }).catch(() => "");
  return DAILY_LIMIT.exec(text)?.[0] ?? null;
}

export interface ApplyFiles {
  cvPdf: string;
  /** Typed into a "cover letter" text box when the form has one. */
  coverLetter: string | null;
}

/** "question = answer" lines, the unit compared between what you approved and what the form has now. */
export const fieldKeys = (fields: FilledField[]) => fields.map((f) => `${f.question} = ${f.answer}`);

/**
 * `submit: false` fills every step and stops before Submit (nothing is sent) and returns the fields.
 * `submit: true` with `approved` (the fields you saw) sends only if the form produces exactly those fields;
 * any new question or different answer comes back as "changed" without sending.
 */
export async function easyApply(
  ctx: BrowserContext, jobUrl: string, files: ApplyFiles, profile: Profile, opts: { submit: boolean; approved?: FilledField[] },
): Promise<EasyApplyResult> {
  const fields: FilledField[] = [];
  const page = await ctx.newPage();
  try {
    // Same throttle as the guest reads, so all LinkedIn traffic together stays slow.
    try {
      await politeGoto(page, jobUrl, 45000);
    } catch (err) {
      if (err instanceof BlockedError) return { kind: "limit", reason: err.message };
      throw err;
    }
    await page.waitForTimeout(2500);
    if (isLoginUrl(page.url()) || (await page.locator("a[href*='/login'], .sign-in-form").first().isVisible().catch(() => false))) {
      return { kind: "not_logged_in" };
    }
    const shown = await limitShown(page);
    if (shown) return { kind: "limit", reason: `LinkedIn says: "${shown}"` };
    if (await page.getByText(/^\s*Applied\s+\d+\s+\w+\s+ago/i).first().isVisible().catch(() => false)) {
      return { kind: "already_applied" };
    }

    const button = page.locator("button.jobs-apply-button, button[aria-label*='Easy Apply'], a[aria-label*='Easy Apply']").first();
    if (!(await appears(button, 8000))) {
      const external = page.locator("button.jobs-apply-button, a.jobs-apply-button, [aria-label^='Apply']").first();
      const href = await external.getAttribute("href", { timeout: 2000 }).catch(() => null);
      return { kind: "not_easy_apply", apply_url: href };
    }
    const label = (await button.getAttribute("aria-label")) ?? (await button.innerText());
    if (!/easy apply/i.test(label)) return { kind: "not_easy_apply", apply_url: null };

    await button.click();
    const dialog = page.locator("[role='dialog']").filter({ has: page.locator("form, button") }).first();
    await dialog.waitFor({ state: "visible", timeout: 15000 });
    const limit = await limitShown(page); // the daily-limit notice opens as a dialog instead of the form
    if (limit) {
      await page.keyboard.press("Escape").catch(() => {});
      return { kind: "limit", reason: `LinkedIn says: "${limit}"` };
    }

    let lastSignature = "";
    let sameCount = 0;
    for (let step = 0; step < MAX_STEPS; step++) {
      await page.waitForTimeout(1200);
      const unknown = await fillStep(dialog, files, profile, step + 1, fields);
      if (unknown.length) {
        await discard(page);
        return { kind: "needs_you", questions: unknown, fields };
      }

      const submit = dialog.locator("button[aria-label='Submit application'], button:has-text('Submit application')").first();
      if (await submit.isVisible().catch(() => false)) {
        await uncheckFollow(dialog, step + 1, fields);
        if (!opts.submit) {
          await discard(page);
          return { kind: "tested", fields };
        }
        if (opts.approved) {
          const before = new Set(fieldKeys(opts.approved));
          const now = new Set(fieldKeys(fields));
          const differences = [
            ...[...now].filter((k) => !before.has(k)).map((k) => `new or different: ${k}`),
            ...[...before].filter((k) => !now.has(k)).map((k) => `no longer asked: ${k}`),
          ];
          if (differences.length) {
            await discard(page);
            return { kind: "changed", fields, differences };
          }
        }
        await submit.click();
        const sent = await page
          .getByText(/application (was )?sent|your application was sent|applied to/i).first()
          .waitFor({ state: "visible", timeout: 20000 })
          .then(() => true, () => false);
        await page.keyboard.press("Escape").catch(() => {});
        return sent ? { kind: "applied", fields } : { kind: "failed", error: "pressed Submit but saw no confirmation; check LinkedIn > My jobs" };
      }

      const next = dialog
        .locator("button[aria-label='Review your application'], button[aria-label='Continue to next step'], button:has-text('Review'), button:has-text('Next')")
        .first();
      if (!(await next.isVisible().catch(() => false))) {
        await discard(page);
        return { kind: "failed", error: "no Next / Review / Submit button in the form" };
      }
      await next.click();
      await page.waitForTimeout(1500);

      const errors = await visibleErrors(dialog);
      if (errors.length) {
        await discard(page);
        return { kind: "needs_you", questions: errors, fields };
      }
      // Same heading + progress after clicking Next twice = stuck on a step we can't complete.
      const signature = (await dialog.innerText().catch(() => "")).slice(0, 400);
      sameCount = signature === lastSignature ? sameCount + 1 : 0;
      lastSignature = signature;
      if (sameCount >= 2) {
        await discard(page);
        return { kind: "needs_you", questions: ["The form did not move forward. Open the job and finish it by hand."], fields };
      }
    }
    await discard(page);
    return { kind: "failed", error: `form had more than ${MAX_STEPS} steps` };
  } catch (err) {
    await discard(page).catch(() => {});
    return { kind: "failed", error: (err as Error).message.slice(0, 500) };
  } finally {
    await page.close().catch(() => {});
  }
}

/**
 * Fills the current step and records every value the form now holds in `log` (including ones LinkedIn
 * filled in itself), so you can see exactly what would be sent. Returns the questions it could not answer.
 */
async function fillStep(dialog: Locator, files: ApplyFiles, profile: Profile, step: number, log: FilledField[]): Promise<string[]> {
  const unknown: string[] = [];
  const note = (question: string, answer: string, how: FilledField["how"]) => log.push({ step, question, answer, how });

  // Resume: upload the tailored PDF if this step has an upload field. LinkedIn selects the new upload.
  const file = dialog.locator("input[type='file']").first();
  if ((await file.count()) && /resume|cv/i.test((await dialog.innerText().catch(() => "")))) {
    await file.setInputFiles(files.cvPdf).catch(() => {});
    note("Resume", basename(files.cvPdf), "CV file");
    await dialog.page().waitForTimeout(2500);
  }

  // Text inputs and text areas.
  for (const input of await dialog.locator("input[type='text'], input[type='tel'], input[type='email'], input[type='number'], input:not([type]), textarea").all()) {
    if (!(await input.isVisible()) || !(await input.isEditable())) continue;
    const q = await questionFor(input);
    const existing = (await input.inputValue()).trim();
    if (existing) { // prefilled by LinkedIn: leave it, but show it
      note(q, existing, "filled by LinkedIn");
      continue;
    }
    const numeric = (await input.getAttribute("type")) === "number" || /numeric/i.test((await input.getAttribute("id")) ?? "");
    const isCover = /cover letter/i.test(q);
    let answer = isCover ? files.coverLetter ?? undefined : answerFor(q, profile, "text");
    if (answer !== undefined && numeric) answer = /\d+(\.\d+)?/.exec(answer)?.[0];
    if (answer === undefined) {
      if (await isRequired(input, q)) unknown.push(q);
      continue;
    }
    await input.fill(answer);
    note(q, answer, isCover ? "cover letter" : "your settings");
    // Location fields open a typeahead; pick the first suggestion.
    if (/city|location/i.test(q)) {
      await dialog.page().waitForTimeout(1200);
      const option = dialog.page().locator("[role='listbox'] [role='option']").first();
      if (await option.isVisible().catch(() => false)) await option.click();
    }
  }

  // Dropdowns.
  for (const select of await dialog.locator("select").all()) {
    if (!(await select.isVisible())) continue;
    const q = await questionFor(select);
    const current = await select.evaluate((s: HTMLSelectElement) =>
      s.selectedIndex > 0 && !/select an option/i.test(s.options[s.selectedIndex]?.text ?? "") ? s.options[s.selectedIndex]!.text.trim() : "");
    if (current) {
      note(q, current, "filled by LinkedIn");
      continue;
    }
    const answer = answerFor(q, profile, "choice");
    const options = await select.evaluate((s: HTMLSelectElement) => [...s.options].map((o) => o.text.trim()));
    const pick = answer === undefined ? undefined : pickOption(options, answer);
    if (pick) {
      await select.selectOption({ label: pick });
      note(q, pick, "your settings");
    } else unknown.push(q);
  }

  // Radio groups (usually Yes/No).
  for (const group of await dialog.locator("fieldset").all()) {
    if (!(await group.isVisible())) continue;
    const radios = group.locator("input[type='radio']");
    if (!(await radios.count())) continue;
    const q = ((await group.locator("legend").first().innerText().catch(() => "")) || (await group.innerText())).split("\n")[0]!.trim();
    const checked = group.locator("input[type='radio']:checked").first();
    if (await checked.count()) {
      const id = await checked.getAttribute("id");
      const text = id ? await group.locator(`label[for='${id}']`).first().innerText().catch(() => "") : "";
      note(q, clean(text) || "(chosen)", "filled by LinkedIn");
      continue;
    }
    const answer = answerFor(q, profile, "choice");
    if (answer === undefined) {
      unknown.push(q);
      continue;
    }
    const label = group.locator("label").filter({ hasText: new RegExp(`^\\s*${escapeRe(answer)}\\s*$`, "i") }).first();
    if (await label.count()) {
      await label.click();
      note(q, answer, "your settings");
    } else unknown.push(q);
  }

  return unknown;
}

async function uncheckFollow(dialog: Locator, step: number, log: FilledField[]) {
  const follow = dialog.locator("input[type='checkbox'][id*='follow']").first();
  if ((await follow.count()) && (await follow.isChecked().catch(() => false))) {
    await dialog.locator(`label[for='${await follow.getAttribute("id")}']`).click().catch(() => {});
    log.push({ step, question: "Follow the company", answer: "No", how: "unticked" });
  }
}

async function questionFor(el: Locator): Promise<string> {
  const id = await el.getAttribute("id");
  if (id) {
    const label = el.page().locator(`label[for='${id.replace(/'/g, "\\'")}']`).first();
    if (await label.count()) return clean(await label.innerText());
  }
  return clean((await el.getAttribute("aria-label")) ?? (await el.getAttribute("placeholder")) ?? "unlabelled field");
}

async function isRequired(el: Locator, q: string): Promise<boolean> {
  return (await el.getAttribute("required")) !== null || (await el.getAttribute("aria-required")) === "true" || /\*\s*$/.test(q);
}

async function visibleErrors(dialog: Locator): Promise<string[]> {
  const out: string[] = [];
  for (const e of await dialog.locator(".artdeco-inline-feedback--error").all()) {
    if (!(await e.isVisible())) continue;
    const field = e.locator("xpath=ancestor::*[.//label or .//legend][1]");
    const q = clean((await field.locator("label, legend").first().innerText().catch(() => "")) || "");
    out.push(`${q || "a field"}: ${clean(await e.innerText())}`);
  }
  return out;
}

async function discard(page: Page) {
  const dismiss = page.locator("[role='dialog'] button[aria-label='Dismiss']").first();
  if (await dismiss.isVisible().catch(() => false)) {
    await dismiss.click();
    const confirm = page.locator("button[data-control-name='discard_application_confirm_btn'], button:has-text('Discard')").first();
    if (await appears(confirm, 3000)) await confirm.click();
  }
}

/**
 * Answer for one form question, from config/profile.json. Your own `answers.questions` regexes win;
 * then contact details and the common questions. undefined = no answer (never guessed).
 * `kind` "choice" = Yes/No radio or dropdown, so "Do you have 5+ years of React?" is answered Yes/No
 * from your real years (a truthful No beats a stopped application).
 */
export function answerFor(question: string, p: Profile, kind: "text" | "choice" = "text"): string | undefined {
  const q = question.toLowerCase();
  for (const rule of p.answers.questions) if (new RegExp(rule.match, "i").test(question)) return rule.answer;

  const a = p.answers;
  const nonEmpty = (s: string) => (s.trim() ? s.trim() : undefined);
  const [first, ...rest] = p.me.name.split(/\s+/);
  const skill = skillIn(q, Object.keys(a.skill_years));

  if (/years?.*(experience|work)|experience.*years?|how many years/.test(q)) {
    const have = skill ? a.skill_years[skill]! : a.years_of_experience;
    const need = /(?:at least|minimum(?: of)?|more than|over)\s*(\d+)|(\d+)\s*\+?\s*(?:or more )?years?/.exec(q);
    if (kind === "choice" && need) return have >= Number(need[1] ?? need[2]) ? "Yes" : "No";
    return String(have);
  }
  if (kind === "choice" && /^(do|have) you (have )?(any )?(hands-on |professional |working )?(experience|knowledge|worked)/.test(q)) {
    return skill ? (a.skill_years[skill]! > 0 ? "Yes" : "No") : undefined;
  }
  if (/first name/.test(q)) return first;
  if (/last name|surname/.test(q)) return nonEmpty(rest.join(" "));
  if (/full name|^name\b/.test(q)) return p.me.name;
  if (/phone|mobile/.test(q) && !/country code/.test(q)) return nonEmpty(p.me.phone);
  if (/e-?mail/.test(q)) return p.me.email;
  if (/linkedin/.test(q)) return nonEmpty(p.me.linkedin);
  if (/github/.test(q)) return nonEmpty(p.me.github);
  if (/website|portfolio/.test(q)) return nonEmpty(p.me.website) ?? nonEmpty(p.me.github);
  if (/city|location|where .*(live|based)/.test(q)) return nonEmpty(p.me.location);
  if (/notice period|when can you start|start date|availability/.test(q)) return nonEmpty(a.notice_period);
  if (/expected (salary|ctc|compensation)|salary expectation|desired (salary|pay)/.test(q)) return nonEmpty(a.expected_salary);
  if (/current (salary|ctc|compensation)/.test(q)) return nonEmpty(a.current_salary);
  return undefined;
}

/** Longest skill from skill_years found as a whole word in the question ("react native" beats "react"). */
function skillIn(q: string, skills: string[]): string | undefined {
  return skills
    .filter((s) => new RegExp(`(^|[^a-z0-9])${escapeRe(s.toLowerCase())}($|[^a-z0-9])`).test(q))
    .sort((x, y) => y.length - x.length)[0];
}

/** Dropdown option for an answer: exact text, then contains, then a numeric range ("3-5", "5+") holding the number. */
export function pickOption(options: string[], answer: string): string | undefined {
  const low = answer.toLowerCase();
  const real = options.filter((o) => !/select an option/i.test(o));
  const text = real.find((o) => o.toLowerCase() === low) ?? real.find((o) => o.toLowerCase().includes(low));
  if (text || !/^\d+$/.test(answer)) return text;
  const n = Number(answer);
  return real.find((o) => {
    const range = /(\d+)\s*(?:-|to|–)\s*(\d+)/.exec(o);
    if (range) return n >= Number(range[1]) && n <= Number(range[2]);
    const plus = /(\d+)\s*\+/.exec(o);
    return plus ? n >= Number(plus[1]) : false;
  });
}

/** Waits up to `ms` for the element to show. (Locator.isVisible() does not wait, whatever timeout it is given.) */
const appears = (l: Locator, ms: number) => l.waitFor({ state: "visible", timeout: ms }).then(() => true, () => false);

const clean = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, 300);
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
