const fs = require('node:fs');
const path = require('node:path');

function runtimeFolder() {
  const platform = process.platform === 'win32'
    ? 'win'
    : process.platform === 'darwin' ? 'mac' : 'linux';
  return `${platform}-${process.arch}`;
}

function resolveExecutable() {
  const configured = String(process.env.CRUNCHYMURMUR_TRANSCRIBER_PATH || '').trim();
  if (configured && fs.existsSync(configured)) return configured;
  const executable = process.platform === 'win32'
    ? 'crunchymurmur-transcriber.exe'
    : 'crunchymurmur-transcriber';
  const repositoryRuntime = path.resolve(
    __dirname,
    '..',
    '..',
    'build',
    'transcriber-runtime',
    runtimeFolder(),
    executable,
  );
  if (fs.existsSync(repositoryRuntime)) return repositoryRuntime;
  for (const directory of String(process.env.PATH || '').split(path.delimiter)) {
    const candidate = path.join(directory, executable);
    if (directory && fs.existsSync(candidate)) return candidate;
  }
  const cargoRuntime = path.join(
    process.env.CARGO_HOME || path.join(process.env.USERPROFILE || process.env.HOME || '', '.cargo'),
    'bin',
    executable,
  );
  return fs.existsSync(cargoRuntime) ? cargoRuntime : '';
}

module.exports = { resolveExecutable, runtimeFolder };
