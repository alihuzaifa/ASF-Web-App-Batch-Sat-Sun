#!/usr/bin/env node
/**
 * Writes the music bed from scratch, so the track in public/audio is ours and
 * there is nothing to clear before a post.
 *
 *   node scripts/make-music.mjs
 *
 * It generates a short MIDI phrase, renders it with FluidSynth against the
 * MuseScore_General SoundFont (MIT), and encodes an MP3 with ffmpeg. The
 * phrase is deliberately plain — a slow pad, a quiet arpeggio and a root note
 * underneath. It sits under a voice or under text without asking for attention,
 * which is the whole job.
 *
 * Needs, and will say so if they are missing:
 *   fluidsynth   ~/audiotools/fluidsynth/.../bin/fluidsynth.exe (or on PATH)
 *   soundfont    ~/audiotools/MuseScore_General.sf3
 *   ffmpeg       on PATH
 */
import { writeFileSync, existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const templateRoot = resolve(here, '..');
const audioDir = join(templateRoot, 'public', 'audio');
const midiPath = join(audioDir, 'studio-bed.mid');
const wavPath = join(audioDir, 'studio-bed.wav');
const mp3Path = join(audioDir, 'studio-bed.mp3');

const TPQ = 480; // ticks per quarter note
const BPM = 70;

/** MIDI variable-length quantity. */
const vlq = (n) => {
  const out = [n & 0x7f];
  n >>= 7;
  while (n > 0) {
    out.unshift((n & 0x7f) | 0x80);
    n >>= 7;
  }
  return out;
};

const events = []; // { at, bytes }
const push = (at, bytes) => events.push({ at, bytes });
const note = (channel, pitch, start, length, velocity) => {
  push(start, [0x90 | channel, pitch, velocity]);
  push(start + length, [0x80 | channel, pitch, 0]);
};

/** A minor, six bars, nothing clever: Am F C G Am G. */
const PROGRESSION = [
  { root: 57, chord: [57, 60, 64, 69] }, // Am
  { root: 53, chord: [53, 57, 60, 65] }, // F
  { root: 48, chord: [48, 55, 60, 64] }, // C
  { root: 55, chord: [55, 59, 62, 67] }, // G
  { root: 57, chord: [57, 60, 64, 69] }, // Am
  { root: 55, chord: [55, 59, 62, 67] }, // G
];

const BAR = TPQ * 4;

// voices: 0 warm pad, 1 harp, 2 soft bass
push(0, [0xc0, 89]); // Pad 2 (warm)
push(0, [0xc1, 46]); // Orchestral harp
push(0, [0xc2, 38]); // Synth bass 1
for (const ch of [0, 1, 2]) {
  push(0, [0xb0 | ch, 91, 96]); // reverb, generously
  push(0, [0xb0 | ch, 93, 40]); // a little chorus
  push(0, [0xb0 | ch, 7, ch === 0 ? 78 : ch === 1 ? 64 : 58]); // channel volume
}

PROGRESSION.forEach((bar, i) => {
  const at = i * BAR;

  // pad — the chord, held the whole bar, entering softly
  bar.chord.forEach((pitch, j) => {
    note(0, pitch, at + j * 12, BAR - 24, 46);
  });

  // harp — eighth notes, up then down, skipping the first beat so the bar breathes
  const arp = [...bar.chord, ...[...bar.chord].reverse().slice(1)];
  arp.forEach((pitch, j) => {
    const start = at + TPQ + j * (TPQ / 2);
    if (start < at + BAR - TPQ / 2) note(1, pitch + 12, start, TPQ / 2 - 20, 38 + (j % 3) * 4);
  });

  // bass — root on one and three
  note(2, bar.root - 12, at, TPQ * 2 - 40, 52);
  note(2, bar.root - 12, at + TPQ * 2, TPQ * 2 - 40, 44);
});

// a last chord left to ring, so the file does not stop on a cliff
const tail = PROGRESSION.length * BAR;
[57, 60, 64, 69].forEach((pitch, j) => note(0, pitch, tail + j * 12, TPQ * 6, 40));
note(2, 45 - 12, tail, TPQ * 4, 44);

events.sort((a, b) => a.at - b.at);

const track = [];
// tempo
track.push(...vlq(0), 0xff, 0x51, 0x03, ...[0, 8, 16].map(() => 0)); // placeholder, filled below
track.length -= 3;
const usPerQuarter = Math.round(60_000_000 / BPM);
track.push((usPerQuarter >> 16) & 0xff, (usPerQuarter >> 8) & 0xff, usPerQuarter & 0xff);

let last = 0;
for (const e of events) {
  track.push(...vlq(e.at - last), ...e.bytes);
  last = e.at;
}
track.push(...vlq(TPQ), 0xff, 0x2f, 0x00); // end of track

const header = [
  0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, (TPQ >> 8) & 0xff, TPQ & 0xff,
];
const trackHeader = [
  0x4d, 0x54, 0x72, 0x6b,
  (track.length >> 24) & 0xff,
  (track.length >> 16) & 0xff,
  (track.length >> 8) & 0xff,
  track.length & 0xff,
];

mkdirSync(audioDir, { recursive: true });
writeFileSync(midiPath, Buffer.from([...header, ...trackHeader, ...track]));
console.log(`midi   ${midiPath}`);

/** FluidSynth and the SoundFont, wherever they are on this machine. */
const candidates = [
  join(homedir(), 'audiotools', 'fluidsynth', 'fluidsynth-v2.6.0-win10-x64-cpp11', 'bin', 'fluidsynth.exe'),
  join(homedir(), 'audiotools', 'fluidsynth', 'bin', 'fluidsynth.exe'),
  'fluidsynth',
];
const fluid = candidates.find((c) => c === 'fluidsynth' || existsSync(c));
const soundfont = join(homedir(), 'audiotools', 'MuseScore_General.sf3');

if (!existsSync(soundfont)) {
  console.error(`error  no SoundFont at ${soundfont}`);
  process.exit(1);
}

try {
  execFileSync(fluid, ['-ni', '-g', '0.75', '-r', '44100', '-F', wavPath, soundfont, midiPath], {
    stdio: ['ignore', 'ignore', 'pipe'],
  });
} catch (e) {
  console.error('error  fluidsynth failed —', String(e.stderr ?? e.message).trim().split('\n').slice(-3).join(' '));
  process.exit(1);
}
console.log(`wav    ${wavPath}`);

/** Normalise quietly, fade both ends, encode. */
execFileSync(
  'ffmpeg',
  [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-i', wavPath,
    '-af', 'afade=t=in:st=0:d=1.5,loudnorm=I=-20:TP=-3:LRA=9,afade=t=out:st=22:d=3',
    '-t', '25',
    '-codec:a', 'libmp3lame', '-b:a', '160k',
    mp3Path,
  ],
  { stdio: ['ignore', 'ignore', 'inherit'] }
);
console.log(`mp3    ${mp3Path}`);

for (const tmp of [midiPath, wavPath]) {
  try {
    unlinkSync(tmp);
  } catch {}
}
console.log('');
console.log('credit Written and rendered locally with FluidSynth using the MuseScore_General SoundFont (MIT).');
