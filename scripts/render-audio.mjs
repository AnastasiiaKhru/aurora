/**
 * Original Aurora audio, synthesized in this file.
 * No samples, songs, or downloaded recordings are used.
 * Oscillators, envelopes, filtered noise, and layered transients are rendered
 * offline to 16-bit PCM WAV.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SR = 44100
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'audio')

const TAU = Math.PI * 2

function noiseAt(i) {
  let x = (Math.imul(i, 1664525) + 1013904223) >>> 0
  x = (Math.imul(x ^ (x >>> 16), 2246822519)) >>> 0
  return (x / 4294967296) * 2 - 1
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v))
}

function env(t, a, h, r) {
  if (t < 0) return 0
  if (t < a) return t / Math.max(0.0008, a)
  if (t < a + h) return 1
  const u = (t - a - h) / Math.max(0.0008, r)
  if (u >= 1) return 0
  return Math.cos(u * Math.PI * 0.5)
}

function fadeEdges(out, ms = 4) {
  const n = Math.min(out.length >> 1, Math.floor((ms / 1000) * SR))
  for (let i = 0; i < n; i += 1) {
    const w = i / n
    out[i] *= w
    out[out.length - 1 - i] *= w
  }
}

function normalize(out, peak = 0.89) {
  let max = 0
  let sum = 0
  for (let i = 0; i < out.length; i += 1) {
    const v = out[i]
    sum += v
    const a = Math.abs(v)
    if (a > max) max = a
  }
  const mean = sum / out.length
  const gain = max > 0.00001 ? peak / max : 0
  for (let i = 0; i < out.length; i += 1) out[i] = (out[i] - mean) * gain
  return { peak: max, gain }
}

function addOsc(out, start, dur, f0, f1, amp, partial = 0) {
  const a0 = Math.floor(start * SR)
  const n = Math.floor(dur * SR)
  let phase = 0
  for (let i = 0; i < n; i += 1) {
    const idx = a0 + i
    if (idx < 0 || idx >= out.length) continue
    const t = i / SR
    const p = i / Math.max(1, n - 1)
    const f = f0 * Math.pow(f1 / Math.max(1, f0), p)
    phase += (TAU * f) / SR
    const e = env(t, Math.min(0.012, dur * 0.08), dur * 0.12, dur * 0.78)
    const s = Math.sin(phase) + partial * Math.sin(phase * 2)
    out[idx] += s * e * amp
  }
}

function addNoise(out, start, dur, amp, decay, seed, hp = 0) {
  const a0 = Math.floor(start * SR)
  const n = Math.floor(dur * SR)
  let prev = 0
  for (let i = 0; i < n; i += 1) {
    const idx = a0 + i
    if (idx < 0 || idx >= out.length) continue
    const t = i / SR
    const raw = noiseAt(seed + i)
    const colored = hp > 0 ? raw - prev : raw
    prev = raw
    const e = Math.exp(-t * decay) * env(t, 0.004, 0.01, dur)
    out[idx] += colored * e * amp
  }
}

function addSweep(out, start, dur, f0, f1, amp) {
  addOsc(out, start, dur, f0, f1, amp, 0.15)
}

function buffer(seconds) {
  return new Float32Array(Math.max(1, Math.floor(seconds * SR)))
}

function wavBytes(samples) {
  const data = Buffer.alloc(samples.length * 2)
  for (let i = 0; i < samples.length; i += 1) {
    const s = clamp(samples[i], -1, 1)
    data.writeInt16LE((s * 32767) | 0, i * 2)
  }
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + data.length, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(1, 22)
  header.writeUInt32LE(SR, 24)
  header.writeUInt32LE(SR * 2, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36)
  header.writeUInt32LE(data.length, 40)
  return Buffer.concat([header, data])
}

function stats(samples) {
  let peak = 0
  let sq = 0
  let silent = 0
  for (let i = 0; i < samples.length; i += 1) {
    const a = Math.abs(samples[i])
    if (a > peak) peak = a
    if (a < 0.001) silent += 1
    sq += samples[i] * samples[i]
  }
  return {
    seconds: Number((samples.length / SR).toFixed(2)),
    peak: Number(peak.toFixed(3)),
    rms: Number(Math.sqrt(sq / samples.length).toFixed(4)),
    silentRatio: Number((silent / samples.length).toFixed(3)),
  }
}

function midi(note) {
  return 440 * 2 ** ((note - 69) / 12)
}

function beatSamples(bpm) {
  return Math.round((60 / bpm) * SR)
}

function addTone(out, start, dur, f0, f1, amp, decay) {
  const n = Math.max(1, dur | 0)
  let phase = 0
  for (let i = 0; i < n; i += 1) {
    const idx = start + i
    if (idx < 0 || idx >= out.length) continue
    const t = i / SR
    const p = i / Math.max(1, n - 1)
    const f = f0 * (f1 / f0) ** p
    phase += (TAU * f) / SR
    const attack = i < 24 ? i / 24 : 1
    const release = n - i < 60 ? (n - i) / 60 : 1
    out[idx] += Math.sin(phase) * Math.exp(-t * decay) * attack * release * amp
  }
}

function addKick(out, start, amp) {
  const n = Math.floor(0.19 * SR)
  let phase = 0
  for (let i = 0; i < n; i += 1) {
    const idx = start + i
    if (idx < 0 || idx >= out.length) continue
    const t = i / SR
    const f = 46 + 150 * Math.exp(-t * 32)
    phase += (TAU * f) / SR
    const body = Math.sin(phase) * Math.exp(-t * 9.5)
    const click = i < 70 ? (1 - i / 70) * noiseAt(start + i) * 0.22 : 0
    out[idx] += (body * 0.92 + click) * amp
  }
}

function addSoftKick(out, start, amp) {
  const n = Math.floor(0.24 * SR)
  let phase = 0
  for (let i = 0; i < n; i += 1) {
    const idx = start + i
    if (idx < 0 || idx >= out.length) continue
    const t = i / SR
    const f = 58 + 70 * Math.exp(-t * 16)
    phase += (TAU * f) / SR
    const body = Math.sin(phase) * Math.exp(-t * 6.2)
    const click = i < 28 ? (1 - i / 28) * noiseAt(start + i) * 0.04 : 0
    out[idx] += (body + click) * amp
  }
}

function addClap(out, start, amp, seed) {
  const n = Math.floor(0.13 * SR)
  let low = 0
  for (let i = 0; i < n; i += 1) {
    const idx = start + i
    if (idx < 0 || idx >= out.length) continue
    const t = i / SR
    const raw = noiseAt(seed + i)
    low += 0.42 * (raw - low)
    const cluster = i < 700 ? 0.55 + 0.45 * Math.sin(t * 210) : Math.exp(-(t - 0.016) * 26)
    out[idx] += (raw - low) * cluster * amp
  }
}

function addPad(out, start, dur, freq, amp) {
  const n = Math.max(1, dur | 0)
  let phase = 0
  let wide = 0
  const attack = Math.min(n, Math.floor(0.32 * SR))
  const release = Math.min(n, Math.floor(0.2 * SR))
  for (let i = 0; i < n; i += 1) {
    const idx = start + i
    if (idx < 0 || idx >= out.length) continue
    phase += (TAU * freq) / SR
    wide += (TAU * freq * 1.004) / SR
    const a = i < attack ? i / attack : 1
    const r = i > n - release ? (n - i) / release : 1
    const s = Math.sin(phase) * 0.72 + Math.sin(wide) * 0.2 + Math.sin(phase * 2) * 0.08
    out[idx] += s * a * r * amp
  }
}

function addBell(out, start, dur, freq, amp) {
  const n = Math.max(1, dur | 0)
  let phase = 0
  for (let i = 0; i < n; i += 1) {
    const idx = start + i
    if (idx < 0 || idx >= out.length) continue
    const t = i / SR
    phase += (TAU * freq) / SR
    const attack = i < 36 ? i / 36 : 1
    const s = Math.sin(phase) * 0.74 + Math.sin(phase * 2.01) * 0.2 + Math.sin(phase * 3.2) * 0.06
    out[idx] += s * Math.exp(-t * 7.5) * attack * amp
  }
}

function addHat(out, start, amp, open, seed) {
  const n = Math.floor((open ? 0.07 : 0.028) * SR)
  let low = 0
  const cut = open ? 0.18 : 0.28
  for (let i = 0; i < n; i += 1) {
    const idx = start + i
    if (idx < 0 || idx >= out.length) continue
    const raw = noiseAt(seed + i * 3)
    low += cut * (raw - low)
    const hat = raw - low
    const e = Math.exp((-i / SR) * (open ? 28 : 70))
    out[idx] += hat * e * amp
  }
}

function addSnare(out, start, amp, seed) {
  const n = Math.floor(0.16 * SR)
  let phase = 0
  let low = 0
  for (let i = 0; i < n; i += 1) {
    const idx = start + i
    if (idx < 0 || idx >= out.length) continue
    const t = i / SR
    phase += (TAU * 188) / SR
    const raw = noiseAt(seed + i)
    low += 0.22 * (raw - low)
    const e = Math.exp(-t * 18)
    out[idx] += (Math.sin(phase) * 0.28 + (raw - low) * 0.72) * e * amp
  }
}

function addNoiseSweep(out, start, dur, amp, seed) {
  const n = Math.max(1, dur | 0)
  let low = 0
  for (let i = 0; i < n; i += 1) {
    const idx = start + i
    if (idx < 0 || idx >= out.length) continue
    const p = i / n
    const raw = noiseAt(seed + i)
    low += (0.08 + p * 0.35) * (raw - low)
    const e = Math.sin(p * Math.PI) ** 1.3
    out[idx] += (raw - low) * e * amp
  }
}

function sidechain(out, step, depth) {
  for (let i = 0; i < out.length; i += 1) {
    const pos = (i % step) / step
    const env = Math.exp(-pos * 11)
    out[i] *= 1 - depth * env
  }
}

function soften(out) {
  let low = 0
  const cut = Math.exp((-TAU * 7200) / SR)
  for (let i = 0; i < out.length; i += 1) {
    low += (1 - cut) * (out[i] - low)
    out[i] = low
  }
}

function rmsRange(samples, from, to) {
  let sq = 0
  const n = Math.max(1, to - from)
  for (let i = from; i < to; i += 1) sq += samples[i] * samples[i]
  return Math.sqrt(sq / n)
}

function analyze(samples) {
  let low = 0
  let mid = 0
  const aLow = Math.exp((-TAU * 180) / SR)
  const aMid = Math.exp((-TAU * 2600) / SR)
  let lp = 0
  let mp = 0
  let flux = 0
  let prev = 0
  for (let i = 0; i < samples.length; i += 4) {
    const s = samples[i]
    lp += (1 - aLow) * (s - lp)
    const rest = s - lp
    mp += (1 - aMid) * (rest - mp)
    const high = rest - mp
    low += lp * lp
    mid += mp * mp
    flux += (s - prev) ** 2
    prev = s
  }
  const hops = Math.ceil(samples.length / 4)
  const total = low + mid + (flux > 0 ? 0 : 0)
  let highE = 0
  lp = 0
  mp = 0
  for (let i = 0; i < samples.length; i += 4) {
    const s = samples[i]
    lp += (1 - aLow) * (s - lp)
    const rest = s - lp
    mp += (1 - aMid) * (rest - mp)
    const high = rest - mp
    highE += high * high
  }
  const sum = low + mid + highE
  return {
    low: low / sum,
    mid: mid / sum,
    high: highE / sum,
    flux: Math.sqrt(flux / hops),
  }
}

/**
 * Soft modern electronic bed.
 * Amaj7–F#m7–Dmaj7–Eadd9, round kicks, airy hats, a warm sine bass,
 * sustained pads, and a short bell hook. The rush bed is a little
 * faster and brighter. It stays soft rather than turning into a harder mix.
 */
