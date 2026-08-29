/**
 * 工程导入/导出工具
 * - exportProjectToFile：把工程纯数据序列化为 .json 并触发浏览器下载
 * - readProjectFile：读取用户选择的 .json 文件，返回解析后的对象（失败抛错）
 */
import type { Project } from '../types/project';

export function exportProjectToFile(project: Project, filename?: string): void {
  const data = JSON.stringify(project, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  a.download = filename ?? `web-music-studio-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // 释放对象 URL（延迟一帧确保下载已触发）
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function readProjectFile(file: File): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        resolve(JSON.parse(String(reader.result)));
      } catch {
        reject(new Error('文件不是合法的 JSON'));
      }
    };
    reader.onerror = () => reject(new Error('读取文件失败'));
    reader.readAsText(file);
  });
}
