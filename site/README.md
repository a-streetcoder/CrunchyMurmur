# CrunchyMurmur website

Static landing page for CrunchyMurmur, deployed to Cloudflare Workers as a
static-assets Worker (`wrangler.jsonc`) with `/site` as the build root.

Before changing anything here, read the **Website** section of the repository
[AGENTS.md](../AGENTS.md): the page is deliberately coupled to the GitHub
repository name, the release artifact naming pattern, the terminal installer
scripts, and `docs/platform-support.md`.

## Files

- `index.html` — the whole page (hero, terminal installer, features, platform table, downloads).
- `styles.css` — light theme; the design tokens mirror the `:root` light palette in `ui/main.css`.
- `app.js` — OS detection, terminal-tab/copy behavior, and live sync of every
  download link with the latest GitHub release via the public API. Without
  JavaScript (or before the first release exists) all links fall back to the
  GitHub Releases page.
- `docs.html` + `docs.js` — hosted documentation viewer at `/docs`. Fetches the
  Markdown under `docs/` from raw.githubusercontent.com (branch `main`) at page
  load and renders it client-side, so GitHub stays the single source of truth.
  The `DOCS` manifest in `docs.js` must mirror the files under `docs/`.
- `vendor/markdown-it.min.js` — Markdown renderer, vendored from the repository's
  `node_modules` (no CDN dependency).
- `wrangler.jsonc` + `.assetsignore` — Cloudflare static-assets Worker (no Worker
  code). `/docs` serves `docs.html` via the default `html_handling`; files listed
  in `.assetsignore` are never uploaded. Assets are served with
  `Cache-Control: max-age=0, must-revalidate`, so un-hashed `app.js`/`styles.css`
  are revalidated on every load.
- `i18n-catalog.js` + `generate-i18n.js` — landing-page localisation. The
  catalog maps every English phrase on `index.html` to the same 11 languages as
  the app UI (`ui/i18n.js`); the generator writes `/<lang>/index.html` pages,
  `sitemap.xml` (with `hreflang` alternates), and `robots.txt`. It runs on every
  `wrangler deploy`/`wrangler dev` via the `build.command` in `wrangler.jsonc`, and it fails the build if the catalog and
  `index.html` drift apart, so edit them together. The generated output is
  gitignored. Dynamic strings that `app.js` injects (download button, release
  line, copy feedback) live in the `UI_STRINGS` table inside `app.js`.
- `assets/` — brand mark and screenshots copied from `assets/` and `docs/images/`.

`index.html` is the English source of truth. Its translatable strings are
replaced by exact match (`>phrase<` for element bodies, `"phrase"` for
attributes), so keep each translatable block on a single line.

## Local preview

```sh
cd site && npx wrangler dev   # regenerates the localised pages, then serves
# http://localhost:8787 (English), /it/, /es/, /pt/, /fr/, /de/, /da/, /no/, /sv/, /zh/, /ko/, /ja/
```

## Deploy

The site is the Cloudflare Worker `crunchymurmur-site` in the StreetCoding
account, served only at https://crunchymurmur.com/ (custom domain; the
`workers.dev` and preview URLs are disabled, so there is one canonical origin
and `SITE_ORIGIN` in `generate-i18n.js` and the `hreflang`/canonical links in
`index.html` must all use it). `www.crunchymurmur.com` redirects to the apex.

Workers Builds auto-deploys from GitHub `main` (root directory `/site`, build
watch paths `site/*`, deploy command `npx wrangler deploy`), so merging a PR
that touches this folder is enough. Manual override from `site/`:

```sh
npx wrangler deploy
```