function renderArena(bpm, bars, rush) {
  const step = beatSamples(bpm)
  const total = step * 4 * bars
  const tone = new Float32Array(total)
  const drums = new Float32Array(total)
  const progression = [
    { root: 57, tones: [57, 61, 64, 68] },
    { root: 54, tones: [54, 57, 61, 64] },
    { root: 50, tones: [50, 54, 57, 61] },
    { root: 52, tones: [52, 56, 59, 66] },
  ]
  const motifs = [
    [0, 7, 12, -1, 7, 4, 12, -1],
    [-1, 4, 7, 12, -1, 11, 7, 4],
    [0, -1, 7, 12, 16, 12, 7, -1],
    [4, 7, -1, 11, 12, -1, 7, 4],
  ]
  for (let bar = 0; bar < bars; bar += 1) {
    const chord = progression[bar % progression.length]
    const root = midi(chord.root)
    const origin = bar * step * 4
    for (const note of chord.tones) addPad(tone, origin, step * 4, midi(note), rush ? 0.048 : 0.04)
    const bass = [
      [0, 0.55, rush ? 0.16 : 0.13],
      [2.5, 0.28, rush ? 0.1 : 0.08],
      [3.5, 0.2, rush ? 0.08 : 0.06],
    ]
    if (rush) bass.push([1.5, 0.18, 0.07])
    for (const [beat, beatsLong, amp] of bass) {
      addTone(tone, origin + Math.floor(beat * step), Math.floor(beatsLong * step), root / 2, root / 2, amp, 3.4)
    }
    for (let beat = 0; beat < 4; beat += 1) {
      const hit = origin + beat * step
      addSoftKick(drums, hit, rush ? 0.58 : 0.5)
      if (beat === 1 || beat === 3) addClap(drums, hit, rush ? 0.13 : 0.09, 5000 + bar * 13 + beat)
      const divisions = rush ? 4 : 2
      for (let sub = 0; sub < divisions; sub += 1) {
        const hatAt = hit + Math.floor((sub * step) / divisions)
        const open = sub === divisions - 1 && (beat === 1 || beat === 3)
        const accent = sub === 0 ? 0.65 : 0.38
        addHat(drums, hatAt, (rush ? 0.028 : 0.018) * accent, open, 9000 + bar * 20 + beat * 4 + sub)
      }
    }
    const motif = motifs[bar % motifs.length]
    for (let eighth = 0; eighth < motif.length; eighth += 1) {
      const degree = motif[eighth]
      if (degree < 0) continue
      const freq = root * 2 ** (degree / 12) * 2
      const at = origin + Math.floor((eighth * step) / 2)
      const amp = (eighth % 4 === 0 ? 0.11 : 0.07) * (rush ? 1.12 : 1)
      addBell(tone, at, Math.floor(step * 0.46), freq, amp)
      if (rush && eighth % 2 === 0) addBell(tone, at, Math.floor(step * 0.3), freq * 2, amp * 0.32)
    }
    if (bar % 8 === 7) addNoiseSweep(tone, origin + step * 2, step * 2, rush ? 0.03 : 0.018, 21000 + bar)
  }
  sidechain(tone, step, rush ? 0.34 : 0.22)
  const out = new Float32Array(total)
  for (let i = 0; i < total; i += 1) out[i] = tone[i] + drums[i]
  soften(out)
  fadeEdges(out, 12)
  normalize(out, rush ? 0.74 : 0.7)
  let peaks = 0
  const hop = Math.floor(SR * 0.05)
  for (let i = hop; i < out.length; i += hop) {
    let peak = 0
    let prev = 0
    for (let j = 0; j < hop; j += 1) {
      peak = Math.max(peak, Math.abs(out[i - j]))
      prev = Math.max(prev, Math.abs(out[Math.max(0, i - hop - j)]))
    }
    if (peak > 0.28 && peak > prev * 1.22) peaks += 1
  }
  const rate = peaks / (out.length / SR)
  console.log(`bed ${bpm} bpm  peaks/sec ${rate.toFixed(2)}`)
  if (rate < 1.15) throw new Error(`bed ${bpm} has no groove`)
  const head = rmsRange(out, 0, Math.min(out.length, Math.floor(SR * 1.2)))
  const body = rmsRange(out, 0, out.length)
  const bands = analyze(out)
  if (head < body * 0.62) throw new Error(`bed ${bpm} starts too quietly`)
  if (bands.low < 0.08) throw new Error(`bed ${bpm} lacks a bass pulse`)
  if (bands.high > 0.42) throw new Error(`bed ${bpm} is too bright`)
  console.log(`bed ${bpm} bpm  low ${(bands.low * 100).toFixed(0)}%  mid ${(bands.mid * 100).toFixed(0)}%  high ${(bands.high * 100).toFixed(0)}%  flux ${bands.flux.toFixed(3)}`)
  return out
}

