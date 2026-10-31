# AGENTS.md

Technical notes for contributors and AI agents working on this repository.
User-facing documentation lives in [README.md](README.md).

## What this project is

A single-file userscript (`ehentai-app.user.js`) that replaces the E-Hentai /
ExHentai HTML pages with a mobile app shell. It is plain JavaScript, has no
runtime dependencies, and uses no `GM_*` APIs. The built file is produced by
concatenating `src/*.js` in filename order inside one IIFE.

## Repository layout

```
ehentai-app.user.js       built, installable userscript (committed)
build.sh                  concatenates src/ + injects the version
scripts/version.mjs       version injection helper
src/00-header.js          userscript metadata + IIFE opener
src/10-utils.js           helpers, storage, DEFAULT_SETTINGS, route classify
src/20-icons.js           inline SVG icon set
src/30-css.js             the whole stylesheet (CSS variables, themes)
src/40-http-parsers.js    fetch layer, cache, HTML parsers
src/60-app.js             app shell, router, drawer, sheets, login, toasts
src/70-list.js            gallery list page + infinite scroll + favorites warm-up
src/75-detail.js          gallery detail, favorites/rating/comments, thumbnails
src/80-reader.js          reader core, layouts, page resolution, progress
src/85-reader-ui.js       reader chrome, gestures, reader menu, jump sheet
src/90-pages.js           search, settings, history, toplists, login helpers
src/99-boot.js            bootstrap and teardown
test/                     parser, UI, live and Safari harnesses + fixtures
.github/workflows/build.yml   rebuilds the userscript on source pushes
```

The order matters: `src/*.js` are concatenated verbatim, so functions are visible
across files inside the same IIFE. Keep declarations in the file where they belong
and rely on hoisting only for functions.

## Build

```bash
npm install
npm run build          # bash build.sh -> ehentai-app.user.js
```

`build.sh` injects `package.json`'s version into `@version` and the in-app
`VERSION` constant. Never edit `ehentai-app.user.js` by hand; rebuild it.

The built file is committed so the raw URL always serves a working script.
`.github/workflows/build.yml` runs `npm ci`, `npm test`, `npm run build` on pushes
that touch `src/` and commits the rebuilt file. It skips commits that only change
the built artifact, preventing a rebuild loop.

## Tests

```bash
npm test               # parser assertions (linkedom + saved HTML fixtures)
npm run test:ui        # headless Chrome UI assertions (Puppeteer)
npm run test:live      # optional, hits the real e-hentai.org
npm run test:safari       # Safari WebDriver harness
npm run test:safari:mcp   # Safari MCP stdio harness
```

- Parser tests read `src/10-utils.js` + `src/40-http-parsers.js` directly and run
  them in a `linkedom` document. Add a fixture under `test/fixtures/` when site
  markup changes.
- UI tests start a local HTTP server on `127.0.0.1:43123`, rewrite
  `e-hentai.org`/`exhentai.org` links to localhost, intercept images with a 1×1
  PNG, inject the built userscript, and drive Chrome at
  `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` (adjust
  `executablePath` if needed).
- Gallery HTML is delayed by 700 ms in the UI test so the instant detail preview
  can be asserted before the full page renders.
- Current expectation: **67 parser / 59 UI** assertions, both suites must pass
  before a release.

### Fixtures of note

`test/fixtures/` contains live pages captured from the sites:

- `index.html` — front page, Compact layout (`gl*c`, `data-src` lazily loaded).
- `index-extended.html` — Extended layout (`gl*e`, direct `src`).
- `index-thumbnail.html` — Thumbnail layout (div-based `gl*t`).
- `index-minimal.html` — Minimal layout (`gl*m`).
- `detail.html` — E-Hentai detail page (thumbnails as direct styled divs).
- `detail-ex.html` — ExHentai detail page (each `#gdt` preview wrapped in an
  extra div with the “Page N” caption). This is the regression fixture for the
  v1.0.8 blank-preview bug.
- `detail_p1.html` — page 2 of a 1,614-page gallery (thumbnail paging).
- `reader.html`, `toplist.html`, `favorites.html`, `favpopup_loggedin.html`,
  `search.html`, `tag:language:chinese.html`, `popular.html`, `watched.html`.

## Release and auto-update

Header metadata points both `@downloadURL` and `@updateURL` at
`https://raw.githubusercontent.com/lenchan139/xHentai-js/main/ehentai-app.user.js`.

Release flow:

```bash
npm run release        # npm version patch --no-git-tag-version + build
git add -A
git commit -m "release: vX.Y.Z"
git tag vX.Y.Z
git push origin main
git push origin vX.Y.Z
```

Then update the `vX.Y.Z` snapshot links in `README.md` (cache-free install) and
the version badge. `main` remains the auto-update source.

