import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    watch: {
      // Tell Vite to ignore watching `src-tauri` (prevents EBUSY on Windows during Cargo builds)
      ignored: ['**/src-tauri/**'],
    },
  },
  build: {
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/elkjs')) return 'vendor-elk';
          if (
            id.includes('node_modules/@codemirror') ||
            id.includes('node_modules/@lezer') ||
            id.includes('node_modules/@uiw') ||
            id.includes('node_modules/codemirror')
          ) {
            return 'vendor-codemirror';
          }
          if (id.includes('node_modules/@xyflow')) return 'vendor-xyflow';
          if (
            id.includes('node_modules/react') ||
            id.includes('node_modules/zustand') ||
            id.includes('node_modules/lucide-react')
          ) {
            return 'vendor-ui';
          }
          return undefined;
        },
      },
    },
  },
  envPrefix: ['VITE_', 'TAURI_'],
});