function renderVictoryPayoff() {
  const out = buffer(9.2)
  const stabs = [0, 0.42, 0.84, 1.7]
  const chords = [
    [62, 66, 69],
    [64, 69, 74],
    [66, 69, 74],
    [62, 69, 74, 81],
  ]
  stabs.forEach((time, index) => {
    addOsc(out, time, 0.55, 52, 78, index === 3 ? 0.46 : 0.32)
    addNoise(out, time, 0.18, 0.12, 16, 50 + index, 0.4)
    for (const note of chords[index]) addOsc(out, time, 1.1, midi(note), midi(note), index === 3 ? 0.1 : 0.07, 0.15)
  })
  for (let beat = 0; beat < 8; beat += 1) addOsc(out, 2.4 + beat * 0.38, 0.16, 78, 46, beat % 2 === 0 ? 0.22 : 0.12)
  addOsc(out, 2.5, 5.4, midi(62), midi(62), 0.05)
  addOsc(out, 2.5, 5.4, midi(69), midi(69), 0.04)
  addOsc(out, 2.5, 5.4, midi(74), midi(74), 0.035)
  addOsc(out, 6.6, 1.8, 65, 130, 0.28)
  fadeEdges(out, 18)
  normalize(out, 0.78)
  return out
}

function renderCloseTension() {
  const step = beatSamples(144)
  const total = step * 8
  const out = new Float32Array(total)
  for (let beat = 0; beat < 8; beat += 1) {
    const at = beat * step
    addTone(out, at, Math.floor(step * 0.45), midi(50), midi(50), 0.22, 6)
    addTone(out, at + Math.floor(step / 2), Math.floor(step * 0.3), midi(55), midi(57), 0.12, 8)
    addHat(out, at + Math.floor(step / 2), 0.05, false, 300 + beat)
  }
  fadeEdges(out, 6)
  normalize(out, 0.46)
  return out
}

