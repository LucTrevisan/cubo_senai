import { defineConfig } from 'vite';

export default defineConfig({
  base: './',                       // funciona em qualquer subpasta (GitHub Pages, etc.)
  worker: { format: 'es' },
  build: { target: 'es2020', chunkSizeWarningLimit: 900 },
});
