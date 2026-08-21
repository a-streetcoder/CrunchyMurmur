const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SDK_VERSION = '0.1.0-alpha.1';

function packageJson(directory) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, directory, 'package.json'), 'utf8'));
}

test('desktop JavaScript adapters are public alpha packages', () => {
  for (const directory of ['packages/transcribe-node', 'packages/transcribe-tauri']) {
    const manifest = packageJson(directory);
    assert.equal(manifest.version, SDK_VERSION, `${manifest.name} version`);
    assert.notEqual(manifest.private, true, `${manifest.name} must be publishable`);
    assert.equal(manifest.license, 'MIT');
    assert.equal(manifest.publishConfig?.access, 'public');
    assert.equal(manifest.repository?.url, 'git+https://github.com/a-streetcoder/CrunchyMurmur.git');
    assert.equal(manifest.repository?.directory, directory.replaceAll('\\', '/'));
    assert.equal(manifest.homepage, `https://github.com/a-streetcoder/CrunchyMurmur/tree/main/${directory}`);
  }
});

test('Rust engine and Tauri adapter are publishable at the same alpha version', () => {
  const engine = fs.readFileSync(path.join(ROOT, 'native/transcriber/Cargo.toml'), 'utf8');
  const tauri = fs.readFileSync(path.join(ROOT, 'packages/transcribe-tauri/Cargo.toml'), 'utf8');

  assert.match(engine, /version = "0\.1\.0-alpha\.1"/);
  assert.doesNotMatch(engine, /publish = false/);
  assert.match(tauri, /version = "0\.1\.0-alpha\.1"/);
  assert.doesNotMatch(tauri, /publish = false/);
  assert.match(
    tauri,
    /crunchymurmur-transcriber = \{ version = "=0\.1\.0-alpha\.1", path = "\.\.\/\.\.\/native\/transcriber" \}/,
  );
});

test('SDK release demo archive includes its local Node adapter dependency', () => {
  const workflow = fs.readFileSync(
    path.join(ROOT, '.github', 'workflows', 'sdk-release.yml'),
    'utf8',
  );
  assert.match(
    workflow,
    /HEAD examples\/electron-chat packages\/transcribe-node/,
  );
});