function renderComeback() {
  const out = buffer(1.55)
  ;[62, 66, 69, 74].forEach((note, index) => {
    addOsc(out, index * 0.16, 0.42, midi(note), midi(note + 2), 0.22, 0.2)
  })
  addNoiseSweep(out, Math.floor(0.15 * SR), Math.floor(1.05 * SR), 0.12, 77)
  addKick(out, Math.floor(1.05 * SR), 0.85)
  addOsc(out, 1.05, 0.4, midi(74), midi(74), 0.16)
  fadeEdges(out, 8)
  normalize(out, 0.74)
  return out
}

function renderLeadHit() {
  const out = buffer(0.52)
  addKick(out, 0, 0.9)
  addSnare(out, 0, 0.28, 9)
  for (const note of [62, 66, 69, 74]) addOsc(out, 0.01, 0.42, midi(note), midi(note), 0.12, 0.2)
  fadeEdges(out, 6)
  normalize(out, 0.76)
  return out
}

function renderFinalTen() {
  const step = beatSamples(150)
  const out = new Float32Array(step * 4)
  for (let eighth = 0; eighth < 8; eighth += 1) {
    const at = Math.floor((eighth * step) / 2)
    addTone(out, at, Math.floor(step * 0.18), eighth % 2 === 0 ? 98 : 146, 70, eighth % 2 === 0 ? 0.28 : 0.16, 12)
    addHat(out, at, 0.07, false, 900 + eighth)
  }
  fadeEdges(out, 4)
  normalize(out, 0.5)
  return out
}

function renderFinalThree() {
  const out = buffer(2.7)
  let cursor = 0
  let gap = 0.18
  let note = 57
  while (cursor < 2.35) {
    addTone(out, Math.floor(cursor * SR), Math.floor(0.12 * SR), midi(note), midi(note + 1), 0.2, 14)
    addHat(out, Math.floor(cursor * SR), 0.06, false, 1400 + Math.floor(cursor * 100))
    cursor += gap
    gap = Math.max(0.07, gap * 0.9)
    note += note > 69 ? 0 : 1
  }
  addNoiseSweep(out, Math.floor(0.2 * SR), Math.floor(2.2 * SR), 0.1, 88)
  addKick(out, Math.floor(2.25 * SR), 0.7)
  fadeEdges(out, 10)
  normalize(out, 0.68)
  return out
}

