/**
 * 一次性转换脚本（本地跑，产物提交进 public/）：
 * Salamander Grand Piano v3（Alexander Holm，CC-BY-3.0）
 *   输入：解包的 ogg/ 目录 —— 30 个根音(A0..C8 小三度网格) × 16 力度(v1..v16)，48kHz 立体声
 *   输出：public/samples/piano/{soft,mid,hard}/<midi>.mp3 —— 逐键三层力度，44.1kHz 单声道
 * 非网格键取最近根音采样并 ffmpeg 移调 ±1 半音（asetrate+atempo 保持时长）。
 *
 * 用法： node scripts/build-piano-salamander.mjs <salamander-ogg-dir>
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = resolve(process.argv[2] || '');
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'samples', 'piano');
const LAYERS = { soft: 'v5', mid: 'v9', hard: 'v14' };
const CONCURRENCY = 8;

const midiOf = (name) => {
  const m = /^([A-G]#?)(-?\d+)$/.exec(name);
  const pc = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 }[m[1]];
  return (parseInt(m[2], 10) + 1) * 12 + pc;
};

if (!existsSync(SRC) || !readdirSync(SRC).some((f) => f.endsWith('.ogg'))) {
  console.error('ogg dir not found:', SRC);
  process.exit(1);
}
const roots = [...new Set(readdirSync(SRC).map((f) => /^([A-G]#?\d+)v\d+\.ogg$/.exec(f)?.[1]).filter(Boolean))]
  .map((name) => ({ name, midi: midiOf(name) }))
  .sort((a, b) => a.midi - b.midi);
console.log(`roots: ${roots.length} (${roots[0].name}=${roots[0].midi} .. ${roots.at(-1).name}=${roots.at(-1).midi})`);

const nearest = (m) => roots.reduce((best, r) => (Math.abs(r.midi - m) < Math.abs(best.midi - m) ? r : best), roots[0]);
const trimDur = (m) => (m <= 36 ? 7 : m <= 60 ? 5.5 : m <= 84 ? 4 : 2.8);

const run = (args) =>
  new Promise((res, rej) => {
    const p = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => (err += d));
    p.on('close', (code) => (code ? rej(new Error(err.slice(-400))) : res()));
  });

const jobs = [];
for (const [layer, velTag] of Object.entries(LAYERS)) {
  const dir = join(OUT, layer);
  mkdirSync(dir, { recursive: true });
  for (let m = 21; m <= 108; m++) {
    const out = join(dir, `${m}.mp3`);
    if (existsSync(out) && statSync(out).size > 0) continue;
    const r = nearest(m);
    const shift = m - r.midi;
    if (Math.abs(shift) > 1) {
      console.warn('skip (far from grid):', m);
      continue;
    }
    const aset = Math.round(48000 * 2 ** (shift / 12));
    const atempo = 2 ** (-shift / 12);
    const D = trimDur(m);
    const F = Math.min(1.4, D * 0.35);
    const af =
      `pan=mono|c0=0.5*c0+0.5*c1,asetrate=${aset},aresample=44100,atempo=${atempo.toFixed(6)},` +
      `afade=t=out:st=${(D - F).toFixed(2)}:d=${F.toFixed(2)}`;
    jobs.push([
      '-hide_banner', '-loglevel', 'error', '-y',
      '-i', join(SRC, `${r.name}${velTag}.ogg`),
      '-af', af, '-t', String(D),
      '-c:a', 'libmp3lame', '-b:a', '64k', out,
    ]);
  }
}
console.log('to convert:', jobs.length);

const total = jobs.length;
let done = 0;
let failed = [];
const worker = async () => {
  while (jobs.length) {
    const args = jobs.shift();
    try {
      await run(args);
    } catch (e) {
      failed.push([args.at(-1), String(e.message).slice(0, 120)]);
    }
    if (++done % 60 === 0) console.log(` ${done} / ${total}`);
  }
};
await Promise.all(Array.from({ length: Math.min(CONCURRENCY, total) }, worker));
console.log('done:', done, 'failed:', failed.length);
for (const [f, e] of failed.slice(0, 5)) console.log('  !', f, '\n   ', e);
