const test = require('node:test');
const assert = require('node:assert/strict');

const { createModelProfileManifest } = require('../src/model-profile');

test('Parakeet catalog metadata becomes a portable Model Profile', () => {
  const profile = createModelProfileManifest({
    id: 'parakeet-v3',
    family: 'parakeet',
    files: [
      { name: 'encoder.onnx', size: 5, sha256: 'abc123' },
    ],
  });

  assert.deepEqual(profile, {
    schemaVersion: 1,
    modelId: 'parakeet-v3',
    modelVersion: '1.0.0',
    engine: 'parakeet',
    quantisation: 'int8',
    languages: [
      'auto', 'bg', 'hr', 'cs', 'da', 'nl', 'en', 'et', 'fi', 'fr', 'de',
      'el', 'hu', 'it', 'lv', 'lt', 'mt', 'pl', 'pt', 'ro', 'sk', 'sl',
      'es', 'sv', 'ru', 'uk',
    ],
    files: [
      { path: 'encoder.onnx', bytes: 5, sha256: 'abc123' },
    ],
    minimumEngineVersion: '0.1.0',
  });
});