const sfx = {
  'gift-small': () => {
    const out = buffer(0.22)
    addOsc(out, 0, 0.18, 620, 880, 0.35)
    addOsc(out, 0.02, 0.14, 980, 1240, 0.12)
    return out
  },
  'gift-medium': () => {
    const out = buffer(0.38)
    addSweep(out, 0, 0.16, 280, 740, 0.28)
    addOsc(out, 0.05, 0.28, 520, 860, 0.22, 0.25)
    addNoise(out, 0.04, 0.12, 0.08, 30, 7, 0.7)
    return out
  },
  'gift-large': () => {
    const out = buffer(0.78)
    addSweep(out, 0, 0.42, 180, 720, 0.3)
    addOsc(out, 0.28, 0.42, 220, 90, 0.34)
    addNoise(out, 0.3, 0.28, 0.16, 12, 11, 0.45)
    addOsc(out, 0.32, 0.36, 640, 420, 0.12, 0.3)
    return out
  },
  projectile: () => {
    const out = buffer(0.12)
    addNoise(out, 0, 0.028, 0.48, 90, 3, 0.95)
    addOsc(out, 0, 0.07, 920, 210, 0.26, 0.15)
    addOsc(out, 0, 0.045, 160, 70, 0.14)
    return out
  },
  laser: () => {
    const out = buffer(0.15)
    addNoise(out, 0, 0.02, 0.32, 100, 19, 0.95)
    addOsc(out, 0, 0.09, 1720, 460, 0.22, 0.4)
    addOsc(out, 0, 0.05, 2480, 880, 0.07)
    return out
  },
  'missile-launch': () => {
    const out = buffer(0.62)
    addNoise(out, 0, 0.03, 0.42, 80, 21, 0.92)
    addOsc(out, 0, 0.08, 480, 140, 0.24)
    addSweep(out, 0.02, 0.2, 90, 240, 0.28)
    addNoise(out, 0.12, 0.42, 0.18, 6, 29, 0.35)
    addSweep(out, 0.16, 0.4, 180, 70, 0.16)
    return out
  },
  'missile-flight': () => {
    const out = buffer(0.45)
    addNoise(out, 0, 0.42, 0.14, 4, 27, 0.55)
    addOsc(out, 0, 0.42, 240, 160, 0.08)
    return out
  },
  'missile-impact': () => {
    const out = buffer(0.55)
    addOsc(out, 0, 0.4, 90, 38, 0.4)
    addNoise(out, 0, 0.32, 0.28, 9, 33, 0.25)
    addOsc(out, 0.02, 0.18, 180, 70, 0.12)
    return out
  },
  'power-charge': () => {
    const out = buffer(0.7)
    addSweep(out, 0, 0.62, 160, 740, 0.26)
    addOsc(out, 0.1, 0.5, 320, 640, 0.1, 0.4)
    return out
  },
  'power-release': () => {
    const out = buffer(0.36)
    addSweep(out, 0, 0.22, 520, 180, 0.3)
    addNoise(out, 0, 0.16, 0.14, 18, 44, 0.5)
    return out
  },
  'explosion-small': () => {
    const out = buffer(0.32)
    addNoise(out, 0, 0.22, 0.3, 16, 51, 0.2)
    addOsc(out, 0, 0.28, 120, 48, 0.28)
    return out
  },
  'explosion-large': () => {
    const out = buffer(0.85)
    addOsc(out, 0, 0.55, 78, 32, 0.42)
    addNoise(out, 0, 0.45, 0.26, 7, 58, 0.15)
    addOsc(out, 0.08, 0.6, 50, 36, 0.22)
    addNoise(out, 0.12, 0.5, 0.08, 3, 62, 0.1)
    return out
  },
  lightning: () => {
    const out = buffer(0.34)
    addNoise(out, 0, 0.08, 0.22, 40, 70, 0.95)
    addOsc(out, 0.01, 0.12, 1800, 420, 0.12, 0.8)
    addOsc(out, 0.04, 0.2, 240, 90, 0.16)
    addNoise(out, 0.06, 0.18, 0.1, 14, 77, 0.7)
    return out
  },
  fire: () => {
    const out = buffer(0.42)
    addNoise(out, 0, 0.28, 0.22, 8, 81, 0.35)
    addSweep(out, 0.02, 0.3, 360, 140, 0.16)
    addOsc(out, 0, 0.12, 520, 260, 0.08)
    return out
  },
  tornado: () => {
    const out = buffer(0.95)
    addNoise(out, 0, 0.9, 0.16, 1.6, 90, 0.45)
    addSweep(out, 0.05, 0.85, 140, 420, 0.12)
    addSweep(out, 0.2, 0.7, 220, 80, 0.08)
    return out
  },
  'meteor-fall': () => {
    const out = buffer(1.15)
    addOsc(out, 0, 1.05, 70, 46, 0.22)
    addNoise(out, 0.05, 1.0, 0.12, 1.4, 101, 0.2)
    addSweep(out, 0.25, 0.85, 180, 90, 0.16)
    return out
  },
  'meteor-impact': () => {
    const out = buffer(1.15)
    addOsc(out, 0, 0.7, 64, 28, 0.46)
    addNoise(out, 0, 0.4, 0.3, 6, 111, 0.12)
    addOsc(out, 0.04, 0.8, 40, 30, 0.24)
    addNoise(out, 0.1, 0.7, 0.1, 2.2, 118, 0.05)
    addOsc(out, 0.02, 0.25, 220, 80, 0.1)
    return out
  },
  'ultimate-charge': () => {
    const out = buffer(1.35)
    addSweep(out, 0, 1.15, 90, 880, 0.24)
    addOsc(out, 0.15, 1.05, 180, 540, 0.1, 0.35)
    addNoise(out, 0.4, 0.9, 0.08, 2, 130, 0.4)
    return out
  },
  'ultimate-impact': () => {
    const out = buffer(1.45)
    addOsc(out, 0, 0.9, 58, 26, 0.4)
    addNoise(out, 0, 0.5, 0.28, 5, 141, 0.1)
    addOsc(out, 0.06, 1.1, 36, 28, 0.26)
    addSweep(out, 0.02, 0.45, 480, 120, 0.12)
    addNoise(out, 0.15, 0.9, 0.08, 1.8, 150, 0.05)
    return out
  },
  combo: () => {
    const out = buffer(0.32)
    addOsc(out, 0, 0.16, 660, 880, 0.28)
    addOsc(out, 0.08, 0.2, 990, 1240, 0.16)
    return out
  },
  'combo-high': () => {
    const out = buffer(0.5)
    addOsc(out, 0, 0.18, 520, 780, 0.22)
    addOsc(out, 0.08, 0.22, 780, 1170, 0.18, 0.3)
    addOsc(out, 0.16, 0.28, 1040, 1560, 0.12)
    addNoise(out, 0.12, 0.16, 0.06, 20, 160, 0.6)
    return out
  },
  momentum: () => {
    const out = buffer(0.42)
    addSweep(out, 0, 0.36, 220, 660, 0.24)
    addOsc(out, 0.08, 0.28, 440, 660, 0.1)
    return out
  },
  'team-lead': () => {
    const out = buffer(0.36)
    addOsc(out, 0, 0.22, 494, 740, 0.2)
    addOsc(out, 0.06, 0.24, 740, 988, 0.1)
    return out
  },
  'countdown-tick': () => {
    const out = buffer(0.14)
    addOsc(out, 0, 0.12, 520, 520, 0.3)
    return out
  },
  'countdown-final': () => {
    const out = buffer(0.28)
    addOsc(out, 0, 0.22, 680, 420, 0.28)
    addOsc(out, 0.02, 0.18, 1020, 640, 0.1)
    return out
  },
  'final-rush-start': () => {
    const out = buffer(1.15)
    addSweep(out, 0, 0.7, 140, 880, 0.22)
    addNoise(out, 0.15, 0.55, 0.08, 4, 170, 0.4)
    addOsc(out, 0.62, 0.4, 98, 49, 0.32)
    addNoise(out, 0.64, 0.3, 0.16, 10, 175, 0.2)
    return out
  },
  victory: () => {
    const out = buffer(1.7)
    ;[523.25, 659.25, 783.99, 1046.5].forEach((f, i) => addOsc(out, i * 0.11, 0.7, f, f, 0.16, 0.15))
    addOsc(out, 0.05, 1.2, 130.8, 261.6, 0.18)
    return out
  },
}

function renderNamed(name, factory, peak) {
  const out = factory()
  fadeEdges(out, name.startsWith('countdown') ? 3 : 6)
  normalize(out, peak)
  return out
}

const peaks = {
  'gift-small': 0.42,
  'countdown-tick': 0.48,
  'team-lead': 0.55,
  momentum: 0.62,
  projectile: 0.7,
  laser: 0.62,
  'gift-medium': 0.7,
  combo: 0.68,
  'missile-flight': 0.5,
  fire: 0.66,
  tornado: 0.6,
  'meteor-fall': 0.74,
  'ultimate-charge': 0.76,
  'power-charge': 0.7,
  'final-rush-start': 0.78,
  victory: 0.7,
}

