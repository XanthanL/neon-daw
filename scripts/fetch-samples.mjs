/**
 * 预下载 FluidR3_GM（CC-BY 3.0，经 gleitz/midi-js-soundfonts）逐键采样到 public/samples/。
 * 运行时改用本地 MIDI 号文件名（<midi>.mp3），彻底规避升/降号命名差异与 URL 里的 '#' 锚点问题，
 * 也不再实时跨域 GET（同源静态资源，快且可缓存）。
 *
 * 用法： node scripts/fetch-samples.mjs   （幂等：已存在且非空的文件跳过）
 */
import { mkdir, writeFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CDN = 'https://cdn.jsdelivr.net/gh/gleitz/midi-js-soundfonts@master/FluidR3_GM/';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'samples');

/** 各乐器 + 需要覆盖的 MIDI 音域（钢琴给满键盘，其余按需，控制体积） */
const PLAN = [
  { inst: 'acoustic_grand_piano', lo: 21, hi: 108 }, // A0–C8 满键盘
  { inst: 'electric_piano_1', lo: 36, hi: 96 },
  { inst: 'acoustic_bass', lo: 24, hi: 55 },
  { inst: 'synth_strings_1', lo: 48, hi: 84 },
];

const FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const oct = (m) => Math.floor(m / 12) - 1;
const flatName = (m) => `${FLAT[m % 12]}${oct(m)}`;
const sharpName = (m) => `${SHARP[m % 12]}${oct(m)}`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchOne(url) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url);
      if (res.ok) return new Uint8Array(await res.arrayBuffer());
      if (res.status === 404) return null;
    } catch {
      /* 网络抖动重试 */
    }
    await sleep(250 * (attempt + 1));
  }
  return null;
}

/** 取一个 MIDI 音的采样：先降号，再升号（不同乐器命名习惯不一） */
async function resolveSample(inst, midi) {
  const flat = await fetchOne(`${CDN}${inst}-mp3/${encodeURIComponent(flatName(midi))}.mp3`);
  if (flat) return flat;
  return fetchOne(`${CDN}${inst}-mp3/${encodeURIComponent(sharpName(midi))}.mp3`);
}

async function existsNonEmpty(p) {
  try {
    const s = await stat(p);
    return s.size > 0;
  } catch {
    return false;
  }
}

async function main() {
  let written = 0;
  let skipped = 0;
  const misses = [];
  let bytes = 0;

  for (const { inst, lo, hi } of PLAN) {
    const dir = join(OUT, inst);
    await mkdir(dir, { recursive: true });
    const jobs = [];
    for (let m = lo; m <= hi; m++) {
      jobs.push(
        (async () => {
          const file = join(dir, `${m}.mp3`);
          if (await existsNonEmpty(file)) {
            skipped++;
            return;
          }
          const data = await resolveSample(inst, m);
          if (!data) {
            misses.push(`${inst}/${m} (${flatName(m)})`);
            return;
          }
          await writeFile(file, data);
          written++;
          bytes += data.length;
        })(),
      );
      if (jobs.length >= 8) await Promise.all(jobs.splice(0, jobs.length));
    }
    await Promise.all(jobs);
    console.log(`${inst}: done`);
  }

  console.log(
    `\nwrote=${written} skipped=${skipped} misses=${misses.length} size≈${(bytes / 1048576).toFixed(1)}MB`,
  );
  if (misses.length) console.log('missing:', misses.slice(0, 40).join(', '));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
