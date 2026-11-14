/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    watch: {
      // Windows：原子写入会产生瞬时 .tmpdir/*.tmp 临时文件，chokidar 去 watch 它会触发
      // EBUSY 并抛出未处理的 FSWatcher error 直接 crash 掉 dev server。忽略 docs 与临时文件。
      ignored: ['**/docs/**', '**/*.tmpdir/**', '**/*.tmp', '**/.git/**', '**/dist/**', '**/coverage/**'],
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