async function emit(rel, samples) {
  const file = join(ROOT, rel)
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, wavBytes(samples))
  const info = stats(samples)
  if (info.rms < 0.01 || info.peak < 0.05) throw new Error(`${rel} looks silent`)
  console.log(`${rel}\t${info.seconds}s\tpeak ${info.peak}\trms ${info.rms}`)
}

function renderBattleStart() {
  const out = buffer(0.7)
  addKick(out, 0, 1)
  addSnare(out, Math.floor(0.012 * SR), 0.5, 21)
  addNoise(out, 0, 0.24, 0.22, 11, 15, 0.3)
  addOsc(out, 0, 0.45, 48, 92, 0.4)
  for (const note of [62, 66, 69, 74]) addOsc(out, 0.02, 0.5, midi(note), midi(note), 0.1, 0.2)
  fadeEdges(out, 8)
  normalize(out, 0.8)
  return out
}

/** Hard CHK / KSH. Mid noise only, so the click stays crisp without a bird tone. */
function addClick(out, start, dur, amp, seed, lo = 850, hi = 1650) {
  addBand(out, start, dur, amp, seed, lo, hi, 90)
}

/** Low-mid energy body. Fundamental stays under 280 Hz. */
function addBody(out, start, dur, f0, f1, amp, color = 0.28) {
  const a0 = Math.floor(start * SR)
  const n = Math.max(1, Math.floor(dur * SR))
  let phase = 0
  for (let i = 0; i < n; i += 1) {
    const idx = a0 + i
    if (idx < 0 || idx >= out.length) continue
    const t = i / SR
    const p = i / Math.max(1, n - 1)
    const f = f0 * (f1 / Math.max(1, f0)) ** p
    phase += (TAU * f) / SR
    const attack = Math.min(1, t / 0.004)
    const e = attack * Math.exp(-t / Math.max(0.028, dur * 0.46))
    const s = Math.sin(phase) + color * Math.sin(phase * 2) + color * 0.28 * Math.sin(phase * 3.02)
    out[idx] += s * e * amp
  }
}

/** Short bass thump. Drops fast so it reads as impact, not a note. */
function addThump(out, start, dur, f0, f1, amp) {
  addBody(out, start, dur, f0, f1, amp, 0)
}

function addBand(out, start, dur, amp, seed, lo, hi, decay) {
  const a0 = Math.floor(start * SR)
  const n = Math.max(1, Math.floor(dur * SR))
  const hiA = 1 - Math.exp((-TAU * hi) / SR)
  const loA = 1 - Math.exp((-TAU * lo) / SR)
  let high = 0
  let low = 0
  for (let i = 0; i < n; i += 1) {
    const idx = a0 + i
    if (idx < 0 || idx >= out.length) continue
    const raw = noiseAt(seed + i * 5 + 11)
    high += hiA * (raw - high)
    low += loA * (raw - low)
    const t = i / SR
    const e = Math.min(1, t / 0.0011) * Math.exp(-t * decay)
    out[idx] += (high - low) * e * amp
  }
}

/** Beating low-mid rumble for charges. Two close tones, no high partials. */
function addRumble(out, start, dur, f, amp) {
  const a0 = Math.floor(start * SR)
  const n = Math.max(1, Math.floor(dur * SR))
  let phaseA = 0
  let phaseB = 0
  for (let i = 0; i < n; i += 1) {
    const idx = a0 + i
    if (idx < 0 || idx >= out.length) continue
    const t = i / SR
    phaseA += (TAU * f) / SR
    phaseB += (TAU * f * 0.94) / SR
    const swell = 0.42 + 0.58 * Math.min(1, t / Math.max(0.03, dur * 0.55))
    const tail = Math.exp(-Math.max(0, t - dur * 0.55) / Math.max(0.03, dur * 0.22))
    out[idx] += (Math.sin(phaseA) * 0.72 + Math.sin(phaseB) * 0.48) * swell * tail * amp
  }
}

/** Rushing energy. A moving noise band, never a pitched note. */
function addWhoosh(out, start, dur, amp, seed, fromHz, toHz) {
  const a0 = Math.floor(start * SR)
  const n = Math.max(1, Math.floor(dur * SR))
  let high = 0
  let low = 0
  for (let i = 0; i < n; i += 1) {
    const idx = a0 + i
    if (idx < 0 || idx >= out.length) continue
    const p = i / Math.max(1, n - 1)
    const center = fromHz * (toHz / Math.max(1, fromHz)) ** p
    const hiA = 1 - Math.exp((-TAU * Math.min(5000, center * 1.65)) / SR)
    const loA = 1 - Math.exp((-TAU * Math.max(50, center * 0.42)) / SR)
    const raw = noiseAt(seed + i * 7 + 3)
    high += hiA * (raw - high)
    low += loA * (high - low)
    const env = Math.sin(Math.PI * Math.min(1, p)) ** 0.5
    out[idx] += (high - low) * env * amp
  }
}

function shaped(seconds, draw, level) {
  const out = buffer(seconds)
  draw(out)
  normalize(out, level)
  return out
}

function sum(parts) {
  const out = new Float32Array(parts[0].length)
  for (const part of parts) {
    for (let i = 0; i < out.length; i += 1) out[i] += part[i] ?? 0
  }
  return out
}

function drive(out, amount) {
  for (let i = 0; i < out.length; i += 1) out[i] = Math.tanh(out[i] * amount)
}

function fadeTail(out, ms = 6) {
  const n = Math.min(out.length, Math.floor((ms / 1000) * SR))
  for (let i = 0; i < n; i += 1) out[out.length - 1 - i] *= i / n
  const head = Math.min(out.length, Math.floor(0.00035 * SR))
  for (let i = 0; i < head; i += 1) out[i] *= i / Math.max(1, head)
}

function finishAttack(out, driveAmount, peak) {
  drive(out, driveAmount)
  fadeTail(out, 8)
  normalize(out, peak)
  return out
}