Raw GitHub caches `main` for a few minutes after a push. Versioned tag URLs are
the reliable immediate install path.

## Runtime architecture

### Boot

`src/99-boot.js` checks `isAppRoute(location.href)`. For owned routes it hides the
native page (`body { visibility: hidden }` + a boot spinner), clones the parsed
document (`document.cloneNode(true)`), injects styles, builds the shell, then
calls `navigate(location.href, { initial, replace, initialDoc })`. The initial
render parses the already-downloaded native HTML, so first paint does not make a
second request. `?ehx=off` always opts out.

### Routing

`classify()` in `src/10-utils.js` maps URLs to routes: `list`, `detail`,
`reader`, `toplist`, `search`, `settings`, `history`, `external`. A global click
handler intercepts same-origin links and calls `navigate()`; back/forward uses
the History API with `history.state.d` for depth. `app.navSeq` guards against
stale async renders after the user navigates again.

### Network and caching

`src/40-http-parsers.js`:

- `fetchDoc(url, { ttl, force, priority })` — same-origin `fetch` with
  `credentials: 'same-origin'`, a 35 s timeout on E-Hentai / 60 s on ExHentai,
  and an in-memory `htmlCache` (default 120 s, 70 entries).
- In-flight requests are shared; a real navigation can jump ahead of a queued
  background warm-up (`withFetchSlot`, `MAX_FETCHES = 3`).
- Login, sad-panda and Cloudflare challenge pages are never cached.
- `challengePage()` keeps the native Cloudflare interstitial visible instead of
  hiding it under the app shell.

### Parsers (`src/40-http-parsers.js`)

- `parseList(doc, base)` handles all four E-Hentai display modes:
  - **Compact** `dm_l`: `gl1c/gl2c/gl3c/gl4c`, images use `data-src`.
  - **Extended** `dm_e`: `gl1e/gl2e/gl3e/gl4e`, cover is a direct `src`.
  - **Thumbnail** `dm_t`: div-based `gl1t/gl3t/gl4t/gl5t`, no tags/uploader.
  - **Minimal** `dm_m`: `gl1m/gl2m/gl4m/gl5m`, covers inside `.glthumb`.
  - The row query is `table.itg tr, div.gl1t`, so table- and div-based layouts
    share one code path.
  - Page counts are read from the dedicated `<div>4 pages</div>`, never from
    concatenated row text (`15:10` + `4 pages` would otherwise parse as `104`).
  - The app requests Compact (`inline_set=dm_l`) because it does **not** set a
    display-mode cookie. `dm_e` rewrites the visitor's `sl` cookie, which is a
    side effect we avoid.
- `parseDetail(doc, base)` reads `#gn`/`#gj`, `#gd1` cover (img or background
  style), `#gdd` info table, `#taglist`, `#gdt` thumbnails, `.ptt` thumbnail page
  links and inline `apikey`/`apiuid`.
  - Thumbnail markup has two shapes: `<a><div style="background:url(...)"></div></a>`
    on E-Hentai and `<a><div><div style="background:url(...)"></div><div>Page N</div></div></a>`
    on ExHentai. Always select `div[style*="url("]`, not the first `div`.
- `parseReader(doc, base)` reads `img#img` (`src`, inline width/height), the
  counter, `load_image()` nav, gallery link, and the `/fullimg/` original URL.
  The served image is E-Hentai's resampled WebP (`xres=800/1280`); the original
  is only used when the reader resolution setting is `original`.

### List rendering (`src/70-list.js`)

- Favorites are warmed after launch (`schedulePreload`) and cached for five
  minutes (`FAVORITES_TTL`). A cache hit renders immediately; a weak cache hit
  (items present but no covers) is refetched.
- Renders the first 30 cards, then appends 30-card chunks via an
  `IntersectionObserver` sentinel (`rootMargin: 900px`).
- Cover URLs are preconnected per origin (deduped) before cards render.

### Detail rendering (`src/75-detail.js`)

- If the navigation came from a list card, `navigate()` passes the list item as
  `opts.gallery`. `detailPreviewHtml()` paints the known cover/title/category
  and a working **Read** button before the gallery HTML arrives; the full render
  replaces it when the fetch completes.
- The `#gdt` sprite sheet (one image per 20 pages, on a random
  `*.hath.network` host) is emitted as `data-sprite`/`data-ox`/`data-oy`.
  An `IntersectionObserver` (`rootMargin: 400px`) paints it when the grid is
  near the viewport, and an idle task also starts the paint early because the
  grid usually sits below the fold. A `new Image()` probe forces the request
  (Safari can defer offscreen CSS backgrounds) and the `.ehx-thumb-loading`
  shimmer is removed once the sheet decodes.
- The first reader page is warmed in the background with `fetchDoc(firstThumb.href)`
  after the detail page renders.
