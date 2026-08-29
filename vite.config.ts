import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vite.dev/config/
export default defineConfig({
  // 相对基路径：产物可部署在 GitHub Pages 的 /<仓库名>/ 子路径下，无需写死仓库名
  base: './',
  plugins: [react(), tailwindcss()],
});
