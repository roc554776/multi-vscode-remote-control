import { glob } from 'glob';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Test runner using Node.js test runner with vitest expect
export async function run(): Promise<void> {
  const testsRoot = path.resolve(__dirname);
  
  console.log('Loading test files from:', testsRoot);
  
  // Find all test files
  const testFiles = await glob('**/*.test.mjs', { cwd: testsRoot });
  
  console.log(`Found ${String(testFiles.length)} test file(s)`);
  
  if (testFiles.length === 0) {
    throw new Error('No test files found');
  }
  
  // Import all test files - they register tests when imported
  for (const file of testFiles) {
    const testPath = path.resolve(testsRoot, file);
    console.log(`Importing: ${file}`);
    await import(testPath);
  }
  
  console.log('\nTest files imported. Tests will run automatically.');
  
  // The tests are run automatically by Node.js test runner
  // We don't need to explicitly call run() here
}
