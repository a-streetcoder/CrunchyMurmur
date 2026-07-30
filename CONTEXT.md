# CrunchyMurmur transcription

This context defines the language used for reusable, private transcription across the CrunchyMurmur desktop application and future native integrations.

## Language

**On-device Engine**:
The reusable local inference module that loads a compatible model and turns audio into a transcript without a network request.
_Avoid_: Backend, transcription service, AI engine

**Voice Session**:
An ordered sequence of audio submitted for one transcription result, ending in completion or cancellation.
_Avoid_: Stream, recording job, request

**Model Profile**:
A versioned manifest describing the files, checksums, languages, quantisation and runtime compatibility of one local model.
_Avoid_: Model config, download entry

**Transcript Outcome**:
The result of a Voice Session, classified as speech, no speech, cancelled or failed.
_Avoid_: Response, payload

**Host Recorder**:
Platform-owned microphone capture that supplies audio to a Voice Session without being part of the On-device Engine.
_Avoid_: Engine recorder, shared microphone

## Relationships

- An **On-device Engine** loads exactly one **Model Profile** at a time.
- An **On-device Engine** processes one or more **Voice Sessions** during its lifetime.
- A **Voice Session** produces exactly one **Transcript Outcome**.
- A **Host Recorder** supplies ordered audio to one **Voice Session**.

## Example dialogue

> **Developer:** "Should the On-device Engine ask for microphone permission when it starts?"
> **Domain expert:** "No. The Host Recorder owns permission and capture; the On-device Engine only receives audio through a Voice Session."

## Flagged ambiguities

- "Streaming" previously meant both incremental audio input and partial transcript output. A **Voice Session** may accept incremental audio, but partial transcript output is not promised until a model genuinely supports it.
