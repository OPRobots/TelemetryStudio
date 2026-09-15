import { resolve } from 'path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

const pocRoot = resolve(__dirname);

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: {
        entry: resolve(pocRoot, 'main/index.ts'),
        formats: ['cjs'],
      },
      outDir: resolve(pocRoot, 'out/main'),
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: {
        entry: resolve(pocRoot, 'preload/index.ts'),
        formats: ['cjs'],
      },
      outDir: resolve(pocRoot, 'out/preload'),
    },
  },
  renderer: {
    root: pocRoot,
    build: {
      rollupOptions: {
        input: resolve(pocRoot, 'index.html'),
      },
      outDir: resolve(pocRoot, 'out/renderer'),
    },
    resolve: {
      alias: {
        '@': resolve(pocRoot, 'src'),
      },
    },
    plugins: [react()],
  },
});
