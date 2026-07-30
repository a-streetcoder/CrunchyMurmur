const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const roots = ['src', 'ui', 'scripts', 'test', 'packages'];
const files = [];

function visit(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const filename = path.join(dir, entry.name);
    if (entry.isDirectory()) visit(filename);
    else if (entry.isFile() && filename.endsWith('.js')) files.push(filename);
  }
}

for (const root of roots) visit(path.resolve(root));

let failed = false;
for (const filename of files) {
  const result = spawnSync(process.execPath, ['--check', filename], { encoding: 'utf8' });
  if (result.status !== 0) {
    failed = true;
    process.stderr.write(result.stderr || result.stdout || `Syntax check failed: ${filename}\n`);
  }
}

if (failed) process.exit(1);
console.log(`Syntax checked ${files.length} JavaScript files.`);
