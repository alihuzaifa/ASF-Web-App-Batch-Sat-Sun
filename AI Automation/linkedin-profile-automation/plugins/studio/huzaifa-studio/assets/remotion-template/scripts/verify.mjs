#!/usr/bin/env node
/**
 * Looks at the file that was actually produced, so nothing ships on the word
 * "rendered". Headless on purpose: opening a 4320px PNG to eyeball it is the
 * expensive way to learn what these checks already know.
 *
 *   node scripts/verify.mjs image [path]
 *   node scripts/verify.mjs video [path] [--allow-silent]
 *
 * Prints one line of JSON on success and exits 0. On failure it says what is
 * wrong and exits 1.
 */
import { readFileSync, existsSync, statSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const templateRoot = resolve(here, '..');
const tokens = JSON.parse(readFileSync(resolve(templateRoot, 'src', 'brand.tokens.json'), 'utf8'));

const kind = process.argv[2];
const allowSilent = process.argv.includes('--allow-silent');
const given = process.argv[3] && !process.argv[3].startsWith('--') ? process.argv[3] : null;

if (!['image', 'video'].includes(kind)) {
  console.error('usage: node scripts/verify.mjs <image|video> [path] [--allow-silent]');
  process.exit(2);
}

const file = resolve(given ?? resolve(templateRoot, 'out', kind === 'image' ? 'image.png' : 'video.mp4'));
if (!existsSync(file)) {
  console.error(`error  nothing at ${file} — the render did not finish`);
  process.exit(1);
}

const bytes = statSync(file).size;
const fail = (msg) => {
  console.error(`error  ${msg}`);
  process.exit(1);
};

/** Either LinkedIn canvas, at any scale the commands allow. */
const canvasName = (w, h) => {
  for (const [name, c] of Object.entries(tokens.canvas)) {
    for (const scale of [1, 2, 3, 4]) {
      if (w === c.width * scale && h === c.height * scale) return { name, scale };
    }
  }
  return null;
};

if (kind === 'image') {
  const buf = readFileSync(file, { length: 33 });
  const isPng = buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (!isPng) fail('not a PNG — check what the render actually wrote');

  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  const canvas = canvasName(width, height);
  if (!canvas) fail(`${width}x${height} is not one of the brand canvases at 1x-4x`);
  if (bytes < 120 * 1024) fail(`only ${(bytes / 1024).toFixed(0)}KB — a card this size is almost certainly blank`);

  console.log(
    JSON.stringify({
      ok: true,
      kind: 'image',
      width,
      height,
      format: canvas.name,
      scale: canvas.scale,
      mb: +(bytes / 1024 / 1024).toFixed(2),
    })
  );
  process.exit(0);
}

/** video — needs ffprobe, which ships with ffmpeg. */
const ffprobe = (args) => {
  try {
    return execFileSync('ffprobe', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    fail('ffprobe is not on PATH — install ffmpeg, or the video cannot be checked');
  }
};

const probe = JSON.parse(
  ffprobe(['-v', 'quiet', '-print_format', 'json', '-show_streams', '-show_format', file])
);

const video = probe.streams.find((s) => s.codec_type === 'video');
const audio = probe.streams.find((s) => s.codec_type === 'audio');
if (!video) fail('no video stream');

const canvas = canvasName(video.width, video.height);
if (!canvas) fail(`${video.width}x${video.height} is not one of the brand canvases at 1x-4x`);

const seconds = +(probe.format.duration ?? 0);
if (seconds < 4) fail(`only ${seconds.toFixed(1)}s — too short to read`);
if (seconds > 90) fail(`${seconds.toFixed(1)}s — longer than anything this studio should post`);

if (!audio && !allowSilent) {
  fail('no audio stream — set a track in src/audio.config.ts, or pass --allow-silent on purpose');
}

/** An audio stream that is digital silence is the failure this catches: the
 *  file looks right and plays nothing. */
let meanDb = null;
if (audio) {
  /** volumedetect reports on stderr, so the output has to be read from there —
   *  reading stdout is how this check silently passes on a silent file. */
  const run = spawnSync(
    'ffmpeg',
    ['-hide_banner', '-nostats', '-i', file, '-map', '0:a:0', '-af', 'volumedetect', '-f', 'null', '-'],
    { encoding: 'utf8' }
  );
  const m = String(run.stderr ?? '').match(/mean_volume:\s*(-?\d+(\.\d+)?) dB/);
  if (m) meanDb = +m[1];
  if (meanDb === null) fail('could not read the audio level — is ffmpeg on PATH?');
  if (meanDb < -60 && !allowSilent) {
    fail(`the audio track is silent (mean ${meanDb} dB) — the music never made it into the render`);
  }
}

console.log(
  JSON.stringify({
    ok: true,
    kind: 'video',
    width: video.width,
    height: video.height,
    format: canvas.name,
    audio: Boolean(audio),
    meanDb,
    seconds: +seconds.toFixed(1),
    mb: +(bytes / 1024 / 1024).toFixed(2),
  })
);
