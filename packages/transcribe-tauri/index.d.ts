export type TranscriptionErrorCode =
  | 'MODEL_NOT_FOUND'
  | 'MODEL_INVALID'
  | 'MODEL_UNTRUSTED'
  | 'MODEL_NOT_PREPARED'
  | 'AUDIO_INVALID'
  | 'LANGUAGE_UNSUPPORTED'
  | 'RUNTIME_MISSING'
  | 'ENGINE_BUSY'
  | 'ENGINE_CRASHED'
  | 'CANCELLED'
  | 'TIMED_OUT'
  | 'DISPOSED'
  | 'INFERENCE_FAILED'
  | 'INTERNAL';

export interface PrepareOptions {
  modelDirectory: string;
  trustedManifestSha256: string;
}

export interface EngineInformation {
  engineVersion: string;
  modelId: string;
  modelVersion: string;
  loadMs: number;
  reused: boolean;
}

export interface AudioInput {
  path: string;
}

export interface TranscribeOptions {
  language?: string;
}

export interface Transcript {
  text: string;
  outcome: 'speech' | 'no-speech';
  inferenceMs: number;
}

export interface Diagnostics {
  state: 'idle' | 'ready';
  modelId: string | null;
  modelVersion: string | null;
  lastLoadMs: number | null;
  lastInferenceMs: number | null;
}

export type InvokeCommand = (
  command: string,
  payload?: Record<string, unknown>,
) => Promise<unknown>;

export interface LocalTranscriberOptions extends PrepareOptions {
  invoke?: InvokeCommand;
}

export class TranscriptionError extends Error {
  code: TranscriptionErrorCode | (string & {});
  recoverable: boolean;
}

export interface LocalTranscriber {
  prepare(options?: PrepareOptions): Promise<EngineInformation>;
  transcribe(input: AudioInput, options?: TranscribeOptions): Promise<Transcript>;
  diagnostics(): Promise<Diagnostics>;
  dispose(): Promise<void>;
}

export function createTranscriber(options: LocalTranscriberOptions): LocalTranscriber;
export function prepare(options: PrepareOptions): Promise<EngineInformation>;
export function transcribe(
  input: AudioInput,
  options?: TranscribeOptions,
): Promise<Transcript>;
export function diagnostics(): Promise<Diagnostics>;
export function dispose(): Promise<void>;
