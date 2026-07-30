# Third-party notices

CrunchyMurmur includes the following open-source software in its distributed application.

## transcribe-rs

CrunchyMurmur includes a native helper built with [transcribe-rs](https://github.com/cjpais/transcribe-rs), Copyright its contributors, licensed under the MIT License.

## NVIDIA Parakeet TDT 0.6B v3

The optional Parakeet V3 model is downloaded from the [ONNX export](https://huggingface.co/istupakov/parakeet-tdt-0.6b-v3-onnx) and is licensed under CC BY 4.0. The [source model](https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3) supports 25 European languages.

## ONNX Runtime

The macOS Intel package includes [Microsoft ONNX Runtime](https://github.com/microsoft/onnxruntime), Copyright Microsoft Corporation, licensed under the MIT License. The applicable licence text is included with the distributed application.

## RustCrypto SHA-2

The native engine uses the [RustCrypto SHA-2](https://github.com/RustCrypto/hashes) implementation to verify local Model Profile assets. It is dual-licensed under the MIT License and Apache License 2.0.

## Rust semver

The native engine uses the [Rust semver](https://github.com/dtolnay/semver) crate to enforce Model Profile compatibility. It is dual-licensed under the MIT License and Apache License 2.0.

## Muya

Muya is the Markdown editor extracted from [MarkText](https://github.com/marktext/marktext) and distributed as [`@muyajs/core`](https://www.npmjs.com/package/@muyajs/core).

- Copyright © Jocs and MarkText contributors
- Licence: MIT
- Source: <https://github.com/marktext/marktext/tree/develop/packages/muya>

Muya's transitive dependencies retain their respective licences. Their package metadata is recorded in `package-lock.json`, and the release SBOM contains the exact dependency versions shipped with each CrunchyMurmur release.

## whisper.cpp

CrunchyMurmur bundles the `whisper-cli` and `whisper-server` executables from [whisper.cpp](https://github.com/ggml-org/whisper.cpp), pinned to v1.8.6 (`23ee03506a91ac3d3f0071b40e66a430eebdfa1d`).

MIT License

Copyright (c) 2023-2026 The ggml authors

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
