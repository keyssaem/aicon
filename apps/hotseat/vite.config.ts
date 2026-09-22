import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// 카드 이미지는 packages/content/assets 에 있고 /cards/... 로 제공됩니다.
export default defineConfig({
  plugins: [react()],
  publicDir: fileURLToPath(new URL('../../packages/content/assets', import.meta.url)),
  server: { port: 5173, open: false },
});
