import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// 개발 중에는 카드 이미지를 packages/content/assets에서 바로 제공하고,
// 배포할 때는 서버(apps/server)가 /cards/를 맡습니다.
export default defineConfig({
  plugins: [react()],
  publicDir: fileURLToPath(new URL('../../packages/content/assets', import.meta.url)),
  server: {
    port: 5174,
    proxy: {
      '/socket.io': { target: 'http://localhost:5175', ws: true },
    },
  },
  build: { outDir: 'dist', emptyOutDir: true },
});
