# CrunchyMurmur On-device Transcription SDK

> Status: in-repository desktop preview, not yet published.
>
> Package names and examples in this guide are provisional. Do not add them to an application until the corresponding release artifacts exist.

The CrunchyMurmur On-device Transcription SDK will make the local transcription implementation used by the desktop application available to other desktop and native applications. It is designed for chat composers, push-to-talk controls, local note capture and other privacy-sensitive voice input.

The SDK performs inference on the user's device. The core does not send audio, transcripts, model paths or diagnostics over a network and does not include telemetry.

## Initial scope

The first supported hosts will be:

- Node.js and Electron on Windows, macOS and Linux;
- Tauri 2 desktop applications on Windows, macOS and Linux.

The shared engine is intended to support these later adapters without reimplementing transcription:

- Swift on macOS and iOS;
- Kotlin on Android and JVM desktop;
- React Native on iOS and Android, using the Swift and Kotlin adapters;
- other native hosts through a stable C-compatible seam.

An ordinary browser tab is not an initial target. The current fast implementation depends on a native ONNX Runtime and a local model. Browser execution would require a separately designed WASM or WebGPU implementation.

## Goals

- Keep transcription fully local after model installation.
- Present a small, stable interface that hides model loading, audio normalisation, silence detection, inference, cancellation and cleanup.
- Reuse a warm model across multiple short voice messages.
- Keep framework packages small by distributing native runtimes and models separately.
- Give every host the same lifecycle, error codes and transcript outcomes.
- Keep microphone permission and capture under the control of the host application.
- Make runtime and model integrity independently verifiable.

## Non-goals for the first release

- Cloud transcription or a hosted CrunchyMurmur endpoint.
- Browser-only inference.
- A bundled chat interface, microphone button or visual overlay.
- Live partial transcripts from models that only produce a final result.
- Speaker diarisation or meeting-length recording.
- Implicit model downloads during engine construction.
- Identical acceleration on every operating system.

## Architecture

The implementation is divided into three layers:

```text
Application
  |
  +-- Host Recorder -- microphone permission, device selection, audio focus
  |
  +-- Host Adapter --- Node/Electron, Tauri, Swift, Kotlin, React Native
          |
          +-- On-device Engine -- Rust lifecycle and audio contract
                  |
                  +-- transcribe-rs
                  +-- ONNX Runtime
                  +-- verified local Model Profile
```

### On-device Engine

The Rust engine is the source of truth for:

- model validation and warm reuse;
- audio validation, channel conversion and resampling;
- rejection of clips that are too short or contain no usable speech;
- inference and cancellation;
- bounded storage for incremental audio;
- stable errors and privacy-safe diagnostics;
- release of model and runtime resources.

The engine accepts local audio and produces a structured transcript outcome. It does not own microphone permission, operating-system audio sessions, model downloads, application UI or analytics.

### Host adapters

Each host adapter translates platform types and lifecycle into the shared engine contract.

- Electron initially uses a sidecar process. This preserves crash isolation and reuses the proven JSON-lines process lifecycle.
- Tauri links the Rust crate directly and exposes a narrow plugin interface.
- Swift will use an XCFramework and Swift concurrency wrapper.
- Kotlin will use JNI packaged as an AAR with coroutine wrappers.
- React Native will expose a Turbo Native Module over the Swift and Kotlin adapters.

React Native does not use the Node adapter. Tauri does not need to route inference through JavaScript or a sidecar.

### Host Recorders

Microphone capture remains platform-owned because permission, device selection, audio focus, interruption and background behaviour differ by host.

Host Recorders must:

- request permission only in response to an explicit user action;
- preserve an explicitly selected device or return a device-unavailable error;
- deliver audio in order;
- stop hardware capture after completion, cancellation or failure;
- avoid retaining audio unless the application explicitly requests it.

The SDK may provide optional recorder helpers, but recording is not part of the Rust engine.

## Provisional interface

The public host interface is default-first. The Rust engine underneath it remains smaller and accepts PCM audio through an equivalent native contract.

