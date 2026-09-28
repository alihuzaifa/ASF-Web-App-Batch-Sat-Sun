#!/usr/bin/env node
/**
 * The template owns the brand; the marketplace root only mirrors it.
 *
 *   node scripts/sync-brand.mjs           copy src/brand.*.json -> shared/brand/
 *   node scripts/sync-brand.mjs --check   fail if the two have drifted
 *
 * Two copies of a palette drift the week after they are written, and then a
 * card and a README disagree about what colour the brand is. The check runs in
 * the same breath as the typecheck so the drift is caught the day it happens.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const templateRoot = resolve(here, '..');
/** .../plugins/studio/huzaifa-studio/assets/remotion-template -> repo root */
const repoRoot = resolve(templateRoot, '..', '..', '..', '..', '..');
const sharedDir = resolve(repoRoot, 'shared', 'brand');

const pairs = [
  ['brand.profile.json', 'profile.json'],
  ['brand.tokens.json', 'tokens.json'],
];

const check = process.argv.includes('--check');
let drifted = false;

mkdirSync(sharedDir, { recursive: true });

for (const [from, to] of pairs) {
  const src = readFileSync(resolve(templateRoot, 'src', from), 'utf8');
  const dest = resolve(sharedDir, to);
  let current = null;
  try {
    current = readFileSync(dest, 'utf8');
  } catch {
    current = null;
  }

  if (check) {
    if (current === null) {
      console.error(`error  shared/brand/${to} is missing — run: npm run brand:sync`);
      drifted = true;
    } else if (current !== src) {
      console.error(`error  shared/brand/${to} has drifted from src/${from} — run: npm run brand:sync`);
      drifted = true;
    }
  } else {
    writeFileSync(dest, src);
    console.log(`synced src/${from} -> shared/brand/${to}`);
  }
}

if (check && !drifted) console.log('ok     the brand files match');
process.exit(drifted ? 1 : 0);
