import { defineConfig } from 'vitest/config';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    testTimeout: 30000,
    hookTimeout: 30000,
    globals: false,
    alias: {
      vscode: path.resolve(__dirname, 'src/test/mocks/vscode.ts'),
    },
  },
  resolve: {
    conditions: ['node', 'import'],
  },
});
