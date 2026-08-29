/**
 * 合成式 808 风格鼓组
 * Kick/Tom = MembraneSynth；Snare/Clap = NoiseSynth + 带通滤波；
 * ClosedHat/OpenHat = MetalSynth + 高通。
 * 支持 velocity（0-127 → 0-1 音量）与音高（tune 半音）/衰减（decay 秒）参数。
 */
import * as Tone from 'tone';
import type { DrumType } from '../types/project';

/** 鼓参数（tune：半音移位；decay：衰减秒数） */
export interface DrumParams {
  tune?: number;
  decay?: number;
}

export interface DrumVoice {
  /** 音源输出节点（已含滤波整形，接入通道 Gain） */
  readonly output: Tone.ToneAudioNode;
  /** 以 0-127 力度在指定音频时刻触发 */
  trigger(velocity: number, time: number): void;
  dispose(): void;
}

/** velocity 0-127 → Tone velocity 0-1 */
const vel01 = (v: number) => Math.min(1, Math.max(0.01, v / 127));

/** Kick —— 808 正弦下坠 */
function createKick(params: DrumParams): DrumVoice {
  const synth = new Tone.MembraneSynth({
    pitchDecay: 0.048,
    octaves: 7,
    oscillator: { type: 'sine' },
    envelope: { attack: 0.0008, decay: params.decay ?? 0.42, sustain: 0 },
  });
  synth.volume.value = 3;
  const note = Tone.Frequency('C1').transpose(params.tune ?? 0).toNote();
  return {
    output: synth,
    trigger(v, t) {
      synth.triggerAttackRelease(note, '8n', t, vel01(v));
    },
    dispose() {
      synth.dispose();
    },
  };
}

/** Snare —— 白噪 + 带通滤波 */
function createSnare(params: DrumParams): DrumVoice {
  const decay = params.decay ?? 0.18;
  const noise = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.001, decay, sustain: 0 },
  });
  noise.volume.value = 4;
  const bp = new Tone.Filter({
    type: 'bandpass',
    frequency: 1750 * 2 ** ((params.tune ?? 0) / 12),
    Q: 0.9,
  });
  noise.connect(bp);
  return {
    output: bp,
    trigger(v, t) {
      noise.triggerAttackRelease(decay, t, vel01(v));
    },
    dispose() {
      noise.dispose();
      bp.dispose();
    },
  };
}

/** Clap —— 三次短促噪声爆发 + 尾巴（经典 808 拍手） */
function createClap(params: DrumParams): DrumVoice {
  const burst = new Tone.NoiseSynth({
    noise: { type: 'pink' },
    envelope: { attack: 0.001, decay: 0.04, sustain: 0 },
  });
  const tail = new Tone.NoiseSynth({
    noise: { type: 'pink' },
    envelope: { attack: 0.001, decay: params.decay ?? 0.22, sustain: 0 },
  });
  const bp = new Tone.Filter({
    type: 'bandpass',
    frequency: 1050 * 2 ** ((params.tune ?? 0) / 12),
    Q: 1.6,
  });
  burst.connect(bp);
  tail.connect(bp);
  burst.volume.value = 2;
  tail.volume.value = 2;
  return {
    output: bp,
    trigger(v, t) {
      const vel = vel01(v);
      burst.triggerAttackRelease(0.04, t, vel);
      burst.triggerAttackRelease(0.04, t + 0.024, vel * 0.9);
      burst.triggerAttackRelease(0.04, t + 0.048, vel * 0.85);
      tail.triggerAttackRelease(0.2, t + 0.07, vel);
    },
    dispose() {
      burst.dispose();
      tail.dispose();
      bp.dispose();
    },
  };
}

/** ClosedHat / OpenHat —— MetalSynth + 高通（开镲衰减更长） */
function createHat(open: boolean, params: DrumParams): DrumVoice {
  const decay = params.decay ?? (open ? 0.42 : 0.06);
  const baseFreq = 311 * 2 ** ((params.tune ?? 0) / 12);
  const synth = new Tone.MetalSynth({
    envelope: { attack: 0.001, decay, release: 0.01 },
    harmonicity: 5.1,
    modulationIndex: 32,
    resonance: 5200,
    octaves: 1.6,
  });
  synth.frequency.value = baseFreq;
  synth.volume.value = -10;
  const hp = new Tone.Filter({ type: 'highpass', frequency: 7200 });
  synth.connect(hp);
  return {
    output: hp,
    trigger(v, t) {
      // MetalSynth 继承 Instrument 的四参签名：note, duration, time, velocity
      synth.triggerAttackRelease(baseFreq, decay * 0.9, t, vel01(v));
    },
    dispose() {
      synth.dispose();
      hp.dispose();
    },
  };
}

/** Tom —— 高音调 MembraneSynth */
function createTom(params: DrumParams): DrumVoice {
  const synth = new Tone.MembraneSynth({
    pitchDecay: 0.09,
    octaves: 2.2,
    oscillator: { type: 'sine' },
    envelope: { attack: 0.001, decay: params.decay ?? 0.38, sustain: 0 },
  });
  const note = Tone.Frequency('A2').transpose(params.tune ?? 0).toNote();
  return {
    output: synth,
    trigger(v, t) {
      synth.triggerAttackRelease(note, '8n', t, vel01(v));
    },
    dispose() {
      synth.dispose();
    },
  };
}

/** 鼓组工厂 */
export function createDrumVoice(type: DrumType, params: DrumParams = {}): DrumVoice {
  switch (type) {
    case 'kick':
      return createKick(params);
    case 'snare':
      return createSnare(params);
    case 'clap':
      return createClap(params);
    case 'closedHat':
      return createHat(false, params);
    case 'openHat':
      return createHat(true, params);
    case 'tom':
      return createTom(params);
  }
}
