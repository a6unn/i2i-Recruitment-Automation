import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  define: {
    'import.meta.env.VITE_API_BASE': JSON.stringify(process.env.VITE_API_BASE || 'http://localhost:3002'),
  },
  build: {
    outDir: 'dist',
    emptyDirOnBuildStart: true,
    rollupOptions: {
      input: {
        'service-worker': resolve(__dirname, 'src/service-worker.ts'),
        'content-script': resolve(__dirname, 'src/content-script.ts'),
        popup: resolve(__dirname, 'src/popup.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        assetFileNames: 'content-script.[ext]',
        format: 'es',
      },
    },
    cssCodeSplit: false,
  },
});
