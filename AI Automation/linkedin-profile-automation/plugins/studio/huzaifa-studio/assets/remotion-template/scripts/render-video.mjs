#!/usr/bin/env node
/**
 * Renders the cut, and refuses to be quiet about a silent one.
 *
 * The music is part of the product here, not a garnish, so this wrapper reads
 * src/audio.config.ts first and says what is about to happen before it spends
 * minutes encoding.
 *
 *   node scripts/render-video.mjs                        defaults from video.config.ts
 *   node scripts/render-video.mjs --props=./video.props.json
 *   node scripts/render-video.mjs --out=out/portrait.mp4
 */
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const templateRoot = resolve(here, '..');
const audioSrc = readFileSync(join(templateRoot, 'src', 'audio.config.ts'), 'utf8');

/** The config is TypeScript, so read the two fields out of it rather than
 *  dragging a TS loader into a short script. */
const fileMatch = audioSrc.match(/file:\s*(?:null|'([^']*)'|"([^"]*)")/);
const track = fileMatch ? (fileMatch[1] ?? fileMatch[2] ?? null) : null;
const creditMatch = audioSrc.match(/credit:\s*\n?\s*'([^']*)'/);
const credit = creditMatch?.[1] ?? '';

const args = process.argv.slice(2);
const outArg = args.find((a) => a.startsWith('--out='));
const out = outArg ? outArg.slice('--out='.length) : 'out/video.mp4';
const passthrough = args.filter((a) => !a.startsWith('--out='));

if (!track) {
  console.warn('');
  console.warn('  No music set. src/audio.config.ts has `file: null`, so this cut renders silent.');
  console.warn('  Drop a cleared track into public/audio/ and name it there.');
  console.warn('  Then check it with: node scripts/verify.mjs video');
  console.warn('');
} else {
  const path = join(templateRoot, 'public', track);
  if (!existsSync(path)) {
    console.error(`error  audio.config.ts points at public/${track}, which does not exist.`);
    process.exit(1);
  }
  console.log(`music  public/${track}${credit ? ` — credit: ${credit}` : ' — no credit recorded yet'}`);
  if (!credit) {
    console.warn('warn   set `credit` in src/audio.config.ts while you still remember the source');
  }
}

/** Run the CLI with this same Node rather than through npx and a shell. Node
 *  refuses to spawn a .cmd without a shell, a shell needs every argument
 *  quoted, and an output path with a space in it is exactly the sort of thing
 *  that then silently renders to the wrong place. */
const require = createRequire(import.meta.url);
const cliPackage = require.resolve('@remotion/cli/package.json');
const cli = join(dirname(cliPackage), require(cliPackage).bin.remotion);

const result = spawnSync(
  process.execPath,
  [cli, 'render', 'src/index.ts', 'Video', out, '--scale=2', ...passthrough],
  { cwd: templateRoot, stdio: 'inherit' }
);

if (result.status !== 0) process.exit(result.status ?? 1);

console.log('');
console.log(`next   node scripts/verify.mjs video ${out}`);