```ts
type PcmAudio = {
  samples: Float32Array | Int16Array;
  sampleRate: number;
  channels: 1 | 2;
};

type AudioInput =
  | PcmAudio
  | { wav: Uint8Array }
  | { path: string };

type EngineInfo = {
  engineVersion: string;
  modelId: string;
  modelVersion: string;
  executionProvider: string;
};

type TranscribeOptions = {
  language?: string | 'auto';
  signal?: AbortSignal;
  timeoutMs?: number;
};

type SessionOptions = TranscribeOptions;

type Transcript = {
  text: string;
  outcome: 'speech' | 'no-speech';
  language?: string;
  audioDurationMs: number;
  inferenceMs: number;
};

type Diagnostics = {
  state: 'idle' | 'preparing' | 'ready' | 'transcribing' | 'disposed';
  modelId?: string;
  modelVersion?: string;
  executionProvider?: string;
  queued: number;
  lastLoadMs?: number;
  lastInferenceMs?: number;
  lastErrorCode?: string;
};

type TranscriptionSession = {
  push(audio: PcmAudio): Promise<void>;
  finish(): Promise<Transcript>;
  cancel(): void;
};

type LocalTranscriber = {
  prepare(): Promise<EngineInfo>;
  transcribe(input: AudioInput, options?: TranscribeOptions): Promise<Transcript>;
  session(options?: SessionOptions): TranscriptionSession;
  diagnostics(): Diagnostics;
  dispose(): Promise<void>;
};
```

`Transcript` represents successful inference only. Cancellation rejects with
the stable `CANCELLED` error, and every failure rejects with its corresponding
stable error code; neither is a `Transcript.outcome`.

The exact language-specific names may change before the first alpha. The behavioural contract below is the stable design target.

Native adapters express cancellation using their platform convention: Swift task cancellation, Kotlin coroutine cancellation, Rust cancellation tokens and React Native promise or event cancellation. Each maps to the same engine behaviour as `AbortSignal`.

### Default lifecycle

1. Constructing an adapter is cheap and does not request microphone permission.
2. `prepare()` validates and loads a local Model Profile.
3. `transcribe()` calls `prepare()` automatically when necessary.
4. The loaded model is reused for later voice messages.
5. `dispose()` cancels outstanding work and releases native resources.

Applications that need the lowest first-message latency should call `prepare()` while their composer is idle. Applications that prefer lower idle memory may wait for the first transcription.

### Voice Session lifecycle

1. Create a session.
2. Push one or more ordered PCM chunks.
3. Call `finish()` exactly once, or call `cancel()`.
4. Do not push audio after completion or cancellation.

Cancellation is idempotent. A completed or cancelled session cannot be reused.

The first release produces a final transcript after `finish()`. Accepting incremental audio does not imply partial transcript output.

### Concurrency

One engine instance owns one loaded model and performs one inference at a time. Host adapters serialise additional transcription requests in first-in, first-out order. Queued work remains independently cancellable.

Applications that genuinely require parallel inference must create separate engine instances and accept the additional memory cost.

## Example: Electron or Node

The following illustrates the planned developer experience. The package is not published yet.

```ts
import { createLocalTranscriber } from '@crunchymurmur/transcribe-node';

const transcriber = createLocalTranscriber({
  modelDirectory: applicationModelDirectory,
  trustedManifestSha256: verifiedRelease.models.parakeetV3.manifestSha256,
});

await transcriber.prepare();

const result = await transcriber.transcribe({
  path: '/absolute/path/to/message.wav',
}, {
  language: 'auto',
  signal: abortController.signal,
});

if (result.outcome === 'speech') {
  chatComposer.insert(result.text);
}

await transcriber.dispose();
```

The Node adapter will support Electron main processes and ordinary Node applications. Renderer processes should call a trusted main-process interface rather than receive filesystem or native-process access.

## Example: Tauri

Tauri 2 desktop applications link the in-repository Rust plugin directly:

```rust
tauri::Builder::default()
    .plugin(tauri_plugin_crunchymurmur_transcribe::init())
    .run(tauri::generate_context!())?;
```

The JavaScript guest bindings use the same default-first shape:

