# Coding-agent requirements

## Localisation is part of every feature

Every user-facing change must be reviewed for localisation before it is considered complete.

- Never add renderer-visible English directly when a reusable message belongs in `ui/i18n.js`. Add the English source message and a natural translation for every supported locale.
- Use `window.i18n.t('English source')` for runtime-generated labels, dialogs, notifications, and status text. Static exact text is translated by the renderer, but explicit `data-i18n` is preferred for new or ambiguous markup.
- Keep product names, model names, keyboard keys, paths, commands, and user content untranslated.
- Use the active locale for user-facing dates, numbers, and plural-sensitive messages. Do not concatenate sentence fragments that translators cannot reorder.
- Distinguish the interface locale (`uiLocale`) from Whisper's spoken-language setting (`language`).
- Run `npm run check:i18n` and the relevant UI tests. A release or feature is incomplete if a supported catalog is missing a key.
- When adding a locale, update the selector, `supported`, every catalog, this policy if needed, and packaging/tests in the same change.

Supported interface locales: English, Italian, Spanish, Portuguese, French, German, Danish, Norwegian, Swedish, Chinese, Korean, and Japanese.

The marketing website in `site/` is a separate English-only surface and is not part of the renderer i18n catalog.

## Website (`site/`) is coupled to this repository

`site/` contains the public landing page, deployed to Cloudflare as the static-assets Worker `crunchymurmur-site` (StreetCoding account, config in `site/wrangler.jsonc`, custom domain `crunchymurmur.com`, auto-deployed by Workers Builds from GitHub `main` with root directory `/site`; from inside `site/`, `npx wrangler deploy` is the manual override). It deliberately depends on repository facts. When you change any of the following, update `site/` in the same change:

- **Repository owner/name** (`a-streetcoder/CrunchyMurmur`): hardcoded in `site/index.html` links and `site/app.js` (`REPO`). Renaming or moving the repo breaks every download link and the release lookup.
- **Release artifact names**: `site/app.js` matches release assets against the electron-builder `artifactName` pattern `${productName}-${os}-${arch}.${ext}` from `package.json`, plus the renames in `scripts/normalize-linux-artifacts.js` (e.g. `CrunchyMurmur-win-x64.exe`, `CrunchyMurmur-mac-universal.dmg`, `CrunchyMurmur-linux-x64.AppImage`). Changing `productName`, `artifactName`, targets, or the normalize script must be mirrored in `ASSET_MATCHERS`.
- **Terminal installers**: the site shows the same commands as the README Install section (`install.ps1`, `install.sh` fetched raw from `main`). Moving or renaming those scripts breaks the copy-paste commands on the site.
- **Platform support table**: the table in `site/index.html` mirrors `docs/platform-support.md`. Keep them in sync when platform capabilities change.
- **Feature and trust copy**: sourced from `README.md` and `docs/features.md`. Material product changes (providers, privacy posture, packages) should be reflected on the site.
- **Documentation viewer**: `site/docs.html` + `site/docs.js` render the Markdown under `docs/` directly from `raw.githubusercontent.com` (branch `main`) at page load — GitHub is the single source of truth and doc edits appear on the site immediately. The `DOCS` manifest in `site/docs.js` lists each doc by path and slug: adding, renaming, or removing a file under `docs/` must be mirrored there (and in the doc cards in `site/index.html`). Docs must stay pure Markdown — the renderer (vendored markdown-it) runs with raw HTML disabled, so HTML in a doc displays as literal text on the site.
- **Theme**: `site/styles.css` design tokens mirror the light `:root` palette in `ui/main.css`. If the app palette changes, update the site tokens.
- **Landing-page localisation**: `site/index.html` is the English source of truth; `site/generate-i18n.js` builds `/it/`–`/ja/` pages from `site/i18n-catalog.js` (same 11 languages and column order as `ui/i18n.js`). Any English copy change on the landing page must update the catalog in the same change — the generator fails the build (via `build.command` in `site/wrangler.jsonc`) when they drift. Dynamic strings injected by `site/app.js` live in its `UI_STRINGS` table.

The site never hardcodes a release version: `site/app.js` fetches `releases/latest` from the GitHub API at page load and falls back to the GitHub Releases page when no release exists or the API is unavailable, so publishing releases requires no site change as long as asset names keep the pattern above.
