export type TranscriptionErrorCode =
  | 'MODEL_NOT_FOUND'
  | 'MODEL_INVALID'
  | 'MODEL_NOT_PREPARED'
  | 'AUDIO_INVALID'
  | 'INFERENCE_FAILED'
  | 'INTERNAL';

export interface TranscriptionSettings {
  parakeetModelPath: string;
  language?: string;
  requireModelProfile?: boolean;
}

export interface TranscriptionDiagnostics {
  backend: string;
  ready: boolean;
  modelPath: string;
  executablePath: string;
  lastLoadMs: number | null;
  lastInferenceMs: number | null;
  lastError: string;
}

export interface OnDeviceTranscriberOptions {
  resolveExecutable: () => string;
  spawnProcess?: (...args: any[]) => any;
  logger?: Pick<Console, 'info' | 'warn' | 'error'>;
  loadTimeoutMs?: number;
  inferenceTimeoutMs?: number;
}

export interface AudioInput {
  path: string;
}

export interface Transcript {
  text: string;
  outcome: 'speech' | 'no-speech';
  language?: string;
}

export interface LocalTranscriberOptions extends Omit<OnDeviceTranscriberOptions, 'resolveExecutable'> {
  modelDirectory: string;
  resolveExecutable: () => string;
}

export class TranscriptionError extends Error {
  code: TranscriptionErrorCode | string;
  recoverable: boolean;
}

export class OnDeviceTranscriber {
  constructor(options: OnDeviceTranscriberOptions);
  diagnostics(): TranscriptionDiagnostics;
  prepare(
    settings: TranscriptionSettings,
    options?: { signal?: AbortSignal },
  ): Promise<TranscriptionDiagnostics>;
  transcribe(
    audioPath: string,
    settings: TranscriptionSettings,
    options?: { signal?: AbortSignal },
  ): Promise<string>;
  transcribeDetailed(
    audioPath: string,
    settings: TranscriptionSettings,
    options?: { signal?: AbortSignal },
  ): Promise<Transcript>;
  dispose(): void;
}

export class LocalTranscriber {
  constructor(options: LocalTranscriberOptions);
  prepare(options?: { signal?: AbortSignal }): Promise<TranscriptionDiagnostics>;
  transcribe(
    input: AudioInput | string,
    options?: { language?: string; signal?: AbortSignal },
  ): Promise<Transcript>;
  diagnostics(): TranscriptionDiagnostics;
  dispose(): Promise<void>;
}

export function createLocalTranscriber(options: LocalTranscriberOptions): LocalTranscriber;
export { OnDeviceTranscriber as NativeTranscriptionService };
export { TranscriptionError as NativeTranscriptionError };
export function parakeetSupportsLanguage(language?: string): boolean;
