import * as esbuild from 'esbuild';

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

async function main() {
  // Build extension (CommonJS)
  const extensionCtx = await esbuild.context({
    entryPoints: ['src/extension.ts'],
    bundle: true,
    format: 'cjs',
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: 'node',
    outdir: 'dist',
    outbase: 'src',
    external: ['vscode'],
    logLevel: 'info',
  });

  // Build tests (ESM, transpile only without bundling deeply)
  const testCtx = await esbuild.context({
    entryPoints: {
      'test/suite/index': 'src/test/suite/index.ts',
      'test/suite/extension.test': 'src/test/suite/extension.test.ts',
    },
    bundle: true, // Need bundle to handle imports
    format: 'esm',
    minify: false,
    sourcemap: !production,
    sourcesContent: false,
    platform: 'node',
    outdir: 'dist',
    outExtension: { '.js': '.mjs' },
    external: ['vscode', 'vitest', 'vitest/*', '@vitest/*', 'vite', 'glob', 'node:*'],
    logLevel: 'info',
  });

  if (watch) {
    await extensionCtx.watch();
    await testCtx.watch();
    console.log('Watching...');
  } else {
    await extensionCtx.rebuild();
    await testCtx.rebuild();
    await extensionCtx.dispose();
    await testCtx.dispose();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
