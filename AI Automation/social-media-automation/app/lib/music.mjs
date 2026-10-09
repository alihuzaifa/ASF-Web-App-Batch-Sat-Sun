// The music under every video, written here from sine waves and noise.
//
// Nothing is sampled from anyone, so no platform can match it to a song and mute
// the post weeks later (the Content ID problem). Same idea as ghaznawi-marketing.
//
// Am -> F -> C -> G, one chord per bar. "upbeat" has a kick, hats, a clap and an
// arpeggio; "calm" is pad and bass only, for long videos people listen to longer.
// The video cuts on this tempo, so the BPM is passed through to the composition.

import { mkdir, writeFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import path from "node:path"
import { MUSIC } from "./paths.mjs"

const RATE = 44100
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12)

// A minor, F major, C major, G major as MIDI notes (root, third, fifth)
const CHORDS = [
  [57, 60, 64],
  [53, 57, 60],
  [48, 52, 55],
  [55, 59, 62],
]

// Small fixed-seed random, so the same settings always give the same track
const rng = (seed) => () => {
  seed = (seed * 1664525 + 1013904223) >>> 0
  return seed / 4294967296
}

export const synth = ({ seconds, bpm = 100, mood = "upbeat", seed = 7 }) => {
  const n = Math.ceil(seconds * RATE)
  const L = new Float32Array(n)
  const R = new Float32Array(n)
  const rand = rng(seed)
  const beat = 60 / bpm
  const bar = beat * 4
  const upbeat = mood === "upbeat"

  const add = (start, dur, fn, pan = 0, gain = 1) => {
    const s0 = Math.floor(start * RATE)
    const s1 = Math.min(n, Math.floor((start + dur) * RATE))
    const gl = gain * Math.cos(((pan + 1) * Math.PI) / 4)
    const gr = gain * Math.sin(((pan + 1) * Math.PI) / 4)
    for (let s = Math.max(0, s0); s < s1; s++) {
      const v = fn((s - s0) / RATE)
      L[s] += v * gl
      R[s] += v * gr
    }
  }

  // Soft saw: a few harmonics, so it is warm rather than buzzy
  const soft = (f, t) => Math.sin(2 * Math.PI * f * t) + Math.sin(4 * Math.PI * f * t) / 3 + Math.sin(6 * Math.PI * f * t) / 6

  const bars = Math.ceil(seconds / bar)
  for (let b = 0; b < bars; b++) {
    const t0 = b * bar
    const chord = CHORDS[b % 4]
    const intro = b < 2

    // pad: each chord tone twice, slightly detuned left and right
    for (const note of chord) {
      const f = midi(note)
      const env = (t) => Math.min(1, t / 0.4) * Math.min(1, (bar + 0.3 - t) / 0.5)
      add(t0, bar + 0.3, (t) => soft(f * 1.002, t) * env(t), -0.5, 0.05)
      add(t0, bar + 0.3, (t) => soft(f * 0.998, t) * env(t), 0.5, 0.05)
    }

    // bass: the root two octaves down
    const fb = midi(chord[0] - 24)
    const hits = upbeat ? [0, 2] : [0]
    for (const h of hits) {
      const len = upbeat ? beat * 2 : bar
      add(t0 + h * beat, len, (t) => (Math.sin(2 * Math.PI * fb * t) + 0.3 * Math.sin(4 * Math.PI * fb * t)) * Math.exp(-t * (upbeat ? 2.2 : 0.9)) * Math.min(1, t / 0.01), 0, 0.32)
    }

    if (!upbeat) continue

    // arpeggio: eighth notes up the chord, an octave above the pad
    for (let i = 0; i < 8; i++) {
      const note = chord[i % 3] + 12 + (i >= 6 ? 12 : 0)
      const f = midi(note)
      add(t0 + (i * beat) / 2, beat * 0.9, (t) => Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 7) * Math.min(1, t / 0.004), i % 2 ? 0.35 : -0.35, intro ? 0.05 : 0.07)
    }

    if (intro) continue

    for (let k = 0; k < 4; k++) {
      // kick: a sine falling from 120 Hz to 45 Hz
      add(t0 + k * beat, 0.35, (t) => {
        const f = 45 + 75 * Math.exp(-t * 30)
        return Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 9)
      }, 0, 0.55)
      // hat on the off beat: short filtered noise
      let last = 0
      add(t0 + k * beat + beat / 2, 0.05, (t) => {
        const x = rand() * 2 - 1
        const hp = x - last
        last = x
        return hp * Math.exp(-t * 90)
      }, 0.2, 0.06)
      // clap on two and four
      if (k % 2 === 1) add(t0 + k * beat, 0.18, (t) => (rand() * 2 - 1) * Math.exp(-t * 22), -0.1, 0.12)
    }
  }

  // fade in and out, soft clip, then bring the peak to -1 dB
  const fin = 0.3 * RATE
  const fout = 1.8 * RATE
  let peak = 0
  for (let s = 0; s < n; s++) {
    const g = Math.min(1, s / fin) * Math.min(1, (n - s) / fout)
    L[s] = Math.tanh(L[s] * 1.2) * g
    R[s] = Math.tanh(R[s] * 1.2) * g
    peak = Math.max(peak, Math.abs(L[s]), Math.abs(R[s]))
  }
  const norm = peak > 0 ? 0.89 / peak : 1
  return { L, R, norm }
}

export const toWav = ({ L, R, norm }) => {
  const n = L.length
  const buf = Buffer.alloc(44 + n * 4)
  buf.write("RIFF", 0)
  buf.writeUInt32LE(36 + n * 4, 4)
  buf.write("WAVE", 8)
  buf.write("fmt ", 12)
  buf.writeUInt32LE(16, 16)
  buf.writeUInt16LE(1, 20)
  buf.writeUInt16LE(2, 22)
  buf.writeUInt32LE(RATE, 24)
  buf.writeUInt32LE(RATE * 4, 28)
  buf.writeUInt16LE(4, 32)
  buf.writeUInt16LE(16, 34)
  buf.write("data", 36)
  buf.writeUInt32LE(n * 4, 40)
  for (let s = 0, o = 44; s < n; s++, o += 4) {
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[s] * norm)) * 32767), o)
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[s] * norm)) * 32767), o + 2)
  }
  return buf
}

/** Write (or reuse) a track and return its file name inside data/music. */
export const track = async ({ seconds, bpm, mood }) => {
  const secs = Math.ceil(seconds)
  const name = `${mood}-${bpm}bpm-${secs}s.wav`
  const file = path.join(MUSIC, name)
  if (!existsSync(file)) {
    await mkdir(MUSIC, { recursive: true })
    await writeFile(file, toWav(synth({ seconds: secs, bpm, mood })))
  }
  return name
}