```ts
import { createTranscriber } from '@crunchymurmur/transcribe-tauri';

const transcriber = createTranscriber();
await transcriber.prepare({
  modelDirectory: applicationModelDirectory,
  trustedManifestSha256: verifiedRelease.models.parakeetV3.manifestSha256,
});
const result = await transcriber.transcribe({ path: recordedWavPath });
```

The default Tauri permission set exposes diagnostics only. Hosts explicitly
grant preparation, filesystem transcription, and disposal to trusted windows.
Tauri desktop uses direct Rust linkage; Tauri mobile still requires the same
iOS and Android lifecycle work as the other native adapters.

## Audio contract

The engine-level format is interleaved PCM:

- `Float32` samples in the range `-1.0` to `1.0`, or signed 16-bit PCM;
- one or two channels;
- a declared positive sample rate;
- chunks delivered in chronological order.

The engine converts supported input to the model's required mono sample rate. Host adapters may additionally accept WAV files or bytes. Other encoded formats are adapter concerns and are not required in the core.

Inputs fail with a stable audio error when they are malformed, empty, too short, too long for the configured limit or contain no usable speech. No-speech detection must happen before inference to avoid hallucinated phrases.

Short chat dictation is the first performance target. Long meetings should continue using CrunchyMurmur's separate chunked meeting workflow until bounded long-form behaviour is designed and tested for the SDK.

## Model Profile contract

Models are assets, not JavaScript, Rust or framework dependencies. The engine only consumes a verified local Model Profile.

A profile manifest will contain at least:

```json
{
  "schemaVersion": 1,
  "modelId": "parakeet-v3-int8",
  "modelVersion": "provisional",
  "engine": "parakeet",
  "quantisation": "int8",
  "languages": ["auto", "en", "it", "es"],
  "files": [
    {
      "path": "model.onnx",
      "bytes": 0,
      "sha256": "provisional"
    }
  ],
  "minimumEngineVersion": "0.1.0"
}
```

Release manifests must contain actual sizes and SHA-256 values. A profile is
rejected when files are missing, checksums do not match, the schema is
unsupported or the engine version is incompatible.

Checksums are not a trust anchor by themselves. Production adapters use one of
these authenticated paths:

- a model bundled by the host pins the manifest SHA-256 in the host's signed
  application configuration;
- a downloaded model is listed in a signed release index containing its model
  ID, version and manifest SHA-256. The release pipeline signs that index, and
  each adapter verifies it with an Ed25519 public key pinned in the adapter
  before accepting the digest;
- an embedding host may provide its own trust policy, but must supply an
  already-authenticated manifest digest to the engine.

The engine compares the accepted manifest's digest with that trusted digest
before it validates the individual files. HTTPS, a GitHub URL, or a locally
generated manifest is not sufficient on its own, and trust-on-first-use is not
the production default. Development builds may explicitly allow an untrusted
profile, but release builds must not enable that option.

Model acquisition is deliberately separate:

- desktop applications may bundle a verified profile or install it into an application-controlled cache;
- mobile applications normally bundle an approved mobile profile or perform an explicit, user-visible download;
- the engine never discovers or downloads a model from an arbitrary URL;
- applications decide retention, metered-network and storage policies.

The current desktop Parakeet profile must not become the mobile default until memory, latency, battery and thermal behaviour are measured on representative devices.

## Stable errors

Every adapter maps native failures to the same codes. Applications must branch on codes and localise their own user-facing messages rather than parsing English diagnostics.

