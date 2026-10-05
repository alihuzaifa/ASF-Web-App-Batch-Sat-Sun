// Tailored CV → one HTML page → PDF (Playwright page.pdf). Two columns, real text, no images.
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Browser } from "playwright";
import type { Profile } from "../config/profile.js";
import type { TailoredCv } from "../match/schema.js";
import { CVS_DIR } from "../lib/paths.js";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const url = (s: string) => (/^https?:\/\//i.test(s) ? s : `https://${s}`);
const link = (href: string, text: string) => `<a href="${esc(url(href))}">${esc(text)}</a>`;
// "Team Collaboration: worked with..." → the label before the colon in bold, like the template CV.
const para = (s: string) => {
  const m = /^([^:]{2,40}):\s+(.+)$/.exec(s);
  return `<p>${m ? `<b>${esc(m[1]!)}:</b> ${esc(m[2]!)}` : esc(s)}</p>`;
};

/**
 * Two columns: big serif name, contact block top right, small blue section labels.
 * Left: experience, education, projects, certifications, languages. Right: skills, awards. Still real text (ATS reads it).
 */
export function cvHtml(cv: TailoredCv, me: Profile["me"]): string {
  const contact = [
    me.phone && esc(me.phone),
    esc(me.email),
    me.website && link(me.website, "Portfolio"),
    me.linkedin && link(me.linkedin, "LinkedIn"),
    me.github && link(me.github, "GitHub"),
    me.location && esc(me.location),
  ].filter(Boolean).join(" | ");
  const section = (title: string, body: string) => (body ? `<section><h2>${title}</h2>${body}</section>` : "");
  const dates = (a: string, b: string) => [a, b].filter(Boolean).map(esc).join(" &ndash; ");

  const left = [
    section("Experience", cv.experience.map((e) => `<div class="item">
      <h3>${esc(e.company)}, ${esc(e.title)}</h3>
      ${dates(e.start, e.end) || e.location ? `<div class="when">${[dates(e.start, e.end), e.location && esc(e.location)].filter(Boolean).join(" &middot; ")}</div>` : ""}
      ${e.bullets.map(para).join("")}</div>`).join("")),
    section("Education", cv.education.map((e) => `<div class="item"><h3>${esc(e.school)} &mdash; ${esc(e.degree)}</h3>${e.year ? `<div class="when">${esc(e.year)}</div>` : ""}</div>`).join("")),
    section("Projects", cv.projects.map((p) => `<div class="item">
      <h3>${esc(p.name)}${p.link ? `: ${link(p.link, p.link)}` : ""}</h3>
      ${p.bullets.map(para).join("")}</div>`).join("")),
    section("Certifications", cv.certifications.map(para).join("")),
    section("Languages", cv.languages.length ? `<p class="langs">${cv.languages.map((l) => esc(l.toUpperCase())).join(" , ")}</p>` : ""),
  ].join("");
  const right = [
    section("Skills", cv.skills.map((g) => `<p class="group"><b>${esc(g.group)}:</b> ${g.items.map(esc).join(", ")}</p>`).join("")),
    section("Awards", cv.awards.map((a) => `<div class="award"><p><b>${esc(a.title)}</b></p>${a.detail ? `<p>${esc(a.detail)}</p>` : ""}</div>`).join("")),
  ].join("");

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${esc(me.name)} - CV</title>
<style>
  @page { size: A4; margin: 16mm 15mm; }
  * { box-sizing: border-box; }
  body { font: 9.6pt/1.55 Merriweather, Georgia, "Times New Roman", serif; color: #666; margin: 0; }
  .sans { font-family: "Open Sans", "Segoe UI", Arial, sans-serif; }
  header { display: flex; justify-content: space-between; gap: 24px; margin-bottom: 26px; }
  h1 { font-size: 30pt; line-height: 1.1; color: #000; margin: 0; letter-spacing: .01em; }
  .headline { font: 14pt/1.3 "Open Sans", "Segoe UI", Arial, sans-serif; color: #000; margin-top: 6px; }
  .contact { font: 700 8.6pt/1.45 "Open Sans", "Segoe UI", Arial, sans-serif; color: #000; width: 34%; flex: none; }
  .contact b { display: block; }
  a { color: #1155cc; }
  .cols { display: flex; gap: 30px; }
  .left { flex: 1; } .right { width: 34%; flex: none; }
  h2 { font: 700 8.6pt "Open Sans", "Segoe UI", Arial, sans-serif; color: #2079c7; text-transform: uppercase; margin: 0 0 12px; }
  section { margin-bottom: 22px; }
  h3 { font-size: 11pt; color: #000; margin: 0 0 3px; line-height: 1.3; }
  .when { font: 7.8pt "Open Sans", "Segoe UI", Arial, sans-serif; color: #666; margin-bottom: 4px; }
  .item { margin-bottom: 14px; break-inside: avoid; }
  p { margin: 0 0 5px; }
  b { color: #555; }
  .group { margin-bottom: 14px; }
  .group b { display: block; }
  .award { margin-bottom: 14px; break-inside: avoid; }
  .award p:first-child { margin-bottom: 10px; }
  .langs { font-weight: 700; color: #000; }
</style></head><body>
<header>
  <div><h1>${esc(me.name.toUpperCase())}</h1><div class="headline">${esc(cv.headline)}</div></div>
  <div class="contact"><b>Contact Information:</b>${contact}</div>
</header>
<div class="cols">
  <div class="left">${left}</div>
  ${right ? `<div class="right">${right}</div>` : ""}
</div>
</body></html>`;
}

export function jobDir(jobId: string): string {
  return join(CVS_DIR, jobId.replace(/[^a-z0-9]+/gi, "-").slice(0, 80));
}

const fileName = (me: Profile["me"], what: string) => `${me.name.replace(/[^\p{L}\p{N} ]+/gu, "").trim()} ${what}.pdf`;

async function toPdf(browser: Browser, html: string, pdfPath: string): Promise<void> {
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: "load" });
    await page.pdf({ path: pdfPath, format: "A4", printBackground: true, preferCSSPageSize: true });
  } finally {
    await page.close();
  }
}

/** Writes data/cvs/<job>/cv.html and "<Name> CV.pdf". Returns both paths. */
export async function renderCv(browser: Browser, jobId: string, cv: TailoredCv, me: Profile["me"]): Promise<{ html: string; pdf: string }> {
  const dir = jobDir(jobId);
  await mkdir(dir, { recursive: true });
  const html = cvHtml(cv, me);
  const htmlPath = join(dir, "cv.html");
  const pdfPath = join(dir, fileName(me, "CV"));
  await writeFile(htmlPath, html);
  await toPdf(browser, html, pdfPath);
  return { html: htmlPath, pdf: pdfPath };
}

export function coverLetterHtml(text: string, me: Profile["me"]): string {
  const contact = [me.email, me.phone, me.location].filter(Boolean).map(esc).join(" &middot; ");
  const paras = text.split(/\n\s*\n/).map((p) => `<p>${esc(p.trim()).replace(/\n/g, "<br>")}</p>`).join("");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${esc(me.name)} - Cover letter</title>
<style>
  @page { size: A4; margin: 22mm 22mm; }
  body { font: 10.5pt/1.65 Merriweather, Georgia, "Times New Roman", serif; color: #333; margin: 0; }
  h1 { font-size: 24pt; color: #000; margin: 0; }
  .contact { font: 700 9pt "Open Sans", "Segoe UI", Arial, sans-serif; color: #000; margin: 4px 0 28px; }
  p { margin: 0 0 12px; }
</style></head><body>
<h1>${esc(me.name.toUpperCase())}</h1>
<div class="contact">${contact}</div>
${paras}
</body></html>`;
}

/** Writes "<Name> Cover Letter.pdf" next to the CV. */
export async function renderCoverLetter(browser: Browser, jobId: string, text: string, me: Profile["me"]): Promise<string> {
  const dir = jobDir(jobId);
  await mkdir(dir, { recursive: true });
  const pdfPath = join(dir, fileName(me, "Cover Letter"));
  await toPdf(browser, coverLetterHtml(text, me), pdfPath);
  return pdfPath;
}
