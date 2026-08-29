/**
 * WAV 编码器：AudioBuffer → 16-bit PCM WAV Blob
 * 供「导出音乐文件」离线渲染落盘使用（无第三方依赖）
 */

/** 写入 little-endian 字符串 */
function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
}

/**
 * 把 AudioBuffer 编码为 WAV（44.1k 采样率由渲染上下文决定，此处透传）
 * 多声道交织为 16-bit PCM。
 * 分块 + 让出主线程，避免长音频一次性同步转换卡死页面；onProgress 报告 0..1 进度。
 */
export async function encodeWav(
  buffer: AudioBuffer,
  onProgress?: (ratio: number) => void,
): Promise<Blob> {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const numFrames = buffer.length;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = numFrames * blockAlign;
  const view = new DataView(new ArrayBuffer(44 + dataSize));

  /* ---- RIFF header ---- */
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');
  /* ---- fmt chunk ---- */
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  /* ---- data chunk ---- */
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  /* 交织采样并做 float(-1..1) → int16 转换（分块让出主线程） */
  const channels: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) channels.push(buffer.getChannelData(c));

  const CHUNK = 65536; // 每块帧数
  let offset = 44;
  for (let i = 0; i < numFrames; i++) {
    for (let c = 0; c < numChannels; c++) {
      const sample = Math.max(-1, Math.min(1, channels[c][i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
    if (i % CHUNK === CHUNK - 1) {
      onProgress?.((i + 1) / numFrames);
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  onProgress?.(1);

  return new Blob([view.buffer], { type: 'audio/wav' });
}

/** 触发浏览器下载给定 Blob */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
