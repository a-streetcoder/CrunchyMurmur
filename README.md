<div align="center">
  <img src="assets/brand-mark.svg" width="104" alt="CrunchyMurmur logo">

  # CrunchyMurmur

  **Private-by-default voice dictation, meeting transcription, and Markdown notes.**

  Press a shortcut, speak, and keep working. CrunchyMurmur runs on Windows, macOS, and Linux, with fast local Parakeet, broad-language Whisper, or optional cloud transcription.

  [![Latest release](https://img.shields.io/github/v/release/a-streetcoder/CrunchyMurmur?display_name=tag&sort=semver)](https://github.com/a-streetcoder/CrunchyMurmur/releases/latest)
  [![Downloads](https://img.shields.io/github/downloads/a-streetcoder/CrunchyMurmur/total)](https://github.com/a-streetcoder/CrunchyMurmur/releases)
  [![CI](https://github.com/a-streetcoder/CrunchyMurmur/actions/workflows/ci.yml/badge.svg)](https://github.com/a-streetcoder/CrunchyMurmur/actions/workflows/ci.yml)
  [![CodeQL](https://github.com/a-streetcoder/CrunchyMurmur/actions/workflows/codeql.yml/badge.svg)](https://github.com/a-streetcoder/CrunchyMurmur/actions/workflows/codeql.yml)
  [![CodeRabbit Pull Request Reviews](https://img.shields.io/coderabbit/prs/github/a-streetcoder/CrunchyMurmur?utm_source=oss&utm_medium=github&utm_campaign=a-streetcoder%2FCrunchyMurmur&labelColor=171717&color=FF570A&link=https%3A%2F%2Fcoderabbit.ai&label=CodeRabbit+Reviews)](https://coderabbit.ai)
  [![Platforms](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-256351)](docs/platform-support.md)
  [![License: MIT](https://img.shields.io/badge/license-MIT-7EB880)](LICENSE)

  [Website](https://crunchymurmur.com/) · [Download](https://github.com/a-streetcoder/CrunchyMurmur/releases/latest) · [Documentation](docs/README.md) · [Report a bug](https://github.com/a-streetcoder/CrunchyMurmur/issues/new/choose) · [Security](.github/SECURITY.md)
</div>

![CrunchyMurmur dashboard with live dictation active](docs/images/hero.png)

---

## What it does

| | Capability | What you get |
|---|---|---|
| <img src="docs/readme-icons/dictation.svg" width="38" alt=""> | **Dictation anywhere** | Hold the global shortcut, speak, and release to transcribe into the focused app. |
| <img src="docs/readme-icons/meetings.svg" width="38" alt=""> | **Meeting capture** | Record a microphone and, where supported, system audio as separate speaker-labelled tracks. |
| <img src="docs/readme-icons/notes.svg" width="38" alt=""> | **A real Markdown workspace** | Edit notes, meeting notes, and reusable AI templates with write, split, and preview modes. |
| <img src="docs/readme-icons/privacy.svg" width="38" alt=""> | **Local-first privacy** | Use whisper.cpp fully offline. There is no account, advertising SDK, or project-operated telemetry. |
| <img src="docs/readme-icons/insights.svg" width="38" alt=""> | **Useful progress, locally** | Track dictated words, weighted words per minute, and consecutive active days on your device. |
| <img src="docs/readme-icons/updates.svg" width="38" alt=""> | **Verified releases and updates** | Signed packages, checksums, SBOMs, provenance attestations, and stable in-app updates from GitHub Releases. |

The interface is available in 12 languages — English, Italiano, Español, Português, Français, Deutsch, Dansk, Norsk, Svenska, 中文, 한국어, and 日本語. It follows your system language by default, and you can switch instantly in General settings.

## A calm, native-feeling workspace

| Appearance and device settings | Local and cloud transcription |
|---|---|
| ![CrunchyMurmur General settings in light mode](docs/images/general.png) | ![CrunchyMurmur transcription engine settings](docs/images/engine.png) |

Screenshots use a clean automated test profile with no personal data or credentials.

## Notes that stay yours

| Markdown notes workspace | Focused note editing |
|---|---|
| ![CrunchyMurmur Notes workspace](docs/images/notes.png) | ![CrunchyMurmur Markdown note editor](docs/images/note-editor.png) |

Notes are ordinary Markdown files in your Documents folder, so they remain portable, searchable, and usable with other editors.

## Install

Download the latest package from [GitHub Releases](https://github.com/a-streetcoder/CrunchyMurmur/releases/latest), or use the verified terminal installer.

**Windows — PowerShell**

```powershell
irm https://raw.githubusercontent.com/a-streetcoder/CrunchyMurmur/main/install.ps1 | iex
```

**macOS or Linux**

```sh
curl -fsSL https://raw.githubusercontent.com/a-streetcoder/CrunchyMurmur/main/install.sh | sh
```

The scripts detect your operating system and architecture, download the latest release, and verify it against the published SHA-256 digest before installation. See [Getting started](docs/getting-started.md) for manual packages and first-run setup.

> **Windows trust notice:** Windows installers are Authenticode-signed with the temporary self-signed publisher certificate `CN=CrunchyMurmur Temporary Self-Signed Publisher`, valid through 10 July 2027. SmartScreen may warn because the certificate is not issued by a publicly trusted certificate authority. Verify `SHA256SUMS` and the GitHub provenance attestation before installing. macOS packages are Developer ID signed and notarized.

## Choose where transcription happens

- **Parakeet V3 (recommended):** fast, accurate CPU transcription for 25 European languages through the bundled Rust `transcribe-rs` engine. The model stays loaded between dictations and meeting chunks.
- **Local Whisper:** the broad-language fallback for 99+ languages, manual language selection, translation, and custom GGML models. CrunchyMurmur bundles `whisper.cpp`; no separate engine installation is required.
- **Groq Whisper API:** faster on many laptops; audio is sent to the Groq account you configure.

Near-silent recordings are rejected before inference instead of being saved as model hallucinations.
- **Optional AI formatting and notes:** use Anthropic, OpenAI, Groq, Claude Code, or Codex only when you configure and invoke them.

Cloud features are optional. Provider failures fall back safely without discarding the original transcript.

## Designed for trust

- No CrunchyMurmur account, analytics SDK, ads, or project-operated telemetry.
- API keys use operating-system-backed safe storage when available.
- Local data can be exported or permanently deleted from the app.
- Audio retention never removes meeting transcripts or notes.
- Release artifacts include SHA-256 checksums, an SPDX SBOM, and GitHub build-provenance attestations.
- Privileged Electron operations stay in the main process with constrained renderer APIs.

Read the complete [privacy notice](docs/legal/privacy.md), [security policy](.github/SECURITY.md), and [architecture overview](docs/architecture.md).

## Platform support

| | Windows | macOS | Linux |
|---|---|---|---|
| Packages | NSIS x64 / ARM64 | Universal DMG / ZIP | AppImage and Debian x64 / ARM64 |
| Default shortcut | Hold `Ctrl + Win` | Hold `Fn` | Configurable toggle |
| Meeting system audio | Supported | macOS 13+ | Microphone only |
| Automatic paste | Native | Accessibility permission | `wtype` or `xdotool` |
| Updates | Automatic | Automatic | Automatic for AppImage; reinstall for Debian |

See the [full capability matrix and Linux requirements](docs/platform-support.md).

## Updating

Packaged Windows, macOS, and Linux AppImage builds check stable GitHub Releases and download valid upgrades in the background. The app asks before restarting to install. Prereleases and downgrades are never applied.

You can also run the same terminal install command again at any time. Debian packages use this manual path. Read [Updating CrunchyMurmur](docs/updating.md) for exact behavior and verification options.

## Build from source

Requires Node.js 22.12 or newer, npm, the stable Rust toolchain, and a native C/C++ linker (Visual Studio Build Tools on Windows, Xcode Command Line Tools on macOS, or GCC on Linux). Git is optional: the source bootstrap resolves `main` to an exact commit, downloads its GitHub archive, installs locked dependencies, validates the project, builds the local transcription helper, and launches it.

**Windows — PowerShell**

```powershell
& ([scriptblock]::Create((irm https://raw.githubusercontent.com/a-streetcoder/CrunchyMurmur/main/scripts/source/run-from-source.ps1)))
```

**macOS or Linux**

```sh
curl -fsSL https://raw.githubusercontent.com/a-streetcoder/CrunchyMurmur/main/scripts/source/run-from-source.sh | sh
```

The source is kept in a user-owned application-data directory, so running the command again safely rebuilds from the latest protected `main`. The previous working source tree is replaced only after the new commit passes dependency installation and validation. Read the scripts before piping them to a shell; options and manual commands are documented in [Building from source](docs/building-from-source.md).

Manual development setup remains available:

```sh
git clone https://github.com/a-streetcoder/CrunchyMurmur.git
cd CrunchyMurmur
npm ci
npm run check
npm start
```

Native release packages must be built on their target platform. See [Contributing](.github/CONTRIBUTING.md) and [Releasing](docs/releasing.md).

## Documentation

- [Documentation index](docs/README.md)
- [Getting started](docs/getting-started.md)
- [Building from source](docs/building-from-source.md)
- [Features and providers](docs/features.md)
- [Platform support](docs/platform-support.md)
- [Updating](docs/updating.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Architecture](docs/architecture.md)
- [On-device Transcription SDK](docs/on-device-sdk.md)
- [Release process](docs/releasing.md)
- [Roadmap](docs/project/roadmap.md)
- [Project status](docs/project/status.md)
- [Support](docs/project/support.md)

## Contributing

Bug reports, focused pull requests, documentation improvements, and platform testing are welcome. Please read [Contributing](.github/CONTRIBUTING.md) and the [Code of Conduct](.github/CODE_OF_CONDUCT.md) first. Never post API keys, private calendar URLs, recordings, transcripts, or notes in a public issue.

CrunchyMurmur is released under the [MIT License](LICENSE). Use is also subject to the distributed [Terms of Use](docs/legal/terms.md).

The Markdown editing experience is powered by MarkText's MIT-licensed [Muya editor](https://github.com/marktext/marktext/tree/develop/packages/muya). See [third-party notices](docs/THIRD_PARTY_NOTICES.md) for attribution details.
