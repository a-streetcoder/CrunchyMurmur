# Getting started

## 1. Install

Use a package from the latest GitHub Release or the verified terminal installer shown in the [README](../README.md#install).

- Windows: run the x64 or ARM64 NSIS installer.
- macOS: open the universal DMG and copy CrunchyMurmur to Applications.
- Linux: use the x64 or ARM64 AppImage, or install the matching Debian package.

macOS artifacts are Developer ID signed and notarized. Windows artifacts are Authenticode-signed with the temporary self-signed publisher certificate `CN=CrunchyMurmur Temporary Self-Signed Publisher`, valid through 10 July 2027; SmartScreen may warn because it is not issued by a publicly trusted certificate authority. Every release includes `SHA256SUMS`, an SPDX SBOM, and GitHub provenance attestations so downloads can be verified independently.

## 2. Finish the first-run setup

The first launch opens a short setup wizard. It asks where transcription should run, fetches whatever that choice needs, and checks the system permissions — after it, dictation works in every app without visiting Settings.

1. **Choose an engine.**
   - **Parakeet V3 (recommended)** — fast, accurate, fully offline; 25 European languages detected automatically. One model download of about 640 MB.
   - **Whisper** — 99+ languages, manual language selection, and translation; fully offline. Pick a model size in the wizard (larger is more accurate and slower). The whisper.cpp engine itself is bundled; nothing else to install.
   - **Groq (cloud)** — nothing to download; each recording is sent to Groq's Whisper API with your own API key from [console.groq.com/keys](https://console.groq.com/keys). Review the provider's terms and retention settings before choosing it.
2. **Wait for the download** (local engines only). The model is stored in the app's data folder and never downloaded again. The chosen model is selected automatically when the download completes.
3. **Grant permissions.** macOS asks for Microphone, Accessibility (to paste the transcript into the active app), and Input Monitoring (for the Fn push-to-talk shortcut); Windows asks for the microphone. Grant each in the system dialog and return to the wizard.

Choosing **Set up later** closes the wizard for good and opens **Settings → Transcription**, where every option is also available: switching engines, downloading or deleting models under **Local models**, or pointing Whisper at your own `whisper-cli` build or GGML `.bin` file.

## 3. Check the microphone

Open **Settings → Audio and language**, choose the intended input device, and use **Test**. An empty transcript is usually caused by the wrong microphone, missing operating-system permission, or a local model/executable mismatch.

## 4. Make the first dictation

- Windows defaults to holding `Ctrl + Win`; release either key to transcribe.
- macOS defaults to holding `Fn`; grant Accessibility and Input Monitoring when prompted.
- Linux uses a configurable toggle shortcut by default.

Change the combination from **General → Dictation shortcut** by selecting **Record shortcut** and physically pressing the desired supported keys. A recording overlay confirms that capture is active.

The completed transcript is copied and pasted into the app that had focus. If automatic paste is unavailable, the text remains on the clipboard.

## 5. Optional features

- Add AI providers in **Engine** for transcript cleanup or AI notes.
- Create reusable Markdown prompts under **Templates**.
- Start consent-aware recordings under **Meetings**.
- Review dictated words, WPM, and streaks on **Dashboard**.

Continue with [Features](features.md), [Platform support](platform-support.md), or [Troubleshooting](troubleshooting.md).