| Code | Meaning | Usually recoverable |
|---|---|---:|
| `MODEL_NOT_FOUND` | Required model assets are absent | Yes |
| `MODEL_INVALID` | Manifest, file or checksum validation failed | Yes |
| `MODEL_UNTRUSTED` | Manifest digest is not authenticated by the host trust policy | No |
| `MODEL_UNSUPPORTED` | Model and engine versions are incompatible | Yes |
| `RUNTIME_MISSING` | Native runtime is not installed or packaged | Yes |
| `RUNTIME_INCOMPATIBLE` | Runtime does not support this platform or architecture | No |
| `AUDIO_INVALID` | Audio metadata or samples are malformed | Yes |
| `AUDIO_TOO_SHORT` | The clip cannot contain useful speech | Yes |
| `AUDIO_TOO_LONG` | The clip exceeds the configured SDK limit | Yes |
| `LANGUAGE_UNSUPPORTED` | The selected model does not support the language | Yes |
| `MIC_PERMISSION_DENIED` | A Host Recorder was denied microphone access | Yes |
| `MIC_DEVICE_UNAVAILABLE` | The selected input is missing | Yes |
| `MIC_NO_SIGNAL` | Capture completed without usable speech | Yes |
| `ENGINE_BUSY` | Work cannot be queued under the configured policy | Yes |
| `CANCELLED` | The caller cancelled the operation | Yes |
| `TIMED_OUT` | Preparation or inference exceeded its limit | Yes |
| `OUT_OF_MEMORY` | The model or input exceeded available memory | Maybe |
| `ENGINE_CRASHED` | The native implementation terminated unexpectedly | Yes |
| `DISPOSED` | Work was submitted after disposal | No |
| `INTERNAL` | An unexpected implementation failure occurred | Maybe |

An error also contains a safe diagnostic message, a recoverable flag and an optional platform cause. It must not contain audio, transcript text, credentials or unnecessary user paths.

## Platform plan

| Host | Initial implementation | Architectures | Delivery |
|---|---|---|---|
| Node/Electron Windows | Isolated native sidecar | x64, ARM64 | npm adapter plus verified runtime artifact |
| Node/Electron macOS | Isolated native sidecar | universal or arm64/x64 | npm adapter plus signed runtime artifact |
| Node/Electron Linux | Isolated native sidecar | x64, ARM64 | npm adapter plus verified runtime artifact |
| Tauri desktop | Direct Rust crate | platform-native | Rust crate and Tauri plugin |
| Swift macOS/iOS | Stable native seam with Swift concurrency wrapper | Apple Silicon and supported simulator/device targets | Swift Package with XCFramework |
| Kotlin Android | JNI with coroutine wrapper | `arm64-v8a`, supported emulator target | AAR |
| Kotlin JVM desktop | JNI desktop libraries | supported desktop architectures | Maven artifact plus native libraries |
| React Native | Turbo Native Module over Swift and Kotlin | inherited from native adapters | npm package |

The first release supports only the first four desktop rows. Later rows remain design targets until they pass their own conformance and device tests.

## Stable native seam

Swift, Kotlin, React Native and other native hosts need a stable C-compatible seam rather than direct access to Rust or ONNX values.

The seam will follow these rules:

- engine and Voice Session values cross as opaque handles;
- every exported function returns a status code;
- transcript data and diagnostics use explicitly owned UTF-8 buffers;
- allocation and release functions are paired and documented;
- sample pointers are accompanied by element count, sample rate and channel count;
- nullability and thread-safety are explicit for every function;
- Rust panics never unwind across the seam;
- callbacks cannot run after their engine or session is disposed;
- the host can query the native contract version before opening an engine.

The first C header will be generated and tested from the Rust crate. It is not frozen by this design document; compatibility begins with the first published alpha.

## Acceleration

CPU inference is the compatibility baseline. Acceleration is selected inside the implementation and reported in diagnostics.

Potential later paths include:

- Core ML on supported Apple devices;
- XNNPACK on ARM devices;
- NNAPI or other Android execution providers;
- DirectML on supported Windows devices.

Acceleration must not change transcript semantics or become required by the common interface. Each path needs separate correctness, startup, memory and fallback tests.

## Performance requirements

The package must publish reproducible measurements rather than describe itself as fast without context.

Each release benchmark should record:

- host operating system, architecture and processor;
- model profile and quantisation;
- cold model-load time;
- warm inference time;
- audio duration and real-time factor;
- peak resident memory;
- package runtime size and model size;
- execution provider;
- cancellation latency.

Release gates for the first alpha:

- warm model reuse is verified across consecutive transcriptions;
- adapter overhead is measured separately from inference;
- audio buffering remains bounded for the documented input limit;
- inference never runs on a JavaScript, Swift or Android UI thread;
- no performance regression greater than 10 percent is accepted without an explanation in the changelog.

## Privacy and security

