const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const ignoredDirectories = new Set(['.git', '.claude', 'dist', 'node_modules', 'target']);
const failures = [];

function markdownFiles(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && (ignoredDirectories.has(entry.name) || /^dist(?:-|$)/.test(entry.name))) continue;
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...markdownFiles(filename));
    else if (entry.isFile() && entry.name.endsWith('.md')) files.push(filename);
  }
  return files;
}

function localTargets(contents) {
  const targets = [];
  for (const match of contents.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)) targets.push(match[1]);
  for (const match of contents.matchAll(/<(?:img|a)\b[^>]*(?:src|href)=["']([^"']+)["'][^>]*>/gi)) targets.push(match[1]);
  return targets;
}

for (const filename of markdownFiles(root)) {
  const contents = fs.readFileSync(filename, 'utf8');
  for (let target of localTargets(contents)) {
    target = target.trim().replace(/^<|>$/g, '').split(/\s+["']/)[0];
    if (!target || target.startsWith('#') || /^(?:https?:|mailto:)/i.test(target)) continue;
    const pathOnly = target.split('#')[0].split('?')[0];
    if (!pathOnly) continue;
    let decoded;
    try { decoded = decodeURIComponent(pathOnly); } catch { decoded = pathOnly; }
    const resolved = path.resolve(path.dirname(filename), decoded);
    if (!fs.existsSync(resolved)) failures.push(`${path.relative(root, filename)} -> ${target}`);
  }
}

if (failures.length) {
  console.error(`Broken local documentation links:\n${failures.map((failure) => `- ${failure}`).join('\n')}`);
  process.exit(1);
}
console.log('Local documentation links are valid.');
