import { glob } from 'glob';
import Mocha from 'mocha';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function run(): Promise<void> {
  // Create the mocha test
  const mocha = new Mocha({
    ui: 'bdd',
    color: true,
    timeout: 30000,
  });

  const testsRoot = path.resolve(__dirname);
  
  console.log('Loading test files from:', testsRoot);
  
  // Find all test files
  const testFiles = await glob('**/*.test.mjs', { cwd: testsRoot });
  
  console.log(`Found ${testFiles.length.toString()} test file(s)`);
  
  if (testFiles.length === 0) {
    throw new Error('No test files found');
  }
  
  // Add files to the test suite
  for (const f of testFiles) {
    mocha.addFile(path.resolve(testsRoot, f));
  }

  return new Promise((resolve, reject) => {
    try {
      mocha.run((failures) => {
        if (failures > 0) {
          reject(new Error(`${failures.toString()} tests failed.`));
        } else {
          resolve();
        }
      });
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