- No network code, telemetry or advertising dependency belongs in the engine.
- Model download helpers, when introduced, are explicit and separate.
- Native artifacts and Model Profiles are verified with SHA-256 checksums.
- Release artifacts should include an SBOM and provenance attestation.
- Temporary audio is uniquely named, access-restricted where supported and deleted after success, failure or cancellation.
- Diagnostics exclude audio, transcripts, credentials and private paths.
- Node/Electron renderers do not receive native process or arbitrary filesystem access.
- Native callbacks must not outlive disposed engine or session handles.
- FFI inputs are length-checked and ownership rules are documented.

## Testing and adapter conformance

The engine interface is the primary test surface. Tests assert observable outcomes rather than ONNX or process implementation details.

Required shared cases include:

- deterministic fixture audio produces the expected transcript;
- silence and constant offsets produce no-speech outcomes;
- malformed audio maps to `AUDIO_INVALID`;
- missing, corrupt and incompatible Model Profiles fail safely;
- repeated calls reuse a warm model;
- queued and active cancellation remain independent;
- timeouts leave the engine reusable;
- disposal is idempotent;
- temporary audio is removed after every terminal outcome;
- diagnostics contain no user audio, transcript or sensitive path;
- unsupported language and architecture errors are stable.

Every host adapter must run a conformance suite covering the same lifecycle and error codes. Platform-specific suites additionally cover packaging, signatures, microphone permission, device selection, interruptions and UI-thread safety.

## Distribution and versioning

The engine, adapters and Model Profiles are versioned independently.

- Engine releases follow semantic versioning.
- Adapter major versions declare the compatible engine major version.
- Model Profiles declare a schema version and minimum engine version.
- Native release artifacts are immutable and checksum-addressed.
- Package installation does not silently download a model.
- Unsupported operating-system versions and architectures fail during installation or preparation with a stable error.

Planned publication channels are npm for Node and React Native, crates.io for Rust and Tauri, Swift Package Manager for Apple platforms and Maven Central for Kotlin artifacts. Publication details remain provisional until namespace ownership, signing and automated release workflows are verified.

## Delivery phases

### Phase 1: extract and prove the engine

- [x] Convert the current Rust helper into a reusable library crate.
- [x] Keep the existing JSON-lines binary as a thin adapter.
- [x] Define stable file-audio, result, error and lifecycle types.
- [x] Add model-manifest validation and initial conformance fixtures.
- [x] Migrate CrunchyMurmur's Parakeet path onto the extracted crate.

### Phase 2: desktop packages

- [ ] Publish the Node/Electron adapter with platform runtime artifacts.
- [x] Build an in-repository Tauri 2 plugin that links the Rust crate directly.
- [ ] Publish the Tauri crate and guest bindings.
- [ ] Add example chat composer integrations.
- [ ] Publish benchmarks for Windows, macOS and Linux.

### Phase 3: native mobile feasibility

- Benchmark candidate Model Profiles on representative iOS and Android devices.
- Select supported minimum operating-system versions and architectures.
- Validate Core ML, XNNPACK and Android execution paths.
- Finalise the stable native seam and ownership rules.

### Phase 4: native adapters

- Publish the Swift Package and XCFramework.
- Publish Kotlin Android and JVM artifacts.
- Publish React Native over the Swift and Kotlin adapters.
- Add device-lab conformance and performance gates.

## Contributing to the SDK

Before implementing an adapter:

1. Confirm that the host cannot use an existing adapter.
2. Map every engine error to the shared code set.
3. Keep microphone permission and capture outside the Rust engine.
4. Keep inference away from the host UI thread.
5. Do not introduce implicit networking or telemetry.
6. Run the shared conformance fixtures.
7. Document artifact architectures, minimum operating-system versions and native dependencies.
8. Publish package, runtime and model sizes separately.

The Rust library, Node/Electron adapter, and Tauri plugin now share one engine
implementation in this repository. Publication, streaming/cancellation
conformance, and real host examples remain required before Swift, Kotlin, and
React Native depend on the seam.

## Related documentation

- [Architecture](architecture.md)
- [Building from source](building-from-source.md)
- [Platform support](platform-support.md)
- [Release process](releasing.md)
- [Third-party notices](THIRD_PARTY_NOTICES.md)
