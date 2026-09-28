#!/usr/bin/env node
/**
 * Checks a props file before a render spends minutes on it, and before a card
 * says something the profile does not support.
 *
 *   node scripts/validate-props.mjs props.json
 *   node scripts/validate-props.mjs video.props.json --video
 *
 * The rules are the ones that actually break cards: an unknown kind, a missing
 * field for the kind that was chosen, a keyPhrase that is not in the headline
 * (it would silently fall back to the last word), text long enough to shrink
 * the card to nothing, and a claim the brand profile forbids.
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const templateRoot = resolve(here, '..');
const profile = JSON.parse(readFileSync(resolve(templateRoot, 'src', 'brand.profile.json'), 'utf8'));
const tokens = JSON.parse(readFileSync(resolve(templateRoot, 'src', 'brand.tokens.json'), 'utf8'));

const args = process.argv.slice(2);
const isVideo = args.includes('--video');
const target = args.find((a) => !a.startsWith('--'));

if (!target) {
  console.error('usage: node scripts/validate-props.mjs <props.json> [--video]');
  process.exit(2);
}

const file = resolve(target);
if (!existsSync(file)) {
  console.error(`error  no props file at ${file}`);
  process.exit(1);
}

let props;
try {
  props = JSON.parse(readFileSync(file, 'utf8'));
} catch (e) {
  console.error(`error  ${target} is not valid JSON — ${e.message}`);
  process.exit(1);
}

const problems = [];
const warn = [];
const KINDS = ['insight', 'list', 'stat', 'quote', 'showcase'];
const FORMATS = Object.keys(tokens.canvas);

if (props.format && !FORMATS.includes(props.format)) {
  problems.push(`format "${props.format}" is not one of ${FORMATS.join(', ')}`);
}

const hasPhrase = (line, phrase) =>
  !phrase || (typeof line === 'string' && line.toLowerCase().includes(phrase.toLowerCase()));

if (!isVideo) {
  const kind = props.kind ?? 'insight';
  if (!KINDS.includes(kind)) problems.push(`kind "${kind}" is not one of ${KINDS.join(', ')}`);

  if (kind !== 'quote') {
    if (!props.headline) problems.push('headline is required');
    if (props.headline && props.headline.length > 110)
      problems.push(`headline is ${props.headline.length} characters — keep it under 110`);
    if (!hasPhrase(props.headline, props.keyPhrase))
      problems.push(`keyPhrase "${props.keyPhrase}" is not inside the headline`);
    if (props.subhead && !hasPhrase(props.subhead, props.subheadAccent))
      problems.push(`subheadAccent "${props.subheadAccent}" is not inside the subhead`);
  }

  if (kind === 'insight' && !props.body) problems.push('the insight card needs a body');
  if (kind === 'insight' && props.body && props.body.length > 460)
    problems.push(`body is ${props.body.length} characters — keep it under 460`);
  if (kind === 'list') {
    const points = props.points ?? [];
    if (points.length < 3 || points.length > 5)
      problems.push(`the list card needs 3-5 points, got ${points.length}`);
    points.forEach((p, i) => {
      if (p.length > 76) problems.push(`point ${i + 1} is ${p.length} characters — keep it under 76`);
    });
  }
  if (kind === 'stat' && (!props.stat?.value || !props.stat?.label))
    problems.push('the stat card needs stat.value and stat.label');
  if (kind === 'quote' && !props.quote) problems.push('the quote card needs quote');
  if (kind === 'showcase') {
    for (const field of ['project', 'what', 'built', 'learned']) {
      if (!props.showcase?.[field]) problems.push(`the showcase card needs showcase.${field}`);
    }
    if (props.showcase?.project && profile.projects?.length && !profile.projects.includes(props.showcase.project)) {
      warn.push(
        `showcase.project "${props.showcase.project}" is not in the profile's project list — check it is really his`
      );
    }
  }
} else {
  if (!props.headline) problems.push('headline is required');
  if (!hasPhrase(props.headline, props.keyPhrase))
    problems.push(`keyPhrase "${props.keyPhrase}" is not inside the headline`);
  const points = props.points ?? [];
  if (points.length < 2 || points.length > 4)
    problems.push(`the video needs 2-4 points, got ${points.length} — more than that and nobody finishes it`);
  points.forEach((p, i) => {
    if (p.length > 84) problems.push(`point ${i + 1} is ${p.length} characters — keep it under 84`);
  });
  if (!props.closingLine) problems.push('closingLine is required');
  if (props.hold) {
    for (const [name, sec] of Object.entries(props.hold)) {
      if (typeof sec !== 'number' || sec < 1.5)
        problems.push(`hold.${name} is ${sec}s — under 1.5s is unreadable`);
    }
  }
}

/** The claims the profile says are not his to make. */
const flat = JSON.stringify(props).toLowerCase();
const banned = [
  [/\b(senior|lead|principal)\s+(developer|engineer)\b/, 'a seniority title'],
  [/\b\d+\+?\s*(years?|yrs?)\s+(of\s+)?experience\b/, 'a length of experience'],
  [/\b\d[\d,.]*\s*(k|m)?\s*(followers|views|downloads|users|clients)\b/, 'an audience or client number'],
];
for (const [re, what] of banned) {
  if (re.test(flat)) problems.push(`the copy claims ${what} — brand.profile.json lists that under doNotClaim`);
}

for (const w of warn) console.warn(`warn   ${w}`);
if (problems.length) {
  for (const p of problems) console.error(`error  ${p}`);
  process.exit(1);
}
console.log(`ok     ${target} is ready to render`);
