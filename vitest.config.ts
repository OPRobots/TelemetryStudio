import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/core/**/*', 'src/parsers/**/*'],
    },
  },
  resolve: {
    alias: {
      '@core': resolve('src/core'),
      '@parsers': resolve('src/parsers'),
      '@widgets': resolve('src/widgets'),
      '@services': resolve('src/services'),
      '@shared': resolve('src/shared'),
    },
  },
});
