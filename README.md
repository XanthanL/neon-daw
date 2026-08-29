# NeonDAW

**English** · [简体中文](README.zh-CN.md)

**A complete DAW that runs entirely in your browser.**
Sequence drums, roll melodies, mix through an effect chain, arrange a full song — and export a real WAV file. No install, no account, no backend: drums and synths are generated live with the Web Audio API, melodic instruments use bundled real samples, and everything is produced and rendered in the browser.

> 🎧 **Live demo:** _<https://YOUR-USERNAME.github.io/neon-daw/>_ — fill this in after enabling Pages (Settings → Pages → Source: **GitHub Actions**); the deploy workflow ships with the repo.

![NeonDAW home](screenshots/home-desktop.png)

| | | |
|---|---|---|
| **8 modules** | Channel Rack · Piano Roll · Mixer · Synth · Song · Live Keys · Random · Files |
| **Sound** | 6 synthesized 808-style drums · 16 synth presets · 14 insert effects · bundled real samples for piano / keys / bass / pads |
| **Generation** | 20 named styles · 3–8 patterns per song · harmony / motif / form engines |
| **Interface** | Bilingual EN / 中文 · responsive desktop + mobile layouts |
| **Output** | Offline-rendered WAV export with a live progress bar |
| **Stack** | React 18 · TypeScript · Tone.js · Zustand · Framer Motion · Tailwind CSS 4 · Vite |
| **Footprint** | 100% client-side · single static build · deployable to GitHub Pages |

---

## Why NeonDAW exists

Most "web synth" demos stop at one keyboard. NeonDAW is a complete production loop in a single page:

```
drums (step sequencer) → melody (piano roll) → mix (fx + faders) → arrange (song) → export (WAV)
```

…and it treats the browser like a real instrument: audio unlocks on first touch, playback is sample-accurate via a lookahead scheduler, and the offline exporter rebuilds the *exact* same signal chain so what you hear is what you download.

## Features

### 🥁 Channel Rack
- 16th-note step grid with per-step **velocity** (drag on desktop, paint mode on touch).
- Pattern manager: create / rename / duplicate / resize (1–8 bars) / clear / delete, with Song-clip cascade and full undo.

### 🎹 Piano Roll
- Click to create, drag to move, edge-drag to resize, right-drag or long-press to erase.
- Snap presets (1/4 … 1/32, 1/8T), zoom, and a velocity lane that tints note color.

### 🎚 Mixer
- Per-track level meters (peak-hold), faders, pan, mute/solo, and **4 effect slots**.
- 14 effects: reverb, delays, EQ3, filter, compressor, chorus, phaser, distortion, bit-crusher, tremolo, limiter, stereo widener…

### 🎛 Synth
- Dual oscillators + filter + ADSR with a live envelope curve, and a 16-preset library across 5 families.

### 🎼 Song
- 6 arrangement tracks; place / move / copy / delete pattern clips on a bar timeline.
- **Click or drag the ruler / playhead to scrub and seek** — during playback or from a stopped position.

### ⌨️ Live Keys
- 25-key touch keyboard with octave shift — and **loop overdub**: play along while a pattern loops and your take is quantized into the grid.

### 🎲 Random
- One tap draws a named style and generates a coherent full song — key, chord plan (voicings & voice-leading), a developing motif, groove density and form — then plays it back. Pick **3–8 patterns**: more patterns means a longer arrangement, more layers (lead / pad / arp join in) and denser grooves.

### 📁 Files
- Import/export the whole project as JSON, start fresh, or **export WAV** (pattern ×1/×2/×4 or full song) with a three-phase progress bar that keeps the UI responsive.

![Channel Rack playing](screenshots/rack-desktop.png)

## Architecture, in one breath

Three Zustand stores (`project` persisted to localStorage, `ui`, `history` for 50-step snapshot undo) feed a single `AudioEngine` that owns the Tone.js transport and a per-channel / per-track node graph; the offline exporter reuses the same chain-building rules so preview and export match. A pure-TS music engine (`src/utils/music`) powers the generative "Random" mode, and `src/i18n` holds the bilingual string tables.

```
src/
  audio/        engine · drum synths · synth presets · samples (local) · effects · offline render · wav encoder
  stores/       project (persisted) · ui · history
  components/   8 modules + layout + ui kit
  i18n/         language store + EN/中文 string tables
  utils/music/  rng · theory · motif · groove · styles · compose
```

## Sound sources

NeonDAW is a hybrid instrument:

- **Drums** are synthesized live (808-style `MembraneSynth` / `NoiseSynth` / `MetalSynth`) — zero assets, fully tweakable (tune / decay).
- **Leads / plucks** are the built-in dual-oscillator synth, so the Synth module's knobs actually do something.
- **Piano, keys, bass and pads** play real sampled instruments, **pre-bundled locally** under `public/samples/` (fetched once via `scripts/fetch-samples.mjs`) and loaded same-origin — no runtime cross-origin CDN calls, so first playback is instant and offline-friendly. Files are keyed by MIDI number, so every black key is covered too. If a sample can't load, the voice silently falls back to the synthesizer — a note is never dropped.

## License

MIT © NeonDAW contributors.

Instrument samples are **FluidR3_GM**, © Frank Neff, redistributed via
[`gleitz/midi-js-soundfonts`](https://github.com/gleitz/midi-js-soundfonts) under
**CC-BY 3.0**.
