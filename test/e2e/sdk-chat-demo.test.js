const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { _electron: electron } = require('@playwright/test');

test('SDK chat demo opens with its secure transcription controls', { timeout: 30_000 }, async (t) => {
  let electronApp;
  t.after(async () => {
    await electronApp?.close().catch(() => {});
  });

  electronApp = await electron.launch({
    args: [path.resolve(__dirname, '..', '..', 'examples', 'electron-chat')],
    env: {
      ...process.env,
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
    },
  });
  const page = await electronApp.firstWindow();
  await page.waitForLoadState('domcontentloaded');

  assert.equal(await page.title(), 'CrunchyMurmur SDK Chat');
  assert.equal(await page.locator('#record').count(), 1);
  assert.equal(await page.locator('#message').getAttribute('placeholder'), 'Write a message…');
  assert.deepEqual(
    await page.evaluate(() => Object.keys(window.chatDemo).sort()),
    ['diagnostics', 'transcribeWav'],
  );
  assert.deepEqual(
    await page.evaluate(() => window.chatDemo.diagnostics()),
    {
      state: 'idle',
      modelId: null,
      modelVersion: null,
      lastLoadMs: null,
      lastInferenceMs: null,
    },
  );
});