function bandReport(samples) {
  const cuts = [180, 700, 1800]
  const state = cuts.map(() => 0)
  const alpha = cuts.map((freq) => 1 - Math.exp((-TAU * freq) / SR))
  const energy = [0, 0, 0, 0]
  for (let i = 0; i < samples.length; i += 1) {
    const x = samples[i]
    for (let band = 0; band < cuts.length; band += 1) state[band] += alpha[band] * (x - state[band])
    const parts = [state[0], state[1] - state[0], state[2] - state[1], x - state[2]]
    for (let band = 0; band < parts.length; band += 1) energy[band] += parts[band] * parts[band]
  }
  const total = energy.reduce((sum, value) => sum + value, 0) || 1
  const names = ['sub', 'low-mid', 'mid', 'high']
  return names.map((name, index) => `${name} ${Math.round((energy[index] / total) * 100)}%`).join('  ')
}

const attacks = {
  'atk-like': () => {
    const seconds = 0.12
    return finishAttack(
      sum([
        shaped(seconds, (out) => addClick(out, 0, 0.009, 1, 11, 1400, 2800), 0.78),
        shaped(seconds, (out) => addBand(out, 0, 0.05, 1, 23, 340, 1200, 22), 0.95),
        shaped(seconds, (out) => addThump(out, 0.001, 0.042, 90, 52, 1), 0.5),
        shaped(seconds, (out) => addBand(out, 0.018, 0.09, 1, 24, 180, 520, 14), 0.28),
      ]),
      1.15,
      0.74,
    )
  },
  'atk-follow': () => {
    const seconds = 0.26
    return finishAttack(
      sum([
        shaped(seconds, (out) => addClick(out, 0, 0.012, 1, 31, 1200, 3000), 0.72),
        shaped(seconds, (out) => addBand(out, 0, 0.09, 1, 44, 160, 680, 9), 0.9),
        shaped(seconds, (out) => addThump(out, 0, 0.07, 78, 42, 1), 0.58),
        shaped(seconds, (out) => addWhoosh(out, 0.015, 0.22, 1, 45, 980, 240), 0.74),
        shaped(seconds, (out) => addBand(out, 0.04, 0.02, 1, 46, 600, 1500, 40), 0.32),
      ]),
      1.12,
      0.78,
    )
  },
  'atk-share': () => {
    const seconds = 0.3
    return finishAttack(
      sum([
        shaped(seconds, (out) => addClick(out, 0, 0.01, 1, 7, 1300, 3200), 0.7),
        shaped(seconds, (out) => addWhoosh(out, 0, 0.09, 1, 8, 860, 320), 0.62),
        shaped(seconds, (out) => addWhoosh(out, 0.09, 0.09, 1, 9, 780, 280), 0.7),
        shaped(seconds, (out) => addWhoosh(out, 0.18, 0.1, 1, 10, 700, 240), 0.78),
        shaped(seconds, (out) => addThump(out, 0.09, 0.06, 86, 48, 1), 0.4),
        shaped(seconds, (out) => addThump(out, 0.18, 0.07, 80, 44, 1), 0.48),
        shaped(seconds, (out) => addBand(out, 0, 0.08, 1, 12, 180, 640, 10), 0.45),
      ]),
      1.1,
      0.8,
    )
  },
  'atk-small': () => {
    const seconds = 0.3
    return finishAttack(
      sum([
        shaped(seconds, (out) => addClick(out, 0, 0.012, 1, 18, 1100, 2800), 0.68),
        shaped(seconds, (out) => addBand(out, 0, 0.11, 1, 28, 140, 560, 7), 0.92),
        shaped(seconds, (out) => addThump(out, 0, 0.09, 72, 40, 1), 0.66),
        shaped(seconds, (out) => addWhoosh(out, 0.02, 0.24, 1, 29, 820, 200), 0.7),
        shaped(seconds, (out) => addBand(out, 0.05, 0.04, 1, 30, 500, 1400, 24), 0.36),
      ]),
      1.12,
      0.82,
    )
  },
  'atk-medium': () => {
    const seconds = 0.48
    return finishAttack(
      sum([
        shaped(seconds, (out) => addRumble(out, 0, 0.1, 70, 1), 0.62),
        shaped(seconds, (out) => addBand(out, 0, 0.1, 1, 36, 120, 460, 6), 0.55),
        shaped(seconds, (out) => addClick(out, 0.08, 0.014, 1, 52, 900, 2600), 0.8),
        shaped(seconds, (out) => addBand(out, 0.08, 0.08, 1, 53, 220, 1100, 12), 0.9),
        shaped(seconds, (out) => addThump(out, 0.08, 0.1, 88, 38, 1), 0.72),
        shaped(seconds, (out) => addWhoosh(out, 0.12, 0.32, 1, 54, 760, 170), 0.8),
      ]),
      1.1,
      0.86,
    )
  },
  'hit-small': () => {
    const seconds = 0.08
    return finishAttack(
      sum([
        shaped(seconds, (out) => addClick(out, 0, 0.008, 1, 9, 1500, 3800), 0.8),
        shaped(seconds, (out) => addBand(out, 0, 0.04, 1, 10, 400, 1400, 30), 0.95),
        shaped(seconds, (out) => addThump(out, 0, 0.045, 100, 58, 1), 0.48),
      ]),
      1.18,
      0.72,
    )
  },
  'hit-medium': () => {
    const seconds = 0.16
    return finishAttack(
      sum([
        shaped(seconds, (out) => addClick(out, 0, 0.012, 1, 14, 1000, 2800), 0.82),
        shaped(seconds, (out) => addBand(out, 0, 0.05, 1, 15, 300, 1200, 20), 0.9),
        shaped(seconds, (out) => addThump(out, 0, 0.09, 84, 40, 1), 0.7),
        shaped(seconds, (out) => addBand(out, 0.02, 0.1, 1, 16, 160, 600, 10), 0.4),
      ]),
      1.12,
      0.8,
    )
  },
  'hit-large': () => {
    const seconds = 0.26
    return finishAttack(
      sum([
        shaped(seconds, (out) => addClick(out, 0, 0.014, 1, 21, 800, 2400), 0.85),
        shaped(seconds, (out) => addBand(out, 0, 0.06, 1, 22, 240, 1100, 14), 0.92),
        shaped(seconds, (out) => addThump(out, 0, 0.14, 86, 34, 1), 0.82),
        shaped(seconds, (out) => addBand(out, 0.02, 0.16, 1, 23, 140, 520, 7), 0.48),
      ]),
      1.1,
      0.88,
    )
  },
}

