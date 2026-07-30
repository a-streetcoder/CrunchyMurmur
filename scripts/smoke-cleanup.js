const fs = require('fs');

const RETRYABLE_CODES = new Set(['EBUSY', 'ENOTEMPTY', 'EPERM']);

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function removeTemporaryDirectory(directory, {
  remove = (target) => fs.rmSync(target, { recursive: true, force: true }),
  delay = wait,
  attempts = 8,
  retryDelayMs = 250,
} = {}) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      remove(directory);
      return;
    } catch (error) {
      if (!RETRYABLE_CODES.has(error?.code) || attempt === attempts) throw error;
      await delay(retryDelayMs * attempt);
    }
  }
}

module.exports = { removeTemporaryDirectory };
