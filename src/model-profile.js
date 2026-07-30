const PARAKEET_LANGUAGES = [
  'auto', 'bg', 'hr', 'cs', 'da', 'nl', 'en', 'et', 'fi', 'fr', 'de', 'el',
  'hu', 'it', 'lv', 'lt', 'mt', 'pl', 'pt', 'ro', 'sk', 'sl', 'es', 'sv',
  'ru', 'uk',
];

function createModelProfileManifest(model) {
  if (!model || model.family !== 'parakeet' || !Array.isArray(model.files)) {
    throw new TypeError('A Parakeet model catalog entry is required.');
  }
  return {
    schemaVersion: 1,
    modelId: model.id,
    modelVersion: '1.0.0',
    engine: 'parakeet',
    quantisation: 'int8',
    languages: [...PARAKEET_LANGUAGES],
    files: model.files.map((file) => ({
      path: file.name,
      bytes: file.size,
      sha256: file.sha256,
    })),
    minimumEngineVersion: '0.1.0',
  };
}

module.exports = { PARAKEET_LANGUAGES, createModelProfileManifest };
