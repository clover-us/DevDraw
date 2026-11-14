/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      // 双入口：产品 index.html + 活体设计语言参考页 design.html（相对路径由 Vite 按 root 解析）
      input: {
        main: 'index.html',
        design: 'design.html',
      },
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    watch: {
      // Windows：原子写入会产生瞬时 .tmpdir/*.tmp 临时文件，chokidar 去 watch 它会触发
      // EBUSY 并抛出未处理的 FSWatcher error 直接 crash 掉 dev server。忽略 docs 与临时文件；
      // 根目录的 QA 脚本/截图同样是"写完就被别的进程读"，同样会 EBUSY，一并忽略。
      ignored: [
        '**/docs/**',
        '**/*.tmpdir/**',
        '**/*.tmp',
        '**/.git/**',
        '**/dist/**',
        '**/coverage/**',
        '**/qa-*.mjs',
        '**/qa-*/**',
        '**/*.png',
      ],
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
