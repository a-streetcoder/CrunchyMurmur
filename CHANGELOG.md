# Changelog

All notable changes are documented here. This project follows Semantic
Versioning and the Keep a Changelog structure.

## [Unreleased]

### Added

- A publishable `0.1.0-alpha.1` on-device transcription SDK: the shared Rust engine, Node/Electron and Tauri adapters, a common four-method lifecycle, stable result types, privacy-safe diagnostics, package provenance, and automated npm/crates.io/GitHub prerelease publication.
- A secure, local-first Electron chat demo with microphone capture, automatic light/dark appearance, 12 interface languages, temporary WAV cleanup, and a narrow renderer-to-main transcription bridge.

## [0.1.3] - 2026-07-24

### Added

- A single Settings entry pinned to the bottom of the sidebar opens one settings screen with section navigation: General, Appearance, Audio and language, Transcription, AI formatting, AI notes, Templates, and Data and privacy.
- The AI formatting system instructions are now editable in Settings, with the built-in default shown as a placeholder and a reset control.
- Meetings show an inline AI-notes template picker next to Generate, replacing the popup, and re-generation reuses the selected template.
- Calendar feed errors now explain common mistakes — Google Calendar's embed URL, non-public Google calendars, sign-in-protected feeds, and URLs that return web pages instead of ICS data — in every supported language.

### Fixed

- macOS updates now restart correctly when choosing "Restart now": the update quit was being intercepted by the tray-window close handler.
- On macOS the main window now comes to the foreground when the app is opened or reopened instead of appearing behind the active application.
- Clicking the Dock icon on macOS reopens the main window.
- Nightly releases publish correctly: release validation no longer misreads the first changed file, nightly builds emit channel-specific update manifests, and Linux artifact normalization rewrites them.


## [0.1.2] - 2026-07-21

### Fixed

- Windows updates signed by the pinned temporary publisher certificate can now install automatically even when Windows reports its self-signed trust chain as unknown. Electron's trusted-signature verification remains the primary path, and unsigned, altered, expired, or differently signed packages remain blocked.

## [0.1.1] - 2026-07-21

### Added

- Stable and Nightly update channels in General settings, translated across every supported interface language.
- Signed scheduled and manually triggered Nightly prereleases for Windows, macOS, and Linux through the existing GitHub release pipeline.

### Changed

- Returning from Nightly to Stable now requires explicit confirmation and limits downgrade permission to the confirmed Stable replacement.
- Release validation now enforces canonical semantic versions, real Nightly calendar dates, idempotent Nightly tags, and publication of channel-specific updater manifests.

## [0.1.0] - 2026-07-20

### Added

- A pinned, bundled whisper.cpp runtime and persistent local Whisper sessions through a supervised `whisper-server`, including model preloading, shared meeting/dictation reuse, timing diagnostics, idle cleanup, and a safe bundled `whisper-cli` fallback.
- Parakeet V3 as the recommended fast local engine for 25 European languages, powered by a bundled persistent Rust `transcribe-rs` helper on Windows, macOS, and Linux.
- Verified direct model downloads from Hugging Face with pinned file sizes and SHA-256 checksums.
- Pre-inference rejection for recordings that are too short or effectively silent, preventing common silence hallucinations.
- Local acceleration readiness in Engine settings, translated across every supported interface language.
- Safe one-command Windows, macOS, and Linux source bootstraps that build an exact GitHub commit without requiring Git.
- Open-source project documentation, branded README feature icons, support policy, roadmap, getting-started guide, and update/troubleshooting guides.
- Release-time validation that every platform updater manifest references artifacts that were actually built.
- Shared offline WYSIWYG Markdown editor for notes, AI-note templates, and live meeting notes, powered by MarkText's Muya editor.
- Markdown formatting, contextual editing tools, slash-command block insertion, search, undo, HTML-safe rendering, and document statistics.
- System-aware light and dark themes based on the ivory, Mediterranean green, pistachio, ceramic blue, butter, apricot, and bougainvillea palette.

### Changed

- Reorganized community, legal, and project documentation into conventional `.github/` and `docs/` sections and removed unused legacy branding exports.
- Stable automatic updates now explicitly reject prereleases and downgrades.
- Text-editing surfaces now render Markdown directly while preserving the existing Markdown and autosave storage formats.
- Window chrome, scrollbars, cards, controls, editor surfaces, and the recording overlay now follow the saved appearance preference across Windows, macOS, and Linux.
- Replaced the placeholder in-app waveform glyph and legacy orange/blue package variants with one palette-aligned five-bar app mark across title bar, tray, Windows, macOS, and Linux artifacts.
- Reframed Engine settings around complementary Parakeet, Whisper, and Groq choices, with language-coverage guidance and accurate model speed/accuracy labels.
- Windows ARM64 packages use the verified x64 local transcription helpers through the operating system's built-in emulation, matching the existing Whisper compatibility strategy.
- Windows installers use a temporary self-signed publisher certificate, valid through 10 July 2027, while the project completes publicly trusted code-signing onboarding.

### Initial production foundation

- Automated syntax and store/security tests.
- Cross-platform CI, Electron smoke tests, and open-source contribution and security policies.
- Streaming meeting audio persistence with bounded renderer memory.
- Windows x64/ARM64, macOS universal, Linux x64/ARM64 release targets.
- GitHub Release updates, verified terminal installers, checksums, SPDX SBOM, and provenance attestations.
- Configurable global shortcut, support diagnostics, logs, data export/deletion, meeting retention, privacy notice, and terms.
- Key-press shortcut recorder and Windows Ctrl + Win hold-to-dictate default.
- Dashboard totals for dictated words, weighted WPM, and daily streak.
- macOS Fn push-to-talk and native EventKit calendar integration.
- Separate microphone/system meeting tracks on supported Windows and macOS versions.
- Speaker-labelled, timestamped, chunked meeting transcription with progress and cancellation.
- Groq AI Notes and optional AI formatting for dictation.
- Permission status and audio-only meeting retention controls.
- Linux Electron UI coverage and stable x64 AppImage/Debian artifact names.

### Foundation changes

- Hardened IPC, navigation, permissions, AI CLI isolation, secret handling,
  file persistence, calendar fetching, and model download validation.
- Replaced the archived platform-specific keyboard hook with Electron global shortcuts.
- Added cross-platform paste and CLI discovery.
- Refined the desktop shell with integrated title-bar chrome, compact contained cards, responsive panes, and bounded scroll regions.
- Restored the standard application menu and redesigned recording history as non-shrinking transcript preview cards.
- Meeting retention now removes WAV files only and always preserves transcripts and notes.
- Linux desktop metadata now keeps packaged windows associated with the installed application entry.

### Fixed

- Microphone leak after a fast push-to-talk release.
- Orphaned meeting state when the main window is closed.
- Duplicate meeting recording starts and note autosave selection races.
- Temporary dictation WAV accumulation and filesystem path traversal.
- Blank packaged windows caused by disabling Electron's required file-protocol fuse.
- General-page horizontal overflow and unbounded GitHub updater error text.
- Recording cards collapsing to timestamp-only rows in large histories.
- Shortcut capture hiding held or incomplete keys behind generic instructions.
- Engine/provider modules and form-control text clipping or misaligning at narrow widths and with Linux font metrics.
