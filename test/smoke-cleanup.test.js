const test = require('node:test');
const assert = require('node:assert/strict');

const { removeTemporaryDirectory } = require('../scripts/smoke-cleanup');

test('packaged smoke cleanup retries while macOS releases application files', async () => {
  let attempts = 0;
  const delays = [];
  const remove = () => {
    attempts += 1;
    if (attempts < 3) {
      const error = new Error('directory not empty');
      error.code = 'ENOTEMPTY';
      throw error;
    }
  };

  await removeTemporaryDirectory('/temporary/profile', {
    remove,
    delay: async (milliseconds) => delays.push(milliseconds),
    attempts: 4,
    retryDelayMs: 25,
  });

  assert.equal(attempts, 3);
  assert.deepEqual(delays, [25, 50]);
});

test('packaged smoke cleanup does not hide unexpected filesystem errors', async () => {
  const remove = () => {
    const error = new Error('read-only filesystem');
    error.code = 'EROFS';
    throw error;
  };

  await assert.rejects(
    removeTemporaryDirectory('/temporary/profile', { remove }),
    (error) => error.code === 'EROFS',
  );
});