- Covers and sprites are preconnected per origin.
- Favorites and ratings reuse the site's own popup/API tokens; comments are
  sanitized before rendering.

### Reader (`src/80-reader.js`, `src/85-reader-ui.js`)

- `resolvePageUrl()` maps a page index to its `/s/<key>/<gid>-<n>` URL via the
  gallery detail pages (`?p=<thumb page>`), cached in `pageUrlCache`.
- `getReaderRecord()` fetches the `/s/` page, parses it, and keeps:
  - `src` — resampled image (default) or `/fullimg/` when
    `settings.readerResolution === 'original'`;
  - `resampled` — always the resampled URL, used as a fallback;
  - `original` — whether `src` is the original;
  - `fullUrl`, `url`, dimensions and gallery metadata.
- If an original fails to load, `loadSlot()` retries with `rec.resampled` once
  and shows a toast.
- Vertical mode builds one placeholder per page and loads via an
  `IntersectionObserver` (`rootMargin: 1400px`); paged mode builds current ±1
  slides and uses scroll-snap.
- `settings.preload` (1–4) controls `prefetchAround()`.
- Progress is saved per gallery on page change and on `pagehide`.

### Settings and storage

`DEFAULT_SETTINGS` is in `src/10-utils.js`:

```
theme         auto | dark | light
layout        grid | list
columns       2 | 3
showTags      boolean
blurCovers    boolean
readerMode    vertical | paged
readerFit     width | contain
readerResolution  auto | original
tapZones      boolean
preload       1..4
```

`localStorage` keys include `ehx.settings`, `ehx.progress`, `ehx.history`,
`ehx.searches` and the page cache. Cookies stay in the browser's cookie store.

## Site quirks and compatibility notes

- **List display modes**: Compact (`dm_l`), Minimal (`dm_m`), Extended (`dm_e`),
  Thumbnail (`dm_t`). Requesting a mode can set the `sl` cookie; `dm_l` does not.
- **Cover hosts**: E-Hentai `ehgt.org`, ExHentai `s.exhentai.org`. Both serve the
  same 250px-wide `/w/` thumbnail (about 20–35 KB). The detail page uses the same
  URL as the list; there is no larger “body” cover. The `ehgt.org` and
  `s.exhentai.org` paths are interchangeable mirrors in testing, but the app
  uses each site's own host.
- **Reader images**: `*.hath.network` with a random host and port. The server
  picks the resample (`xres=800` or `1280`). `/fullimg/...` redirects to the
  original and requires a valid session.
- **Detail thumbnails**: one sprite sheet per 20 pages on `*.hath.network`.
  ExHentai adds a wrapper div around each preview (see `parseDetail`).
- **ExHentai auth**: `igneous`, `ipb_member_id`, `ipb_pass_hash`. A stale
  `yay=louder` cookie causes the white screen/sad panda; remove ExHentai website
  data, then log in on `e-hentai.org/home.php` and reopen ExHentai.
- **Favorites**: the server-side `favorites.php` response was measured at ~11 s
  on ExHentai (DOMContentLoaded ~9 s, 22 KB transfer). This is server-bound; the
  app cannot make the first load faster, only cache it for five minutes.
- **Cloudflare**: if the challenge page is detected, the app leaves it visible.

## Performance notes (measured)

These numbers guided the current design; they are not guarantees.

- List covers: 250 px WebP, ~20–35 KB each, but 2–4 s per request and roughly
  six parallel connections. Loading 25 at once pushed the last cover to ~24 s.
  Lazy hydration (first 4 eager, rest near viewport) keeps the first screen to
  one batch.
- ExHentai covers: same 250 px size on `s.exhentai.org`, 0.5–4 s per image.
- Detail sprite: one 200px-per-page sheet per 20 pages, 413–428 KB at
  4000×300 for a 20-page range on a random `hath.network` host; 1.8–7.8 s in
  curl tests, and up to ~11 s in one Safari run. The host sends
  `cache-control: public, max-age=31536000`, so it is instant after the first
  load. This is the site's low-res preview sheet, not full page images.
  E-Hentai's account-level Thumbnail Size (Small) produces a smaller sheet.
- Reader: `/s/` HTML ~0.4 s, 1280 px WebP ~0.4–0.8 s in Safari tests.
- ExHentai `favorites.php`: ~11 s server time (see above).
- ExHentai HTML TTFB is the dominant cost and highly variable: 0.5–10 s in Safari
  and curl tests on the same machine. DNS is ~2–4 ms, TCP+TLS ~7–20 ms, and
  static assets (`/z/0381/x.css`, `/img/blank.gif`) return in ~30 ms. Dynamic
  HTML sends `cache-control: no-cache`, `age: 0`, `cf-cache-status: DYNAMIC`, so
  Cloudflare/Varnish are not caching it; each request is generated by the
  origin. A fresh session also pays a ~10 s redirect chain:
  `exhentai.org/` → `forums.e-hentai.org/remoteapi.php` → `exhentai.org/?poni=no`
  (sets `yay=louder`) → `exhentai.org/`. This is server-side and outside the
  script's control.
