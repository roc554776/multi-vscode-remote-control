import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');

// Main daemon build
const buildOptions = {
  entryPoints: ['src/index.ts'],
  bundle: true,
  outfile: 'dist/index.js',
  platform: 'node',
  target: 'node18',
  format: 'esm',
  external: [],
  sourcemap: true,
  banner: {
    js: '#!/usr/bin/env node\n',
  },
};

// Build individual modules for tests
const modulesBuildOptions = {
  entryPoints: [
    'src/daemon-server.ts',
    'src/extension-registry.ts',
    'src/router.ts',
    'src/types.ts',
  ],
  bundle: false,
  outdir: 'dist',
  platform: 'node',
  target: 'node18',
  format: 'esm',
  sourcemap: true,
};

// Build tests
const testBuildOptions = {
  entryPoints: [
    'src/__tests__/extension-registry.test.ts',
    'src/__tests__/daemon-server.test.ts',
    'src/__tests__/e2e/daemon-e2e.test.ts',
  ],
  bundle: false,
  outdir: 'dist/__tests__',
  platform: 'node',
  target: 'node18',
  format: 'esm',
  sourcemap: true,
};

if (watch) {
  const ctx = await esbuild.context(buildOptions);
  await ctx.watch();
  console.log('Watching for changes...');
} else {
  await esbuild.build(buildOptions);
  await esbuild.build(modulesBuildOptions);
  await esbuild.build(testBuildOptions);
  console.log('Build complete');
}
