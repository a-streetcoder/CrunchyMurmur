const COMMAND_PREFIX = 'plugin:crunchymurmur-transcribe';

async function defaultInvoke(command, payload) {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke(command, payload);
}

export class TranscriptionError extends Error {
  constructor({ code = 'INTERNAL', message = 'Local transcription failed.', recoverable = true } = {}) {
    super(message);
    this.name = 'TranscriptionError';
    this.code = code;
    this.recoverable = recoverable;
  }

  static from(error) {
    if (error instanceof TranscriptionError) return error;
    if (error && typeof error === 'object') {
      return new TranscriptionError(error);
    }
    return new TranscriptionError({ message: String(error || 'Local transcription failed.') });
  }
}

export function createTranscriber(invokeCommand = defaultInvoke) {
  const call = async (command, payload) => {
    try {
      return await invokeCommand(`${COMMAND_PREFIX}|${command}`, payload);
    } catch (error) {
      throw TranscriptionError.from(error);
    }
  };

  return {
    prepare(options) {
      return call('prepare', { options });
    },
    transcribe(input, options = {}) {
      if (typeof input?.path !== 'string' || !input.path.trim()) {
        return Promise.reject(new TranscriptionError({
          code: 'AUDIO_INVALID',
          message: 'A local audio file path is required.',
          recoverable: true,
        }));
      }
      return call('transcribe', { input, options });
    },
    diagnostics() {
      return call('diagnostics');
    },
    dispose() {
      return call('dispose');
    },
  };
}

const transcriber = createTranscriber();

export const prepare = transcriber.prepare;
export const transcribe = transcriber.transcribe;
export const diagnostics = transcriber.diagnostics;
export const dispose = transcriber.dispose;
