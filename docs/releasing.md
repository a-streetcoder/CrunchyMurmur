# Releasing CrunchyMurmur

GitHub Releases is the only supported publication channel. The workflow builds on native GitHub-hosted Windows, macOS, and Linux runners and refuses to publish unsigned Windows or macOS artifacts.

## One-time repository setup

Make the repository public before announcing downloads; GitHub's anonymous `releases/latest/download` URLs and the terminal installers cannot serve assets from a private repository.

Configure these GitHub Actions secrets:

- `WIN_CSC_LINK`: base64-encoded Windows code-signing certificate or a supported secure URL.
- `WIN_CSC_KEY_PASSWORD`: certificate password.
- `APPLE_DEVELOPER_ID_CERTIFICATE`: base64-encoded Apple Developer ID Application certificate.
- `APPLE_DEVELOPER_ID_CERTIFICATE_PASSWORD`: certificate password.
- `APPLE_TEAM_ID`: Apple Developer team identifier.
- `APPLE_NOTARY_API_KEY`: base64-encoded App Store Connect API private key (`.p8`).
- `APPLE_NOTARY_KEY_ID`: App Store Connect API key identifier.
- `APPLE_NOTARY_ISSUER_ID`: App Store Connect API issuer identifier.

The Apple credentials may be organisation-level secrets restricted to this repository. The workflow writes the notarisation key to the macOS runner only for the signed build and does not persist it as an artifact.

The initial Windows certificate is the temporary self-signed publisher `CN=CrunchyMurmur Temporary Self-Signed Publisher`, valid through 10 July 2027. Replace it with a publicly trusted code-signing certificate before expiry. Until then, release notes and download pages must disclose that SmartScreen may warn and direct users to the published checksums and provenance attestations.

Starting with 0.1.2, the Windows updater has a narrowly scoped fallback for certificate fingerprint `44C466EA973008A8D4C3B18775795AC9549810F2` because Windows reports its untrusted self-signed chain as `UnknownError`. Electron's normal trusted-signature verifier always runs first. Keep the pinned fingerprint aligned with the release secret, never broaden the fallback to a publisher name alone, and remove the fallback when the temporary certificate is replaced. Users on 0.1.0 or 0.1.1 must install 0.1.2 manually once before automatic updates can resume.

Enable GitHub private vulnerability reporting, require pull requests and CI on `main`, enable Dependabot security updates, and restrict who may create `v*` tags. Use a GitHub Environment with required reviewers for the release secrets if the repository's plan supports it.

## Release procedure

1. Update `CHANGELOG.md` and set the same stable version in `package.json` and `package-lock.json`.
2. Run `npm ci`, `npm run check`, `npm audit --audit-level=high --omit=dev`, and `npm run release:check` from a clean checkout. CI also parses both source bootstraps on their native shells. (Production dependencies gate the release; dev-toolchain advisories are reported as warnings.)
3. Merge the reviewed release commit to `main`.
4. Create and push the matching annotated tag, for example `v0.1.0`.
5. The Release workflow validates the tag/version pair, builds and signs Windows x64/arm64, signs and notarizes macOS universal, and builds Linux x64/arm64 AppImage and Debian packages.
6. Each platform job verifies that its updater manifest references files that were actually built.
7. The publish job creates an SPDX SBOM and `SHA256SUMS`, generates GitHub build-provenance attestations, and publishes the immutable GitHub Release.
8. Verify installation and updating on clean Windows x64/arm64, supported macOS Intel/Apple Silicon, Linux X11, and Linux Wayland systems before announcing the release.

Do not manually replace assets on a published release. Fix the source and publish a new patch version.

## Nightly procedure

The Nightly workflow runs daily and can also be started manually from GitHub Actions. It tags the current `main` commit with the next-minor prerelease format `vX.Y.0-nightly.YYYYMMDD.RUN`, then calls the same cross-platform signing, notarisation, testing, checksum, SBOM, and attestation pipeline as Stable. The resulting GitHub Release is marked as a prerelease and publishes `nightly` updater manifests. It does not replace GitHub's latest Stable release or the downloads shown on the website.

Nightly packages are never created locally, so signing credentials remain confined to GitHub Actions. Published Nightly assets remain immutable and auditable like Stable releases.

## Stable download URLs

The release workflow keeps these names stable for a future website:

- `CrunchyMurmur-win-x64.exe`
- `CrunchyMurmur-win-arm64.exe`
- `CrunchyMurmur-mac-universal.dmg`
- `CrunchyMurmur-mac-universal.zip`
- `CrunchyMurmur-linux-x64.AppImage`
- `CrunchyMurmur-linux-arm64.AppImage`
- `CrunchyMurmur-linux-x64.deb`
- `CrunchyMurmur-linux-arm64.deb`
- `SHA256SUMS`
- `sbom.spdx.json`
- `install.ps1`
- `install.sh`

Prefix any name with `https://github.com/a-streetcoder/CrunchyMurmur/releases/latest/download/` for a website download link.

## Verification

- Windows: inspect Authenticode with `Get-AuthenticodeSignature`, confirm the expected `CrunchyMurmur Temporary Self-Signed Publisher` subject and 10 July 2027 expiry, and verify the file digest against `SHA256SUMS`. A clean machine may report the self-signed chain as untrusted even when the signature and digest are intact.
- macOS: run `codesign --verify --deep --strict`, `spctl --assess --type execute`, and `xcrun stapler validate` against the installed application/package.
- Linux and all platforms: compare the artifact SHA-256 with `SHA256SUMS` and verify the GitHub attestation with GitHub CLI.
- Confirm the app's updater discovers the release and applies it from the previous stable version.
- Confirm Stable ignores prereleases, Nightly discovers the latest Nightly prerelease, and returning to Stable requires explicit confirmation. Debian packages update by rerunning the Stable terminal installer.