function attackBig() {
  const seconds = 0.86
  const body = sum([
    shaped(seconds, (out) => addRumble(out, 0, 0.1, 62, 1), 0.58),
    shaped(seconds, (out) => addBand(out, 0, 0.1, 1, 3, 110, 420, 5), 0.42),
    shaped(seconds, (out) => addRumble(out, 0.08, 0.14, 78, 1), 0.72),
    shaped(seconds, (out) => addBand(out, 0.08, 0.14, 1, 4, 160, 560, 6), 0.55),
    shaped(seconds, (out) => addThump(out, 0.2, 0.16, 94, 38, 1), 0.78),
  ])
  const air = sum([
    shaped(seconds, (out) => addWhoosh(out, 0.18, 0.2, 1, 15, 900, 240), 0.78),
    shaped(seconds, (out) => addWhoosh(out, 0.34, 0.48, 1, 16, 620, 140), 0.86),
  ])
  const crack = sum([
    shaped(seconds, (out) => addClick(out, 0.2, 0.016, 1, 90, 800, 2600), 0.88),
    shaped(seconds, (out) => addBand(out, 0.2, 0.055, 1, 91, 320, 1200, 16), 0.64),
  ])
  return widen(body, air, crack)
}

function hitMax() {
  const seconds = 0.42
  const body = sum([
    shaped(seconds, (out) => addThump(out, 0, 0.14, 90, 36, 1), 0.68),
    shaped(seconds, (out) => addRumble(out, 0.05, 0.22, 48, 1), 0.36),
  ])
  const air = shaped(seconds, (out) => addBand(out, 0.012, 0.18, 1, 40, 180, 640, 8), 0.55)
  const crack = sum([
    shaped(seconds, (out) => addClick(out, 0, 0.014, 1, 70, 900, 2400), 0.95),
    shaped(seconds, (out) => addBand(out, 0, 0.06, 1, 71, 320, 1300, 16), 0.9),
  ])
  return widen(body, air, crack)
}

function widen(body, air, crack) {
  const n = body.length
  const left = new Float32Array(n)
  const right = new Float32Array(n)
  const delay = Math.floor(0.009 * SR)
  for (let i = 0; i < n; i += 1) {
    const delayed = i >= delay ? i - delay : -1
    const airLate = delayed >= 0 ? air[delayed] : 0
    const crackLate = delayed >= 0 ? crack[delayed] : 0
    left[i] = body[i] + air[i] * 0.8 + crack[i]
    right[i] = body[i] * 0.96 + air[i] * 1.1 + airLate * 0.32 + crackLate * 0.9
  }
  drive(left, 1.18)
  drive(right, 1.18)
  fadeTail(left, 14)
  fadeTail(right, 14)
  let peak = 0
  for (let i = 0; i < n; i += 1) peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]))
  const gain = peak > 0.00001 ? 0.9 / peak : 0
  for (let i = 0; i < n; i += 1) {
    left[i] *= gain
    right[i] *= gain
  }
  return { left, right }
}

function wavStereo(left, right) {
  const n = Math.min(left.length, right.length)
  const data = Buffer.alloc(n * 4)
  for (let i = 0; i < n; i += 1) {
    data.writeInt16LE((clamp(left[i], -1, 1) * 32767) | 0, i * 4)
    data.writeInt16LE((clamp(right[i], -1, 1) * 32767) | 0, i * 4 + 2)
  }
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + data.length, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(2, 22)
  header.writeUInt32LE(SR, 24)
  header.writeUInt32LE(SR * 4, 28)
  header.writeUInt16LE(4, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36)
  header.writeUInt32LE(data.length, 40)
  return Buffer.concat([header, data])
}

if (process.argv.includes('--attacks')) {
  for (const [name, factory] of Object.entries(attacks)) {
    const out = factory()
    console.log(`${name} bands  ${bandReport(out)}`)
    await emit(`sfx/${name}.wav`, out)
  }
  const big = attackBig()
  const maxHit = hitMax()
  for (const [name, pair] of [['atk-big', big], ['hit-max', maxHit]]) {
    const merged = new Float32Array(pair.left.length)
    for (let i = 0; i < merged.length; i += 1) merged[i] = (pair.left[i] + pair.right[i]) * 0.5
    console.log(`${name} bands  ${bandReport(merged)}`)
    const file = join(ROOT, `sfx/${name}.wav`)
    await mkdir(dirname(file), { recursive: true })
    await writeFile(file, wavStereo(pair.left, pair.right))
    console.log(`sfx/${name}.wav\t${(pair.left.length / SR).toFixed(2)}s\tstereo`)
  }
} else if (process.argv.includes('--shots')) {
  for (const name of ['projectile', 'laser', 'missile-launch']) {
    await emit(`sfx/${name}.wav`, renderNamed(name, sfx[name], peaks[name] ?? 0.8))
  }
} else if (process.argv.includes('--cue-only')) {
  await emit('sfx/battle-start.wav', renderBattleStart())
} else {
await emit('music/battle-main.wav', renderArena(116, 16, false))
await emit('music/final-rush.wav', renderArena(124, 16, true))
await emit('music/victory.wav', renderVictoryPayoff())
await emit('music/close-tension.wav', renderCloseTension())
await emit('music/comeback.wav', renderComeback())
await emit('music/lead-hit.wav', renderLeadHit())
await emit('music/final-ten.wav', renderFinalTen())
await emit('music/final-three.wav', renderFinalThree())
await emit('sfx/battle-start.wav', renderBattleStart())
if (process.argv.includes('--sfx')) {
  for (const [name, factory] of Object.entries(sfx)) {
    await emit(`sfx/${name}.wav`, renderNamed(name, factory, peaks[name] ?? 0.8))
  }
}
}