- ExHentai's reader supports a faster path than loading `/s/` HTML: the native
  page posts `{"method":"showpage","gid":...,"page":...,"imgkey":...,
  "showkey":...}` to `https://s.exhentai.org/api.php` (E-Hentai:
  `https://api.e-hentai.org/api.php`) and receives JSON with `i3` (image),
  `i6` (`/fullimg/`) and nav. Measured ~0.9–1.2 s per page. The current reader
  still fetches `/s/` HTML per page.

## Safari debugging harnesses

Safari 27 ships `safaridriver --mcp` (requires **Safari → Settings → Developer →
Allow Remote Automation** or `safaridriver --enable`). Register it with OpenCode:

```jsonc
"safari": {
  "type": "local",
  "command": ["/System/Cryptexes/App/usr/bin/safaridriver", "--mcp"],
  "enabled": true
}
```

The MCP automation runs an isolated session: `list_tabs` may be empty or show
only automation tabs, and it does not share the user's normal Safari profile or
cookies. For authenticated tests, set the three cookies in the automation tab
first (they are JS-visible) or log in there.

Harnesses (each spawns its own `safaridriver --mcp` stdio client):

- `test/safari.mjs` — WebDriver smoke test against local fixtures.
- `test/safari-mcp.mjs` — MCP client smoke test.
- `test/safari-app-timing.mjs` — injects the built userscript into a live
  gallery, taps Read, and prints `/s/` + image resource timings.
- `test/safari-cover-parallel.mjs` — downloads 25 list covers in parallel and
  reports per-image timings.
- `test/safari-cover-debug.mjs` — live front-page cover performance and console.
- `test/safari-detail-preview.mjs` — verifies the instant detail preview and
  deferred sprite painting.
- `test/safari-ex-preview.mjs` — logs in to ExHentai in the automation session,
  opens the wrapped-preview gallery, and checks cover + sprite loading.
- `test/safari-ex-timing.mjs` — sets ExHentai cookies, then records Safari
  Navigation Timing (`requestStart` → `responseStart`) for the front page,
  favorites and a gallery detail page.
- `test/safari-ex-thumbs.mjs` — opens an ExHentai gallery, pages the detail
  thumbnails through the app, and checks when the preview sheet is painted and
  requested.
- `test/safari-listmode-debug.mjs` — compares `dm_e` / `dm_l` markup and cookie
  side effects.
- `test/safari-favorites-debug.mjs` — kept-alive login, `yay` removal, favorites
  performance.
- `test/safari-login-debug.mjs`, `test/safari-check-user-tab.mjs`,
  `test/safari-remove-yay.mjs`, `test/safari-web-debug.mjs` — focused login,
  cookie and tab checks.

MCP `evaluate_javascript` expects a script body; use `return (...)` explicitly.
Async IIFEs are not awaited by the tool — assign the promise to `window.__x` and
poll it from Node if you need async page work.

`list_network_requests` may return no entries for some pages; prefer
`performance.getEntriesByType('resource')` inside the page.

## Design reference (JHenTai)

This is a vanilla-JS reimplementation, not a port. UX decisions were taken from:

- `lib/src/pages/layout/mobile_v2/mobile_layout_page_v2.dart` — bottom navigation,
  left drawer, lazy tab rendering.
- `lib/src/pages/layout/mobile_v2/mobile_layout_page_v2_state.dart` — tab list.
- `lib/src/widget/eh_gallery_list_card_.dart` and
  `eh_gallery_waterflow_card.dart` — card layout, category/rating chips,
  progress indicator.
- `lib/src/config/ui_config.dart` — category palette and tag namespace colors.
- `lib/src/pages/details/details_page.dart` — hero/cover, action row, info table,
  tags, comments, thumbnails.
- `lib/src/pages/read/read_page.dart` and `read/layout/*` — vertical/paged
  reading, tap zones, progress, prefetching.

Material 3 purple seed is mirrored with CSS variables (`#d0bcff` accent on
`#0f0d13`, `#6750a4` in light mode).

## Conventions for changes

1. Edit `src/`, never the built file.
2. Run `npm test` and `npm run test:ui`; add a fixture/test for parser changes.
3. Rebuild with `npm run build` and commit both source and artifact.
4. Bump `package.json` + header + `VERSION` together (use `npm run release`),
   then update the versioned links in `README.md`.
5. Keep `README.md` user-facing. Put architecture, measurements, fixtures and
   harness details in this file.
6. Do not weaken the `?ehx=off` escape hatch or hide Cloudflare/log-in pages.
7. Keep requests same-origin with the user's cookies; no proxies or telemetry.
