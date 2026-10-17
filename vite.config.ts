import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'tests/**/*.test.{ts,tsx}',
      'packages/**/*.test.{ts,tsx}',
      'apps/desktop/tests/**/*.test.{ts,tsx}',
    ],
    environment: 'node',
    clearMocks: true,
    restoreMocks: true,
    mockReset: true,
    passWithNoTests: true,
  },
});