# E-Hentai App — a JHenTai-style mobile shell

A single-file userscript that turns **e-hentai.org** and **exhentai.org** into a fast,
app-like mobile experience. It is inspired by the UI/UX of
[JHenTai](https://github.com/jiangtian616/JHenTai) — the mobile layout, gallery cards,
detail page and reader — but it is written from scratch in plain JavaScript, with no
build step required at install time.

> Not affiliated with E-Hentai, ExHentai, or JHenTai. It is a client-side skin: all
> requests go to the real site with your own session. It does not bypass age gates,
> GP costs, or site rules.

[![Install / update](https://img.shields.io/badge/install%20%2F%20update-userscript-6750a4?style=for-the-badge)](https://raw.githubusercontent.com/lenchan139/xHentai-js/v1.0.3/ehentai-app.user.js)
[![version](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Flenchan139%2FxHentai-js%2Fv1.0.3%2Fpackage.json&query=%24.version&label=version&color=6750a4)](https://raw.githubusercontent.com/lenchan139/xHentai-js/v1.0.3/ehentai-app.user.js)
[![GitHub](https://img.shields.io/badge/GitHub-lenchan139%2FxHentai--js-181717?logo=github)](https://github.com/lenchan139/xHentai-js)

| Home | Detail | Reader |
| --- | --- | --- |
| ![Home](shots/01-home.png) | ![Detail](shots/02-detail.png) | ![Reader](shots/03-reader.png) |

---

## Features

### App shell
- Sticky top bar, **5-tab bottom navigation** (Home / Popular / Favorites / Search / More)
  and a slide-out drawer, modelled on JHenTai's `mobile_layout_page_v2`.
- Safe-area aware on iPhone (notch / home indicator), light and dark themes.
- In-app navigation with History API: back preserves the loaded gallery list, its
  infinite-scroll pages, and your scroll position.

### Gallery lists
- Card grid (2 or 3 columns) or compact list rows.
- Category badges and tag chips use the same category/namespace colors as JHenTai.
- Page counts, uploader, date, read-progress bar and `P12` resume badge.
- Category chips for Doujinshi, Manga, Artist CG, Game CG, Western, Non-H,
  Image Set, Cosplay, Asian Porn, Misc.
- Infinite scroll; refresh; optional cover blur with tap-to-reveal.
- Long lists render in 30-card batches, so very large folders stay responsive.
- Works on front page, category pages, tag pages, uploader pages, Popular, Watched,
  Favorites (including folder chips when the page exposes them) and search results.

### Gallery detail
- Full-bleed hero with blurred cover, title and Japanese title.
- One-tap actions: **Read / Continue**, Favorite, Rate, Archive, Torrent, Comments,
  Share, Original.
- Info grid (posted, language, pages, size, favorites, rating).
- Namespace-grouped tag pills, tap a tag to search it.
- Comment preview and a full comments sheet (sanitized, read-only).
- Thumbnail grid built from E-Hentai's sprite sheets, with page-range controls and
  a **Jump to page** dialog.
- Reading progress is stored per gallery, so the Read button becomes `P12` and opens
  exactly where you stopped.
- Rating uses E-Hentai's public `rategallery` API with the page's own API key.
- Favorites use the site's own favorites popup form (folder + note), submitted
  in-place; no separate server.

### Reader
- **Vertical continuous** or **paged horizontal** mode; switch inside the reader.
- Width / contain image fit, configurable preload (1–4 pages).
- Tap zones: left third = previous, right third = next, center = toggle chrome.
- Auto-hiding top/bottom chrome, page counter, range slider and jump-to-page.
- Prefetches page HTML and images; retries broken images; can open the current
  image, the original-resolution image, or the original page.
- Saves progress on every page change and on `pagehide`.
- Paged mode uses native scroll-snap, so swiping feels like a native reader.

### Search
- Keyword / tag search with E-Hentai syntax (`language:chinese`, `f:sole female`,
  `artist:shibi`, …).
- Include/exclude any of the 10 categories (`f_cats`), minimum rating, page-count
  range, torrents-only, include expunged.
- Recent searches; the Edit chip pre-fills the last query and category mask.
- Search is executed on the real site; no proxy.

### Library & settings
- Local **History** with covers, resume position and relative timestamps.
- Favorites are warmed in the background after launch and cached for five minutes, so
  the tab is instant once the warm-up completes. Reader prefetch never blocks a tab
  navigation.
- Local reading progress; clear history / progress / page cache.
- Theme (auto / dark / light), layout, columns, tag visibility, cover blur.
- Reader mode, image fit, preload and tap zones.
- Account/login state, original-site escape hatch, reset settings.

---

## Download

**Direct install snapshot — v1.0.3 (cache-free):**

<https://raw.githubusercontent.com/lenchan139/xHentai-js/v1.0.3/ehentai-app.user.js>

**Auto-update source — always `main`:**

<https://raw.githubusercontent.com/lenchan139/xHentai-js/main/ehentai-app.user.js>

> GitHub's raw CDN caches `main` for a few minutes after a push. The versioned
> snapshot above installs v1.0.3 immediately; its header still points at `main` for
> future automatic updates.

- [Install v1.0.3](https://raw.githubusercontent.com/lenchan139/xHentai-js/v1.0.3/ehentai-app.user.js)
- [Open main raw](https://raw.githubusercontent.com/lenchan139/xHentai-js/main/ehentai-app.user.js)
- [GitHub repository](https://github.com/lenchan139/xHentai-js)
- [Built file in the repository](ehentai-app.user.js)

The script has no external dependencies and uses no `GM_*` APIs, so it works in every
mainstream userscript manager.

## Install

### iPhone / iPad (Safari)

**Option A — Tampermonkey (the manager in the original request)**

1. Install **Tampermonkey** from the App Store (it is a paid app on iOS/iPadOS).
2. Open **Settings → Safari → Extensions → Tampermonkey**, enable it, and allow it
   on `e-hentai.org` and `exhentai.org`. In Safari you can also use the **AA** menu →
   **Manage Extensions**.
3. Open the [v1.0.3 install link](https://raw.githubusercontent.com/lenchan139/xHentai-js/v1.0.3/ehentai-app.user.js)
   in Safari. Tampermonkey should offer to install it. If Safari displays the script
   as text instead, open the Tampermonkey app, tap **+**, paste the contents, and save.
4. Visit `https://e-hentai.org/` (and `https://exhentai.org/` if you use it).

**Option B — Userscripts (free, open source)**

1. Install **Userscripts** from the App Store.
2. Enable it in **Settings → Safari → Extensions → Userscripts** and allow it on
   both sites.
3. In the Userscripts app, choose a scripts directory in Files (iCloud Drive or
   On My iPhone), then save the [v1.0.3 userscript](https://raw.githubusercontent.com/lenchan139/xHentai-js/v1.0.3/ehentai-app.user.js)
   into it as `ehentai-app.user.js`.
4. Reload the site in Safari.

### macOS Safari / desktop browsers
- **Safari (macOS):** install Tampermonkey from the App Store, enable it in Safari
  settings, add the script, and allow it for both domains.
- **Chrome / Edge / Firefox / Brave:** install Tampermonkey or Violentmonkey, create
  a new script, paste the file, save.

### Enable it on both domains
The script is matched separately for `e-hentai.org` and `exhentai.org`. Enabling it
for one does not enable it for the other.

---

## Auto-update

The header contains:

```js
// @downloadURL  https://raw.githubusercontent.com/lenchan139/xHentai-js/main/ehentai-app.user.js
// @updateURL    https://raw.githubusercontent.com/lenchan139/xHentai-js/main/ehentai-app.user.js
```

**Tampermonkey** checks that URL periodically and installs a newer `@version`
automatically. To force a check: Tampermonkey → **Utilities → Check for userscript
updates**. The header of the versioned install snapshot still points at `main`, so it
stays on the main-branch build after the first install.

Every push to `main` that touches `src/` runs
[`.github/workflows/build.yml`](.github/workflows/build.yml): it runs `npm ci`,
`npm test`, `npm run build`, and commits the rebuilt `ehentai-app.user.js` if it
changed. The raw URL therefore always serves the latest built artifact.

To publish a newer version:

```bash
npm run release   # bumps the patch version in package.json and rebuilds
git add package.json package-lock.json ehentai-app.user.js
git commit -m "release: vX.Y.Z"
git tag vX.Y.Z
git push && git push origin vX.Y.Z
```

`build.sh` injects the `package.json` version into both `@version` and the in-app
`VERSION` constant.

After pushing a release, update the versioned snapshot links in this README (the
`vX.Y.Z` URLs) if you want a cache-free install link for the new version; `main`
remains the auto-update source either way.

> **Userscripts (Safari iOS)** does not guarantee background update checks. Re-open
> the raw link or use the app's update/reload action. Tampermonkey is the
> auto-updating path.

---

## Logging in

Most of the app works as a guest. Favorites, watched tags and some gallery pages
need a session.

### E-Hentai
Open the drawer → **Log in**. Two methods:

- **Password:** posts to the E-Hentai forum login and returns. You briefly leave the
  app.
- **Cookie login (recommended on iPhone/iPad):** paste these three cookies from a
  browser where you are logged in:
  - `ipb_member_id`
  - `ipb_pass_hash`
  - `igneous`

  The app writes them for the current site with `path=/` and a one-year expiry.
  You can copy them on desktop with DevTools → **Application → Cookies →
  e-hentai.org**, or with a cookie-editor Safari extension.

### ExHentai
ExHentai requires the same cookies to be set for **`exhentai.org`**:

- Log in on `e-hentai.org` first, then open `exhentai.org`.
- If you still get the sad panda, use a cookie editor to set `ipb_member_id`,
  `ipb_pass_hash` and `igneous` for `exhentai.org`, then reload.
- The in-app Cookie login writes cookies for the domain it is currently running on.
  It cannot write `exhentai.org` cookies while it is running on `e-hentai.org`
  (browser security), so do it on the ExHentai side or use a cookie editor.

The **username/password** form logs into the forum and may not be enough for
ExHentai; the cookie method is the reliable one.

---

## Using it

### Navigation
- **Home:** recent galleries, category chips, grid/list toggle.
- **Popular / Favorites / Search:** bottom tabs.
- **More:** opens the drawer (Front Page, Popular, Favorites, Watched, Toplists,
  History, Settings, Login, Theme, Open original site).
- Tap a card for the detail page; tap **Read** to enter the reader.
- Browser back (including the iOS edge-swipe) returns to the previous app page.

### Reader gestures
- Tap the **center** to show/hide the chrome.
- Tap the **left/right third** to go to the previous/next page.
- Vertical mode: scroll continuously.
- Paged mode: swipe horizontally; the next page snaps into view.
- Use the range slider or the counter pill for fast navigation.
- Menu: reading mode, image fit, jump, reload, open image, gallery, original page,
  share.

### Search tips
- `language:chinese`, `language:translated`
- `artist:shibi`, `group:monyamonya`, `parody:blue archive`
- `f:sole female`, `m:sole male`
- Combine with free text; quote multi-word tags if needed.

### Escape hatch
Add `?ehx=off` to any URL to render the original site instead of the app, e.g.
`https://e-hentai.org/g/1234567/abcdef1234/?ehx=off`. The drawer's
**Open original site** does this for you.

---

## What is taken over (and what is not)

| Page | Behaviour |
| --- | --- |
| `/`, `/doujinshi`, `/manga`, `/artistcg`, `/gamecg`, `/western`, `/non-h`, `/imageset`, `/cosplay`, `/asianporn`, `/misc` | In-app list |
| `/tag/*`, `/uploader/*` | In-app list |
| `/popular`, `/watched`, `/favorites.php` | In-app list (login card when required) |
| `/toplist.php` | In-app rank list |
| `/g/<gid>/<token>/` | In-app detail |
| `/s/<key>/<gid>-<n>` | In-app reader |
| `/home.php`, `/archiver.php`, `/gallerytorrents.php`, `/torrents.php`, `/news.php`, `/bounty.php` | Original site |
| Forums, wiki, HentaiVerse, uploads | Original site |

Tag editing, comment posting, archive downloads and torrents stay on the original
site. Favorites and ratings are the two account actions implemented in-app.

---

## Design notes (what was referenced from JHenTai)

This is a vanilla-JS reimplementation, not a port. The UX decisions come from:

- `lib/src/pages/layout/mobile_v2/mobile_layout_page_v2.dart` — bottom navigation,
  left drawer, lazy tab rendering.
- `lib/src/pages/layout/mobile_v2/mobile_layout_page_v2_state.dart` — the tab list
  (Home, Search, Popular, Ranklist, Favorite, Watched, History, Download, Setting).
- `lib/src/widget/eh_gallery_list_card_.dart` and
  `eh_gallery_waterflow_card.dart` — cover + title + uploader + tags + page-count
  cards, category/rating chips, read-progress indicator.
- `lib/src/config/ui_config.dart` — the category palette
  (`Doujinshi #fc4e4e`, `Manga #fcb417`, …) and tag namespace colors.
- `lib/src/pages/details/details_page.dart` — hero/cover layout, the horizontal
  action row (Read, Download, Favorite, Rating, Archive, H2H, Similar, Torrent),
  info table, tags, comments, thumbnails.
- `lib/src/pages/read/read_page.dart` and `read/layout/*` — vertical list, paged
  horizontal and double-column reading, tap zones, progress saving, prefetching.

The Flutter app uses Material 3 with a purple seed; this script mirrors that with a
small CSS-variable theme (`#d0bcff` accent on `#0f0d13`, `#6750a4` in light mode).

---

## Privacy and security

- No third-party server, proxy, analytics or telemetry.
- Gallery/list/reader requests are plain `fetch` calls to the **current origin**, so
  they use your existing cookies.
- The only cross-origin fetch is the rating call to
  `https://api.e-hentai.org/api.php`; it is sent with `credentials: "omit"` and uses
  the API key that the gallery page itself embeds. The optional password login is a
  normal form POST to the E-Hentai forum, and external links open in a new tab.
- Settings, reading progress, history and recent searches live in `localStorage`.
  Cookies live in Safari's normal cookie store.
- Remove everything by deleting the script and clearing website data for the domain.
- Comments are sanitized before rendering (scripts, event handlers and non-HTTP
  URLs are stripped).

---

## Troubleshooting

**Blank or unstyled page**
- Confirm the URL is one of the supported routes above.
- Reload once. If it persists, check that the extension is enabled for the exact
  domain (`www.` included) and that another e-hentai userscript is not conflicting.
- Temporarily open `…?ehx=off` to use the original page.

**"This page requires you to log on"**
- Use the drawer → Log in. On iPhone, cookie login is the most reliable.

**Sad panda on ExHentai**
- Set the three cookies for `exhentai.org` (see above), or log in on E-Hentai first
  and then reload ExHentai.

**"E-Hentai is rate-limiting requests" (HTTP 509)**
- Wait a minute; lower **Preload pages** in Settings; avoid opening many galleries
  at once.

**Images fail to load**
- A failed cover now falls back to a neutral placeholder instead of a broken image.
- Tap **Retry** in the page placeholder; the app re-fetches the image page and gets a
  fresh signed URL. If it still fails, use **Original** for that page.

**Favorites feels slow**
- The app warms Favorites in the background shortly after launch and keeps a five-minute
  cache. The first load still depends on E-Hentai's own favorites query; if it is slow,
  the site is slow. Use the refresh button or open the original page. If a Cloudflare
  check appears, complete it on the original site — the app now leaves that check
  visible instead of covering it.
- **ExHentai sometimes aborts**: page fetches now wait up to 60 seconds on ExHentai
  (35 seconds on E-Hentai). If it still times out, the ExHentai HTML server is not
  responding; the reader images are on a different host and may still work. Retry or
  use the original page.
- **Covers are slow but the reader is fast**: gallery covers come from `ehgt.org`
  while reader images come from `hath.network`. The app now preconnects to `ehgt.org`,
  marks the first six covers as high-priority, and shows a shimmer placeholder while
  they load. A slow `ehgt.org` route (DNS/VPN/ISP) still limits the covers.

**Favorites form does not open**
- The site's favorites popup requires a valid session. Log in; if the popup layout
  changed, the app falls back to opening the original popup.

**Infinite scroll stops**
- The site did not provide a Next link for that page (common on Popular or when not
  logged in).

**Reader feels heavy on a very large gallery (1000+ pages)**
- It creates one placeholder per page. Use a smaller preload value; the app is aimed
  at normal galleries and phones. The original page is always available via
  **Original**.

**A script update changed the site markup**
- Parsers are isolated in `src/40-http-parsers.js`; update the selectors and run
  `npm test`.

---

## Development

The installable file is built by concatenating small source parts, so the code stays
readable:

```
src/00-header.js          userscript metadata + IIFE
src/10-utils.js           helpers, storage, route classification
src/20-icons.js           inline SVG icon set
src/30-css.js             the whole stylesheet
src/40-http-parsers.js    fetch layer + HTML parsers
src/60-app.js             app shell, router, drawer, sheets, login
src/70-list.js            gallery list page + infinite scroll
src/75-detail.js          gallery detail page + favorites/rating/comments
src/80-reader.js          reader core, layouts, progress, prefetch
src/85-reader-ui.js       reader chrome, gestures, menu, jump
src/90-pages.js           search, settings, history, toplists
src/99-boot.js            bootstrap and teardown
```

```bash
npm install          # linkedom + puppeteer-core (dev only)
npm run build        # writes ehentai-app.user.js
npm test             # 44 parser assertions against real HTML snapshots
npm run test:ui      # 46 headless-Chrome UI assertions
npm run shots        # regenerates shots/*.png (placeholder art)
npm run test:live    # optional: real-site smoke test (hits e-hentai.org)
npm run release      # bump patch version + rebuild for a new userscript release
```

- `test/fixtures/` contains saved current E-Hentai pages used by the parser and UI
  tests (front page, search, tag, detail, a 1,614-page gallery page 2, reader,
  toplist, favorites login bounce). They are test data only.
- The UI test starts a local server, rewrites `e-hentai.org` links to localhost, and
  injects the userscript with Puppeteer. It requires Google Chrome at the standard
  macOS path; adjust `executablePath` if needed.
- `npm run test:live` injects the script into the real e-hentai.org, opens the first
  gallery and the reader, and saves screenshots to `shots/live/` (gitignored).
- The GitHub Actions workflow rebuilds and commits the userscript on source pushes to
  `main`; it skips commits that only touch the built file, so there is no rebuild loop.
- Node 20+ recommended.

### Testing in Safari 27+ (local)

Safari 27 includes a built-in MCP server:

```bash
safaridriver --mcp
```

It needs a one-time **Safari → Settings → Developer → Allow Remote Automation**
(or run `safaridriver --enable` with an admin password). The server exposes
navigation, page text/DOM, screenshots, interactions, JavaScript evaluation, and
Inspector network timings.

Register it with OpenCode under `mcp.servers` in
`~/.config/opencode/opencode.jsonc`:

```jsonc
"safari": {
  "type": "local",
  "command": ["/System/Cryptexes/App/usr/bin/safaridriver", "--mcp"],
  "enabled": true
}
```

Local harnesses open a dedicated Safari tab with local fixtures and placeholder
images:

```bash
npm run test:safari       # Safari WebDriver
npm run test:safari:mcp   # Safari MCP stdio client
```

The commands fail with the “Allow Remote Automation” message until that switch is
on. Once it is, `list_network_requests` / `get_network_request` can measure the
real `favorites.php` and `ehgt.org` request timings in Safari.

---

## Credits

- [JHenTai](https://github.com/jiangtian616/JHenTai) by jiangtian616 (Apache-2.0) —
  the UX and color reference. No Flutter code is included here.
- E-Hentai / ExHentai for the site and public API.
- Icon paths are hand-written in a Lucide-style stroke language.

## License

MIT — see [LICENSE](LICENSE).
