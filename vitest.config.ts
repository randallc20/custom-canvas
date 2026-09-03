import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  // tsconfig sets `jsx: "preserve"` for Next, which esbuild refuses to parse.
  // Only one test imports a .tsx module (dimensions.test.ts renders the
  // useDimensionUnit hook), but without this the whole file fails to load.
  oxc: { jsx: { runtime: 'automatic' } },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
