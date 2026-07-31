const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const tag = String(process.argv[2] || process.env.SDK_RELEASE_TAG || '').trim();
const match = /^sdk-v(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/.exec(tag);
if (!match) {
  throw new Error('SDK release tag must use sdk-v<semantic-version>.');
}
const version = match[1];

function packageManifest(directory) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, directory, 'package.json'), 'utf8'));
}

for (const directory of ['packages/transcribe-node', 'packages/transcribe-tauri']) {
  const manifest = packageManifest(directory);
  if (manifest.version !== version) {
    throw new Error(`${manifest.name} is ${manifest.version}; expected ${version}.`);
  }
  if (manifest.private === true || manifest.publishConfig?.access !== 'public') {
    throw new Error(`${manifest.name} is not configured as a public package.`);
  }
}

for (const file of ['native/transcriber/Cargo.toml', 'packages/transcribe-tauri/Cargo.toml']) {
  const manifest = fs.readFileSync(path.join(ROOT, file), 'utf8');
  if (!new RegExp(`^version = "${version.replaceAll('.', '\\.')}"$`, 'm').test(manifest)) {
    throw new Error(`${file} does not match SDK version ${version}.`);
  }
  if (/^publish = false$/m.test(manifest)) {
    throw new Error(`${file} is not publishable.`);
  }
}

console.log(`SDK release ${version} metadata is consistent.`);
