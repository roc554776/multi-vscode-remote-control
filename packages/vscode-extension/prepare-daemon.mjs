import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sourceDir = path.resolve(__dirname, '../daemon/dist');
const targetDir = path.resolve(__dirname, 'daemon/dist');

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const dstPath = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, dstPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, dstPath);
    }
  }
}

if (!fs.existsSync(sourceDir)) {
  console.error(`Daemon build not found: ${sourceDir}`);
  console.error('Run: npm run build --workspace packages/daemon');
  process.exit(1);
}

fs.rmSync(path.resolve(__dirname, 'daemon'), { recursive: true, force: true });
copyDir(sourceDir, targetDir);
console.log(`Prepared daemon files: ${targetDir}`);
