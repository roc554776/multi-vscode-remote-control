import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
  files: 'dist/test/suite/**/*.test.mjs',
  version: 'stable',
  launchArgs: [
    '--disable-extensions',
    '--profile-temp',
  ],
  mocha: {
    ui: 'bdd',
    color: true,
    timeout: 30000,
  },
});
