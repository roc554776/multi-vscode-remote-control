import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 30000,
    hookTimeout: 30000,
    globals: false,
    alias: {
      vscode: 'vscode', // Keep vscode as-is, it will be provided by the runtime
    },
  },
  resolve: {
    conditions: ['node', 'import'],
  },
});
