// ==UserScript==
// @name         E-Hentai App — JHenTai-style mobile UX
// @namespace    ehentai-app-userscript
// @version      1.1.2
// @description  Turns e-hentai.org / exhentai.org into a fast, native-feeling mobile app: gallery grid, detail page, reader, search, favorites, history and settings.
// @author       E-Hentai App contributors
// @license      MIT
// @homepageURL  https://github.com/lenchan139/xHentai-js
// @supportURL   https://github.com/lenchan139/xHentai-js/issues
// @downloadURL  https://raw.githubusercontent.com/lenchan139/xHentai-js/main/ehentai-app.user.js
// @updateURL    https://raw.githubusercontent.com/lenchan139/xHentai-js/main/ehentai-app.user.js
// @match        https://e-hentai.org/*
// @match        https://www.e-hentai.org/*
// @match        https://exhentai.org/*
// @match        https://www.exhentai.org/*
// @run-at       document-start
// @grant        none
// @noframes
// ==/UserScript==

/*
 * Works in Userscripts (Safari iOS/macOS), Tampermonkey, Violentmonkey and
 * other userscript managers. No external dependencies, no GM_* APIs.
 *
 * The script only takes over the pages it knows how to render:
 *   /, category pages, /tag/*, /uploader/*, /popular, /watched,
 *   /favorites.php, /toplist.php, /g/<gid>/<token>/, /s/<key>/<gid>-<n>
 * Every other page is left untouched.
 */
(() => {
  'use strict';

  // Never run inside iframes (ad frames, popups, etc.).
  if (window.top !== window.self) return;
  // ---------------------------------------------------------------------------
  // Constants & tiny helpers
  // ---------------------------------------------------------------------------

  const VERSION = '1.1.2';
  const LS = 'ehx.';
  const APP_ID = 'ehx-app';
  const IS_EX = /(^|\.)exhentai\.org$/i.test(location.hostname);
  const SITE_NAME = IS_EX ? 'ExHentai' : 'E-Hentai';

  const CATEGORY_PATHS = {
    '/doujinshi': 'Doujinshi',
    '/manga': 'Manga',
    '/artistcg': 'Artist CG',
    '/gamecg': 'Game CG',
    '/western': 'Western',
    '/non-h': 'Non-H',
    '/imageset': 'Image Set',
    '/cosplay': 'Cosplay',
    '/asianporn': 'Asian Porn',
    '/misc': 'Misc',
  };
  const CATEGORY_ORDER = [
    'Doujinshi', 'Manga', 'Artist CG', 'Game CG', 'Western',
    'Non-H', 'Image Set', 'Cosplay', 'Asian Porn', 'Misc',
  ];
  const CATEGORY_COLORS = {
    'Doujinshi': '#fc4e4e',
    'Manga': '#fcb417',
    'Image Set': '#5050d7',
    'Game CG': '#05bf0b',
    'Artist CG': '#dde500',
    'Cosplay': '#9755f5',
    'Non-H': '#68c9de',
    'Asian Porn': '#fe93ff',
    'Western': '#14e723',
    'Misc': '#9e9e9e',
  };
  const TAG_ORDER = ['language', 'parody', 'character', 'group', 'artist', 'female', 'male', 'mixed', 'other', 'location'];

  const DEFAULT_SETTINGS = {
    theme: 'auto',          // auto | dark | light
    layout: 'grid',         // grid | list
    columns: 2,             // 2 | 3
    showTags: true,
    blurCovers: false,
    readerMode: 'vertical', // vertical | paged
    readerFit: 'width',     // width | contain
    readerResolution: 'auto', // auto (site-resampled) | original (fullimg)
    tapZones: true,
    preload: 2,
  };

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  const text = (el) => (el ? (el.textContent || '').replace(/\s+/g, ' ').trim() : '');
  const num = (v) => {
    const n = parseInt(String(v == null ? '' : v).replace(/[^\d-]/g, ''), 10);
    return Number.isFinite(n) ? n : null;
  };
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

  function absUrl(u, base) {
    if (!u) return '';
    try {
      return new URL(u, base || location.href).href;
    } catch {
      return '';
    }
  }
  function sameOrigin(u) {
    try {
      return new URL(u, location.href).origin === location.origin;
    } catch {
      return false;
    }
  }
  function safeImage(u) {
    const v = absUrl(u);
    return /^https?:\/\//i.test(v) ? v : '';
  }
  function debounce(fn, ms) {
    let t = 0;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  }
  function throttleRaf(fn) {
    let queued = false;
    return (...args) => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        fn(...args);
      });
    };
  }
  const formatNum = (n) => (n == null ? '' : Number(n).toLocaleString('en-US'));

  function parseQuery(url) {
    try {
      return new URL(url, location.href).searchParams;
    } catch {
      return new URLSearchParams();
    }
  }
  function currentUrl() {
    return location.origin + location.pathname + location.search + location.hash;
  }

  // ---------------------------------------------------------------------------
  // Storage
  // ---------------------------------------------------------------------------

  const store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(LS + key);
        return raw == null ? fallback : JSON.parse(raw);
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(LS + key, JSON.stringify(value));
      } catch {
        /* quota / private mode */
      }
      return value;
    },
    del(key) {
      try { localStorage.removeItem(LS + key); } catch { /* noop */ }
    },
  };

  const storedSettings = store.get('settings', {});
  const settings = Object.assign({}, DEFAULT_SETTINGS, storedSettings && typeof storedSettings === 'object' ? storedSettings : {});

  function saveSettings(patch) {
    Object.assign(settings, patch || {});
    store.set('settings', settings);
    applyTheme();
  }

  function applyTheme() {
    const root = document.documentElement;
    const mode = settings.theme;
    const dark = mode === 'dark' || (mode === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
    root.dataset.ehxTheme = dark ? 'dark' : 'light';
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#0f0d13' : '#f7f3fa');
  }

  // Reading progress / history -------------------------------------------------
  const progressStore = {
    key(gid) { return 'progress.' + gid; },
    get(gid) { return store.get(this.key(gid), null); },
    set(gid, data) {
      store.set(this.key(gid), Object.assign({ gid, updated: Date.now() }, data));
      historyStore.touch(Object.assign({ gid }, data));
    },
    remove(gid) { store.del(this.key(gid)); },
    clearAll() {
      try {
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith(LS + 'progress.')) keys.push(k);
        }
        for (const k of keys) localStorage.removeItem(k);
      } catch { /* private mode */ }
    },
    all() {
      const out = [];
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith(LS + 'progress.')) {
            try { out.push(JSON.parse(localStorage.getItem(k))); } catch { /* noop */ }
          }
        }
      } catch { /* private mode */ }
      return out.sort((a, b) => (b.updated || 0) - (a.updated || 0));
    },
  };

  const historyStore = {
    key: 'history',
    list() { return store.get(this.key, []); },
    touch(entry) {
      if (!entry || !entry.gid) return;
      const list = this.list().filter((x) => String(x.gid) !== String(entry.gid));
      list.unshift(Object.assign({}, entry, { updated: Date.now() }));
      store.set(this.key, list.slice(0, 120));
    },
    remove(gid) { store.set(this.key, this.list().filter((x) => String(x.gid) !== String(gid))); },
    clear() { store.set(this.key, []); },
  };

  // In-memory caches -----------------------------------------------------------
  const htmlCache = new Map();       // url -> { at, doc, text, url }
  const pageUrlCache = new Map();    // `${gid}:${idx}` -> absolute page URL

  function clearRuntimeCaches() {
    htmlCache.clear();
    pageUrlCache.clear();
    try { favoritesCache.clear(); } catch { /* not initialised yet */ }
    store.del('favorites');
    persistClear();
  }

  // ---------------------------------------------------------------------------
  // Route classification
  // ---------------------------------------------------------------------------

  const LIST_ROUTES = new Set(['/popular', '/watched', '/favorites.php']);

  function classify(url) {
    let u;
    try { u = new URL(url, location.href); } catch { return { name: 'external' }; }
    const p = u.pathname.replace(/\/+$/, '') || '/';

    // Escape hatch: ?ehx=off always lets the original site render.
    if (u.searchParams.get('ehx') === 'off') return { name: 'external', url: u.href };

    // Internal app pages that do not exist on the site itself.
    if (u.hash === '#ehx-search') return { name: 'search', url: u.href };
    if (u.hash === '#ehx-settings') return { name: 'settings', url: u.href };
    if (u.hash === '#ehx-history') return { name: 'history', url: u.href };

    let m = p.match(/^\/s\/[0-9a-f]+\/(\d+)-(\d+)$/i);
    if (m) {
      return { name: 'reader', gid: m[1], index: parseInt(m[2], 10), url: u.href };
    }
    m = p.match(/^\/g\/(\d+)\/([0-9a-f]+)$/i);
    if (m) {
      return { name: 'detail', gid: m[1], token: m[2], url: u.href };
    }
    if (p === '/toplist.php') return { name: 'toplist', url: u.href };
    if (LIST_ROUTES.has(p)) return { name: 'list', kind: p.slice(1), url: u.href };
    if (p === '/' || p === '/index.php') return { name: 'list', kind: 'home', url: u.href };
    if (p.startsWith('/tag/')) return { name: 'list', kind: 'tag', tag: decodeURIComponent(p.slice(5)).replace(/\+/g, ' '), url: u.href };
    if (p.startsWith('/uploader/')) return { name: 'list', kind: 'uploader', uploader: decodeURIComponent(p.slice(10)).replace(/\+/g, ' '), url: u.href };
    if (CATEGORY_PATHS[p]) return { name: 'list', kind: 'category', category: CATEGORY_PATHS[p], url: u.href };

    return { name: 'external', url: u.href };
  }

  function isAppRoute(url) {
    return classify(url).name !== 'external';
  }

  // Where the user is relative to the 5 bottom tabs.
  function tabOfRoute(route, url) {
    if (!route) return 'home';
    if (route.name === 'reader') return 'none';
    if (route.name === 'detail') return 'home';
    if (route.name === 'search') return 'more';
    if (route.name === 'settings' || route.name === 'history' || route.name === 'toplist') return 'more';
    if (route.kind === 'popular') return 'popular';
    if (route.kind === 'favorites.php') return 'favorites';
    if (route.kind === 'watched') return 'watched';
    const q = parseQuery(url || location.href);
    if (q.get('f_search')) return 'search';
    return 'home';
  }
  // ---------------------------------------------------------------------------
  // Inline SVG icon set (Lucide-style, 24x24, currentColor)
  // ---------------------------------------------------------------------------

  const ICON_PATHS = {
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9 21v-7h6v7"/>',
    popular: '<path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/>',
    heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4.3-4.3"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    back: '<path d="m15 18-6-6 6-6"/>',
    forward: '<path d="m9 18 6-6-6-6"/>',
    more: '<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/>',
    star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9Z"/>',
    download: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M4 19h16"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 8a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
    share: '<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.8 7.6-4.4M8.2 13.2l7.6 4.4"/>',
    tag: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z"/><circle cx="7.5" cy="7.5" r="1.2"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    trash: '<path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 14h10l1-14"/><path d="M10 11v6M14 11v6"/>',
    external: '<path d="M14 4h6v6"/><path d="M20 4 10 14"/><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><circle cx="12" cy="7.5" r="1"/>',
    book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5Z"/><path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20"/>',
    comment: '<path d="M21 12a8 8 0 0 1-8 8H4l2-3a8 8 0 1 1 15-5Z"/>',
    bookmark: '<path d="M6 3h12v18l-6-4-6 4Z"/>',
    sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h10M18 18h2"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="16" cy="18" r="2"/>',
    arrowUp: '<path d="M12 19V5"/><path d="m6 11 6-6 6 6"/>',
    arrowDown: '<path d="M12 5v14"/><path d="m6 13 6 6 6-6"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m21 16-5-5-8 8"/>',
    folder: '<path d="M3 6h6l2 2h10v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"/>',
    thumbs: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    jump: '<path d="M4 12h16"/><path d="m14 6 6 6-6 6"/>',
    rotate: '<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/>',
    cloud: '<path d="M7 18a4 4 0 0 1-.5-8A6 6 0 0 1 18 9a4.5 4.5 0 0 1 .5 9Z"/>',
    bolt: '<path d="M13 2 4 14h6l-1 8 9-12h-6Z"/>',
    filter: '<path d="M4 5h16l-6 7v6l-4 2v-8Z"/>',
    downloadCloud: '<path d="M7 18a4 4 0 0 1-.5-8A6 6 0 0 1 18 9a4.5 4.5 0 0 1 .5 9"/><path d="M12 12v8"/><path d="m8.5 16.5 3.5 3.5 3.5-3.5"/>',
    login: '<path d="M14 4h5a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-5"/><path d="M10 8l4 4-4 4"/><path d="M14 12H3"/>',
    history: '<path d="M3 12a9 9 0 1 0 2.6-6.4"/><path d="M3 4v5h5"/><path d="M12 7v5l3 2"/>',
  };

  function icon(name, size = 22, cls = '') {
    const p = ICON_PATHS[name] || ICON_PATHS.info;
    return `<svg class="ehx-i ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  }
  // ---------------------------------------------------------------------------
  // Stylesheet
  // ---------------------------------------------------------------------------

  const CSS = `
  :root{
    color-scheme:dark;
    --tabh:60px;
    --radius:16px;
    --radius-sm:11px;
    --bg:#0f0d13;
    --bg-soft:#151219;
    --card:#1b1721;
    --card2:#241f2c;
    --text:#eee8f4;
    --muted:#a79db3;
    --muted2:#7d7488;
    --line:rgba(255,255,255,.085);
    --accent:#d0bcff;
    --accent-ink:#241a3a;
    --accent2:#6750a4;
    --danger:#ff6f86;
    --ok:#71d69b;
    --shimmer:#2a2433;
    --tag-bg:#2b2734;
    --tag-fg:#c9c2d6;
    --tag-watched-bg:#173a5e;
    --tag-watched-fg:#8ec5ff;
    --tag-watched-line:rgba(88,166,255,.45);
    --shadow:0 8px 26px rgba(0,0,0,.35);
    --sat:env(safe-area-inset-top,0px);
    --sab:env(safe-area-inset-bottom,0px);
    --sal:env(safe-area-inset-left,0px);
    --sar:env(safe-area-inset-right,0px);
  }
  :root[data-ehx-theme="light"]{
    color-scheme:light;
    --bg:#f7f3fa;
    --bg-soft:#f1ebf7;
    --card:#ffffff;
    --card2:#f4eef9;
    --text:#1d1b20;
    --muted:#5f5967;
    --muted2:#8b8494;
    --line:rgba(20,10,40,.10);
    --accent:#6750a4;
    --accent-ink:#ffffff;
    --accent2:#d0bcff;
    --danger:#c33a52;
    --ok:#25824d;
    --shimmer:#e9e1f2;
    --tag-bg:#ece6f3;
    --tag-fg:#4a4354;
    --tag-watched-bg:#dbeafe;
    --tag-watched-fg:#1d4ed8;
    --tag-watched-line:#93c5fd;
    --shadow:0 8px 24px rgba(50,20,90,.12);
  }
  *,*::before,*::after{box-sizing:border-box}
  html,body{
    margin:0!important;padding:0!important;width:auto!important;min-width:0!important;
    background:var(--bg)!important;color:var(--text)!important;
    text-align:left!important;font-size:15px!important;
    font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif!important;
    -webkit-text-size-adjust:100%;text-size-adjust:100%;
    -webkit-tap-highlight-color:transparent;
  }
  html{scroll-behavior:auto;overflow-x:hidden}
  body{overflow-x:hidden}
  a{color:inherit;text-decoration:none}
  img{max-width:100%}
  button,input,select,textarea{font:inherit;color:inherit}
  button{border:0;background:none;padding:0;cursor:pointer}
  ::selection{background:var(--accent);color:var(--accent-ink)}
  .ehx-i{display:block;flex:0 0 auto}

  #${APP_ID}{
    overflow-x:hidden;
    min-height:100vh;
    min-height:100dvh;
    display:flex;flex-direction:column;
    padding-bottom:calc(var(--tabh) + var(--sab) + 8px);
    background:var(--bg);
  }
  #${APP_ID}.ehx-no-tabbar{padding-bottom:0}

  /* ---------- Top bar ---------- */
  .ehx-topbar{
    position:sticky;top:0;z-index:40;
    display:flex;align-items:center;gap:10px;
    padding:calc(var(--sat) + 9px) calc(12px + var(--sar)) 9px calc(12px + var(--sal));
    background:rgba(15,13,19,.86);
    -webkit-backdrop-filter:blur(18px) saturate(160%);
    backdrop-filter:blur(18px) saturate(160%);
    border-bottom:1px solid var(--line);
  }
  :root[data-ehx-theme="light"] .ehx-topbar{background:rgba(247,243,250,.88)}
  .ehx-topbar.ehx-transparent{background:transparent;border-bottom:0;backdrop-filter:none;-webkit-backdrop-filter:none}
  .ehx-title{font-size:17px;font-weight:700;letter-spacing:-.01em;line-height:1.15;min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .ehx-brand{display:flex;align-items:center;gap:9px;flex:1;min-width:0}
  .ehx-logo{
    width:32px;height:32px;border-radius:10px;flex:0 0 auto;
    display:grid;place-items:center;font-weight:900;font-size:15px;
    color:var(--accent-ink);background:linear-gradient(145deg,var(--accent),var(--accent2));
    box-shadow:0 4px 14px rgba(103,80,164,.35);
  }
  .ehx-brandname{font-size:17px;font-weight:800;letter-spacing:-.02em;line-height:1.05}
  .ehx-brandsub{font-size:10.5px;color:var(--muted2);font-weight:600;letter-spacing:.06em;text-transform:uppercase;margin-top:1px}
  .ehx-iconbtn{
    width:40px;height:40px;border-radius:50%;display:grid;place-items:center;
    color:var(--text);flex:0 0 auto;transition:background .15s ease,transform .12s ease;
  }
  .ehx-iconbtn:active{background:var(--card2);transform:scale(.94)}
  .ehx-iconbtn.ehx-small{width:34px;height:34px}
  .ehx-iconbtn[disabled]{opacity:.35;pointer-events:none}
  .ehx-topbar .ehx-iconbtn{margin:-5px 0}

  /* ---------- Generic ---------- */
  .ehx-main{flex:1;min-width:0}
  .ehx-pad{padding-left:calc(12px + var(--sal));padding-right:calc(12px + var(--sar))}
  .ehx-muted{color:var(--muted)}
  .ehx-dim{color:var(--muted2)}
  .ehx-row{display:flex;align-items:center;gap:8px}
  .ehx-grow{flex:1;min-width:0}
  .ehx-center{display:grid;place-items:center}
  .ehx-divider{height:1px;background:var(--line);margin:14px 0}
  .ehx-nowrap{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

  .ehx-btn{
    display:inline-flex;align-items:center;justify-content:center;gap:7px;
    height:42px;padding:0 18px;border-radius:999px;font-size:14px;font-weight:650;
    background:var(--card2);color:var(--text);border:1px solid var(--line);
    transition:transform .12s ease,opacity .12s ease;
  }
  .ehx-btn:active{transform:scale(.97);opacity:.9}
  .ehx-btn-primary{background:var(--accent);color:var(--accent-ink);border-color:transparent;box-shadow:0 6px 18px rgba(103,80,164,.28)}
  .ehx-btn-danger{color:var(--danger)}
  .ehx-btn-block{display:flex;width:100%}
  .ehx-btn[disabled]{opacity:.45;pointer-events:none}

  .ehx-pill{
    display:inline-flex;align-items:center;gap:5px;
    height:27px;padding:0 10px;border-radius:999px;
    background:var(--card2);border:1px solid var(--line);
    font-size:11.5px;font-weight:650;color:var(--muted);white-space:nowrap;
  }

  /* ---------- Category chips ---------- */
  .ehx-chips{
    display:flex;gap:7px;overflow-x:auto;padding:10px calc(12px + var(--sar)) 10px calc(12px + var(--sal));
    scrollbar-width:none;-ms-overflow-style:none;
    -webkit-overflow-scrolling:touch;
  }
  .ehx-chips::-webkit-scrollbar{display:none}
  .ehx-chip{
    flex:0 0 auto;height:32px;padding:0 13px;border-radius:999px;
    display:inline-flex;align-items:center;gap:6px;
    background:var(--card);border:1px solid var(--line);
    font-size:12.5px;font-weight:650;color:var(--muted);
    transition:background .15s,color .15s,border-color .15s;
  }
  .ehx-chip:active{transform:scale(.97)}
  .ehx-chip.ehx-active{background:var(--accent);color:var(--accent-ink);border-color:transparent}
  .ehx-chip .ehx-dot{width:6px;height:6px;border-radius:50%;background:currentColor;opacity:.9}

  /* ---------- Gallery cards ---------- */
  .ehx-grid{
    display:grid;grid-template-columns:repeat(var(--ehx-cols,2),minmax(0,1fr));
    gap:12px;padding:2px calc(12px + var(--sar)) 26px calc(12px + var(--sal));
  }
  .ehx-grid.ehx-listmode{grid-template-columns:1fr;gap:9px}
  .ehx-card{
    position:relative;background:var(--card);border-radius:var(--radius);
    overflow:hidden;border:1px solid var(--line);
    box-shadow:0 4px 16px rgba(0,0,0,.16);
    transition:transform .14s ease;
  }
  .ehx-card:active{transform:scale(.985)}
  .ehx-cover{position:relative;aspect-ratio:3/4;overflow:hidden;background:var(--card2)}
  .ehx-cover.ehx-cover-loading{
    background:linear-gradient(100deg,var(--card2) 20%,var(--shimmer) 40%,var(--card2) 60%);
    background-size:200% 100%;animation:ehx-shimmer 1.6s linear infinite}
  .ehx-cover img{width:100%;height:100%;object-fit:cover;display:block;background:var(--card2)}
  .ehx-cover-fallback{position:absolute;inset:0;display:grid;place-items:center;color:var(--muted2);background:var(--card2)}
  .ehx-cover:after{content:"";position:absolute;inset:auto 0 0 0;height:42%;background:linear-gradient(180deg,transparent,rgba(0,0,0,.52));pointer-events:none}
  .ehx-badge{
    position:absolute;z-index:2;display:inline-flex;align-items:center;gap:4px;
    height:21px;padding:0 7px;border-radius:6px;font-size:10px;font-weight:800;
    letter-spacing:.02em;color:#fff;background:rgba(0,0,0,.62);
    -webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);
  }
  .ehx-badge.ehx-cat{left:7px;top:7px;text-transform:uppercase;background:var(--catcolor,#777);color:#120d18}
  .ehx-badge.ehx-pages{right:7px;bottom:7px;background:rgba(0,0,0,.7)}
  .ehx-badge.ehx-lang{right:7px;bottom:7px;background:rgba(0,0,0,.7)}
  .ehx-badge.ehx-resume{left:7px;bottom:7px;background:var(--accent);color:var(--accent-ink)}
  .ehx-cover-blur{filter:blur(14px) saturate(.8);transform:scale(1.08)}
  .ehx-card-body{padding:9px 10px 10px}
  .ehx-card-title{
    font-size:13px;font-weight:650;line-height:1.28;letter-spacing:-.005em;
    display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;
    min-height:2.56em;
  }
  .ehx-card-sub{margin-top:4px;font-size:11px;color:var(--muted);display:flex;align-items:center;gap:5px;min-width:0}
  .ehx-card-sub .ehx-nowrap{min-width:0}
  .ehx-card-tags{display:flex;flex-wrap:wrap;gap:4px;overflow:hidden;margin-top:6px;max-height:42px;align-content:flex-start}
  .ehx-tag{
    display:inline-flex;align-items:center;height:19px;padding:0 6px;border-radius:5px;
    font-size:9.5px;font-weight:700;white-space:nowrap;
    background:var(--tag-bg);color:var(--tag-fg);
  }
  .ehx-tag.ehx-tag-watched{background:var(--tag-watched-bg);color:var(--tag-watched-fg)}
  .ehx-card-foot{display:flex;align-items:center;gap:6px;margin-top:6px;font-size:10.5px;color:var(--muted2)}
  .ehx-rating{display:inline-flex;align-items:center;gap:2px;color:#f5c451;font-weight:700;font-size:10.5px}
  .ehx-rating .ehx-i{width:11px;height:11px}
  .ehx-stars{display:none;gap:1px}
  .ehx-listmode .ehx-stars{display:inline-flex}
  .ehx-listmode .ehx-rating-compact{display:none}
  .ehx-star{display:inline-flex;opacity:.24}
  .ehx-star.ehx-star-on{opacity:1}
  .ehx-star.ehx-star-on svg{fill:currentColor}
  .ehx-progress{position:absolute;left:0;right:0;bottom:0;height:3px;background:rgba(255,255,255,.18);z-index:3}
  .ehx-progress>i{display:block;height:100%;background:var(--accent)}
  .ehx-hidden-tag{display:none}
  .ehx-reveal{
    position:absolute;inset:0;z-index:4;display:grid;place-items:center;gap:6px;
    background:rgba(10,8,14,.55);color:#fff;font-size:11px;font-weight:700;
  }
  .ehx-reveal .ehx-i{opacity:.9}

  /* list mode */
  .ehx-listmode .ehx-card{display:flex;align-items:stretch;min-height:140px}
  .ehx-listmode .ehx-cover{width:108px;aspect-ratio:3/4;flex:0 0 auto;border-radius:0}
  .ehx-listmode .ehx-cover:after{display:none}
  .ehx-listmode .ehx-card-body{flex:1;min-width:0;padding:11px 12px;display:flex;flex-direction:column;justify-content:flex-start;gap:3px}
  .ehx-listmode .ehx-card-title{min-height:0;-webkit-line-clamp:2}
  .ehx-listmode .ehx-card-tags{max-height:66px}
  .ehx-listmode .ehx-badge.ehx-cat{font-size:9px;height:18px;left:5px;top:5px}
  .ehx-listmode .ehx-badge.ehx-pages{right:5px;bottom:5px}
  .ehx-listmode .ehx-badge.ehx-lang{right:5px;bottom:5px}

  /* ---------- Skeletons / states ---------- */
  .ehx-skel{background:linear-gradient(100deg,var(--card) 20%,var(--card2) 40%,var(--card) 60%);background-size:200% 100%;animation:ehx-shimmer 1.25s infinite linear;border-radius:var(--radius)}
  @keyframes ehx-shimmer{to{background-position:-200% 0}}
  .ehx-skel-card{height:260px;border-radius:var(--radius)}
  .ehx-empty{padding:64px 26px;text-align:center;color:var(--muted)}
  .ehx-empty .ehx-i{margin:0 auto 12px;opacity:.55}
  .ehx-empty h3{margin:0 0 6px;font-size:16px;color:var(--text)}
  .ehx-empty p{margin:0 0 18px;font-size:13px;line-height:1.5}
  .ehx-error{padding:40px 22px;text-align:center}
  .ehx-error p{color:var(--muted);font-size:13px;line-height:1.5;margin:0 0 16px}
  .ehx-spinner{
    width:26px;height:26px;border-radius:50%;
    border:2.5px solid var(--line);border-top-color:var(--accent);
    animation:ehx-spin .8s linear infinite;margin:0 auto;
  }
  @keyframes ehx-spin{to{transform:rotate(360deg)}}
  .ehx-loading{padding:28px;display:grid;place-items:center}
  .ehx-loading-label{display:flex;align-items:center;justify-content:center;gap:9px;padding:14px 16px 4px;font-size:12px;font-weight:650;color:var(--muted)}
  .ehx-loading-label .ehx-spinner{width:16px;height:16px;border-width:2px;margin:0}
  .ehx-top-load{position:fixed;top:0;left:0;right:0;height:2px;z-index:200;background:transparent;overflow:hidden}
  .ehx-top-load:after{content:"";display:block;width:38%;height:100%;background:var(--accent);animation:ehx-load 1.1s ease-in-out infinite}
  @keyframes ehx-load{0%{transform:translateX(-110%)}100%{transform:translateX(320%)}}

  /* ---------- Bottom tab bar ---------- */
  .ehx-tabbar{
    position:fixed;left:0;right:0;bottom:0;z-index:50;
    display:flex;align-items:stretch;
    padding:6px calc(6px + var(--sar)) calc(6px + var(--sab)) calc(6px + var(--sal));
    background:rgba(15,13,19,.92);
    -webkit-backdrop-filter:blur(20px) saturate(170%);backdrop-filter:blur(20px) saturate(170%);
    border-top:1px solid var(--line);
  }
  :root[data-ehx-theme="light"] .ehx-tabbar{background:rgba(255,255,255,.92)}
  .ehx-tab{
    flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;
    min-height:48px;border-radius:12px;color:var(--muted2);font-size:9.5px;font-weight:650;
    transition:color .15s,background .15s;
  }
  .ehx-tab .ehx-i{width:23px;height:23px}
  .ehx-tab span{white-space:nowrap}
  .ehx-tab.ehx-active{color:var(--accent)}
  .ehx-tab:active{background:var(--card2)}
  .ehx-tab.ehx-active .ehx-i{filter:drop-shadow(0 0 8px rgba(208,188,255,.45))}

  /* ---------- Drawer ---------- */
  .ehx-scrim{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:90;opacity:0;pointer-events:none;transition:opacity .2s ease;-webkit-backdrop-filter:blur(2px);backdrop-filter:blur(2px)}
  .ehx-scrim.ehx-show{opacity:1;pointer-events:auto}
  .ehx-drawer{
    position:fixed;top:0;bottom:0;left:0;z-index:100;width:min(84vw,320px);
    background:var(--bg-soft);border-right:1px solid var(--line);
    transform:translateX(-102%);pointer-events:none;transition:transform .24s cubic-bezier(.2,.8,.2,1);
    display:flex;flex-direction:column;
    padding:calc(var(--sat) + 16px) 10px calc(var(--sab) + 14px) 10px;
    box-shadow:24px 0 60px rgba(0,0,0,.4);
  }
  .ehx-drawer.ehx-open{transform:translateX(0);pointer-events:auto}
  .ehx-drawer-head{display:flex;align-items:center;gap:11px;padding:8px 12px 16px}
  .ehx-avatar{width:46px;height:46px;border-radius:50%;display:grid;place-items:center;background:var(--card2);border:1px solid var(--line);color:var(--accent)}
  .ehx-drawer-name{font-size:14px;font-weight:750;line-height:1.2}
  .ehx-drawer-sub{font-size:11px;color:var(--muted2);margin-top:2px}
  .ehx-drawer-list{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch}
  .ehx-drawer-item{
    display:flex;align-items:center;gap:12px;width:100%;
    padding:12px 13px;border-radius:12px;font-size:14px;font-weight:600;color:var(--text);
    text-align:left;
  }
  .ehx-drawer-item .ehx-i{color:var(--muted)}
  .ehx-drawer-item.ehx-active{background:var(--card2);color:var(--accent)}
  .ehx-drawer-item.ehx-active .ehx-i{color:var(--accent)}
  .ehx-drawer-item:active{background:var(--card2)}
  .ehx-drawer-sep{height:1px;background:var(--line);margin:8px 10px}
  .ehx-drawer-foot{padding:8px 12px;font-size:10px;color:var(--muted2);line-height:1.5}

  /* ---------- Detail ---------- */
  .ehx-detail{min-height:60vh}
  .ehx-dhero{position:relative;overflow:hidden;padding:calc(var(--sat) + 0px) 0 0}
  .ehx-dhero-bg{position:absolute;inset:-30px;background-size:cover;background-position:center;filter:blur(30px) saturate(1.25);opacity:.55;transform:scale(1.12)}
  .ehx-dhero-shade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(15,13,19,.20) 0%,rgba(15,13,19,.55) 55%,var(--bg) 100%)}
  :root[data-ehx-theme="light"] .ehx-dhero-shade{background:linear-gradient(180deg,rgba(247,243,250,.15),rgba(247,243,250,.65) 55%,var(--bg) 100%)}
  .ehx-dhero-inner{position:relative;z-index:2;padding:42px calc(14px + var(--sar)) 6px calc(14px + var(--sal));display:flex;gap:14px;align-items:flex-end}
  .ehx-dcover{
    width:126px;flex:0 0 auto;aspect-ratio:3/4;border-radius:14px;overflow:hidden;
    background:var(--card2);box-shadow:0 14px 34px rgba(0,0,0,.5);border:1px solid rgba(255,255,255,.14);
  }
  .ehx-dcover img{width:100%;height:100%;object-fit:cover;display:block}
  .ehx-dhead{flex:1;min-width:0;padding-bottom:2px}
  .ehx-dtitle{font-size:17px;font-weight:800;line-height:1.22;letter-spacing:-.02em;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;text-shadow:0 1px 14px rgba(0,0,0,.45)}
  .ehx-dsub{margin-top:6px;font-size:11.5px;color:var(--muted);line-height:1.3;display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden}
  .ehx-dmeta{display:flex;flex-wrap:wrap;gap:6px;margin-top:9px}
  .ehx-dstats{display:flex;flex-wrap:wrap;gap:10px;padding:4px calc(14px + var(--sal)) 0 calc(14px + var(--sar));position:relative;z-index:2;font-size:11.5px;color:var(--muted)}
  .ehx-dstats b{color:var(--text);font-weight:700}
  .ehx-actions{
    display:flex;gap:9px;overflow-x:auto;padding:14px calc(14px + var(--sar)) 6px calc(14px + var(--sal));
    scrollbar-width:none;-webkit-overflow-scrolling:touch;
  }
  .ehx-actions::-webkit-scrollbar{display:none}
  .ehx-action{
    flex:0 0 auto;width:66px;display:flex;flex-direction:column;align-items:center;gap:5px;
    color:var(--muted);font-size:10px;font-weight:650;
  }
  .ehx-action .ehx-abox{
    width:50px;height:44px;border-radius:13px;display:grid;place-items:center;
    background:var(--card);border:1px solid var(--line);color:var(--text);
    transition:transform .12s,background .15s;
  }
  .ehx-action:active .ehx-abox{transform:scale(.94);background:var(--card2)}
  .ehx-action.ehx-primary .ehx-abox{background:var(--accent);color:var(--accent-ink);border-color:transparent;box-shadow:0 6px 18px rgba(103,80,164,.3)}
  .ehx-action.ehx-primary{color:var(--accent)}
  .ehx-action[disabled]{opacity:.4;pointer-events:none}

  .ehx-section{padding:8px calc(14px + var(--sar)) 4px calc(14px + var(--sal))}
  .ehx-section-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:12px 0 9px}
  .ehx-section-title{font-size:13px;font-weight:800;letter-spacing:.02em;text-transform:uppercase;color:var(--muted)}
  .ehx-section-title span{color:var(--muted2);font-weight:600;text-transform:none;letter-spacing:0}

  .ehx-info{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
  .ehx-info-item{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:9px 11px;min-width:0}
  .ehx-info-k{font-size:10px;color:var(--muted2);font-weight:700;text-transform:uppercase;letter-spacing:.05em}
  .ehx-info-v{font-size:12.5px;font-weight:650;margin-top:2px;line-height:1.3;word-break:break-word}

  .ehx-taggroup{margin:0 0 10px}
  .ehx-taggroup-title{font-size:10.5px;font-weight:800;color:var(--muted2);letter-spacing:.05em;text-transform:uppercase;margin:0 0 5px}
  .ehx-tagwrap{display:flex;flex-wrap:wrap;gap:5px}
  .ehx-tagpill{
    display:inline-flex;align-items:center;height:25px;padding:0 9px;border-radius:7px;
    font-size:11.5px;font-weight:700;background:var(--tag-bg);color:var(--tag-fg);
    border:1px solid transparent;
  }
  .ehx-tagpill.ehx-tag-watched{
    background:var(--tag-watched-bg);color:var(--tag-watched-fg);
    border-color:var(--tag-watched-line);
  }
  .ehx-tagpill:active{opacity:.75}
  .ehx-tagpill.ehx-hiddenop{opacity:.38}

  .ehx-desc{font-size:13px;line-height:1.6;color:var(--muted);white-space:pre-wrap;word-break:break-word}
  .ehx-desc a{color:var(--accent)}

  /* Thumbnail grid */
  .ehx-thumbs{
    display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;
    padding:0 calc(14px + var(--sar)) 18px calc(14px + var(--sal));
  }
  .ehx-thumb{
    position:relative;overflow:hidden;border-radius:9px;background:var(--card2);
    border:1px solid var(--line);aspect-ratio:3/4;cursor:pointer;
  }
  .ehx-thumb.ehx-thumb-loading{
    background:linear-gradient(100deg,var(--card2) 20%,var(--shimmer) 40%,var(--card2) 60%);
    background-size:200% 100%;animation:ehx-shimmer 1.6s linear infinite;
  }
  .ehx-thumb-inner{
    position:absolute;left:0;top:0;width:200px;background-repeat:no-repeat;
    transform-origin:top left;pointer-events:none;transform:scale(var(--thumb-scale,.5));
  }
  .ehx-thumb img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
  .ehx-thumb-num{
    position:absolute;right:4px;bottom:4px;z-index:2;font-size:9px;font-weight:800;
    background:rgba(0,0,0,.65);color:#fff;border-radius:4px;padding:1px 4px;
  }
  .ehx-thumb.ehx-read:after{content:"";position:absolute;inset:0;border:2px solid var(--accent);border-radius:9px;pointer-events:none}
  .ehx-thumbctl{display:flex;align-items:center;gap:8px;padding:0 calc(14px + var(--sar)) 10px calc(14px + var(--sal))}
  .ehx-thumbctl .ehx-grow{font-size:11.5px;color:var(--muted)}

  /* ---------- Reader ---------- */
  .ehx-reader{
    position:fixed;inset:0;z-index:120;background:#070608;color:#fff;
    display:flex;flex-direction:column;overscroll-behavior:none;
    touch-action:manipulation;
  }
  .ehx-reader.ehx-vertical{touch-action:pan-y pinch-zoom}
  .ehx-reader.ehx-paged{touch-action:pan-x pinch-zoom}
  .ehx-rscroll{
    position:absolute;inset:0;overflow-y:auto;overflow-x:hidden;
    -webkit-overflow-scrolling:touch;overscroll-behavior-y:contain;
    scrollbar-width:none;
  }
  .ehx-rscroll::-webkit-scrollbar{display:none}
  .ehx-rpage{
    position:relative;width:100%;background:#0a090c;overflow:hidden;
    display:flex;align-items:flex-start;justify-content:center;
    padding-left:var(--sal);padding-right:var(--sar);
  }
  .ehx-rpage img{display:block;width:100%;height:auto;min-height:120px;background:#0a090c;user-select:none;-webkit-user-select:none}
  .ehx-reader.ehx-fit-contain .ehx-rpage img{width:auto;max-width:100%;height:auto;max-height:100dvh;object-fit:contain}
  .ehx-rpage.ehx-failed{min-height:60vh;display:grid;place-items:center}
  .ehx-rfail{display:flex;flex-direction:column;align-items:center;gap:10px;color:#bbb;font-size:12px;padding:30px;text-align:center}
  .ehx-rfail .ehx-btn{height:36px;font-size:12px}
  .ehx-rloader{position:absolute;inset:0;display:grid;place-items:center;pointer-events:none}
  .ehx-rloader .ehx-spinner{border-color:rgba(255,255,255,.18);border-top-color:#fff}

  /* paged */
  .ehx-reader.ehx-paged .ehx-rscroll{
    display:flex;overflow-x:auto;overflow-y:hidden;
    scroll-snap-type:x mandatory;scroll-behavior:auto;overscroll-behavior-x:contain;
  }
  .ehx-reader.ehx-paged .ehx-rpage{
    flex:0 0 100%;width:100%;height:100vh;height:100dvh;scroll-snap-align:center;scroll-snap-stop:always;
    align-items:center;background:#070608;
  }
  .ehx-reader.ehx-paged .ehx-rpage img{
    width:100%;height:auto;max-height:100dvh;object-fit:contain;margin:auto;
  }
  .ehx-reader.ehx-paged.ehx-fit-contain .ehx-rpage img{width:auto;height:auto;max-width:100vw;max-height:100dvh}

  .ehx-rchrome{position:absolute;inset:0;z-index:5;pointer-events:none;opacity:1;transition:opacity .22s ease}
  .ehx-rchrome.ehx-hidden{opacity:0}
  .ehx-rchrome.ehx-hidden .ehx-rtop,.ehx-rchrome.ehx-hidden .ehx-rbottom,.ehx-rchrome.ehx-hidden .ehx-rmid{pointer-events:none}
  .ehx-rtop{
    position:absolute;top:0;left:0;right:0;pointer-events:auto;
    padding:calc(var(--sat) + 6px) calc(8px + var(--sar)) 34px calc(8px + var(--sal));
    display:flex;align-items:center;gap:6px;
    background:linear-gradient(180deg,rgba(0,0,0,.82),rgba(0,0,0,0));
  }
  .ehx-rbottom{
    position:absolute;left:0;right:0;bottom:0;pointer-events:auto;
    padding:34px calc(10px + var(--sar)) calc(var(--sab) + 8px) calc(10px + var(--sal));
    background:linear-gradient(0deg,rgba(0,0,0,.86),rgba(0,0,0,0));
  }
  .ehx-rtitle{flex:1;min-width:0;font-size:12.5px;font-weight:650;line-height:1.2;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:0 2px}
  .ehx-rcount{font-size:11px;font-weight:700;color:#cfc8d8;background:rgba(255,255,255,.12);padding:4px 9px;border-radius:999px;white-space:nowrap}
  .ehx-reader .ehx-iconbtn{color:#fff}
  .ehx-reader .ehx-iconbtn:active{background:rgba(255,255,255,.14)}
  .ehx-rbar{display:flex;align-items:center;gap:10px;padding:0 2px}
  .ehx-rbar .ehx-iconbtn{width:38px;height:38px}
  .ehx-rrange{
    -webkit-appearance:none;appearance:none;flex:1;height:22px;background:transparent;margin:0;
  }
  .ehx-rrange::-webkit-slider-runnable-track{height:3px;background:rgba(255,255,255,.28);border-radius:999px}
  .ehx-rrange::-webkit-slider-thumb{-webkit-appearance:none;width:17px;height:17px;border-radius:50%;background:#fff;margin-top:-7px;box-shadow:0 1px 6px rgba(0,0,0,.5)}
  .ehx-rrange::-moz-range-track{height:3px;background:rgba(255,255,255,.28);border-radius:999px}
  .ehx-rrange::-moz-range-thumb{width:17px;height:17px;border:0;border-radius:50%;background:#fff}
  .ehx-rprogress{position:absolute;top:0;left:0;right:0;height:2px;background:rgba(255,255,255,.14);z-index:6}
  .ehx-rprogress>i{display:block;height:100%;background:#fff;transition:width .2s ease}
  .ehx-rmid{position:absolute;inset:0;z-index:1}
  .ehx-rmid .ehx-tapzone{position:absolute;top:0;bottom:0;width:32%}
  .ehx-rmid .ehx-tapzone.ehx-left{left:0}
  .ehx-rmid .ehx-tapzone.ehx-right{right:0}
  .ehx-rmid .ehx-rtapmid{position:absolute;top:0;bottom:0;left:32%;right:32%}
  .ehx-rhint{
    position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);
    z-index:7;background:rgba(0,0,0,.72);color:#fff;font-size:12px;font-weight:650;
    padding:9px 14px;border-radius:999px;pointer-events:none;opacity:0;transition:opacity .2s;
  }
  .ehx-rhint.ehx-show{opacity:1}

  /* ---------- Sheet / modal ---------- */
  .ehx-sheet-scrim{position:fixed;inset:0;z-index:150;background:rgba(0,0,0,.58);opacity:0;pointer-events:none;transition:opacity .2s ease}
  .ehx-sheet-scrim.ehx-show{opacity:1;pointer-events:auto}
  .ehx-sheet{
    position:fixed;left:0;right:0;bottom:0;z-index:160;
    max-height:86dvh;display:flex;flex-direction:column;
    background:var(--bg-soft);border-radius:22px 22px 0 0;
    border-top:1px solid var(--line);box-shadow:0 -20px 60px rgba(0,0,0,.45);
    transform:translateY(102%);pointer-events:none;transition:transform .26s cubic-bezier(.2,.85,.2,1);
    padding-bottom:var(--sab);
  }
  .ehx-sheet.ehx-open{transform:translateY(0);pointer-events:auto}
  .ehx-sheet-grab{width:38px;height:4px;border-radius:99px;background:var(--line);margin:9px auto 3px;flex:0 0 auto}
  .ehx-sheet-head{display:flex;align-items:center;gap:10px;padding:8px 18px 10px}
  .ehx-sheet-title{font-size:16px;font-weight:800;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .ehx-sheet-body{overflow-y:auto;-webkit-overflow-scrolling:touch;padding:2px 18px 18px}
  .ehx-sheet-foot{padding:10px 18px 14px;border-top:1px solid var(--line);display:flex;gap:9px;flex:0 0 auto}
  .ehx-sheet-foot .ehx-btn{flex:1}

  /* toast */
  .ehx-toast{
    position:fixed;left:50%;bottom:calc(var(--tabh) + var(--sab) + 18px);transform:translate(-50%,14px);
    z-index:200;max-width:88vw;padding:10px 15px;border-radius:999px;
    background:rgba(35,30,42,.96);color:#fff;font-size:12.5px;font-weight:650;
    box-shadow:0 8px 28px rgba(0,0,0,.4);opacity:0;transition:opacity .2s,transform .2s;
    pointer-events:none;text-align:center;
  }
  :root[data-ehx-theme="light"] .ehx-toast{background:rgba(35,30,42,.94)}
  .ehx-toast.ehx-show{opacity:1;transform:translate(-50%,0)}

  /* Update banner (above the dock) */
  .ehx-update{
    position:fixed;left:10px;right:10px;bottom:calc(var(--tabh) + var(--sab) + 10px);
    z-index:80;display:flex;align-items:center;gap:10px;padding:10px 12px;
    border-radius:14px;background:var(--card);border:1px solid var(--accent);
    box-shadow:0 12px 34px rgba(0,0,0,.42);color:var(--text);
  }
  .ehx-update-msg{display:flex;align-items:center;gap:9px;flex:1;min-width:0;color:var(--accent)}
  .ehx-update-msg b{display:block;font-size:12.5px;color:var(--text)}
  .ehx-update-msg span{display:block;font-size:10.5px;color:var(--muted2);margin-top:1px}
  .ehx-update-install{
    flex:0 0 auto;padding:7px 12px;border-radius:999px;background:var(--accent);color:#241a3a;
    font-size:11.5px;font-weight:800;text-decoration:none;
  }
  .ehx-update-close{
    flex:0 0 auto;display:grid;place-items:center;width:28px;height:28px;border-radius:50%;
    color:var(--muted2);background:var(--card2);
  }

  /* ---------- Forms ---------- */
  .ehx-input{
    width:100%;height:44px;padding:0 13px;border-radius:12px;
    background:var(--card);border:1px solid var(--line);color:var(--text);
    font-size:15px;outline:none;
  }
  .ehx-input:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(208,188,255,.14)}
  textarea.ehx-input{height:auto;min-height:80px;padding:11px 13px;resize:vertical}
  .ehx-field{margin-bottom:13px}
  .ehx-label{display:block;font-size:11px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--muted2);margin:0 0 6px}
  .ehx-searchwrap{display:flex;align-items:center;gap:8px;padding:8px calc(12px + var(--sar)) 6px calc(12px + var(--sal))}
  .ehx-searchbox{flex:1;display:flex;align-items:center;gap:8px;height:42px;padding:0 12px;background:var(--card);border:1px solid var(--line);border-radius:999px}
  .ehx-searchbox .ehx-i{color:var(--muted2)}
  .ehx-searchbox input{flex:1;min-width:0;background:none;border:0;outline:none;font-size:14px;color:var(--text)}
  .ehx-searchbox input::placeholder{color:var(--muted2)}

  /* settings */
  .ehx-settings{padding:4px calc(12px + var(--sar)) 30px calc(12px + var(--sal))}
  .ehx-group{background:var(--card);border:1px solid var(--line);border-radius:14px;overflow:hidden;margin-bottom:12px}
  .ehx-group-title{font-size:10.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--muted2);margin:16px 4px 7px}
  .ehx-setting{display:flex;align-items:center;gap:12px;padding:12px 13px;border-bottom:1px solid var(--line);min-height:50px}
  .ehx-setting:last-child{border-bottom:0}
  .ehx-setting-label{flex:1;min-width:0;font-size:13.5px;font-weight:600}
  .ehx-setting-sub{font-size:11px;color:var(--muted2);margin-top:2px;font-weight:400}
  .ehx-setting-value{font-size:12.5px;color:var(--muted);font-weight:650;display:flex;align-items:center;gap:5px}
  .ehx-switch{width:46px;height:27px;border-radius:99px;background:var(--card2);border:1px solid var(--line);position:relative;transition:background .18s;flex:0 0 auto}
  .ehx-switch:after{content:"";position:absolute;width:21px;height:21px;border-radius:50%;background:var(--muted);left:2px;top:2px;transition:transform .18s,background .18s}
  .ehx-switch.ehx-on{background:var(--accent);border-color:transparent}
  .ehx-switch.ehx-on:after{transform:translateX(19px);background:var(--accent-ink)}
  .ehx-seg{display:flex;background:var(--card2);border-radius:10px;padding:3px;gap:2px}
  .ehx-seg button{height:29px;padding:0 10px;border-radius:8px;font-size:11.5px;font-weight:650;color:var(--muted);display:inline-flex;align-items:center;gap:5px;justify-content:center}
  .ehx-seg button.ehx-active{background:var(--card);color:var(--text);box-shadow:0 1px 4px rgba(0,0,0,.2)}

  /* login */
  .ehx-login{max-width:430px;margin:0 auto;padding:34px 20px 30px;text-align:center}
  .ehx-login .ehx-logo{width:58px;height:58px;border-radius:18px;font-size:24px;margin:0 auto 16px}
  .ehx-login h2{margin:0 0 8px;font-size:20px;letter-spacing:-.02em}
  .ehx-login p{margin:0 0 18px;font-size:13px;line-height:1.55;color:var(--muted)}
  .ehx-login form{text-align:left;margin-top:14px}
  .ehx-note{font-size:11.5px;line-height:1.5;color:var(--muted2);background:var(--card);border:1px solid var(--line);border-radius:11px;padding:10px 12px;margin-top:14px;text-align:left}

  /* toplist */
  .ehx-ranklist{padding:4px calc(12px + var(--sar)) 26px calc(12px + var(--sal))}
  .ehx-rankgroup{margin-bottom:18px}
  .ehx-rankgroup h3{font-size:14px;margin:8px 0 8px}
  .ehx-rankrow{display:flex;align-items:center;gap:10px;padding:9px 11px;background:var(--card);border:1px solid var(--line);border-radius:11px;margin-bottom:6px;font-size:13px}
  .ehx-rankno{width:26px;flex:0 0 auto;font-weight:800;color:var(--accent);font-size:12px}

  /* desktop-ish */
  @media (min-width:700px){
    .ehx-grid{grid-template-columns:repeat(var(--ehx-cols,3),minmax(0,1fr))}
    .ehx-grid.ehx-listmode{grid-template-columns:repeat(2,minmax(0,1fr))}
    .ehx-thumbs{grid-template-columns:repeat(5,minmax(0,1fr))}
    .ehx-dhero-inner{max-width:920px;margin:0 auto}
    .ehx-section,.ehx-actions,.ehx-thumbs,.ehx-thumbctl,.ehx-dstats{max-width:920px;margin-left:auto;margin-right:auto}
    .ehx-sheet{left:50%;right:auto;transform:translate(-50%,102%);width:min(560px,100vw);border-radius:22px 22px 0 0}
    .ehx-sheet.ehx-open{transform:translate(-50%,0)}
  }
  @media (prefers-reduced-motion:reduce){
    *{animation-duration:.001ms!important;transition-duration:.001ms!important}
  }
  `;

  function injectStyles() {
    let el = document.getElementById('ehx-style');
    if (!el) {
      el = document.createElement('style');
      el.id = 'ehx-style';
      (document.head || document.documentElement).appendChild(el);
    }
    el.textContent = CSS;
  }
  // ---------------------------------------------------------------------------
  // Network layer (same-origin fetch + small HTML cache + concurrency limit)
  // ---------------------------------------------------------------------------

  let activeFetches = 0;
  const fetchQueue = [];
  const fetchInflight = new Map();
  const fetchStarted = new Set();
  const MAX_FETCHES = 3;

  // Persistent HTML cache (Cache API). It survives reloads and is used as a
  // stale-while-revalidate layer in front of the in-memory cache.
  const PERSIST_CACHE = 'ehx-html-v1';
  const PERSIST_MAX = 60;
  const PERSIST_STALE_MS = 10 * 60 * 1000;
  const persistRevalidating = new Set();

  function persistSupported() {
    return typeof caches !== 'undefined' && !!caches.open;
  }

  function persistAllowed(abs) {
    try {
      const u = new URL(abs);
      if (u.origin !== location.origin) return false;
      if (/^\/(favorites\.php|watched|home\.php)(\/|$)/.test(u.pathname)) return false;
      return true;
    } catch {
      return false;
    }
  }

  async function persistRead(abs) {
    if (!persistSupported() || !persistAllowed(abs)) return null;
    try {
      const cache = await caches.open(PERSIST_CACHE);
      const res = await cache.match(abs);
      if (!res) return null;
      const at = Number(res.headers.get('x-ehx-at')) || 0;
      const html = await res.text();
      return html ? { at, html } : null;
    } catch {
      return null;
    }
  }

  async function persistWrite(abs, html) {
    if (!persistSupported() || !persistAllowed(abs) || !html) return;
    try {
      const cache = await caches.open(PERSIST_CACHE);
      await cache.put(abs, new Response(html, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'x-ehx-at': String(Date.now()),
        },
      }));
      const keys = await cache.keys();
      if (keys.length <= PERSIST_MAX) return;
      const rows = [];
      for (const req of keys) {
        const res = await cache.match(req);
        rows.push({ req, at: Number(res && res.headers.get('x-ehx-at')) || 0 });
      }
      rows.sort((a, b) => a.at - b.at);
      for (const row of rows.slice(0, rows.length - PERSIST_MAX)) await cache.delete(row.req);
    } catch {
      /* cache quota / private mode */
    }
  }

  async function persistDelete(abs) {
    if (!persistSupported()) return;
    try {
      const cache = await caches.open(PERSIST_CACHE);
      await cache.delete(abs);
    } catch { /* noop */ }
  }

  async function persistClear() {
    if (!persistSupported()) return;
    try { await caches.delete(PERSIST_CACHE); } catch { /* noop */ }
  }

  function persistRevalidate(abs) {
    if (persistRevalidating.has(abs) || !persistAllowed(abs)) return;
    persistRevalidating.add(abs);
    withFetchSlot(async () => {
      try {
        const res = await fetch(abs, {
          credentials: 'same-origin',
          cache: 'no-store',
          headers: { Accept: 'text/html,application/xhtml+xml' },
        });
        if (!res.ok) return;
        const html = await res.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');
        if (loginPage(doc) || sadPanda(doc) || challengePage(doc)) return;
        htmlCache.set(abs, { at: Date.now(), doc, text: html, url: res.url || abs });
        persistWrite(abs, html);
      } catch { /* background */ } finally {
        persistRevalidating.delete(abs);
      }
    }, false);
  }

  function withFetchSlot(fn, priority = false) {
    return new Promise((resolve, reject) => {
      const run = () => {
        activeFetches++;
        Promise.resolve()
          .then(fn)
          .then(resolve, reject)
          .finally(() => {
            activeFetches--;
            const next = fetchQueue.shift();
            if (next) next();
          });
      };
      if (activeFetches < MAX_FETCHES) run();
      else if (priority) fetchQueue.unshift(run);
      else fetchQueue.push(run);
    });
  }

  async function fetchDoc(url, { ttl = 120000, force = false, priority = false } = {}) {
    const abs = absUrl(url);
    if (!abs) throw new Error('Bad URL');
    const hit = htmlCache.get(abs);
    if (!force && hit && Date.now() - hit.at < ttl) return hit;
    if (!force && !hit) {
      const persisted = await persistRead(abs);
      if (persisted) {
        const pdoc = new DOMParser().parseFromString(persisted.html, 'text/html');
        if (loginPage(pdoc) || sadPanda(pdoc) || challengePage(pdoc)) {
          persistDelete(abs);
        } else {
          const rec = { at: persisted.at, doc: pdoc, text: persisted.html, url: abs };
          htmlCache.set(abs, rec);
          if (Date.now() - persisted.at > PERSIST_STALE_MS) persistRevalidate(abs);
          return rec;
        }
      }
    }
    // Share an in-flight request, but let a real navigation jump ahead of a
    // queued background warm-up instead of waiting behind it.
    if (!force && fetchInflight.has(abs)) {
      if (!priority || fetchStarted.has(abs)) return fetchInflight.get(abs);
    }

    const job = withFetchSlot(async () => {
      // A queued warm-up may have been overtaken by a navigation; use its cache.
      if (!force) {
        const lateHit = htmlCache.get(abs);
        if (lateHit && Date.now() - lateHit.at < ttl) return lateHit;
      }
      fetchStarted.add(abs);
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), IS_EX ? 60000 : 35000);
      try {
        const res = await fetch(abs, {
          credentials: 'same-origin',
          cache: force ? 'reload' : 'default',
          headers: { Accept: 'text/html,application/xhtml+xml' },
          signal: ctrl.signal,
        });
        if (!res.ok) {
          const err = new Error('HTTP ' + res.status);
          err.status = res.status;
          throw err;
        }
        const html = await res.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');
        if (challengePage(doc)) {
          const err = new Error('Cloudflare is asking for verification. Open the original site, complete the check, then return.');
          err.challenge = true;
          throw err;
        }
        const rec = { at: Date.now(), doc, text: html, url: res.url || abs };
        // Never cache login/sad-panda pages: they can go stale immediately after login.
        if (!loginPage(doc) && !sadPanda(doc)) {
          htmlCache.set(abs, rec);
          if (persistAllowed(abs)) persistWrite(abs, html);
        }
        if (htmlCache.size > 70) {
          const oldest = [...htmlCache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
          if (oldest) htmlCache.delete(oldest[0]);
        }
        return rec;
      } catch (e) {
        if (e && e.name === 'AbortError') {
          const err = new Error('The page took too long to load. Retry, or open the original site.');
          err.timeout = true;
          throw err;
        }
        throw e;
      } finally {
        fetchStarted.delete(abs);
        clearTimeout(timer);
      }
    }, priority);

    if (!force) {
      fetchInflight.set(abs, job);
      job.then(() => {
        if (fetchInflight.get(abs) === job) fetchInflight.delete(abs);
      }, () => {
        if (fetchInflight.get(abs) === job) fetchInflight.delete(abs);
      });
    }
    return job;
  }

  async function postForm(url, formData, { referer, priority = false } = {}) {
    const abs = absUrl(url);
    return withFetchSlot(async () => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), IS_EX ? 45000 : 25000);
      try {
        const res = await fetch(abs, {
          method: 'POST',
          credentials: 'same-origin',
          body: formData,
          headers: referer ? { Referer: referer } : undefined,
          signal: ctrl.signal,
        });
        const html = await res.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');
        return { ok: res.ok, status: res.status, text: html, doc, url: res.url || abs };
      } finally {
        fetchStarted.delete(abs);
        clearTimeout(timer);
      }
    }, priority);
  }

  async function postJson(url, payload) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    try {
      const res = await fetch(absUrl(url), {
        method: 'POST',
        credentials: 'omit',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: ctrl.signal,
      });
      const text = await res.text();
      let json = null;
      try { json = JSON.parse(text); } catch { /* not json */ }
      return { ok: res.ok, status: res.status, text, json };
    } finally {
      clearTimeout(timer);
    }
  }

  function loginPage(doc) {
    return !!doc.querySelector('form[name="ipb_login_form"]') ||
      /This page requires you to log on/i.test(doc.body ? doc.body.textContent : '');
  }
  function sadPanda(doc) {
    const t = (doc.title || '') + ' ' + (doc.body ? doc.body.textContent : '');
    return /sad panda/i.test(t);
  }
  function challengePage(doc) {
    const title = doc.title || '';
    if (/just a moment|attention required|cf-challenge|cf-chl/i.test(title)) return true;
    const body = ((doc.body && doc.body.textContent) || '').slice(0, 3000);
    return /checking your browser before accessing|enable javascript and cookies to continue|cf-chl-bypass|cf-challenge-running/i.test(body);
  }

  // ---------------------------------------------------------------------------
  // HTML parsers
  // ---------------------------------------------------------------------------

  const catFromClass = (cls) => {
    const m = String(cls || '').match(/ct([0-9a])/);
    if (!m) return '';
    return {
      1: 'Misc', 2: 'Doujinshi', 3: 'Manga', 4: 'Artist CG', 5: 'Game CG',
      6: 'Image Set', 7: 'Cosplay', 8: 'Asian Porn', 9: 'Non-H', a: 'Western',
    }[m[1]] || '';
  };

  const catClassFromName = (name) => {
    const map = {
      Misc: 'ct1', Doujinshi: 'ct2', Manga: 'ct3', 'Artist CG': 'ct4', 'Game CG': 'ct5',
      'Image Set': 'ct6', Cosplay: 'ct7', 'Asian Porn': 'ct8', 'Non-H': 'ct9', Western: 'cta',
    };
    return map[name] || 'ct1';
  };

  function styleUrl(el) {
    if (!el) return '';
    const s = el.getAttribute('style') || '';
    const m = s.match(/url\((['"]?)([^'")]+)\1\)/i);
    return m ? safeImage(m[2]) : '';
  }

  function stylePx(el, prop) {
    const s = el ? (el.getAttribute('style') || '') : '';
    const m = s.match(new RegExp(prop + '\\s*:\\s*(-?\\d+(?:\\.\\d+)?)px', 'i'));
    return m ? parseFloat(m[1]) : 0;
  }

  function parseList(doc, baseUrl) {
    const base = baseUrl || (doc.baseURI || location.href);
    const items = [];
    const seen = new Set();
    // E-Hentai has four list layouts: Compact (gl*c), Extended (gl*e),
    // Thumbnail (gl*t, div-based) and Minimal (gl*m). Normalise both the
    // table-based and div-based variants into the same row list.
    const rows = Array.from(doc.querySelectorAll('table.itg tr, div.gl1t'));
    for (const tr of rows) {
      if (tr.querySelector('td.itd') || tr.querySelector('th')) continue;
      const link = tr.querySelector('.gl3c a[href*="/g/"], .gl2c a[href*="/g/"], .gl1e a[href*="/g/"], .gl4e a[href*="/g/"], .gl1t a[href*="/g/"], .gl2m a[href*="/g/"], a[href*="/g/"]');
      if (!link) continue;
      const href = absUrl(link.getAttribute('href'), base);
      const m = href.match(/\/g\/(\d+)\/([0-9a-f]+)/i);
      if (!m || seen.has(m[1])) continue;
      seen.add(m[1]);

      const titleEl = tr.querySelector('.glink');
      const title = text(titleEl) || text(link);
      if (!title) continue;

      const catEl = tr.querySelector('.gl1c .cn, .gl3e .cn, .gl5t .cs, .gl1m .cs, .gl3c .cn, .gl1c, .cn, .cs');
      const catClass = (catEl && Array.from(catEl.classList).find((c) => /^ct[0-9a]$/.test(c))) || '';
      const category = text(catEl) || catFromClass(catClass) || 'Misc';

      const img = tr.querySelector(
        '.gl2c img[data-src], .gl2c img[src], .gl1c img[data-src], .gl1c img[src], ' +
        '.gl1e img[data-src], .gl1e img[src], .gl3t img[data-src], .gl3t img[src], ' +
        '.gl2m img[data-src], .gl2m img[src], .glthumb img[data-src], .glthumb img[src], img[data-src]',
      );
      let cover = img ? (img.getAttribute('data-src') || img.getAttribute('src') || '') : '';
      cover = safeImage(cover);
      if (/^data:/i.test(cover)) cover = '';

      const uploaderEl = tr.querySelector('.gl4c a[href*="/uploader/"], .gl4e a[href*="/uploader/"], a[href*="/uploader/"]');
      const uploader = text(uploaderEl);

      // The page count lives in its own div in every layout. Scan for the
      // exact label first: concatenated row text can glue "15:10" and
      // "4 pages" into "15:104 pages" and invent a bogus count.
      let pages = null;
      for (const el of tr.querySelectorAll('div')) {
        const pm = text(el).match(/^([\d,]+)\s+pages?$/i);
        if (pm) { pages = num(pm[1]); break; }
      }
      if (!pages) {
        const pm = (tr.textContent || '').match(/(?:^|\s)([\d,]+)\s+pages?\b/i);
        pages = pm ? num(pm[1]) : null;
      }

      const postedEl = tr.querySelector('[id^="posted"]');
      const posted = text(postedEl);

      // The 80x16 .ir sprite slides across ten 16px stars; the top row is
      // whole stars and the bottom row is the half-star variant.
      let rating = 0;
      const ir = tr.querySelector('.ir[style*="background-position"]');
      if (ir) {
        const style = ir.getAttribute('style') || '';
        const rm = style.match(/background-position:\s*(-?\d+)px\s+(-?\d+)px/);
        if (rm) {
          const x = Math.abs(parseInt(rm[1], 10));
          const y = parseInt(rm[2], 10);
          const stars = (y <= -20 ? 4.5 : 5) - x / 16;
          rating = Math.max(0, Math.min(10, Math.round(stars * 2 * 2) / 2));
        }
      }

      const tags = [];
      const tagSeen = new Set();
      for (const el of tr.querySelectorAll('.gl3c .gt, .gl3c .gtw, .gl3c .gtl, .gl3e .gt, .gl3e .gtw, .gl3e .gtl, .gt, .gtw, .gtl')) {
        const full = (el.getAttribute('title') || text(el) || '').split(' | ')[0].trim();
        if (!full || tagSeen.has(full)) continue;
        tagSeen.add(full);
        const idx = full.indexOf(':');
        tags.push({
          ns: idx > 0 ? full.slice(0, idx) : '',
          name: idx > 0 ? full.slice(idx + 1) : full,
          full,
          watched: el.classList.contains('gtw'),
        });
      }
      const language = (tags.find((t) => t.ns === 'language' && !/^(translated|rewrite)$/i.test(t.name))
        || tags.find((t) => t.ns === 'language') || {}).name || null;

      items.push({
        gid: m[1],
        token: m[2],
        url: `${location.origin}/g/${m[1]}/${m[2]}/`,
        title,
        category,
        catClass: catClass || catClassFromName(category),
        cover,
        uploader,
        pages,
        posted,
        tags,
        language,
        rating,
      });
    }

    const favLinks = [];
    const favSeen = new Set();
    for (const a of doc.querySelectorAll('a[href*="fav="]')) {
      const href = absUrl(a.getAttribute('href'), base);
      const label = text(a);
      if (!href || !label || !/favorites\.php/i.test(href) || favSeen.has(href)) continue;
      favSeen.add(href);
      favLinks.push({ href, label });
    }

    return {
      items,
      favLinks,
      next: findNav(doc, 'next'),
      prev: findNav(doc, 'prev'),
      title: text(doc.querySelector('h1.ih, #toppane h1.ih, #toppane h1, h1.ih')),
      range: text(doc.querySelector('.gpc')),
      loggedOut: loginPage(doc),
      sad: sadPanda(doc),
    };
  }

  function findNav(doc, which) {
    const re = which === 'next' ? /next/i : /prev/i;
    const anchors = Array.from(doc.querySelectorAll('.searchnav a[href], a#dnext[href], a#unext[href], a#dprev[href], a#uprev[href]'));
    for (const a of anchors) {
      const label = text(a);
      const id = (a.id || '').toLowerCase();
      if (re.test(label) || (which === 'next' ? /next/.test(id) : /prev/.test(id))) {
        const href = a.getAttribute('href');
        if (href && href !== '#') return absUrl(href, doc.baseURI || location.href);
      }
    }
    const alt = doc.querySelector(which === 'next'
      ? 'a[href*="next="], a[href*="?p="]'
      : 'a[href*="prev="]');
    if (alt && which === 'next') {
      const href = alt.getAttribute('href') || '';
      if (/next=/.test(href)) return absUrl(href, doc.baseURI || location.href);
    }
    return '';
  }

  function parseDetail(doc, baseUrl) {
    const base = baseUrl || doc.baseURI || location.href;

    const title = text(doc.querySelector('#gn')) || text(doc.querySelector('#gd2 h1')) || text(doc.querySelector('h1'));
    const jpTitle = text(doc.querySelector('#gj'));
    const catEl = doc.querySelector('#gdc .cs') || doc.querySelector('#gdc');
    const catClass = (catEl && Array.from(catEl.classList).find((c) => /^ct[0-9a]$/.test(c))) || '';
    const category = text(catEl) || catFromClass(catClass) || 'Misc';

    let cover = '';
    const coverImg = doc.querySelector('#gd1 img');
    if (coverImg) cover = safeImage(coverImg.getAttribute('src'));
    if (!cover) {
      const coverDiv = doc.querySelector('#gd1 div[style*="url("]');
      cover = styleUrl(coverDiv);
    }

    const uploaderEl = doc.querySelector('#gdn a[href*="/uploader/"]');
    const uploader = text(uploaderEl);
    const uploaderUrl = uploaderEl ? absUrl(uploaderEl.getAttribute('href'), base) : '';

    const info = {};
    for (const tr of doc.querySelectorAll('#gdd tr')) {
      const k = text(tr.querySelector('.gdt1')).replace(/:$/, '');
      const vEl = tr.querySelector('.gdt2');
      if (k && vEl) info[k.toLowerCase()] = text(vEl);
    }

    const ratingText = text(doc.querySelector('#rating_label')) || '';
    const rm = ratingText.match(/([\d.]+)/);
    const rating = rm ? parseFloat(rm[1]) : 0;
    const ratingCount = num(text(doc.querySelector('#rating_count')));

    const favText = text(doc.querySelector('#favoritelink'));
    const favorited = /remove/i.test(favText);
    const favCount = num(text(doc.querySelector('#favcount')));

    const tags = [];
    const tagSeen = new Set();
    for (const tr of doc.querySelectorAll('#taglist tr')) {
      const ns = text(tr.querySelector('td.tc')).replace(/:$/, '').trim();
      for (const a of tr.querySelectorAll('td .gt a, td .gtw a, td .gtl a')) {
        const tEl = a.closest('.gt, .gtw, .gtl');
        const onclick = a.getAttribute('onclick') || '';
        const om = onclick.match(/toggle_tagmenu\([^,]+,\s*'([^']+)'/);
        let full = om ? om[1] : (a.getAttribute('title') || text(a));
        // E-Hentai appends " | definition ..." to tags that have a wiki note.
        full = full.split(' | ')[0].trim();
        const idx = full.indexOf(':');
        const name = idx > 0 ? full.slice(idx + 1) : full;
        if (!name || tagSeen.has(full)) continue;
        tagSeen.add(full);
        const hidden = tEl ? (parseFloat(tEl.style.opacity || '1') < 0.7) : false;
        const watched = tEl ? tEl.classList.contains('gtw') : false;
        tags.push({ ns: idx > 0 ? full.slice(0, idx) : ns, name, full, href: absUrl(a.getAttribute('href'), base), hidden, watched });
      }
    }
    // Fallback: tags as plain links under #taglist.
    if (!tags.length) {
      for (const a of doc.querySelectorAll('#taglist a[href*="/tag/"]')) {
        const full = decodeURIComponent((a.getAttribute('href') || '').split('/tag/')[1] || '').replace(/\+/g, ' ');
        if (!full) continue;
        const idx = full.indexOf(':');
        const tEl = a.closest('.gt, .gtw, .gtl');
        tags.push({
          ns: idx > 0 ? full.slice(0, idx) : '',
          name: idx > 0 ? full.slice(idx + 1) : full,
          full,
          href: absUrl(a.getAttribute('href'), base),
          hidden: false,
          watched: tEl ? tEl.classList.contains('gtw') : false,
        });
      }
    }

    const thumbs = [];
    for (const a of doc.querySelectorAll('#gdt a[href*="/s/"]')) {
      const href = absUrl(a.getAttribute('href'), base);
      const im = href.match(/-(\d+)(?:\/)?$/);
      const idx = im ? parseInt(im[1], 10) : null;
      if (!idx) continue;
      const div = a.querySelector('div[style*="url("]') || a.querySelector('div[style]') || a.querySelector('div');
      const img = a.querySelector('img');
      if (img) {
        const src = img.getAttribute('src') || img.getAttribute('data-src') || '';
        thumbs.push({ idx, href, img: safeImage(src), sprite: '', w: 200, h: 266, offX: 0, offY: 0 });
        continue;
      }
      if (!div) continue;
      const sprite = styleUrl(div);
      const w = stylePx(div, 'width') || 200;
      const h = stylePx(div, 'height') || 266;
      const s = div.getAttribute('style') || '';
      let offX = 0;
      let offY = 0;
      const om = s.match(/url\([^)]*\)\s+(-?\d+(?:\.\d+)?)(?:px)?\s+(-?\d+(?:\.\d+)?)(?:px)?/i);
      if (om) { offX = parseFloat(om[1]); offY = parseFloat(om[2]); }
      thumbs.push({ idx, href, img: '', sprite, w, h, offX, offY });
    }

    const thumbPages = [];
    for (const a of doc.querySelectorAll('.ptt a[href]')) {
      const n = num(text(a));
      if (n) thumbPages.push({ n, href: absUrl(a.getAttribute('href'), base), current: /ptds/.test(a.parentElement ? a.parentElement.className : '') });
    }
    const gpc = text(doc.querySelector('.gpc')) || text(doc.querySelector('.gtb .gpc'));
    const rangeM = gpc.match(/Showing\s+([\d,]+)\s*-\s*([\d,]+)\s+of\s+([\d,]+)/i);
    // E-Hentai fits 20 thumbs per page at 200px and 40 at 100px. The sheet
    // class (gt200/gt100) and the first page's "Showing 1 - N" give the size.
    const gdtEl = doc.querySelector('#gdt');
    const gdtClass = gdtEl ? (gdtEl.getAttribute('class') || '') : '';
    let thumbsPerPage = /gt100/.test(gdtClass) ? 40 : 20;
    if (rangeM && num(rangeM[1]) === 1) {
      const firstCount = num(rangeM[2]);
      if (firstCount && firstCount > 0) thumbsPerPage = firstCount;
    }

    // Inline API credentials (used for rating, voting, etc.).
    const scripts = Array.from(doc.querySelectorAll('script:not([src])')).map((s) => s.textContent).join('\n');
    const grab = (name) => {
      const m = scripts.match(new RegExp('var\\s+' + name + '\\s*=\\s*"([^"]*)"'));
      return m ? m[1] : '';
    };
    const grabNum = (name) => {
      const m = scripts.match(new RegExp('var\\s+' + name + '\\s*=\\s*(-?\\d+)'));
      return m ? parseInt(m[1], 10) : null;
    };
    const apikey = grab('apikey');
    const apiuid = grabNum('apiuid');

    let archiveUrl = '';
    let torrentUrl = '';
    for (const a of doc.querySelectorAll('#gd5 a, a[onclick]')) {
      const oc = a.getAttribute('onclick') || '';
      if (!archiveUrl && /archiver\.php/.test(oc)) {
        const m = oc.match(/'([^']*archiver\.php[^']*)'/);
        if (m) archiveUrl = absUrl(m[1].replace(/&amp;/g, '&'), base);
      }
      if (!torrentUrl && /gallerytorrents\.php/.test(oc)) {
        const m = oc.match(/'([^']*gallerytorrents\.php[^']*)'/);
        if (m) torrentUrl = absUrl(m[1].replace(/&amp;/g, '&'), base);
      }
    }
    if (!torrentUrl) {
      const a = doc.querySelector('a[href*="gallerytorrents.php"]');
      if (a) torrentUrl = absUrl(a.getAttribute('href'), base);
    }
    if (!archiveUrl) {
      const a = doc.querySelector('a[href*="archiver.php"]');
      if (a) archiveUrl = absUrl(a.getAttribute('href'), base);
    }

    const comments = parseComments(doc);

    const gidM = base.match(/\/g\/(\d+)\/([0-9a-f]+)/i) || (title ? base.match(/\/g\/(\d+)\/([0-9a-f]+)/i) : null);
    const tokenM = base.match(/\/g\/(\d+)\/([0-9a-f]+)/i);

    return {
      title,
      jpTitle,
      category,
      catClass: catClass || catClassFromName(category),
      cover,
      uploader,
      uploaderUrl,
      info,
      posted: info['posted'] || '',
      parent: info['parent'] || '',
      visible: info['visible'] || '',
      language: info['language'] || '',
      fileSize: info['file size'] || '',
      pages: num(info['length']) || (rangeM ? parseInt(rangeM[3].replace(/,/g, ''), 10) : null),
      favorited: favCount,
      rating,
      ratingCount,
      isFavorited: favorited,
      tags,
      thumbs,
      thumbPages,
      gpc,
      thumbsPerPage,
      thumbRange: rangeM ? { from: num(rangeM[1]), to: num(rangeM[2]), total: num(rangeM[3]) } : null,
      comments,
      apikey,
      apiuid,
      gid: gidM ? gidM[1] : '',
      token: tokenM ? tokenM[2] : '',
      archiveUrl,
      torrentUrl,
      galleryUrl: tokenM ? absUrl(`/g/${tokenM[1]}/${tokenM[2]}/`, base) : base,
    };
  }

  function parseComments(doc) {
    const out = [];
    for (const c of doc.querySelectorAll('#cdiv .c1')) {
      const c3 = text(c.querySelector('.c3'));
      const authorEl = c.querySelector('.c3 a[href*="/uploader/"]');
      const dateM = c3.match(/Posted on\s+(.+?)\s+by:/i);
      const bodyEl = c.querySelector('.c6');
      const body = bodyEl ? bodyEl.innerHTML : '';
      if (!body && !authorEl) continue;
      out.push({
        author: text(authorEl) || 'Anonymous',
        date: dateM ? dateM[1] : c3,
        body,
        uploader: /uploader comment/i.test(text(c.querySelector('.c4'))),
      });
    }
    return out;
  }

  function parseReader(doc, baseUrl) {
    const base = baseUrl || doc.baseURI || location.href;
    const img = doc.querySelector('#i3 img#img') || doc.querySelector('img#img');
    const src = img ? safeImage(img.getAttribute('src')) : '';
    const w = img ? stylePx(img, 'width') : 0;
    const h = img ? stylePx(img, 'height') : 0;

    const counterEl = doc.querySelector('#i2 .sn div');
    const counter = text(counterEl);
    const cm = counter.match(/([\d,]+)\s*\/\s*([\d,]+)/);
    const index = cm ? num(cm[1]) : null;
    const total = cm ? num(cm[2]) : null;

    const nav = [];
    for (const a of doc.querySelectorAll('#i2 .sn a, #i4 .sn a')) {
      const oc = a.getAttribute('onclick') || '';
      const m = oc.match(/load_image\((\d+)\s*,\s*'([0-9a-f]+)'\)/i);
      if (m) {
        const n = parseInt(m[1], 10);
        if (!nav.some((x) => x.n === n)) nav.push({ n, key: m[2], href: absUrl(a.getAttribute('href'), base) });
      }
    }
    const byId = (id) => {
      const a = doc.querySelector(`#i2 a#${id}, #i4 a#${id}`);
      if (!a) return null;
      const oc = a.getAttribute('onclick') || '';
      const m = oc.match(/load_image\((\d+)\s*,\s*'([0-9a-f]+)'\)/i);
      return m ? { n: parseInt(m[1], 10), key: m[2], href: absUrl(a.getAttribute('href'), base) } : null;
    };
    const prev = byId('prev') || nav[1] || null;
    const next = byId('next') || nav[2] || null;
    const first = nav[0] || null;
    const last = nav.length ? nav[nav.length - 1] : null;

    const infoEl = doc.querySelector('#i2 > div:not(.sn)');
    const pageInfo = text(infoEl);

    const galleryEl = doc.querySelector('#i5 .sb a[href*="/g/"], #i5 a[href*="/g/"]');
    const galleryUrl = galleryEl ? absUrl(galleryEl.getAttribute('href'), base) : '';
    const fullEl = doc.querySelector('#i6 a[href*="/fullimg/"]');

    const inline = Array.from(doc.querySelectorAll('script:not([src])')).map((s) => s.textContent).join('\n');
    const grab = (name) => {
      const m = inline.match(new RegExp('var\\s+' + name + '\\s*=\\s*"([^"]*)"'));
      return m ? m[1] : '';
    };
    const grabNum = (name) => {
      const m = inline.match(new RegExp('var\\s+' + name + '\\s*=\\s*(-?\\d+)'));
      return m ? parseInt(m[1], 10) : null;
    };
    const pageGid = grabNum('gid') || (base.match(/\/g\/(\d+)\//) || [])[1] || '';
    const imgkey = (base.match(/\/s\/([0-9a-f]+)\//i) || [])[1] || '';

    return {
      title: text(doc.querySelector('#i1 h1')),
      src,
      w: w || 800,
      h: h || 1122,
      index: index || 1,
      total: total || (last ? last.n : 0),
      prev,
      next,
      first,
      last,
      pageInfo,
      galleryUrl,
      fullUrl: fullEl ? absUrl(fullEl.getAttribute('href'), base) : '',
      failed: !src,
      login: loginPage(doc),
      sad: sadPanda(doc),
      showkey: grab('showkey'),
      apiUrl: grab('api_url'),
      gid: pageGid,
      imgkey,
    };
  }

  function parseToplist(doc, baseUrl) {
    const base = baseUrl || doc.baseURI || location.href;
    const groups = [];
    for (const h2 of doc.querySelectorAll('.dc h2')) {
      const table = h2.nextElementSibling;
      if (!table) continue;
      const rows = [];
      for (const tr of table.querySelectorAll('tr')) {
        const a = tr.querySelector('.tun a[href*="/g/"]');
        if (!a) continue;
        rows.push({
          rank: text(tr.querySelector('.pso')),
          title: text(a),
          url: absUrl(a.getAttribute('href'), base),
        });
      }
      if (rows.length) groups.push({ title: text(h2), rows });
    }
    if (!groups.length) {
      // Flat fallback for ?tl= pages.
      const rows = [];
      for (const tr of doc.querySelectorAll('table tr')) {
        const a = tr.querySelector('.tun a[href*="/g/"]');
        if (!a) continue;
        rows.push({ rank: text(tr.querySelector('.pso')), title: text(a), url: absUrl(a.getAttribute('href'), base) });
      }
      if (rows.length) groups.push({ title: 'Toplist', rows });
    }
    const links = [];
    const seen = new Set();
    for (const a of doc.querySelectorAll('a[href*="tl="]')) {
      const href = absUrl(a.getAttribute('href'), base);
      const label = text(a);
      if (!href || !label || seen.has(href)) continue;
      seen.add(href);
      links.push({ href, label });
    }
    return { groups, links, title: text(doc.querySelector('h1')) };
  }
  // ---------------------------------------------------------------------------
  // App shell, navigation, overlays
  // ---------------------------------------------------------------------------

  const app = {
    root: null,
    topbar: null,
    main: null,
    tabbar: null,
    layer: null,
    drawer: null,
    scrim: null,
    route: null,
    tab: 'home',
    depth: 0,
    navSeq: 0,
    refresh: null,
    retry: null,
    scroll: new Map(),
    sheets: [],
    loggedIn: null,
    lastQuery: '',
    lastFcats: '0',
    booted: false,
    cleanup: null,
    listState: null,
    reader: null,
  };

  const preconnectedOrigins = new Set();
  function preconnectOrigin(origin) {
    if (!origin || preconnectedOrigins.has(origin)) return;
    preconnectedOrigins.add(origin);
    for (const rel of ['preconnect', 'dns-prefetch']) {
      const link = document.createElement('link');
      link.rel = rel;
      link.href = origin;
      (document.head || document.documentElement).appendChild(link);
    }
  }

  const appActions = {};
  function onAction(name, fn) { appActions[name] = fn; }
  function runAction(name, el) {
    const fn = appActions[name];
    if (!fn) return false;
    try { fn(el); } catch (e) { console.error('[EHX action]', name, e); }
    return true;
  }

  function iconBtn(act, name, label, cls = '') {
    return `<button class="ehx-iconbtn ${cls}" data-act="${act}" aria-label="${esc(label)}" title="${esc(label)}">${icon(name)}</button>`;
  }

  function brandHtml() {
    const letter = IS_EX ? 'X' : 'E';
    return `<div class="ehx-brand">
      <div class="ehx-logo">${letter}</div>
      <div style="min-width:0">
        <div class="ehx-brandname">${esc(SITE_NAME)}</div>
        <div class="ehx-brandsub">Galleries</div>
      </div>
    </div>`;
  }

  function renderTopbar(opts = {}) {
    if (!app.topbar) return;
    const { left = '', title = '', right = '', brand = false, subtitle = '', transparent = false } = opts;
    app.topbar.className = 'ehx-topbar' + (transparent ? ' ehx-transparent' : '');
    if (brand) {
      app.topbar.innerHTML = left + brandHtml() + right;
    } else if (subtitle) {
      app.topbar.innerHTML = left + `<div class="ehx-title" style="line-height:1.15"><div>${esc(title)}</div><div style="font-size:10.5px;font-weight:550;color:var(--muted2);margin-top:2px;overflow:hidden;text-overflow:ellipsis">${esc(subtitle)}</div></div>` + right;
    } else {
      app.topbar.innerHTML = left + `<div class="ehx-title">${esc(title)}</div>` + right;
    }
  }

  const TABS = [
    { id: 'home', icon: 'home', label: 'Home', href: '/' },
    { id: 'popular', icon: 'popular', label: 'Popular', href: '/popular' },
    { id: 'favorites', icon: 'heart', label: 'Favorites', href: '/favorites.php' },
    { id: 'watched', icon: 'eye', label: 'Watched', href: '/watched' },
    { id: 'more', icon: 'menu', label: 'Menu', act: 'drawer' },
  ];

  function renderTabbar() {
    if (!app.tabbar) return;
    const hide = app.tab === 'none' || (app.route && app.route.name === 'reader');
    app.root.classList.toggle('ehx-no-tabbar', hide);
    app.tabbar.style.display = hide ? 'none' : '';
    app.tabbar.innerHTML = TABS.map((t) => {
      const active = app.tab === t.id;
      const inner = `${icon(t.icon, 23)}<span>${t.label}</span>`;
      if (t.act) {
        return `<button class="ehx-tab${active ? ' ehx-active' : ''}" data-act="${t.act}" aria-label="${t.label}">${inner}</button>`;
      }
      return `<a class="ehx-tab${active ? ' ehx-active' : ''}" href="${t.href}" aria-label="${t.label}">${inner}</a>`;
    }).join('');
  }

  // --- navigation -------------------------------------------------------------

  async function navigate(url, opts = {}) {
    const abs = absUrl(url);
    if (!abs) return;
    const route = classify(abs);

    if (route.name === 'external') {
      openExternal(abs);
      return;
    }

    closeDrawer();
    closeSheets();
    cleanupReaderDom();
    if (app.cleanup) { try { app.cleanup(); } catch { /* noop */ } app.cleanup = null; }
    if (app.reader) destroyReader();

    const seq = ++app.navSeq;
    if (app.route) app.scroll.set(currentUrl(), window.scrollY);
    if (app.listState && app.route && app.route.name === 'list') {
      rememberList(app.route.url || currentUrl(), app.listState);
    }

    if (!opts.pop && !opts.initial && abs !== currentUrl()) {
      app.depth = (history.state && typeof history.state.d === 'number' ? history.state.d : app.depth) + 1;
      history.pushState({ ehx: true, d: app.depth }, '', abs);
    } else if (opts.replace) {
      app.depth = history.state && typeof history.state.d === 'number' ? history.state.d : 0;
      history.replaceState({ ehx: true, d: app.depth }, '', abs);
    }

    app.route = route;
    app.tab = tabOfRoute(route, abs);
    app.refresh = null;
    app.retry = null;
    renderTabbar();
    renderDrawer();
    showTopLoading(true);

    try {
      await renderRoute(route, abs, opts.initialDoc || null, Object.assign({}, opts, { seq }));
    } catch (err) {
      if (seq === app.navSeq) showError(err);
    } finally {
      if (seq === app.navSeq) showTopLoading(false);
    }
    if (seq !== app.navSeq) return;

    if (route.name !== 'reader' && route.kind !== 'favorites.php') schedulePreload();

    const y = opts.restore === false ? 0 : (app.scroll.get(abs) || 0);
    window.scrollTo(0, y);
  }

  async function renderRoute(route, url, initialDoc, opts = {}) {
    if (route.name === 'list') return renderListPage(route, url, initialDoc, opts);
    if (route.name === 'detail') return renderDetailPage(route, url, initialDoc, opts);
    if (route.name === 'reader') return renderReaderPage(route, url, initialDoc, opts);
    if (route.name === 'toplist') return renderToplistPage(route, url, initialDoc, opts);
    if (route.name === 'search') return renderSearchPage();
    if (route.name === 'settings') return renderSettingsPage();
    if (route.name === 'history') return renderHistoryPage();
    showError(new Error('Unknown page'));
  }

  function goBack() {
    if (app.reader) { exitReader(); return; }
    const d = history.state && typeof history.state.d === 'number' ? history.state.d : app.depth;
    if (d > 0) history.back();
    else navigate('/', { replace: true });
  }

  function popstateHandler() {
    const url = currentUrl();
    const route = classify(url);
    if (route.name === 'external') return;
    const seq = ++app.navSeq;
    app.depth = history.state && typeof history.state.d === 'number' ? history.state.d : 0;
    app.route = route;
    app.tab = tabOfRoute(route, url);
    cleanupReaderDom();
    if (app.cleanup) { try { app.cleanup(); } catch { /* noop */ } app.cleanup = null; }
    if (app.reader) destroyReader();
    closeDrawer();
    closeSheets();
    renderTabbar();
    renderDrawer();
    renderRoute(route, url, null, { pop: true, seq })
      .then(() => window.scrollTo(0, app.scroll.get(url) || 0))
      .catch(showError);
  }

  function originalUrl(url) {
    try {
      const u = new URL(url || currentUrl(), location.href);
      u.searchParams.set('ehx', 'off');
      return u.href;
    } catch {
      return url;
    }
  }

  function openExternal(url) {
    if (!url) return;
    const abs = absUrl(url);
    if (!/^https?:/i.test(abs)) return;
    if (sameOrigin(abs)) {
      location.href = abs;
      return;
    }
    const w = window.open(abs, '_blank', 'noopener');
    if (!w) location.href = abs;
  }

  // --- loading / errors -------------------------------------------------------

  let topLoadCount = 0;
  let topLoadEl = null;
  function showTopLoading(on) {
    topLoadCount += on ? 1 : -1;
    if (topLoadCount > 0) {
      if (!topLoadEl) {
        topLoadEl = document.createElement('div');
        topLoadEl.className = 'ehx-top-load';
        document.body.appendChild(topLoadEl);
      }
    } else {
      topLoadCount = 0;
      if (topLoadEl) { topLoadEl.remove(); topLoadEl = null; }
    }
  }

  function cleanupReaderDom() {
    for (const el of Array.from(document.querySelectorAll('.ehx-reader'))) {
      if (!app.reader || el !== app.reader.root) el.remove();
    }
    if (!app.reader) document.body.style.overflow = '';
  }

  function showError(err) {
    console.error('[EHX]', err);
    const status = err && err.status;
    let msg = 'Something went wrong while loading this page.';
    if (status === 509) msg = 'E-Hentai is rate-limiting requests. Wait a minute, then try again.';
    else if (status === 403) msg = 'Access denied. You may need to log in.';
    else if (status === 404) msg = 'This page does not exist.';
    else if (err && err.message && /failed to fetch|load failed|network connection|network request/i.test(err.message)) {
      msg = IS_EX
        ? 'ExHentai did not return the page. Check that your ExHentai cookies are valid, then retry.'
        : 'The network request failed. Check your connection, then retry.';
    } else if (err && err.message) msg = err.message;
    app.main.innerHTML = `<div class="ehx-error">
      <div class="ehx-empty" style="padding:34px 10px">
        ${icon('cloud', 40)}
        <h3>Could not load</h3>
        <p>${esc(msg)}</p>
        <div class="ehx-row" style="justify-content:center">
          <button class="ehx-btn ehx-btn-primary" data-act="retry">${icon('refresh', 17)} Retry</button>
          ${status === 403 ? `<button class="ehx-btn" data-act="login">Log in</button>` : ''}
          <button class="ehx-btn" data-act="original">Original site</button>
        </div>
      </div>
    </div>`;
    onAction('retry', () => {
      if (app.route) navigate(app.route.url || currentUrl(), { replace: true, restore: false });
    });
  }

  function emptyState(title, message, actionHtml = '', iconName = 'image') {
    return `<div class="ehx-empty">
      ${icon(iconName, 42)}
      <h3>${esc(title)}</h3>
      <p>${message}</p>
      ${actionHtml}
    </div>`;
  }

  function skeletonGrid(n = 6) {
    return `<div class="ehx-grid" style="--ehx-cols:${settings.columns}">${Array.from({ length: n }, () => '<div class="ehx-skel ehx-skel-card"></div>').join('')}</div>`;
  }

  // --- drawer -----------------------------------------------------------------

  function renderDrawer() {
    if (!app.drawer) return;
    const items = [
      { icon: 'home', label: 'Front Page', href: '/' },
      { icon: 'popular', label: 'Popular', href: '/popular' },
      { icon: 'heart', label: 'Favorites', href: '/favorites.php' },
      { icon: 'eye', label: 'Watched', href: '/watched' },
      { icon: 'search', label: 'Search', href: '/#ehx-search' },
      { icon: 'star', label: 'Toplists', href: '/toplist.php' },
      { icon: 'history', label: 'History', href: '/#ehx-history' },
      { icon: 'settings', label: 'Settings', href: '/#ehx-settings' },
    ];
    const activePath = location.pathname;
    const activeHash = location.hash;
    const list = items.map((it) => {
      const active = it.href.includes('#')
        ? activeHash === it.href.slice(it.href.indexOf('#'))
        : activePath === it.href && !activeHash;
      return `<a class="ehx-drawer-item${active ? ' ehx-active' : ''}" href="${it.href}">${icon(it.icon, 20)}<span>${it.label}</span></a>`;
    }).join('');

    const logged = app.loggedIn === true;
    app.drawer.innerHTML = `
      <div class="ehx-drawer-head">
        <div class="ehx-avatar">${icon(logged ? 'user' : 'login', 24)}</div>
        <div style="min-width:0">
          <div class="ehx-drawer-name">${logged ? 'Signed in' : 'Guest'}</div>
          <div class="ehx-drawer-sub">${esc(SITE_NAME)} · v${VERSION}</div>
        </div>
      </div>
      <div class="ehx-drawer-list">
        ${list}
        <div class="ehx-drawer-sep"></div>
        ${logged
          ? `<button class="ehx-drawer-item" data-act="logout">${icon('login', 20)}<span>Log out</span></button>`
          : `<button class="ehx-drawer-item" data-act="login">${icon('login', 20)}<span>Log in</span></button>`}
        <button class="ehx-drawer-item" data-act="theme">${icon(settings.theme === 'light' ? 'moon' : 'sun', 20)}<span>${settings.theme === 'auto' ? 'Theme: Auto' : settings.theme === 'dark' ? 'Theme: Dark' : 'Theme: Light'}</span></button>
        <button class="ehx-drawer-item" data-act="original">${icon('external', 20)}<span>Open original site</span></button>
      </div>
      <div class="ehx-drawer-foot">
        JHenTai-inspired mobile shell for ${esc(SITE_NAME)}.<br>
        Your session cookies stay on this device.
      </div>`;
  }

  function openDrawer() {
    if (!app.drawer) return;
    renderDrawer();
    app.scrim.style.display = 'block';
    app.drawer.style.display = 'flex';
    requestAnimationFrame(() => {
      app.scrim.classList.add('ehx-show');
      app.drawer.classList.add('ehx-open');
    });
  }
  function closeDrawer() {
    if (!app.drawer) return;
    app.scrim.classList.remove('ehx-show');
    app.drawer.classList.remove('ehx-open');
    setTimeout(() => {
      if (!app.drawer.classList.contains('ehx-open')) {
        app.drawer.style.display = 'none';
        app.scrim.style.display = 'none';
      }
    }, 260);
  }

  // --- sheets & toast ---------------------------------------------------------

  function openSheet({ title = '', body = '', footer = '', className = '', onMount } = {}) {
    const scrim = document.createElement('div');
    scrim.className = 'ehx-sheet-scrim';
    const sheet = document.createElement('section');
    sheet.className = 'ehx-sheet ' + className;
    sheet.innerHTML = `
      <div class="ehx-sheet-grab"></div>
      <div class="ehx-sheet-head">
        <div class="ehx-sheet-title">${esc(title)}</div>
        <button class="ehx-iconbtn ehx-small" data-act="close-sheet" aria-label="Close">${icon('close', 20)}</button>
      </div>
      <div class="ehx-sheet-body">${body}</div>
      ${footer ? `<div class="ehx-sheet-foot">${footer}</div>` : ''}`;
    app.layer.appendChild(scrim);
    app.layer.appendChild(sheet);
    document.body.style.overflow = 'hidden';

    const entry = { scrim, sheet };
    app.sheets.push(entry);

    requestAnimationFrame(() => {
      scrim.classList.add('ehx-show');
      sheet.classList.add('ehx-open');
    });

    const close = () => {
      const i = app.sheets.indexOf(entry);
      if (i >= 0) app.sheets.splice(i, 1);
      scrim.classList.remove('ehx-show');
      sheet.classList.remove('ehx-open');
      setTimeout(() => {
        scrim.remove();
        sheet.remove();
        if (!app.sheets.length && !app.reader) document.body.style.overflow = '';
      }, 270);
    };
    scrim.addEventListener('click', close);
    sheet.addEventListener('click', (e) => {
      if (e.target.closest('[data-act="close-sheet"]')) close();
    });
    if (onMount) onMount(sheet, close);
    return { sheet, close, body: sheet.querySelector('.ehx-sheet-body') };
  }

  function closeSheets() {
    while (app.sheets.length) {
      const s = app.sheets[app.sheets.length - 1];
      s.scrim.remove();
      s.sheet.remove();
      app.sheets.pop();
    }
    if (!app.reader) document.body.style.overflow = '';
  }

  function confirmSheet(title, message, { ok = 'OK', cancel = 'Cancel', danger = false } = {}) {
    return new Promise((resolve) => {
      const s = openSheet({
        title,
        body: `<p style="margin:6px 0 4px;font-size:13.5px;line-height:1.55;color:var(--muted)">${esc(message)}</p>`,
        footer: `<button class="ehx-btn" data-x="cancel">${esc(cancel)}</button><button class="ehx-btn ${danger ? 'ehx-btn-danger' : 'ehx-btn-primary'}" data-x="ok">${esc(ok)}</button>`,
      });
      s.sheet.addEventListener('click', (e) => {
        const b = e.target.closest('[data-x]');
        if (!b) return;
        resolve(b.dataset.x === 'ok');
        s.close();
      });
    });
  }

  let toastTimer = 0;
  function toast(msg, ms = 2200) {
    let el = document.getElementById('ehx-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'ehx-toast';
      el.className = 'ehx-toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    requestAnimationFrame(() => el.classList.add('ehx-show'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('ehx-show'), ms);
  }

  // --- update notifier --------------------------------------------------------

  const UPDATE_INSTALL_URL = (typeof window !== 'undefined' && window.__EHX_UPDATE_INSTALL_URL__)
    || 'https://raw.githubusercontent.com/lenchan139/xHentai-js/main/ehentai-app.user.js';
  const UPDATE_META_URL = (typeof window !== 'undefined' && window.__EHX_UPDATE_META_URL__)
    || 'https://raw.githubusercontent.com/lenchan139/xHentai-js/main/package.json';
  const UPDATE_CHECK_MS = 12 * 60 * 60 * 1000;
  const UPDATE_DISMISS_MS = 24 * 60 * 60 * 1000;

  function versionCmp(a, b) {
    const pa = String(a || '').split('.').map((n) => parseInt(n, 10) || 0);
    const pb = String(b || '').split('.').map((n) => parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const d = (pa[i] || 0) - (pb[i] || 0);
      if (d) return d;
    }
    return 0;
  }

  function hideUpdateBanner() {
    const el = document.getElementById('ehx-update');
    if (el) el.remove();
  }

  function showUpdateBanner(latest, force = false) {
    if (!app.root || !latest) return;
    const state = store.get('update', {}) || {};
    if (!force && state.dismissed === latest && state.dismissedAt
      && Date.now() - state.dismissedAt < UPDATE_DISMISS_MS) return;
    let el = document.getElementById('ehx-update');
    if (!el) {
      el = document.createElement('div');
      el.id = 'ehx-update';
      el.className = 'ehx-update';
      app.root.appendChild(el);
    }
    el.innerHTML = `
      <div class="ehx-update-msg">
        ${icon('download', 19)}
        <div><b>Update available</b><span>v${esc(latest)} · you have v${esc(VERSION)}</span></div>
      </div>
      <a class="ehx-update-install" href="${esc(UPDATE_INSTALL_URL)}" target="_blank" rel="noopener">Install</a>
      <button class="ehx-update-close" data-update-close aria-label="Dismiss">${icon('close', 16)}</button>`;
    el.querySelector('[data-update-close]').addEventListener('click', () => {
      const next = Object.assign({}, store.get('update', {}), {
        dismissed: latest,
        dismissedAt: Date.now(),
      });
      store.set('update', next);
      el.remove();
    });
  }

  async function checkForUpdate(opts = {}) {
    const manual = !!opts.manual;
    const state = store.get('update', {}) || {};
    if (!manual && state.at && Date.now() - state.at < UPDATE_CHECK_MS) {
      if (state.latest && versionCmp(state.latest, VERSION) > 0) showUpdateBanner(state.latest);
      return;
    }
    try {
      const res = await fetch(UPDATE_META_URL, {
        cache: 'no-store',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        headers: { Accept: 'application/json,text/plain' },
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const text = await res.text();
      let latest = '';
      try { latest = (JSON.parse(text) || {}).version || ''; } catch { /* fallback below */ }
      if (!latest) {
        const m = text.match(/\/\/\s*@version\s+([0-9][0-9.]*)/);
        latest = m ? m[1] : '';
      }
      if (!latest) throw new Error('No version');
      store.set('update', Object.assign({}, state, { at: Date.now(), latest }));
      if (versionCmp(latest, VERSION) > 0) {
        showUpdateBanner(latest, manual);
        if (manual) toast(`Update ${latest} available`);
      } else {
        hideUpdateBanner();
        if (manual) toast(`You are on the latest version (${VERSION})`);
      }
    } catch (e) {
      if (manual) toast('Could not check for updates');
    }
  }

  // --- login ------------------------------------------------------------------

  function detectLoggedIn() {
    const c = document.cookie || '';
    return /(?:^|;\s*)(ipb_member_id|ipb_pass_hash|igneous)=/.test(c);
  }

  function loginCardHtml(message, { full = false } = {}) {
    return `<div class="ehx-login" style="${full ? '' : 'padding-top:22px'}">
      <div class="ehx-logo">${IS_EX ? 'X' : 'E'}</div>
      <h2>${IS_EX ? 'Sign in to ExHentai' : 'Sign in to E-Hentai'}</h2>
      <p>${esc(message || 'Log in to use favorites, watched tags and your gallery settings.')}</p>
      <div class="ehx-row" style="justify-content:center;flex-wrap:wrap">
        <button class="ehx-btn ehx-btn-primary" data-act="login">${icon('login', 17)} Log in</button>
        <button class="ehx-btn" data-act="original">${icon('external', 16)} Original site</button>
      </div>
      <div class="ehx-note">
        On iPhone/iPad the easiest method is <b>Cookie login</b>: open E-Hentai on a desktop browser, copy
        <code>ipb_member_id</code>, <code>ipb_pass_hash</code> and <code>igneous</code>, then paste them here.
        ${IS_EX ? 'ExHentai requires the cookies to be set for <b>exhentai.org</b>.' : ''}
      </div>
    </div>`;
  }

  function openLoginSheet() {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const s = openSheet({
      title: 'Log in',
      body: `
        <p style="margin:2px 0 14px;font-size:12.5px;line-height:1.55;color:var(--muted)">
          Sign in with your E-Hentai forum account. The cookie method is the most reliable on iPhone and iPad.
        </p>
        <div class="ehx-seg" id="ehx-login-mode" style="margin:0 0 14px">
          <button data-loginmode="cookie" class="${isIOS ? 'ehx-active' : ''}">${icon('check', 14)} Cookie login</button>
          <button data-loginmode="password" class="${isIOS ? '' : 'ehx-active'}">${icon('user', 14)} Password</button>
        </div>
        <form data-ehx-cookie style="${isIOS ? '' : 'display:none'}">
          <div class="ehx-field"><label class="ehx-label">ipb_member_id</label><input class="ehx-input" name="ipb_member_id" inputmode="numeric" autocomplete="off" autocapitalize="off" spellcheck="false" required></div>
          <div class="ehx-field"><label class="ehx-label">ipb_pass_hash</label><input class="ehx-input" name="ipb_pass_hash" autocomplete="off" autocapitalize="off" spellcheck="false" required></div>
          <div class="ehx-field"><label class="ehx-label">igneous ${IS_EX ? '' : '(optional for E-Hentai)'}</label><input class="ehx-input" name="igneous" autocomplete="off" autocapitalize="off" spellcheck="false" ${IS_EX ? 'required' : ''}></div>
          <button class="ehx-btn ehx-btn-primary ehx-btn-block" type="submit">${icon('check', 17)} Save cookies & reload</button>
          <div class="ehx-note">
            Copy these three cookies from a browser where you are logged in, then paste them here. They are written with
            <code>path=/</code> for <code>${esc(location.hostname)}</code> and expire in one year. They are never sent anywhere except ${esc(SITE_NAME)}.
          </div>
        </form>
        <form data-ehx-login style="${isIOS ? 'display:none' : ''}">
          <div class="ehx-field"><label class="ehx-label">Username</label><input class="ehx-input" name="UserName" autocomplete="username" autocapitalize="off" spellcheck="false" required></div>
          <div class="ehx-field"><label class="ehx-label">Password</label><input class="ehx-input" type="password" name="PassWord" autocomplete="current-password" required></div>
          <button class="ehx-btn ehx-btn-primary ehx-btn-block" type="submit">${icon('login', 17)} Log in with password</button>
          <div class="ehx-note">
            You will briefly leave the app for the E-Hentai forums, then come back. On ExHentai the cookie method is usually required.
          </div>
        </form>`,
    });
    const picker = s.sheet.querySelector('#ehx-login-mode');
    if (picker) {
      picker.addEventListener('click', (e) => {
        const b = e.target.closest('[data-loginmode]');
        if (!b) return;
        const mode = b.dataset.loginmode;
        for (const x of picker.querySelectorAll('button')) x.classList.toggle('ehx-active', x === b);
        const cookieForm = s.sheet.querySelector('form[data-ehx-cookie]');
        const passForm = s.sheet.querySelector('form[data-ehx-login]');
        if (cookieForm) cookieForm.style.display = mode === 'cookie' ? '' : 'none';
        if (passForm) passForm.style.display = mode === 'password' ? '' : 'none';
      });
    }
    return s;
  }

  function submitPasswordLogin(form) {
    const user = form.querySelector('[name="UserName"]')?.value?.trim();
    const pass = form.querySelector('[name="PassWord"]')?.value || '';
    if (!user || !pass) { toast('Enter your username and password'); return; }
    form.action = 'https://forums.e-hentai.org/index.php?act=Login&CODE=01';
    form.method = 'post';
    form.target = '_self';
    for (const [name, value] of [['CookieDate', '1'], ['b', 'd'], ['bt', '1-6'], ['ipb_login_submit', 'Login!']]) {
      let input = form.querySelector(`[name="${name}"]`);
      if (!input) {
        input = document.createElement('input');
        input.type = 'hidden';
        input.name = name;
        form.appendChild(input);
      }
      input.value = value;
    }
    form.submit();
  }

  function submitCookieLogin(form) {
    const get = (n) => (form.querySelector(`[name="${n}"]`)?.value || '').trim();
    const member = get('ipb_member_id');
    const hash = get('ipb_pass_hash');
    const igneous = get('igneous');
    if (!member || !hash) { toast('ipb_member_id and ipb_pass_hash are required'); return; }
    const domain = /(^|\.)exhentai\.org$/i.test(location.hostname) ? '.exhentai.org' : '.e-hentai.org';
    const pairs = [['ipb_member_id', member], ['ipb_pass_hash', hash], ['igneous', igneous]].filter(([, v]) => v);
    for (const [k, v] of pairs) {
      const safe = v.replace(/[;\s]/g, '');
      document.cookie = `${k}=${safe}; domain=${domain}; path=/; max-age=31536000; secure; samesite=lax`;
      document.cookie = `${k}=${safe}; path=/; max-age=31536000; secure; samesite=lax`;
    }
    app.loggedIn = true;
    toast('Cookies saved — reloading…');
    setTimeout(() => location.reload(), 650);
  }

  function logout() {
    confirmSheet('Log out?', 'This opens the forum logout page. Local reading history stays on this device.', { ok: 'Log out', danger: true })
      .then((yes) => {
        if (!yes) return;
        store.del('favorites');
        try { favoritesCache.clear(); } catch { /* noop */ }
        persistClear();
        openExternal('https://forums.e-hentai.org/index.php?act=Login&CODE=03');
      });
  }

  // --- misc UI helpers --------------------------------------------------------

  function categoryColor(cat) { return CATEGORY_COLORS[cat] || '#9e9e9e'; }

  const LANG_CODES = {
    japanese: 'JP', english: 'EN', chinese: 'CN', korean: 'KR', spanish: 'ES',
    french: 'FR', german: 'DE', portuguese: 'PT', russian: 'RU', italian: 'IT',
    vietnamese: 'VI', thai: 'TH', polish: 'PL', indonesian: 'ID', dutch: 'NL',
    hungarian: 'HU', czech: 'CS', arabic: 'AR', ukrainian: 'UA', turkish: 'TR',
    romanian: 'RO', greek: 'GR', swedish: 'SV', finnish: 'FI', norwegian: 'NO',
    danish: 'DA', hebrew: 'HE', hindi: 'HI', translated: 'TR', rewrite: 'RW',
  };
  function langCode(name) {
    const key = String(name || '').trim().toLowerCase();
    if (!key) return '';
    return LANG_CODES[key] || key.slice(0, 2).toUpperCase();
  }

  function tagPill(t, { nav = true, small = false } = {}) {
    const attrs = nav ? `data-tag="${esc(t.full || ((t.ns ? t.ns + ':' : '') + t.name))}"` : '';
    const cls = `ehx-tagpill${t.watched ? ' ehx-tag-watched' : ''}${t.hidden ? ' ehx-hiddenop' : ''}`;
    return `<${nav ? 'button' : 'span'} class="${cls}" ${attrs}>${esc(t.name || t.full)}</${nav ? 'button' : 'span'}>`;
  }

  function tagUrl(full) {
    return '/tag/' + encodeURIComponent(full).replace(/%20/g, '+').replace(/%3A/gi, ':');
  }

  function ratingStars(rating10) {
    const stars = clamp((rating10 || 0) / 2, 0, 5);
    const full = Math.round(stars);
    return `<span class="ehx-rating ehx-stars" aria-label="${stars.toFixed(1)} / 5">${Array.from({ length: 5 }, (_, i) => `<span class="ehx-star${i < full ? ' ehx-star-on' : ''}">${icon('star', 11)}</span>`).join('')}</span>`;
  }

  // Covers are only ~250px wide, but the image hosts often take 2-4s per
  // request and throttle concurrent connections. Loading every cover at once
  // made the last row wait ~20s, so only cards near the viewport get a real
  // src; the rest are hydrated by an IntersectionObserver as you scroll.
  const COVER_PLACEHOLDER = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
  let coverObserver = null;

  function hydrateCovers(root) {
    if (!root) return;
    const imgs = Array.from(root.querySelectorAll('img[data-cover]'));
    if (!imgs.length) return;
    if (!('IntersectionObserver' in window)) {
      for (const img of imgs) {
        img.src = img.getAttribute('data-cover');
        img.removeAttribute('data-cover');
      }
      return;
    }
    if (!coverObserver) {
      coverObserver = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const img = entry.target;
          coverObserver.unobserve(img);
          const src = img.getAttribute('data-cover');
          img.removeAttribute('data-cover');
          if (src) img.src = src;
        }
      }, { rootMargin: '250px 0px' });
    }
    for (const img of imgs) coverObserver.observe(img);
  }

  function galleryCardHtml(g, opts = {}) {
    const prog = progressStore.get(g.gid);
    const cat = g.category || 'Misc';
    const color = categoryColor(cat);
    const blurred = settings.blurCovers && !opts.noBlur;
    const tags = (g.tags || []).slice(0, 8);
    const rating = g.rating
      ? `<span class="ehx-rating ehx-rating-compact">${icon('star', 11)}${g.rating.toFixed(1)}</span>${ratingStars(g.rating)}`
      : '';
    const pct = prog && prog.total ? clamp(Math.round((prog.index / prog.total) * 100), 1, 100) : 0;
    const lang = langCode(g.language);
    const pages = g.pages
      ? `<span class="ehx-badge ehx-pages">${lang ? esc(lang) + ' ' : ''}${formatNum(g.pages)}P</span>`
      : (lang ? `<span class="ehx-badge ehx-lang">${esc(lang)}</span>` : '');
    const imgAttrs = opts.eager
      ? `loading="eager" fetchpriority="high" decoding="async" src="${esc(g.cover)}"`
      : `loading="lazy" fetchpriority="low" decoding="async" data-cover="${esc(g.cover)}" src="${COVER_PLACEHOLDER}"`;
    const cover = g.cover
      ? `<img ${imgAttrs} alt="" class="${blurred ? 'ehx-cover-blur' : ''}">`
      : `<div class="ehx-center" style="height:100%;color:var(--muted2)">${icon('image', 28)}</div>`;
    const tagsHtml = settings.showTags && tags.length
      ? `<div class="ehx-card-tags">${tags.map((t) => `<span class="ehx-tag${t.watched ? ' ehx-tag-watched' : ''}">${esc(t.name)}</span>`).join('')}</div>`
      : '';
    return `<a class="ehx-card" href="${esc(g.url)}" data-gid="${esc(g.gid)}">
      <div class="ehx-cover${opts.eager ? ' ehx-cover-loading' : ''}">
        ${cover}
        <span class="ehx-badge ehx-cat" style="--catcolor:${color}">${esc(cat)}</span>
        ${pages}
        ${prog ? `<span class="ehx-badge ehx-resume">P${prog.index}</span><div class="ehx-progress"><i style="width:${pct}%"></i></div>` : ''}
        ${blurred ? `<div class="ehx-reveal" data-reveal>${icon('eye', 24)}<span>Tap to reveal</span></div>` : ''}
      </div>
      <div class="ehx-card-body">
        <div class="ehx-card-title">${esc(g.title)}</div>
        <div class="ehx-card-sub">
          ${rating}
          ${g.uploader ? `<span class="ehx-nowrap">${esc(g.uploader)}</span>` : ''}
          ${g.posted ? `<span class="ehx-dim" style="margin-left:auto;font-size:9.5px">${esc(g.posted)}</span>` : ''}
        </div>
        ${tagsHtml}
      </div>
    </a>`;
  }

  function bindCoverReveal(container) {
    container.addEventListener('click', (e) => {
      const r = e.target.closest('[data-reveal]');
      if (!r) return;
      e.preventDefault();
      e.stopPropagation();
      const card = r.closest('.ehx-card');
      if (!card) return;
      r.remove();
      card.querySelectorAll('.ehx-cover-blur').forEach((el) => el.classList.remove('ehx-cover-blur'));
      card.dataset.revealed = '1';
    }, true);
  }

  function sanitizeComment(html) {
    try {
      const doc = new DOMParser().parseFromString('<div>' + html + '</div>', 'text/html');
      const root = doc.body.firstElementChild;
      const allowed = new Set(['A', 'B', 'I', 'U', 'S', 'BR', 'P', 'DIV', 'SPAN', 'IMG', 'BLOCKQUOTE', 'UL', 'OL', 'LI', 'STRONG', 'EM', 'CODE']);
      const walk = (node) => {
        for (const child of Array.from(node.childNodes)) {
          if (child.nodeType === 1) {
            if (!allowed.has(child.tagName)) {
              child.replaceWith(...Array.from(child.childNodes));
              continue;
            }
            for (const at of Array.from(child.attributes)) {
              const n = at.name.toLowerCase();
              if (n === 'href' && child.tagName === 'A') {
                const v = absUrl(at.value);
                if (!/^https?:/i.test(v)) child.removeAttribute('href');
                else child.setAttribute('href', v);
              } else if (n === 'src' && child.tagName === 'IMG') {
                const v = absUrl(at.value);
                if (!/^https?:/i.test(v)) child.remove();
                else child.setAttribute('src', v);
              } else if (n !== 'alt' && n !== 'title') {
                child.removeAttribute(at.name);
              }
            }
            walk(child);
          } else if (child.nodeType !== 3) {
            child.remove();
          }
        }
      };
      walk(root);
      return root.innerHTML;
    } catch {
      return esc(html);
    }
  }

  // --- global events & shell --------------------------------------------------

  function bindGlobalEvents() {
    document.addEventListener('click', (e) => {
      const actEl = e.target.closest && e.target.closest('[data-act]');
      if (actEl) {
        const name = actEl.getAttribute('data-act');
        if (runAction(name, actEl)) {
          e.preventDefault();
          return;
        }
      }

      const tagEl = e.target.closest && e.target.closest('[data-tag]');
      if (tagEl) {
        e.preventDefault();
        navigate(tagUrl(tagEl.getAttribute('data-tag')));
        return;
      }

      const a = e.target.closest && e.target.closest('a[href]');
      if (!a) return;
      if (a.target === '_blank' || a.hasAttribute('download')) return;
      const href = a.getAttribute('href') || '';
      if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:')) return;

      const abs = absUrl(href);
      if (!/^https?:/i.test(abs)) return;
      const r = classify(abs);
      if (r.name !== 'external') {
        e.preventDefault();
        // Hand the list item to the detail page so its hero can paint before
        // the (often slow) gallery HTML arrives.
        let gallery = null;
        if (a.classList && a.classList.contains('ehx-card') && app.listState) {
          const gid = a.getAttribute('data-gid');
          if (gid) gallery = (app.listState.items || []).find((g) => String(g.gid) === gid) || null;
        }
        navigate(abs, gallery ? { gallery } : {});
      } else if (sameOrigin(abs)) {
        e.preventDefault();
        location.href = abs;
      } else {
        e.preventDefault();
        const w = window.open(abs, '_blank', 'noopener');
        if (!w) location.href = abs;
      }
    }, true);

    document.addEventListener('submit', (e) => {
      const f = e.target;
      if (f.matches && f.matches('form[data-ehx-login]')) {
        e.preventDefault();
        submitPasswordLogin(f);
      } else if (f.matches && f.matches('form[data-ehx-cookie]')) {
        e.preventDefault();
        submitCookieLogin(f);
      }
    }, true);

    // A blocked/failed cover should not leave an ugly broken image.
    document.addEventListener('load', (e) => {
      const img = e.target;
      if (!img || img.tagName !== 'IMG') return;
      const cover = img.closest && img.closest('.ehx-cover');
      if (cover) cover.classList.remove('ehx-cover-loading');
    }, true);
    document.addEventListener('error', (e) => {
      const img = e.target;
      if (!img || img.tagName !== 'IMG') return;
      const cover = img.closest && img.closest('.ehx-cover');
      if (!cover || cover.querySelector('.ehx-cover-fallback')) return;
      cover.classList.remove('ehx-cover-loading');
      img.remove();
      const fb = document.createElement('div');
      fb.className = 'ehx-cover-fallback ehx-center';
      fb.innerHTML = icon('image', 28);
      cover.prepend(fb);
    }, true);

    window.addEventListener('popstate', popstateHandler);
    window.addEventListener('online', () => toast('Back online'));
    window.addEventListener('offline', () => toast('You are offline'));
  }

  function registerDefaultActions() {
    onAction('back', () => goBack());
    onAction('drawer', () => openDrawer());
    onAction('close-drawer', () => closeDrawer());
    onAction('close-sheet', () => { const s = app.sheets[app.sheets.length - 1]; if (s) { s.scrim.remove(); s.sheet.remove(); app.sheets.pop(); document.body.style.overflow = app.sheets.length ? 'hidden' : ''; } });
    onAction('home', () => navigate('/'));
    onAction('search', () => navigate('/#ehx-search'));
    onAction('settings', () => navigate('/#ehx-settings'));
    onAction('history', () => navigate('/#ehx-history'));
    onAction('login', () => openLoginSheet());
    onAction('logout', () => logout());
    onAction('theme', () => {
      settings.theme = settings.theme === 'auto' ? 'dark' : settings.theme === 'dark' ? 'light' : 'auto';
      saveSettings({ theme: settings.theme });
      renderDrawer();
      toast('Theme: ' + settings.theme);
    });
    onAction('original', () => { location.href = originalUrl(currentUrl()); });
    onAction('share', async () => {
      const data = { title: document.title, url: location.href };
      try {
        if (navigator.share) await navigator.share(data);
        else { await navigator.clipboard.writeText(location.href); toast('Link copied'); }
      } catch { /* cancelled */ }
    });
    onAction('top', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
    onAction('toggle-layout', () => {
      const next = settings.layout === 'grid' ? 'list' : 'grid';
      saveSettings({ layout: next });
      for (const grid of document.querySelectorAll('.ehx-grid')) {
        if (!grid.querySelector('.ehx-card')) continue;
        grid.classList.toggle('ehx-listmode', next === 'list');
        grid.style.setProperty('--ehx-cols', String(settings.columns));
      }
      for (const btn of document.querySelectorAll('[data-act="toggle-layout"]')) {
        btn.innerHTML = `${icon(next === 'grid' ? 'list' : 'grid', 13)} ${next === 'grid' ? 'List' : 'Grid'}`;
      }
    });
    onAction('refresh', () => { if (app.refresh) app.refresh(); else navigate(currentUrl(), { replace: true, restore: false }); });
    onAction('retry', () => { if (app.retry) app.retry(); else navigate(currentUrl(), { replace: true, restore: false }); });
  }

  function initShell() {
    // Remove the original page's styles and scripts before we take over.
    for (const el of $$('link[rel="stylesheet"], style:not(#ehx-style), script, ins, iframe, object')) {
      try { el.remove(); } catch { /* noop */ }
    }
    for (const el of $$('meta[name="viewport"]')) el.remove();
    const vp = document.createElement('meta');
    vp.name = 'viewport';
    vp.content = 'width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=5';
    document.head.appendChild(vp);

    for (const href of ['https://ehgt.org', 'https://s.exhentai.org']) preconnectOrigin(href);

    let tc = document.querySelector('meta[name="theme-color"]');
    if (!tc) {
      tc = document.createElement('meta');
      tc.name = 'theme-color';
      document.head.appendChild(tc);
    }
    applyTheme();

    document.body.removeAttribute('style');
    document.body.className = 'ehx-body';

    app.root = document.createElement('div');
    app.root.id = APP_ID;
    app.root.innerHTML = `
      <header class="ehx-topbar" id="ehx-topbar"></header>
      <main class="ehx-main" id="ehx-main"></main>
      <nav class="ehx-tabbar" id="ehx-tabbar" aria-label="Primary"></nav>
      <div id="ehx-layer"></div>
      <div id="ehx-drawer-scrim" class="ehx-scrim"></div>
      <aside id="ehx-drawer" class="ehx-drawer" aria-label="Menu"></aside>`;
    document.body.replaceChildren(app.root);

    app.topbar = $('#ehx-topbar', app.root);
    app.main = $('#ehx-main', app.root);
    app.tabbar = $('#ehx-tabbar', app.root);
    app.layer = $('#ehx-layer', app.root);
    app.drawer = $('#ehx-drawer', app.root);
    app.scrim = $('#ehx-drawer-scrim', app.root);
    app.scrim.style.display = 'none';
    app.drawer.style.display = 'none';

    app.scrim.addEventListener('click', closeDrawer);
    app.root.addEventListener('click', (e) => {
      if (e.target.closest('[data-act="theme"]')) renderDrawer();
    });

    bindGlobalEvents();
    registerDefaultActions();
    bindCoverReveal(app.root);
    renderTabbar();
    renderDrawer();

    // Update sticky top bar when scrolling (subtle shadow).
    window.addEventListener('scroll', throttleRaf(() => {
      if (!app.topbar) return;
      app.topbar.style.boxShadow = window.scrollY > 4 ? '0 6px 22px rgba(0,0,0,.22)' : 'none';
    }), { passive: true });
  }
  // ---------------------------------------------------------------------------
  // Gallery list page
  // ---------------------------------------------------------------------------

  const CATEGORY_TO_PATH = Object.fromEntries(Object.entries(CATEGORY_PATHS).map(([p, n]) => [n, p]));
  const listMemory = new Map();
  const favoritesCache = new Map();
  const FAVORITES_TTL = 300000;
  const FAV_STORE = 'favorites';
  const favRefreshing = new Set();

  function persistFavorites(url, data) {
    if (!url || !data || !Array.isArray(data.items) || data.loggedOut || data.sad) return;
    try { store.set(FAV_STORE, { url, at: Date.now(), data }); } catch { /* quota */ }
  }

  function persistedFavorites(url) {
    const p = store.get(FAV_STORE, null);
    if (!p || p.url !== url || !p.data || !Array.isArray(p.data.items)) return null;
    return p;
  }

  function backgroundFavoritesRefresh(url) {
    if (favRefreshing.has(url)) return;
    favRefreshing.add(url);
    fetchDoc(url, { force: true })
      .then((rec) => {
        const d = parseList(rec.doc, rec.url);
        if (!d.loggedOut && !d.sad) {
          favoritesCache.set(url, { at: Date.now(), data: d });
          persistFavorites(url, d);
        }
      })
      .catch(() => { /* background */ })
      .finally(() => favRefreshing.delete(url));
  }

  function rememberList(url, state) {
    if (!url || !state || !state.items) return;
    listMemory.set(url, {
      items: state.items.slice(),
      next: state.next || '',
      title: state.title || '',
      range: state.range || '',
      favLinks: state.favLinks || [],
      rendered: state.rendered || 0,
    });
    while (listMemory.size > 10) listMemory.delete(listMemory.keys().next().value);
  }

  let preloadTimer = 0;
  let preloadSeq = 0;
  let nextPrefetchTimer = 0;

  function scheduleNextListPrefetch(state) {
    clearTimeout(nextPrefetchTimer);
    if (!state || !state.next) return;
    const seq = app.navSeq;
    nextPrefetchTimer = setTimeout(() => {
      if (seq !== app.navSeq || !app.listState || app.listState.url !== state.url) return;
      const run = () => {
        if (seq !== app.navSeq) return;
        fetchDoc(canonicalListUrl(state.next), { ttl: 120000 }).catch(() => { /* prefetch */ });
      };
      if ('requestIdleCallback' in window) requestIdleCallback(run, { timeout: 2500 });
      else run();
    }, 1500);
  }
  function schedulePreload() {
    // Favorites is a 7-10s ExHentai request. Starting it 800ms after launch
    // competed with the first covers and every list navigation. Wait until the
    // user has been idle for a few seconds, and reset on every navigation.
    const seq = ++preloadSeq;
    clearTimeout(preloadTimer);
    preloadTimer = setTimeout(() => {
      preloadTimer = 0;
      const run = () => {
        if (seq !== preloadSeq) return;
        if (document.visibilityState === 'hidden') return;
        if (document.querySelector('.ehx-cover-loading')) {
          setTimeout(() => { if (seq === preloadSeq) preloadFavorites(); }, 1500);
          return;
        }
        preloadFavorites();
      };
      if ('requestIdleCallback' in window) requestIdleCallback(run, { timeout: 3000 });
      else run();
    }, 5000);
  }

  function preloadFavorites() {
    if (app.route && (app.route.name === 'reader' || app.route.kind === 'favorites.php')) return;
    const url = canonicalListUrl('/favorites.php');
    const persisted = persistedFavorites(url);
    if (persisted && !favoritesCache.has(url)) favoritesCache.set(url, { at: persisted.at, data: persisted.data });
    const hit = favoritesCache.get(url);
    const weakHit = hit && hit.data && hit.data.items && hit.data.items.length && hit.data.items.every((g) => !g.cover);
    if (hit && !weakHit && Date.now() - hit.at < FAVORITES_TTL) return;
    fetchDoc(url, { ttl: 120000 })
      .then((rec) => {
        const data = parseList(rec.doc, rec.url);
        if (!data.loggedOut && !data.sad) {
          favoritesCache.set(url, { at: Date.now(), data });
          persistFavorites(url, data);
        }
      })
      .catch(() => { /* background warm-up */ });
  }

  function canonicalListUrl(url) {
    try {
      const u = new URL(url, location.href);
      // Cursor pages (`?next=`/`?prev=`) reject inline_set with a 302 on
      // favorites; the parser handles whatever layout the site returns.
      if (u.searchParams.has('next') || u.searchParams.has('prev')) {
        u.searchParams.delete('inline_set');
      } else {
        // Compact is the layout the parser and tests target, and unlike
        // `dm_e` it does not rewrite the visitor's site display-mode cookie.
        u.searchParams.set('inline_set', 'dm_l');
      }
      return u.href;
    } catch {
      return url;
    }
  }

  function listTitle(route, url, data) {
    const q = parseQuery(url).get('f_search') || '';
    if (q) return 'Search';
    if (route.kind === 'popular') return 'Popular';
    if (route.kind === 'favorites.php') return 'Favorites';
    if (route.kind === 'watched') return 'Watched';
    if (route.kind === 'tag') return 'Tag: ' + (route.tag || '');
    if (route.kind === 'uploader') return 'Uploader: ' + (route.uploader || '');
    if (route.kind === 'category') return route.category || 'Galleries';
    return data && data.title ? data.title : 'Front Page';
  }

  function galleryGridHtml(items, opts = {}) {
    const eager = opts.eager || 0;
    return items.map((g, i) => galleryCardHtml(g, { eager: i < eager })).join('');
  }

  function chipsHtml(route, url, data) {
    const q = parseQuery(url).get('f_search') || '';
    const path = new URL(url, location.href).pathname.replace(/\/+$/, '') || '/';
    const chips = [];

    if (q) {
      chips.push(`<span class="ehx-chip ehx-active">${icon('search', 13)} ${esc(q)}</span>`);
      chips.push(`<button class="ehx-chip" data-act="edit-search">Edit</button>`);
      chips.push(`<a class="ehx-chip" href="/">Clear</a>`);
    } else if (route.kind === 'tag') {
      chips.push(`<a class="ehx-chip" href="/">All</a>`);
      chips.push(`<span class="ehx-chip ehx-active">${icon('tag', 13)} ${esc(route.tag || '')}</span>`);
    } else if (route.kind === 'uploader') {
      chips.push(`<a class="ehx-chip" href="/">All</a>`);
      chips.push(`<span class="ehx-chip ehx-active">${icon('user', 13)} ${esc(route.uploader || '')}</span>`);
    } else if (route.kind === 'popular') {
      chips.push(`<span class="ehx-chip ehx-active">${icon('popular', 13)} Popular</span>`);
      chips.push(`<a class="ehx-chip" href="/toplist.php">${icon('star', 13)} Toplists</a>`);
      chips.push(`<a class="ehx-chip" href="/">${icon('home', 13)} Recent</a>`);
    } else if (route.kind === 'favorites.php') {
      chips.push(`<span class="ehx-chip ehx-active">${icon('heart', 13)} Favorites</span>`);
      chips.push(`<a class="ehx-chip" href="/watched">${icon('eye', 13)} Watched</a>`);
      const curFav = parseQuery(url).get('fav') || '';
      for (const f of (data && data.favLinks) || []) {
        const fv = parseQuery(f.href).get('fav') || '';
        chips.push(`<a class="ehx-chip${fv === curFav && (curFav || fv === '') ? ' ehx-active' : ''}" href="${esc(f.href)}">${esc(f.label)}</a>`);
      }
    } else if (route.kind === 'watched') {
      chips.push(`<span class="ehx-chip ehx-active">${icon('eye', 13)} Watched</span>`);
      chips.push(`<a class="ehx-chip" href="/favorites.php">${icon('heart', 13)} Favorites</a>`);
    } else {
      chips.push(`<a class="ehx-chip${path === '/' ? ' ehx-active' : ''}" href="/">All</a>`);
      for (const cat of CATEGORY_ORDER) {
        const p = CATEGORY_TO_PATH[cat];
        chips.push(`<a class="ehx-chip${path === p ? ' ehx-active' : ''}" href="${p}"><span class="ehx-dot" style="background:${categoryColor(cat)}"></span>${esc(cat)}</a>`);
      }
    }

    chips.push(`<button class="ehx-chip" data-act="toggle-layout">${icon(settings.layout === 'grid' ? 'list' : 'grid', 13)} ${settings.layout === 'grid' ? 'List' : 'Grid'}</button>`);
    return `<div class="ehx-chips">${chips.join('')}</div>`;
  }

  async function renderListPage(route, url, initialDoc, opts = {}) {
    const q = parseQuery(url).get('f_search') || '';
    const title = listTitle(route, url);
    const isFav = route.kind === 'favorites.php';
    const favUrl = isFav ? canonicalListUrl(url) : '';

    // Draw the shell immediately.
    const isTab = !q && ['home', 'popular', 'favorites.php', 'watched'].includes(route.kind);
    renderTopbar({
      brand: route.kind === 'home' && !q,
      left: isTab || route.kind === 'tag' || route.kind === 'uploader' || route.kind === 'category'
        ? (isTab ? '' : iconBtn('back', 'back', 'Back'))
        : iconBtn('back', 'back', 'Back'),
      title,
      right: `${iconBtn('search', 'search', 'Search')}${iconBtn('refresh', 'refresh', 'Refresh')}${iconBtn('drawer', 'menu', 'Menu')}`,
    });
    document.title = title + ' · ' + SITE_NAME;

    const refreshList = () => {
      htmlCache.delete(canonicalListUrl(url));
      listMemory.delete(url);
      if (isFav) favoritesCache.delete(favUrl);
      navigate(url, { replace: true, restore: false });
    };
    app.refresh = refreshList;

    const memorized = opts.pop ? listMemory.get(url) : null;
    let data = memorized
      ? { items: memorized.items, next: memorized.next, title: memorized.title, range: memorized.range, favLinks: memorized.favLinks || [], loggedOut: false, sad: false }
      : null;
    let fromCache = false;
    if (!data && isFav && !opts.force) {
      let cachedFav = favoritesCache.get(favUrl);
      if (!cachedFav) {
        const persisted = persistedFavorites(favUrl);
        if (persisted) {
          cachedFav = { at: persisted.at, data: persisted.data };
          favoritesCache.set(favUrl, cachedFav);
        }
      }
      if (cachedFav) {
        data = cachedFav.data;
        fromCache = true;
        if (Date.now() - cachedFav.at >= FAVORITES_TTL) backgroundFavoritesRefresh(favUrl);
      }
    }
    if (!data && initialDoc) {
      try { data = parseList(initialDoc, url); } catch (e) { console.warn(e); }
    }

    const weak = !!(data && data.items.length && data.items.every((g) => !g.cover));
    const emptyHint = !!(data && data.items.length === 0 && !data.loggedOut && !data.sad &&
      /no hits|no results|no favorites|nothing found|you have no/i.test((initialDoc && initialDoc.body && initialDoc.body.textContent) || ''));
    const needsFetch = !data || (!data.items.length && !data.loggedOut && !data.sad && !emptyHint) || (weak && route.kind !== 'favorites.php');
    if (needsFetch) {
      const loadingText = isFav ? 'Loading favorites…' : q ? 'Searching…' : 'Loading galleries…';
      app.main.innerHTML = chipsHtml(route, url, data) +
        `<div class="ehx-loading-label"><div class="ehx-spinner"></div>${loadingText}</div>` +
        skeletonGrid(4);
      const slowTimer = setTimeout(() => {
        if (opts.seq && opts.seq !== app.navSeq) return;
        const label = app.main.querySelector('.ehx-loading-label');
        if (label) label.innerHTML = `<div class="ehx-spinner"></div>Still loading${isFav ? ' favorites' : ''}… the site may be slow`;
      }, 6000);
      const rec = await fetchDoc(canonicalListUrl(url), { force: !!opts.force, priority: true });
      clearTimeout(slowTimer);
      if (opts.seq && opts.seq !== app.navSeq) return;
      data = parseList(rec.doc, rec.url);
      fromCache = false;
    }

    app.loggedIn = data.loggedOut ? false : app.loggedIn;
    if (!data.loggedOut && (route.kind === 'favorites.php' || route.kind === 'watched')) app.loggedIn = true;
    if (q) { app.lastQuery = q; app.lastFcats = parseQuery(url).get('f_cats') || '0'; }

    if (data.sad || data.loggedOut) {
      const msg = data.sad
        ? 'ExHentai is showing the sad panda because this browser has no valid ExHentai cookies. Use Cookie login below.'
        : 'This page requires an E-Hentai account.';
      app.main.innerHTML = chipsHtml(route, url, data) + loginCardHtml(msg, { full: true });
      return;
    }

    if (isFav && !fromCache) {
      favoritesCache.set(favUrl, { at: Date.now(), data });
      persistFavorites(favUrl, data);
    }

    const items = data.items || [];
    for (const g of items.slice(0, 16)) {
      if (!g.cover) continue;
      try { preconnectOrigin(new URL(g.cover).origin); } catch { /* noop */ }
    }
    const rememberedCount = (memorized && memorized.rendered) || 0;
    const initialCount = Math.min(items.length, Math.max(rememberedCount, Math.min(30, items.length)));
    const state = {
      url,
      title,
      range: data.range || '',
      favLinks: data.favLinks || [],
      items: items.slice(),
      next: data.next || '',
      seen: new Set(items.map((g) => String(g.gid))),
      rendered: initialCount,
      loading: false,
      io: null,
      sentinel: null,
      count: items.length,
    };
    app.listState = state;
    scheduleNextListPrefetch(state);

    const gridClass = 'ehx-grid' + (settings.layout === 'list' ? ' ehx-listmode' : '');
    const gridStyle = `--ehx-cols:${settings.columns}`;
    const hasMore = state.rendered < state.items.length || !!state.next;

    app.main.innerHTML = `
      ${chipsHtml(route, url, data)}
      <div class="${gridClass}" id="ehx-gallery-grid" style="${gridStyle}">
        ${galleryGridHtml(items.slice(0, initialCount), { eager: 4 })}
      </div>
      <div id="ehx-list-footer" class="ehx-loading" style="display:${hasMore ? 'grid' : 'none'}">
        <div class="ehx-spinner"></div>
      </div>
      <div id="ehx-sentinel" style="height:1px"></div>
      ${items.length === 0 ? emptyState(q ? 'No results' : 'Nothing here', q ? `No galleries matched <b>${esc(q)}</b>.` : 'This list is empty.', `<button class="ehx-btn" data-act="original">Open original site</button>`, 'search') : ''}`;

    const grid = $('#ehx-gallery-grid');
    const footer = $('#ehx-list-footer');
    const sentinel = $('#ehx-sentinel');
    hydrateCovers(app.main);

    function renderMoreLocal() {
      if (!grid || state.rendered >= state.items.length) return false;
      const chunk = state.items.slice(state.rendered, state.rendered + 30);
      if (!chunk.length) return false;
      grid.insertAdjacentHTML('beforeend', galleryGridHtml(chunk));
      hydrateCovers(grid);
      state.rendered += chunk.length;
      return true;
    }

    async function loadMore() {
      if (state.loading || !state.next) return;
      state.loading = true;
      footer.style.display = 'grid';
      footer.innerHTML = '<div class="ehx-spinner"></div>';
      try {
        const rec = await fetchDoc(canonicalListUrl(state.next));
        const more = parseList(rec.doc, rec.url);
        const fresh = more.items.filter((g) => !state.seen.has(String(g.gid)));
        for (const g of fresh) state.seen.add(String(g.gid));
        if (fresh.length) {
          state.items.push(...fresh);
          state.count += fresh.length;
          renderMoreLocal();
        }
        state.next = more.next || '';
        if (!fresh.length && state.next) {
          // Guard against a pagination loop.
          state.next = '';
        }
        footer.style.display = (state.rendered < state.items.length || state.next) ? 'grid' : 'none';
      } catch (e) {
        console.warn(e);
        footer.innerHTML = `<button class="ehx-btn" data-act="load-more">Retry loading more</button>`;
        onAction('load-more', () => { state.loading = false; loadMore(); });
      } finally {
        state.loading = false;
      }
    }

    onAction('load-more', loadMore);
    onAction('edit-search', () => {
      app.lastQuery = q;
      app.lastFcats = parseQuery(url).get('f_cats') || '0';
      navigate('/#ehx-search');
    });

    if ((state.next || state.rendered < state.items.length) && 'IntersectionObserver' in window && sentinel) {
      const io = new IntersectionObserver((entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        if (renderMoreLocal()) {
          footer.style.display = (state.rendered < state.items.length || state.next) ? 'grid' : 'none';
          return;
        }
        loadMore();
      }, { rootMargin: '900px 0px' });
      io.observe(sentinel);
      state.io = io;
      app.cleanup = () => io.disconnect();
    }
  }
  // ---------------------------------------------------------------------------
  // Gallery detail page
  // ---------------------------------------------------------------------------

  function detailPageUrl(galleryUrl, page) {
    try {
      const u = new URL(galleryUrl, location.href);
      if (page == null || page === 0) u.searchParams.delete('p');
      else u.searchParams.set('p', String(page));
      return u.href;
    } catch {
      return galleryUrl;
    }
  }

  function thumbPageOf(url) {
    const n = num(parseQuery(url).get('p'));
    return n == null ? 0 : n;
  }

  function thumbHalfOf(url) {
    return num(parseQuery(url).get('ph')) === 1 ? 1 : 0;
  }

  function renderThumbGrid(data, gid) {
    const prog = progressStore.get(gid);
    const currentIndex = prog ? prog.index : -1;
    const baseW = (data.thumbs.find((t) => t.w) || {}).w || 200;
    const cells = data.thumbs.map((t) => {
      const sprite = t.sprite
        ? `<div class="ehx-thumb-inner" data-sprite="${esc(t.sprite)}" data-ox="${t.offX}" data-oy="${t.offY}" style="width:${t.w}px;height:${t.h}px"></div>`
        : `<img loading="lazy" decoding="async" src="${esc(t.img)}" alt="">`;
      const ratio = t.sprite ? `${t.w}/${t.h}` : `${t.w}/${t.h}`;
      return `<a class="ehx-thumb${currentIndex === t.idx ? ' ehx-read' : ''}${t.sprite ? ' ehx-thumb-loading' : ''}" href="${esc(t.href)}" style="aspect-ratio:${ratio}">
        ${sprite}<span class="ehx-thumb-num">${t.idx}</span>
      </a>`;
    }).join('');
    return `<div class="ehx-thumbs" id="ehx-thumbs" data-basew="${baseW}" style="--thumb-scale:.5">${cells}</div>`;
  }

  function detailActionsHtml(data, progress) {
    const readLabel = progress ? `P${progress.index}` : 'Read';
    return `<div class="ehx-actions">
      <button class="ehx-action ehx-primary" data-act="read" ${data.thumbs.length ? '' : 'disabled'}>
        <span class="ehx-abox">${icon('book', 22)}</span><span>${esc(readLabel)}</span>
      </button>
      <button class="ehx-action" data-act="fav">
        <span class="ehx-abox">${icon('heart', 21)}</span><span>${data.isFavorited ? 'Saved' : 'Favorite'}</span>
      </button>
      <button class="ehx-action" data-act="rate">
        <span class="ehx-abox">${icon('star', 21)}</span><span>Rate</span>
      </button>
      <button class="ehx-action" data-act="archive">
        <span class="ehx-abox">${icon('downloadCloud', 21)}</span><span>Archive</span>
      </button>
      <button class="ehx-action" data-act="torrent">
        <span class="ehx-abox">${icon('download', 21)}</span><span>Torrent</span>
      </button>
      <button class="ehx-action" data-act="comments">
        <span class="ehx-abox">${icon('comment', 21)}</span><span>Comments${data.comments.length ? ' ' + data.comments.length : ''}</span>
      </button>
      <button class="ehx-action" data-act="detail-share">
        <span class="ehx-abox">${icon('share', 20)}</span><span>Share</span>
      </button>
      <button class="ehx-action" data-act="detail-original">
        <span class="ehx-abox">${icon('external', 20)}</span><span>Original</span>
      </button>
    </div>`;
  }

  function detailInfoHtml(data) {
    const items = [];
    const add = (k, v) => { if (v) items.push(`<div class="ehx-info-item"><div class="ehx-info-k">${esc(k)}</div><div class="ehx-info-v">${v}</div></div>`); };
    add('Posted', esc(data.posted || '—'));
    add('Language', esc(data.language || '—'));
    add('Pages', data.pages ? `${formatNum(data.pages)}` : '—');
    add('File size', esc(data.fileSize || '—'));
    add('Favorited', data.favorited ? `${formatNum(data.favorited)} times` : '—');
    add('Rating', data.rating ? `${data.rating.toFixed(2)} / 10${data.ratingCount ? ` · ${formatNum(data.ratingCount)} votes` : ''}` : '—');
    return `<div class="ehx-info">${items.join('')}</div>`;
  }

  function detailTagsHtml(data) {
    if (!data.tags.length) return '';
    const groups = new Map();
    for (const t of data.tags) {
      const ns = t.ns || 'other';
      if (!groups.has(ns)) groups.set(ns, []);
      groups.get(ns).push(t);
    }
    const ordered = [...groups.keys()].sort((a, b) => {
      const ia = TAG_ORDER.indexOf(a);
      const ib = TAG_ORDER.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
    return ordered.map((ns) => `<div class="ehx-taggroup">
      <div class="ehx-taggroup-title">${esc(ns)}</div>
      <div class="ehx-tagwrap">${groups.get(ns).map((t) => tagPill(t, { nav: true })).join('')}</div>
    </div>`).join('');
  }

  function detailCommentsHtml(data) {
    if (!data.comments.length) return '';
    const preview = data.comments.slice(0, 2).map((c) => `<div class="ehx-comment" style="padding:10px 0;border-bottom:1px solid var(--line)">
      <div class="ehx-row" style="gap:7px;font-size:11px;color:var(--muted2)">
        <b style="color:var(--text)">${esc(c.author)}</b>
        ${c.uploader ? '<span class="ehx-pill" style="height:19px;font-size:9.5px">Uploader</span>' : ''}
        <span style="margin-left:auto">${esc(c.date)}</span>
      </div>
      <div class="ehx-desc" style="margin-top:4px;font-size:12.5px">${sanitizeComment(c.body)}</div>
    </div>`).join('');
    return `<div class="ehx-section-head">
      <div class="ehx-section-title">Comments <span>${data.comments.length}</span></div>
      <button class="ehx-chip" data-act="comments">View all</button>
    </div>
    ${preview}`;
  }

  function formDataFrom(form) {
    const fd = new FormData();
    for (const el of Array.from(form.elements || [])) {
      if (!el.name || el.disabled) continue;
      const type = (el.type || '').toLowerCase();
      if (type === 'submit' || type === 'button' || type === 'reset' || type === 'image' || type === 'file') continue;
      if (type === 'checkbox' || type === 'radio') {
        if (el.checked) fd.append(el.name, el.value);
      } else if (el.tagName === 'SELECT' && el.multiple) {
        for (const o of Array.from(el.selectedOptions || [])) fd.append(el.name, o.value);
      } else {
        fd.append(el.name, el.value);
      }
    }
    const submit = form.querySelector('[type="submit"][name]');
    if (submit) fd.set(submit.name, submit.value || '1');
    return fd;
  }

  // Paint the gallery hero from the list item immediately. The gallery HTML
  // can take several seconds on ExHentai; showing the known title/cover means
  // the tap never lands on an empty skeleton.
  function detailPreviewHtml(g) {
    const cover = g.cover || '';
    const cat = g.category || 'Misc';
    const color = categoryColor(cat);
    return `<div class="ehx-detail">
      <div class="ehx-dhero">
        ${cover ? `<div class="ehx-dhero-bg" style="background-image:url('${esc(cover)}')"></div>` : ''}
        <div class="ehx-dhero-shade"></div>
        <div class="ehx-dhero-inner">
          <div class="ehx-dcover">${cover ? `<img src="${esc(cover)}" alt="" fetchpriority="high" decoding="async">` : `<div class="ehx-center" style="height:100%;color:var(--muted2)">${icon('image', 30)}</div>`}</div>
          <div class="ehx-dhead">
            <div class="ehx-dtitle">${esc(g.title || 'Gallery')}</div>
            <div class="ehx-dmeta">
              <span class="ehx-pill" style="color:${color};border-color:${color}55"><span class="ehx-dot" style="background:${color}"></span>${esc(cat)}</span>
              ${g.pages ? `<span class="ehx-pill">${formatNum(g.pages)} pages</span>` : ''}
            </div>
          </div>
        </div>
      </div>
      <div class="ehx-dstats">${g.uploader ? `<span>${icon('user', 12)} <b>${esc(g.uploader)}</b></span>` : ''}</div>
      <div class="ehx-actions">
        <button class="ehx-action ehx-primary" data-act="read"><span class="ehx-abox">${icon('book', 22)}</span><span>Read</span></button>
      </div>
      <div style="padding:14px">${skeletonGrid(2)}</div>
    </div>`;
  }

  async function renderDetailPage(route, url, initialDoc, opts = {}) {
    const gid = route.gid;
    const token = route.token;
    const galleryUrl = absUrl(`/g/${gid}/${token}/`);
    const thumbPage = thumbPageOf(url);
    const thumbHalf = thumbHalfOf(url);

    renderTopbar({
      left: iconBtn('back', 'back', 'Back'),
      title: 'Gallery',
      right: `${iconBtn('detail-share', 'share', 'Share')}${iconBtn('detail-menu', 'menu', 'Gallery menu')}`,
    });
    if (!initialDoc && opts.gallery) {
      renderTopbar({
        left: iconBtn('back', 'back', 'Back'),
        title: opts.gallery.title || 'Gallery',
        right: `${iconBtn('detail-share', 'share', 'Share')}${iconBtn('detail-menu', 'menu', 'Gallery menu')}`,
      });
      document.title = (opts.gallery.title || 'Gallery') + ' · ' + SITE_NAME;
      app.main.innerHTML = detailPreviewHtml(opts.gallery);
      // The reader can start from the route's gid/token even before the
      // gallery HTML is parsed.
      onAction('read', async () => {
        const first = await resolvePageUrl(gid, token, 1);
        if (first) navigate(first);
        else toast('Could not resolve the first page');
      });
    } else {
      app.main.innerHTML = `
        <div class="ehx-detail">
          <div class="ehx-skel" style="height:260px;border-radius:0"></div>
          <div style="padding:14px">${skeletonGrid(2)}</div>
        </div>`;
    }

    const fetchUrl = detailPageUrl(galleryUrl, thumbPage);
    let data = null;
    if (initialDoc) {
      if (sadPanda(initialDoc) || loginPage(initialDoc)) {
        app.main.innerHTML = loginCardHtml(sadPanda(initialDoc)
          ? 'ExHentai needs valid cookies before it will show galleries. Use Cookie login below.'
          : 'Log in to view this gallery.');
        return;
      }
      try { data = parseDetail(initialDoc, fetchUrl); } catch (e) { console.warn(e); }
    }

    if (!data || !data.title) {
      const rec = await fetchDoc(fetchUrl, { force: !!opts.force, priority: true });
      if (opts.seq && opts.seq !== app.navSeq) return;
      if (sadPanda(rec.doc) || loginPage(rec.doc)) {
        app.main.innerHTML = loginCardHtml(sadPanda(rec.doc)
          ? 'ExHentai needs valid cookies before it will show galleries. Use Cookie login below.'
          : 'Log in to view this gallery.');
        return;
      }
      data = parseDetail(rec.doc, rec.url);
    }

    if (!data.title) {
      app.main.innerHTML = emptyState('Gallery unavailable', 'This gallery may have been removed or expunged.', `<button class="ehx-btn" data-act="original">Open original site</button>`, 'info');
      return;
    }

    if (typeof data.apiuid === 'number' && data.apiuid > 0) { app.loggedIn = true; renderDrawer(); }

    const cover = data.cover || '';
    if (cover) { try { preconnectOrigin(new URL(cover).origin); } catch { /* noop */ } }
    for (const t of (data.thumbs || []).slice(0, 3)) {
      const u = t.sprite || t.img;
      if (!u) continue;
      try { preconnectOrigin(new URL(u).origin); } catch { /* noop */ }
    }
    const progress = progressStore.get(gid);
    const catPath = CATEGORY_TO_PATH[data.category] || '/';
    const title = data.title;

    renderTopbar({
      left: iconBtn('back', 'back', 'Back'),
      title,
      right: `${iconBtn('detail-share', 'share', 'Share')}${iconBtn('detail-menu', 'menu', 'Gallery menu')}`,
    });
    document.title = title + ' · ' + SITE_NAME;

    const firstThumb = data.thumbs[0];
    const totalPages = data.pages || (data.thumbRange && data.thumbRange.total) || data.thumbs.length || 0;
    // The site returns 40 thumbs per page at 100px (gt100) and 20 at 200px
    // (gt200). Always show 20 per app page; the second half comes from the
    // same sheet and needs no extra request.
    const DISPLAY_PER = 20;
    const sitePer = data.thumbsPerPage || 20;
    const halvesPerSite = Math.max(1, Math.ceil(sitePer / DISPLAY_PER));
    const appPage = thumbPage * halvesPerSite + thumbHalf;
    const totalThumbPages = (data.thumbRange && data.thumbRange.total) || data.pages || data.thumbs.length || 0;
    const pageCount = Math.ceil(totalThumbPages / DISPLAY_PER);
    const shownThumbs = data.thumbs.slice(thumbHalf * DISPLAY_PER, thumbHalf * DISPLAY_PER + DISPLAY_PER);
    const shownFrom = appPage * DISPLAY_PER + 1;
    const shownTo = Math.min(totalThumbPages, shownFrom + shownThumbs.length - 1);

    app.main.innerHTML = `
      <div class="ehx-detail">
        <div class="ehx-dhero">
          ${cover ? `<div class="ehx-dhero-bg" style="background-image:url('${esc(cover)}')"></div>` : ''}
          <div class="ehx-dhero-shade"></div>
          <div class="ehx-dhero-inner">
            <div class="ehx-dcover">${cover ? `<img src="${esc(cover)}" alt="" fetchpriority="high" decoding="async">` : `<div class="ehx-center" style="height:100%;color:var(--muted2)">${icon('image', 30)}</div>`}</div>
            <div class="ehx-dhead">
              <div class="ehx-dtitle">${esc(data.title)}</div>
              ${data.jpTitle && data.jpTitle !== data.title ? `<div class="ehx-dsub">${esc(data.jpTitle)}</div>` : ''}
              <div class="ehx-dmeta">
                <a class="ehx-pill" href="${catPath}" style="color:${categoryColor(data.category)};border-color:${categoryColor(data.category)}55"><span class="ehx-dot" style="background:${categoryColor(data.category)}"></span>${esc(data.category)}</a>
                ${data.rating ? `<span class="ehx-pill" style="color:#f5c451">${icon('star', 12)} ${data.rating.toFixed(2)}</span>` : ''}
                ${totalPages ? `<span class="ehx-pill">${formatNum(totalPages)} pages</span>` : ''}
              </div>
            </div>
          </div>
        </div>

        <div class="ehx-dstats">
          ${data.uploader ? `<a href="${esc(data.uploaderUrl || ('/uploader/' + encodeURIComponent(data.uploader)))}">${icon('user', 12)} <b>${esc(data.uploader)}</b></a>` : ''}
          ${data.posted ? `<span>${icon('clock', 12)} ${esc(data.posted)}</span>` : ''}
          ${data.favorited ? `<span>${icon('heart', 12)} ${formatNum(data.favorited)}</span>` : ''}
        </div>

        ${detailActionsHtml(data, progress)}
        <div class="ehx-section">${detailInfoHtml(data)}</div>

        ${data.tags.length ? `<div class="ehx-section">
          <div class="ehx-section-head"><div class="ehx-section-title">Tags <span>${data.tags.length}</span></div></div>
          ${detailTagsHtml(data)}
        </div>` : ''}

        ${data.comments.length ? `<div class="ehx-section">${detailCommentsHtml(data)}</div>` : ''}

        ${data.thumbs.length ? `<div class="ehx-section-head" style="padding:0 14px">
          <div class="ehx-section-title">Pages <span>${shownThumbs.length ? `Showing ${formatNum(shownFrom)}–${formatNum(shownTo)} of ${formatNum(totalThumbPages)}` : esc(data.gpc || '')}</span></div>
          <button class="ehx-chip" data-act="jump-page">${icon('jump', 13)} Jump</button>
        </div>
        ${renderThumbGrid({ ...data, thumbs: shownThumbs }, gid)}
        <div class="ehx-thumbctl">
          <button class="ehx-iconbtn ehx-small" data-act="thumb-prev" ${appPage <= 0 ? 'disabled' : ''}>${icon('back', 18)}</button>
          <div class="ehx-grow">Page ${Math.min(appPage + 1, Math.max(1, pageCount))} / ${Math.max(1, pageCount)}</div>
          <button class="ehx-iconbtn ehx-small" data-act="thumb-next" ${appPage >= pageCount - 1 ? 'disabled' : ''}>${icon('forward', 18)}</button>
        </div>` : ''}
        <div style="height:18px"></div>
      </div>`;

    // Thumbnail sprite scaling. The sprite sheet lives on a slow random
    // hath.network host, so don't request it until the grid is near the
    // viewport — it used to compete with the hero cover on first paint.
    const thumbsEl = $('#ehx-thumbs');
    if (thumbsEl) {
      const cleanups = [];
      let spritesPainted = false;
      let spriteReady = false;
      const paintSprites = () => {
        if (spritesPainted) return;
        spritesPainted = true;
        const cells = thumbsEl.querySelectorAll('[data-sprite]');
        if (!cells.length) return;
        const first = cells[0];
        for (const el of cells) {
          el.style.backgroundImage = `url('${el.dataset.sprite}')`;
          el.style.backgroundPosition = `${el.dataset.ox}px ${el.dataset.oy}px`;
        }
        // Keep the shimmer until the sheet has actually decoded.
        const probe = new Image();
        const markReady = () => {
          spriteReady = true;
          thumbsEl.querySelectorAll('.ehx-thumb-loading').forEach((el) => el.classList.remove('ehx-thumb-loading'));
        };
        probe.onload = markReady;
        probe.onerror = markReady;
        probe.src = first.dataset.sprite;
      };
      if ('IntersectionObserver' in window) {
        const io = new IntersectionObserver((entries) => {
          if (!entries.some((e) => e.isIntersecting)) return;
          io.disconnect();
          paintSprites();
        }, { rootMargin: '400px 0px' });
        io.observe(thumbsEl);
        cleanups.push(() => io.disconnect());
      }
      // The grid sits below the fold, so waiting for it to scroll into view
      // meant the 200px preview sheet only started downloading when the user
      // reached it. Start it in the background after the hero instead.
      const paintSoon = () => paintSprites();
      if ('requestIdleCallback' in window) requestIdleCallback(paintSoon, { timeout: 1200 });
      else setTimeout(paintSoon, 600);

      // On the second half of a 40-thumb sheet, the next sheet is the likely
      // next page. Warm its HTML and sprite in the background so paging feels
      // instant; this is the only async boundary the site's sheet model has.
      const sitePageCount = Math.ceil(totalThumbPages / sitePer);
      if (halvesPerSite > 1 && thumbHalf === halvesPerSite - 1 && thumbPage + 1 < sitePageCount) {
        let readyWaits = 0;
        const warmNext = async () => {
          if (!spriteReady && readyWaits++ < 6) {
            setTimeout(warmNext, 1500);
            return;
          }
          try {
            const nextUrl = detailPageUrl(galleryUrl, thumbPage + 1);
            const rec = await fetchDoc(nextUrl, { ttl: 300000 });
            const d = parseDetail(rec.doc, rec.url);
            const nextSprite = (d.thumbs.find((t) => t.sprite) || {}).sprite;
            if (nextSprite) {
              const im = new Image();
              im.decoding = 'async';
              im.src = nextSprite;
            }
          } catch { /* background */ }
        };
        if ('requestIdleCallback' in window) requestIdleCallback(warmNext, { timeout: 2500 });
        else setTimeout(warmNext, 1200);
      }
      const setScale = () => {
        const cell = thumbsEl.querySelector('.ehx-thumb');
        if (!cell) return;
        const w = cell.getBoundingClientRect().width;
        const base = parseFloat(thumbsEl.dataset.basew) || 200;
        if (w > 0) thumbsEl.style.setProperty('--thumb-scale', String(w / base));
      };
      requestAnimationFrame(setScale);
      if ('ResizeObserver' in window) {
        const ro = new ResizeObserver(setScale);
        ro.observe(thumbsEl);
        cleanups.push(() => ro.disconnect());
      }
      app.cleanup = () => cleanups.forEach((fn) => fn());
    }

    // Warm the first reader page while the user reads the details, so Read
    // is a cache hit instead of an /s/ round-trip.
    if (firstThumb && firstThumb.href) {
      const warm = () => { fetchDoc(firstThumb.href, { ttl: 300000 }).catch(() => { /* background */ }); };
      if ('requestIdleCallback' in window) requestIdleCallback(warm, { timeout: 3500 });
      else setTimeout(warm, 1800);
    }

    app.refresh = () => {
      htmlCache.delete(url);
      htmlCache.delete(fetchUrl);
      navigate(url, { replace: true, restore: false });
    };

    // --- actions -------------------------------------------------------------
    onAction('read', async () => {
      const p = progressStore.get(gid) || {};
      if (data.cover || !p.cover) {
        progressStore.set(gid, {
          index: p.index || 1,
          total: p.total || data.pages || 0,
          pageUrl: p.pageUrl || '',
          title: data.title,
          cover: data.cover || p.cover || '',
          galleryUrl,
          token,
        });
      }
      if (p && p.pageUrl) { navigate(p.pageUrl); return; }
      if (p && p.index > 1) {
        const pageUrl = await resolvePageUrl(gid, token, p.index);
        if (pageUrl) { navigate(pageUrl); return; }
      }
      if (firstThumb) navigate(firstThumb.href);
      else toast('No readable pages found');
    });

    const goThumbAppPage = (n) => {
      if (n < 0 || n >= pageCount) return;
      const sitePage = Math.floor(n / halvesPerSite);
      const half = n % halvesPerSite;
      let target = detailPageUrl(galleryUrl, sitePage);
      if (half) target += (target.includes('?') ? '&' : '?') + 'ph=' + half;
      navigate(target, { restore: false });
    };
    onAction('thumb-prev', () => goThumbAppPage(appPage - 1));
    onAction('thumb-next', () => goThumbAppPage(appPage + 1));

    onAction('jump-page', () => {
      const s = openSheet({
        title: 'Jump to page',
        body: `<div class="ehx-field"><label class="ehx-label">Page number</label><input class="ehx-input" id="ehx-jump-input" type="number" inputmode="numeric" min="1" max="${totalPages || 1}" value="${progress ? progress.index : 1}"></div>
          <p style="font-size:11.5px;color:var(--muted2);line-height:1.5;margin:0 0 4px">Total: ${formatNum(totalPages)} pages.</p>`,
        footer: `<button class="ehx-btn" data-x="cancel">Cancel</button><button class="ehx-btn ehx-btn-primary" data-x="go">Open page</button>`,
      });
      s.sheet.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-x]');
        if (!b) return;
        if (b.dataset.x === 'cancel') { s.close(); return; }
        const n = clamp(num($('#ehx-jump-input', s.sheet).value) || 1, 1, totalPages || 1);
        s.close();
        const pageUrl = (data.thumbs.find((t) => t.idx === n) || {}).href || await resolvePageUrl(gid, token, n);
        if (pageUrl) navigate(pageUrl);
        else toast('Could not find that page');
      });
    });

    onAction('fav', async () => {
      if (app.loggedIn === false) { openLoginSheet(); return; }
      const urlPopup = absUrl(`/gallerypopups.php?gid=${gid}&t=${token}&act=addfav`);
      let rec;
      try { rec = await fetchDoc(urlPopup, { force: true }); } catch (e) { openExternal(urlPopup); return; }
      if (loginPage(rec.doc)) { openLoginSheet(); return; }
      const forms = $$('form', rec.doc);
      const form = forms.find((f) => f.querySelector('select[name="favcat"]')) || forms.find((f) => /fav/i.test(f.getAttribute('action') || ''));
      if (!form) { openExternal(urlPopup); return; }
      const select = form.querySelector('select[name="favcat"]');
      const noteEl = form.querySelector('[name="favnote"]');
      const options = select ? $$('option', select).map((o) => ({ value: o.getAttribute('value') || '', label: text(o), selected: o.hasAttribute('selected') })) : [];
      const current = (options.find((o) => o.selected) || options[0] || {}).value || '0';
      const s = openSheet({
        title: 'Favorite gallery',
        body: `
          <div class="ehx-field"><label class="ehx-label">Folder</label>
            <select class="ehx-input" id="ehx-favcat">${options.map((o) => `<option value="${esc(o.value)}" ${o.value === current ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select>
          </div>
          <div class="ehx-field"><label class="ehx-label">Note (optional)</label><textarea class="ehx-input" id="ehx-favnote" maxlength="200">${esc(noteEl ? noteEl.value : '')}</textarea></div>
          ${data.isFavorited ? '<p style="font-size:11.5px;color:var(--muted2);margin:0">This gallery is already in your favorites. Applying changes will move it.</p>' : ''}`,
        footer: `<button class="ehx-btn" data-x="cancel">Cancel</button><button class="ehx-btn ehx-btn-primary" data-x="save">Save</button>`,
      });
      s.sheet.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-x]');
        if (!b) return;
        if (b.dataset.x === 'cancel') { s.close(); return; }
        const fd = formDataFrom(form);
        fd.set('favcat', $('#ehx-favcat', s.sheet).value);
        fd.set('favnote', $('#ehx-favnote', s.sheet).value);
        const action = form.getAttribute('action') || '';
        const absAction = action ? absUrl(action, rec.url) : urlPopup;
        try {
          const res = await postForm(absAction, fd, { priority: true });
          if (loginPage(res.doc)) { openLoginSheet(); return; }
          data.isFavorited = true;
          try { favoritesCache.clear(); } catch { /* noop */ }
          s.close();
          toast('Favorites updated');
          app.refresh();
        } catch (err) {
          toast('Could not update favorites');
        }
      });
    });

    onAction('rate', async () => {
      if (typeof data.apiuid === 'number' && data.apiuid <= 0) { openLoginSheet(); return; }
      if (!data.apikey) { openExternal(galleryUrl); return; }
      let chosen = Math.round(data.rating) || 0;
      const stars = Array.from({ length: 10 }, (_, i) => `<button class="ehx-rate-star" data-score="${i + 1}" style="font-size:23px;color:${i < chosen ? '#f5c451' : 'var(--card2)'};padding:3px">★</button>`).join('');
      const s = openSheet({
        title: 'Rate this gallery',
        body: `<div style="text-align:center;padding:4px 0 12px" id="ehx-rate-stars">${stars}</div>
          <div style="text-align:center;font-size:12.5px;color:var(--muted)" id="ehx-rate-label">${chosen ? chosen + ' / 10' : 'Tap a star'}</div>
          <p style="font-size:11px;color:var(--muted2);text-align:center;margin:12px 0 0">E-Hentai ratings use a 1–10 scale.</p>`,
      });
      const starsEl = $('#ehx-rate-stars', s.sheet);
      starsEl.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-score]');
        if (!b) return;
        const score = parseInt(b.dataset.score, 10);
        chosen = score;
        $$('[data-score]', starsEl).forEach((el) => { el.style.color = parseInt(el.dataset.score, 10) <= score ? '#f5c451' : 'var(--card2)'; });
        $('#ehx-rate-label', s.sheet).textContent = score + ' / 10';
        try {
          const res = await postJson('https://api.e-hentai.org/api.php', {
            method: 'rategallery', apiuid: data.apiuid, apikey: data.apikey,
            gid: Number(gid), token, rating: score,
          });
          if (res.json && !res.json.error) {
            data.rating = res.json.rating ?? data.rating;
            toast('Rated ' + score + '/10');
            s.close();
          } else {
            toast('Rating failed');
          }
        } catch {
          toast('Rating failed — try the original site');
        }
      });
    });

    onAction('archive', () => {
      if (!data.archiveUrl) { toast('Archive link not available'); return; }
      const s = openSheet({
        title: 'Archive download',
        body: `<p style="font-size:13px;line-height:1.6;color:var(--muted);margin:0 0 12px">E-Hentai's archive downloader opens on the original site. Choose a resolution there and use your GP / free quota as usual.</p>
          <div class="ehx-note">${esc(data.fileSize || '')}${data.pages ? ' · ' + formatNum(data.pages) + ' pages' : ''}</div>`,
        footer: `<button class="ehx-btn" data-x="cancel">Close</button><button class="ehx-btn ehx-btn-primary" data-x="open">Open archiver</button>`,
      });
      s.sheet.addEventListener('click', (e) => {
        const b = e.target.closest('[data-x]');
        if (!b) return;
        s.close();
        if (b.dataset.x === 'open') openExternal(data.archiveUrl);
      });
    });

    onAction('torrent', () => {
      if (!data.torrentUrl) { toast('No torrents available'); return; }
      const s = openSheet({
        title: 'Torrents',
        body: `<p style="font-size:13px;line-height:1.6;color:var(--muted);margin:0 0 12px">Torrent downloads are handled by the original site.</p>`,
        footer: `<button class="ehx-btn" data-x="cancel">Close</button><button class="ehx-btn ehx-btn-primary" data-x="open">Open torrents</button>`,
      });
      s.sheet.addEventListener('click', (e) => {
        const b = e.target.closest('[data-x]');
        if (!b) return;
        s.close();
        if (b.dataset.x === 'open') openExternal(data.torrentUrl);
      });
    });

    onAction('comments', () => {
      if (!data.comments.length) { toast('No comments yet'); return; }
      const body = data.comments.map((c) => `<div style="padding:12px 0;border-bottom:1px solid var(--line)">
        <div class="ehx-row" style="gap:7px;font-size:11px;color:var(--muted2);margin-bottom:5px">
          <b style="color:var(--text);font-size:12px">${esc(c.author)}</b>
          ${c.uploader ? '<span class="ehx-pill" style="height:19px;font-size:9.5px">Uploader</span>' : ''}
          <span style="margin-left:auto">${esc(c.date)}</span>
        </div>
        <div class="ehx-desc" style="font-size:12.5px">${sanitizeComment(c.body)}</div>
      </div>`).join('');
      openSheet({ title: `Comments (${data.comments.length})`, body });
    });

    onAction('detail-menu', () => {
      openSheet({
        title: 'Gallery',
        body: `<div class="ehx-group">
          <button class="ehx-drawer-item" data-x="share">${icon('share', 20)}<span>Share</span></button>
          <button class="ehx-drawer-item" data-x="copy">${icon('external', 20)}<span>Copy link</span></button>
          <button class="ehx-drawer-item" data-x="refresh">${icon('refresh', 20)}<span>Refresh</span></button>
          <button class="ehx-drawer-item" data-x="original">${icon('external', 20)}<span>Open on original site</span></button>
        </div>`,
      }).sheet.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-x]');
        if (!b) return;
        if (b.dataset.x === 'share') { runAction('detail-share'); }
        if (b.dataset.x === 'copy') { try { await navigator.clipboard.writeText(location.href); toast('Link copied'); } catch { toast('Copy failed'); } }
        if (b.dataset.x === 'refresh') app.refresh();
        if (b.dataset.x === 'original') location.href = originalUrl(galleryUrl);
        closeSheets();
      });
    });

    onAction('detail-share', async () => {
      try {
        if (navigator.share) await navigator.share({ title: data.title, url: galleryUrl });
        else { await navigator.clipboard.writeText(galleryUrl); toast('Link copied'); }
      } catch { /* cancelled */ }
    });
    onAction('detail-original', () => { location.href = originalUrl(galleryUrl); });
  }
  // ---------------------------------------------------------------------------
  // Reader core
  // ---------------------------------------------------------------------------

  let reader = null;

  async function resolvePageUrl(gid, token, idx) {
    if (!gid || !token || !idx) return '';
    const key = `${gid}:${idx}`;
    if (pageUrlCache.has(key)) return pageUrlCache.get(key);

    const galleryUrl = absUrl(`/g/${gid}/${token}/`);
    const tries = [];
    const addTries = (per) => {
      const p = Math.floor((idx - 1) / per);
      for (const n of [p, p - 1, p + 1]) {
        if (n >= 0 && !tries.includes(n)) tries.push(n);
      }
    };
    addTries(20);
    for (let ti = 0; ti < tries.length; ti++) {
      const pp = tries[ti];
      try {
        const rec = await fetchDoc(detailPageUrl(galleryUrl, pp), { ttl: 300000, priority: true });
        const d = parseDetail(rec.doc, rec.url);
        if (!d.thumbs.length) continue;
        for (const t of d.thumbs) pageUrlCache.set(`${gid}:${t.idx}`, t.href);
        if (pageUrlCache.has(key)) return pageUrlCache.get(key);
        if (d.pages && idx > d.pages) break;
        // The user's thumbnail size decides whether there are 20 or 40
        // thumbnails per page; retry with the right page if it was 40.
        const per = d.thumbsPerPage || 20;
        addTries(per);
      } catch (e) {
        // Try the next thumbnail page.
      }
    }
    return pageUrlCache.get(key) || '';
  }

  async function fetchShowPage(r, idx, pageUrl) {
    const imgkey = (pageUrl.match(/\/s\/([0-9a-f]+)\//i) || [])[1];
    if (!r.showkey || !r.apiUrl || !r.gid || !imgkey) throw new Error('No showpage context');
    const res = await fetch(r.apiUrl, {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method: 'showpage',
        gid: Number(r.gid),
        page: idx,
        imgkey,
        showkey: r.showkey,
      }),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch { throw new Error('Bad showpage JSON'); }
    if (!data || data.error || !data.i3) throw new Error((data && data.error) || 'No image');
    const doc = new DOMParser().parseFromString(
      `<div id="i3">${data.i3}</div><div id="i6">${data.i6 || ''}</div>`,
      'text/html',
    );
    const img = doc.querySelector('#i3 img#img') || doc.querySelector('#i3 img');
    if (!img) throw new Error('No image');
    const src = safeImage(img.getAttribute('src'));
    if (!src) throw new Error('No image');
    const fullEl = doc.querySelector('#i6 a[href*="/fullimg/"]');
    return {
      src,
      w: stylePx(img, 'width') || num(data.x) || 800,
      h: stylePx(img, 'height') || num(data.y) || 1122,
      index: num(data.p) || idx,
      total: r.total,
      pageInfo: String(data.i || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(),
      galleryUrl: r.galleryUrl,
      fullUrl: fullEl ? absUrl(fullEl.getAttribute('href'), pageUrl) : '',
      login: false,
      sad: false,
    };
  }

  async function getReaderRecord(r, idx, { force = false, priority = false } = {}) {
    if (!r) throw new Error('Reader closed');
    const existing = r.pages.get(idx);
    if (existing && existing.src && !force) return existing;
    if (r.inflight.has(idx) && !force) return r.inflight.get(idx);

    const job = (async () => {
      let pageUrl = (existing && existing.url) || '';
      if (!pageUrl || force) {
        pageUrl = await resolvePageUrl(r.gid, r.token, idx);
      }
      if (!pageUrl) throw new Error('Could not resolve page ' + idx);

      let parsed = null;
      let apiFailed = false;
      const imgkey = (pageUrl.match(/\/s\/([0-9a-f]+)\//i) || [])[1];
      if (r.showkey && r.apiUrl && r.gid && imgkey) {
        try { parsed = await fetchShowPage(r, idx, pageUrl); } catch { apiFailed = true; parsed = null; }
      }
      if (!parsed) {
        const rec = await fetchDoc(pageUrl, { force: force || apiFailed, priority });
        if (sadPanda(rec.doc) || loginPage(rec.doc)) {
          const err = new Error('Login required');
          err.login = true;
          throw err;
        }
        parsed = parseReader(rec.doc, rec.url);
        if (parsed.showkey) {
          r.showkey = parsed.showkey;
          r.apiUrl = parsed.apiUrl;
        }
      }
      if (parsed.login || parsed.sad) {
        const err = new Error('Login required');
        err.login = true;
        throw err;
      }
      if (!parsed.src) {
        const err = new Error('Image not available');
        err.empty = true;
        throw err;
      }

      const useOriginal = settings.readerResolution === 'original' && !!parsed.fullUrl;
      const record = {
        idx,
        url: pageUrl,
        src: useOriginal ? parsed.fullUrl : parsed.src,
        original: useOriginal,
        resampled: parsed.src,
        w: parsed.w || 800,
        h: parsed.h || 1122,
        total: parsed.total || r.total || 1,
        pageInfo: parsed.pageInfo || '',
        fullUrl: parsed.fullUrl || '',
        title: parsed.title || r.title,
        galleryUrl: parsed.galleryUrl || r.galleryUrl,
      };
      r.pages.set(idx, record);
      pageUrlCache.set(`${r.gid}:${idx}`, pageUrl);

      if (parsed.total && parsed.total !== r.total && r.total <= 1) {
        r.total = parsed.total;
        if (r.layoutBuilt) renderReaderLayout(r);
      }
      if (parsed.galleryUrl && !r.galleryUrl) {
        r.galleryUrl = parsed.galleryUrl;
        const m = parsed.galleryUrl.match(/\/g\/(\d+)\/([0-9a-f]+)/i);
        if (m) { r.gid = m[1]; r.token = m[2]; }
      }
      if (parsed.title && (!r.title || r.title === 'Reader')) r.title = parsed.title;

      for (const nav of [parsed.prev, parsed.next, parsed.first, parsed.last]) {
        if (!nav || !nav.n || !nav.href) continue;
        const prevRec = r.pages.get(nav.n) || {};
        if (!prevRec.url) r.pages.set(nav.n, Object.assign(prevRec, { idx: nav.n, url: nav.href }));
        pageUrlCache.set(`${r.gid}:${nav.n}`, nav.href);
      }

      return record;
    })();

    r.inflight.set(idx, job);
    try {
      return await job;
    } finally {
      r.inflight.delete(idx);
    }
  }

  function updateReaderUrl(r, idx, rec) {
    if (!r || !rec || !rec.url) return;
    if (r.index !== idx) return;
    if (location.href === rec.url) return;
    try {
      history.replaceState({ ehx: true, d: app.depth }, '', rec.url);
    } catch { /* noop */ }
    app.route = { name: 'reader', gid: r.gid, index: idx, url: rec.url };
  }

  function renderReaderLayout(r) {
    if (!r || !r.root) return;
    r.layoutBuilt = false;
    if (r.ioLoad) r.ioLoad.disconnect();
    if (r.ioVisible) r.ioVisible.disconnect();
    r.ioLoad = null;
    r.ioVisible = null;
    if (r.pagedTimer) clearTimeout(r.pagedTimer);

    r.mode = settings.readerMode === 'paged' ? 'paged' : 'vertical';
    r.fit = settings.readerFit === 'contain' ? 'contain' : 'width';
    r.root.className = `ehx-reader ${r.mode === 'paged' ? 'ehx-paged' : 'ehx-vertical'}${r.fit === 'contain' ? ' ehx-fit-contain' : ''}`;
    r.scroll.className = 'ehx-rscroll';
    r.scroll.innerHTML = '';
    r.scroll.scrollTop = 0;
    r.scroll.scrollLeft = 0;
    r.slotEls = [];

    if (r.mode === 'paged') buildPagedLayout(r);
    else buildVerticalLayout(r);

    r.layoutBuilt = true;
    updateChrome(r);
  }

  function buildVerticalLayout(r) {
    const total = Math.max(1, r.total || 1);
    const frag = document.createDocumentFragment();
    for (let i = 1; i <= total; i++) {
      const el = document.createElement('div');
      el.className = 'ehx-rpage';
      el.dataset.idx = String(i);
      el.style.aspectRatio = `${r.firstW || 800}/${r.firstH || 1122}`;
      r.slotEls[i] = el;
      frag.appendChild(el);
    }
    r.scroll.appendChild(frag);

    r.ioLoad = new IntersectionObserver((entries) => {
      for (const en of entries) {
        if (en.isIntersecting) loadSlot(r, en.target);
      }
    }, { root: r.scroll, rootMargin: '1400px 0px' });

    const visible = new Map();
    r.ioVisible = new IntersectionObserver((entries) => {
      for (const en of entries) {
        const idx = parseInt(en.target.dataset.idx, 10);
        if (en.isIntersecting) visible.set(idx, en.intersectionRatio);
        else visible.delete(idx);
      }
      let best = null;
      for (const [i, ratio] of visible) {
        if (ratio >= 0.45 && (!best || ratio > best.ratio)) best = { idx: i, ratio };
      }
      if (best && best.idx !== r.index) setReaderIndex(r, best.idx, { scroll: false, fromVisible: true });
    }, { root: r.scroll, threshold: [0, 0.15, 0.45, 0.7, 0.95] });

    for (let i = 1; i <= total; i++) {
      const el = r.slotEls[i];
      if (el) { r.ioLoad.observe(el); r.ioVisible.observe(el); }
    }

    loadSlot(r, r.slotEls[r.index]);
    requestAnimationFrame(() => {
      const el = r.slotEls[r.index];
      if (el) r.scroll.scrollTop = el.offsetTop;
      updateChrome(r);
    });
  }

  function buildPagedLayout(r) {
    r.pagedBase = r.index - 1;
    const slides = [];
    for (let i = r.pagedBase; i <= r.pagedBase + 2; i++) {
      if (i < 1 || i > (r.total || 1)) {
        slides.push(`<div class="ehx-rpage" style="opacity:.25"></div>`);
      } else {
        slides.push(`<div class="ehx-rpage" data-idx="${i}" style="aspect-ratio:auto;height:100dvh"></div>`);
      }
    }
    r.scroll.innerHTML = slides.join('');
    r.slotEls = [];
    for (const el of Array.from(r.scroll.children)) {
      if (el.dataset.idx) r.slotEls[parseInt(el.dataset.idx, 10)] = el;
    }
    for (let i = r.pagedBase; i <= r.pagedBase + 2; i++) {
      if (r.slotEls[i]) loadSlot(r, r.slotEls[i]);
    }
    requestAnimationFrame(() => {
      const w = r.scroll.clientWidth;
      r.suppressScroll = true;
      r.scroll.scrollLeft = w;
      setTimeout(() => { r.suppressScroll = false; }, 220);
    });
  }

  function onPagedScroll(r) {
    if (!r || r.mode !== 'paged' || r.suppressScroll) return;
    clearTimeout(r.pagedTimer);
    r.pagedTimer = setTimeout(() => {
      if (!reader || reader !== r) return;
      const w = r.scroll.clientWidth || window.innerWidth;
      const pos = Math.round(r.scroll.scrollLeft / w);
      const target = r.pagedBase + pos;
      if (target !== r.index && target >= 1 && target <= (r.total || 1)) {
        setReaderIndex(r, target, { fromSwipe: true });
      }
    }, 140);
  }

  async function loadSlot(r, el, { force = false } = {}) {
    if (!r || !el || !reader || reader !== r) return;
    const idx = parseInt(el.dataset.idx || '0', 10);
    if (!idx) return;
    if (!force && (el.dataset.loaded === '1' || el.dataset.loading === '1')) return;
    el.dataset.loading = '1';
    el.classList.remove('ehx-failed');

    if (force) el.replaceChildren();
    if (!el.querySelector('.ehx-rloader')) {
      const loader = document.createElement('div');
      loader.className = 'ehx-rloader';
      loader.innerHTML = '<div class="ehx-spinner"></div>';
      el.appendChild(loader);
    }

    try {
      const rec = await getReaderRecord(r, idx, { force, priority: idx === r.index });
      if (!reader || reader !== r) return;
      el.style.aspectRatio = `${rec.w}/${rec.h}`;
      const img = new Image();
      img.alt = 'Page ' + idx;
      img.decoding = 'async';
      img.loading = 'eager';
      img.setAttribute('fetchpriority', 'high');
      img.draggable = false;
      img.onload = () => {
        el.dataset.loaded = '1';
        el.dataset.loading = '';
        const l = el.querySelector('.ehx-rloader');
        if (l) l.remove();
        el.classList.remove('ehx-failed');
      };
      const startLoad = (src, canFallback) => {
        img.onerror = () => {
          if (canFallback && rec.resampled && rec.resampled !== src) {
            toast('Original failed — using resampled');
            startLoad(rec.resampled, false);
            return;
          }
          el.dataset.loading = '';
          failSlot(r, el, idx);
        };
        try { preconnectOrigin(new URL(src).origin); } catch { /* noop */ }
        img.src = src;
      };
      startLoad(rec.src, !!rec.original);
      el.replaceChildren(img);
      if (!r.cover) r.cover = rec.resampled || rec.src;
      updateReaderUrl(r, idx, rec);
      if (idx === r.index) {
        updateChrome(r);
        saveProgressSoon(r);
      }
      prefetchAround(r);
    } catch (e) {
      if (!reader || reader !== r) return;
      el.dataset.loading = '';
      failSlot(r, el, idx, e);
      if (e && e.login) toast('Login required');
    }
  }

  function failSlot(r, el, idx, err) {
    el.classList.add('ehx-failed');
    el.innerHTML = `<div class="ehx-rfail">
      ${icon('cloud', 30)}
      <div>${esc(err && err.message ? err.message : 'Image failed to load')}</div>
      <div class="ehx-row" style="gap:7px;flex-wrap:wrap;justify-content:center">
        <button class="ehx-btn" data-r="reload" data-idx="${idx}">${icon('refresh', 15)} Retry</button>
        ${err && err.login ? `<button class="ehx-btn" data-act="login">${icon('login', 15)} Log in</button>` : ''}
        <button class="ehx-btn" data-r="original">Original</button>
      </div>
    </div>`;
  }

  function reloadIndex(r, idx) {
    const rec = r.pages.get(idx);
    if (rec && rec.url) htmlCache.delete(rec.url);
    r.pages.delete(idx);
    const el = r.slotEls[idx];
    if (el) loadSlot(r, el, { force: true });
    else renderReaderLayout(r);
  }

  function setReaderIndex(r, idx, opts = {}) {
    if (!r) return;
    const total = Math.max(1, r.total || 1);
    const next = clamp(idx, 1, total);
    if (next === r.index && !opts.force) {
      if (opts.showChrome) showChrome(r);
      return;
    }
    r.index = next;
    if (app.route && app.route.name === 'reader') app.route.index = next;

    updateChrome(r);
    saveProgressSoon(r);
    prefetchAround(r);
    if (opts.showChrome) showChrome(r);

    if (r.mode === 'vertical') {
      if (opts.scroll !== false) {
        const el = r.slotEls[next];
        if (el) r.scroll.scrollTo({ top: el.offsetTop, behavior: 'auto' });
      }
    } else {
      renderReaderLayout(r);
    }

    const rec = r.pages.get(next);
    if (rec) updateReaderUrl(r, next, rec);
  }

  function prefetchAround(r) {
    if (!r) return;
    const seq = (r.prefetchSeq = (r.prefetchSeq || 0) + 1);
    const count = clamp(settings.preload || 2, 1, 4);
    (async () => {
      for (let i = 1; i <= count; i++) {
        if (!reader || reader !== r || r.prefetchSeq !== seq) return;
        await prefetchOne(r, r.index + i);
      }
      for (let i = 1; i <= Math.min(2, count); i++) {
        if (!reader || reader !== r || r.prefetchSeq !== seq) return;
        await prefetchOne(r, r.index - i);
      }
    })();
  }

  async function prefetchOne(r, idx) {
    if (!r || idx < 1 || idx > (r.total || 1)) return;
    const cached = r.pages.get(idx);
    if (cached && cached.src) {
      const im = new Image();
      im.src = cached.src;
      return;
    }
    try {
      const rec = await getReaderRecord(r, idx);
      if (rec && rec.src) {
        const im = new Image();
        im.src = rec.src;
      }
    } catch { /* prefetch is best-effort */ }
  }

  let saveTimer = 0;
  function saveProgressSoon(r) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveProgressNow(r), 650);
  }

  function saveProgressNow(r) {
    if (!r) return;
    const rec = r.pages.get(r.index) || {};
    const pageUrl = rec.url || (app.route && app.route.name === 'reader' ? app.route.url : '');
    progressStore.set(r.gid, {
      index: r.index,
      total: r.total,
      pageUrl,
      title: r.title,
      cover: r.cover || rec.src || '',
      galleryUrl: r.galleryUrl,
      token: r.token,
    });
  }

  function destroyReader() {
    if (!reader) return;
    const r = reader;
    try { saveProgressNow(r); } catch { /* noop */ }
    reader = null;
    app.reader = null;
    clearTimeout(saveTimer);
    if (r.ioLoad) r.ioLoad.disconnect();
    if (r.ioVisible) r.ioVisible.disconnect();
    if (r.pagedTimer) clearTimeout(r.pagedTimer);
    if (r.keyHandler) document.removeEventListener('keydown', r.keyHandler);
    if (r.visibilityHandler) {
      document.removeEventListener('visibilitychange', r.visibilityHandler);
      window.removeEventListener('pagehide', r.visibilityHandler);
    }
    if (r.resizeHandler) window.removeEventListener('resize', r.resizeHandler);
    if (r.hideTimer) clearTimeout(r.hideTimer);
    if (r.root && r.root.parentNode) r.root.remove();
    document.body.style.overflow = '';
    app.root.classList.remove('ehx-no-tabbar');
    renderTabbar();
  }

  function exitReader() {
    const r = reader;
    if (!r) return;
    saveProgressNow(r);
    const gallery = r.galleryUrl;
    const depth = history.state && typeof history.state.d === 'number' ? history.state.d : app.depth;
    destroyReader();
    if (depth > 0) history.back();
    else if (gallery) navigate(gallery, { replace: true });
    else navigate('/', { replace: true });
  }

  function readerFallbackTopbar() {
    renderTopbar({
      left: iconBtn('back', 'back', 'Back'),
      title: 'Reader',
      right: iconBtn('drawer', 'menu', 'Menu'),
    });
  }

  async function renderReaderPage(route, url, initialDoc, opts = {}) {
    app.tab = 'none';
    renderTabbar();
    app.main.innerHTML = '';

    // Full-screen loading shell first.
    const root = document.createElement('div');
    root.className = 'ehx-reader ehx-vertical';
    root.innerHTML = `<div class="ehx-center" style="height:100dvh"><div class="ehx-spinner" style="border-color:rgba(255,255,255,.2);border-top-color:#fff"></div></div>`;
    document.body.appendChild(root);
    document.body.style.overflow = 'hidden';
    app.root.classList.add('ehx-no-tabbar');

    let first = null;
    if (initialDoc) {
      try { first = parseReader(initialDoc, url); } catch (e) { console.warn(e); }
    }

    if (!first || !first.src) {
      try {
        const rec = await fetchDoc(url, { force: !!opts.force, priority: true });
        if (opts.seq && opts.seq !== app.navSeq) {
          root.remove();
          document.body.style.overflow = '';
          app.root.classList.remove('ehx-no-tabbar');
          return;
        }
        if (sadPanda(rec.doc) || loginPage(rec.doc)) {
          root.remove();
          document.body.style.overflow = '';
          app.root.classList.remove('ehx-no-tabbar');
          app.tab = 'home';
          renderTabbar();
          readerFallbackTopbar();
          app.main.innerHTML = loginCardHtml(sadPanda(rec.doc)
            ? 'ExHentai needs valid cookies before it will show images. Use Cookie login below.'
            : 'Log in to read this gallery.');
          return;
        }
        first = parseReader(rec.doc, rec.url);
      } catch (e) {
        root.remove();
        if (opts.seq && opts.seq !== app.navSeq) return;
        document.body.style.overflow = '';
        app.root.classList.remove('ehx-no-tabbar');
        app.tab = 'home';
        renderTabbar();
        readerFallbackTopbar();
        showError(e);
        return;
      }
    }

    if (!first || !first.src) {
      root.remove();
      document.body.style.overflow = '';
      app.root.classList.remove('ehx-no-tabbar');
      app.tab = 'home';
      renderTabbar();
      readerFallbackTopbar();
      app.main.innerHTML = emptyState('Image unavailable', 'This page does not contain a readable image.', `<div class="ehx-row" style="justify-content:center"><button class="ehx-btn ehx-btn-primary" data-act="refresh">Retry</button><button class="ehx-btn" data-act="original">Open original page</button></div>`, 'image');
      return;
    }

    try { preconnectOrigin(new URL(first.src).origin); } catch { /* noop */ }
    const galleryMatch = (first.galleryUrl || '').match(/\/g\/(\d+)\/([0-9a-f]+)/i);
    const gid = route.gid || (galleryMatch ? galleryMatch[1] : '');
    const token = galleryMatch ? galleryMatch[2] : '';
    const index = first.index || route.index || 1;
    const total = first.total || 1;
    const prevProg = progressStore.get(gid);

    reader = {
      root,
      scroll: null,
      chrome: null,
      gid,
      token,
      index,
      total,
      title: first.title || 'Reader',
      galleryUrl: first.galleryUrl || (gid && token ? absUrl(`/g/${gid}/${token}/`) : ''),
      pages: new Map(),
      inflight: new Map(),
      slotEls: [],
      ioLoad: null,
      ioVisible: null,
      mode: settings.readerMode,
      fit: settings.readerFit,
      layoutBuilt: false,
      suppressScroll: false,
      pagedBase: 1,
      pagedTimer: 0,
      hideTimer: 0,
      prefetchSeq: 0,
      cover: (prevProg && prevProg.cover) || '',
      firstW: first.w || 800,
      firstH: first.h || 1122,
      showkey: first.showkey || '',
      apiUrl: first.apiUrl || '',
      vis: new Map(),
    };
    const r = reader;

    r.pages.set(index, {
      idx: index,
      url,
      src: first.src,
      w: first.w || 800,
      h: first.h || 1122,
      total,
      pageInfo: first.pageInfo || '',
      fullUrl: first.fullUrl || '',
      title: r.title,
      galleryUrl: r.galleryUrl,
    });
    if (first.prev) pageUrlCache.set(`${gid}:${first.prev.n}`, first.prev.href);
    if (first.next) pageUrlCache.set(`${gid}:${first.next.n}`, first.next.href);
    if (first.prev) r.pages.set(first.prev.n, Object.assign(r.pages.get(first.prev.n) || {}, { idx: first.prev.n, url: first.prev.href }));
    if (first.next) r.pages.set(first.next.n, Object.assign(r.pages.get(first.next.n) || {}, { idx: first.next.n, url: first.next.href }));

    root.innerHTML = `
      <div class="ehx-rprogress"><i style="width:0%"></i></div>
      <div class="ehx-rscroll"></div>
      <div class="ehx-rchrome"></div>
      <div class="ehx-rhint"></div>`;
    r.scroll = root.querySelector('.ehx-rscroll');
    r.chrome = root.querySelector('.ehx-rchrome');

    buildReaderChrome(r);
    bindReaderEvents(r);
    app.reader = r;
    app.tab = 'none';
    renderTabbar();
    document.title = r.title + ' · ' + SITE_NAME;

    renderReaderLayout(r);
    showChrome(r);
    saveProgressSoon(r);

    // Restore the URL of the actual page (in case we were redirected).
    updateReaderUrl(r, index, r.pages.get(index));
  }
  // ---------------------------------------------------------------------------
  // Reader chrome & interactions
  // ---------------------------------------------------------------------------

  function buildReaderChrome(r) {
    r.chrome.innerHTML = `
      <div class="ehx-rtop">
        <button class="ehx-iconbtn" data-r="back" aria-label="Back">${icon('back', 22)}</button>
        <div class="ehx-rtitle"></div>
        <button class="ehx-rcount" data-r="jump" aria-label="Jump to page">1 / 1</button>
        <button class="ehx-iconbtn" data-r="menu" aria-label="Reader menu">${icon('more', 22)}</button>
      </div>
      <div class="ehx-rbottom">
        <div class="ehx-rbar">
          <button class="ehx-iconbtn" data-r="prev" aria-label="Previous page">${icon('back', 22)}</button>
          <input class="ehx-rrange" type="range" min="1" max="1" value="1" aria-label="Page">
          <button class="ehx-iconbtn" data-r="next" aria-label="Next page">${icon('forward', 22)}</button>
        </div>
      </div>`;

    const range = r.chrome.querySelector('.ehx-rrange');
    range.addEventListener('input', () => {
      showChrome(r);
      const n = parseInt(range.value, 10) || 1;
      updateChromeText(r, n);
    });
    range.addEventListener('change', () => {
      setReaderIndex(r, parseInt(range.value, 10) || 1, { showChrome: false });
    });
  }

  function updateChromeText(r, n) {
    if (!r || !r.chrome) return;
    const count = r.chrome.querySelector('.ehx-rcount');
    const range = r.chrome.querySelector('.ehx-rrange');
    const progress = r.root && r.root.querySelector('.ehx-rprogress > i');
    const total = Math.max(1, r.total || 1);
    if (count) count.textContent = `${n} / ${total}`;
    if (range && document.activeElement !== range) {
      range.max = String(total);
      range.value = String(n);
    }
    if (progress) progress.style.width = `${clamp((n / total) * 100, 0, 100)}%`;
  }

  function updateChrome(r) {
    if (!r || !r.chrome) return;
    const title = r.chrome.querySelector('.ehx-rtitle');
    if (title) title.textContent = r.title || '';
    const range = r.chrome.querySelector('.ehx-rrange');
    if (range) range.max = String(Math.max(1, r.total || 1));
    if (range && document.activeElement === range) range.value = String(r.index);
    updateChromeText(r, r.index);
  }

  function showChrome(r, auto = true) {
    if (!r || !r.chrome) return;
    r.chrome.classList.remove('ehx-hidden');
    clearTimeout(r.hideTimer);
    if (auto) {
      r.hideTimer = setTimeout(() => hideChrome(r), 3400);
    }
  }

  function hideChrome(r) {
    if (!r || !r.chrome) return;
    clearTimeout(r.hideTimer);
    r.chrome.classList.add('ehx-hidden');
  }

  function toggleChrome(r) {
    if (!r || !r.chrome) return;
    if (r.chrome.classList.contains('ehx-hidden')) showChrome(r);
    else hideChrome(r);
  }

  let hintTimer = 0;
  function flashHint(r, msg) {
    if (!r || !r.root) return;
    const el = r.root.querySelector('.ehx-rhint');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('ehx-show');
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => el.classList.remove('ehx-show'), 900);
  }

  function bindReaderEvents(r) {
    r.scroll.addEventListener('scroll', () => {
      if (r.mode === 'paged') onPagedScroll(r);
    }, { passive: true });

    r.root.addEventListener('click', (e) => {
      const btn = e.target.closest && e.target.closest('[data-r]');
      if (btn) {
        const act = btn.dataset.r;
        if (act === 'back') { exitReader(); return; }
        if (act === 'menu') { openReaderMenu(r); return; }
        if (act === 'jump') { openReaderJump(r); return; }
        if (act === 'prev') { setReaderIndex(r, r.index - 1); return; }
        if (act === 'next') { setReaderIndex(r, r.index + 1); return; }
        if (act === 'reload') { reloadIndex(r, parseInt(btn.dataset.idx || String(r.index), 10)); return; }
        if (act === 'original') {
          const rec = r.pages.get(r.index);
          location.href = originalUrl((rec && rec.url) || location.href);
          return;
        }
      }

      if (e.target.closest && e.target.closest('.ehx-rchrome')) {
        showChrome(r);
        return;
      }
      if (e.target.closest && e.target.closest('a,button,input,select,textarea,summary')) {
        showChrome(r);
        return;
      }
      if (r.swiped) { r.swiped = false; return; }

      const x = e.clientX / Math.max(1, window.innerWidth);
      if (settings.tapZones && x < 0.3) {
        if (r.index > 1) setReaderIndex(r, r.index - 1);
        else flashHint(r, 'First page');
      } else if (settings.tapZones && x > 0.7) {
        if (r.index < (r.total || 1)) setReaderIndex(r, r.index + 1);
        else flashHint(r, 'Last page');
      } else {
        toggleChrome(r);
      }
    });

    let touch = null;
    r.scroll.addEventListener('touchstart', (e) => {
      const t = e.touches[0];
      if (t) touch = { x: t.clientX, y: t.clientY };
      r.swiped = false;
    }, { passive: true });
    r.scroll.addEventListener('touchmove', (e) => {
      if (!touch) return;
      const t = e.touches[0];
      if (!t) return;
      if (Math.abs(t.clientX - touch.x) > 12 || Math.abs(t.clientY - touch.y) > 12) r.swiped = true;
    }, { passive: true });
    r.scroll.addEventListener('touchend', () => {
      setTimeout(() => { r.swiped = false; }, 320);
    }, { passive: true });

    r.keyHandler = (e) => {
      if (!reader || reader !== r) return;
      if (e.key === 'Escape') { exitReader(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); setReaderIndex(r, r.index - 1); }
      else if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); setReaderIndex(r, r.index + 1); }
      else if (e.key === 'm') { toggleChrome(r); }
    };
    document.addEventListener('keydown', r.keyHandler);

    r.visibilityHandler = () => {
      if (document.visibilityState === 'hidden') saveProgressNow(r);
    };
    document.addEventListener('visibilitychange', r.visibilityHandler);
    window.addEventListener('pagehide', r.visibilityHandler);

    r.resizeHandler = debounce(() => {
      if (!reader || reader !== r) return;
      if (r.mode === 'paged') renderReaderLayout(r);
    }, 180);
    window.addEventListener('resize', r.resizeHandler);

  }

  function openReaderMenu(r) {
    if (!r) return;
    const mode = settings.readerMode === 'paged' ? 'paged' : 'vertical';
    const fit = settings.readerFit === 'contain' ? 'contain' : 'width';
    const res = settings.readerResolution === 'original' ? 'original' : 'auto';
    const recNow = r.pages.get(r.index);
    const s = openSheet({
      title: 'Reader',
      body: `
        <div class="ehx-field"><label class="ehx-label">Reading mode</label>
          <div class="ehx-seg" id="ehx-reader-mode">
            <button data-mode="vertical" class="${mode === 'vertical' ? 'ehx-active' : ''}">${icon('list', 14)} Vertical</button>
            <button data-mode="paged" class="${mode === 'paged' ? 'ehx-active' : ''}">${icon('image', 14)} Paged</button>
          </div>
        </div>
        <div class="ehx-field"><label class="ehx-label">Image fit</label>
          <div class="ehx-seg" id="ehx-reader-fit">
            <button data-fit="width" class="${fit === 'width' ? 'ehx-active' : ''}">Width</button>
            <button data-fit="contain" class="${fit === 'contain' ? 'ehx-active' : ''}">Contain</button>
          </div>
        </div>
        <div class="ehx-field"><label class="ehx-label">Image resolution</label>
          <div class="ehx-seg" id="ehx-reader-res">
            <button data-res="auto" class="${res === 'auto' ? 'ehx-active' : ''}">Resampled</button>
            <button data-res="original" class="${res === 'original' ? 'ehx-active' : ''}">Original</button>
          </div>
          <p style="font-size:11px;color:var(--muted2);margin:6px 0 0">${res === 'original' ? 'Original files can be several MB and load slowly.' : 'Server-resized WebP — fastest and usually 1280px.'}</p>
        </div>
        <div class="ehx-group">
          <button class="ehx-drawer-item" data-rm="jump">${icon('jump', 20)}<span>Jump to page</span><span style="margin-left:auto;color:var(--muted2);font-size:12px">${r.index} / ${r.total}</span></button>
          <button class="ehx-drawer-item" data-rm="reload">${icon('refresh', 20)}<span>Reload this image</span></button>
          <button class="ehx-drawer-item" data-rm="image">${icon('external', 20)}<span>Open image in new tab</span></button>
          ${recNow && recNow.fullUrl ? `<button class="ehx-drawer-item" data-rm="full">${icon('image', 20)}<span>Open original in new tab</span></button>` : ''}
          <button class="ehx-drawer-item" data-rm="gallery">${icon('book', 20)}<span>Gallery detail</span></button>
          <button class="ehx-drawer-item" data-rm="original">${icon('external', 20)}<span>Open original page</span></button>
          <button class="ehx-drawer-item" data-rm="share">${icon('share', 20)}<span>Share</span></button>
        </div>`,
    });

    s.sheet.addEventListener('click', async (e) => {
      const modeBtn = e.target.closest('[data-mode]');
      if (modeBtn) {
        saveSettings({ readerMode: modeBtn.dataset.mode });
        s.close();
        renderReaderLayout(r);
        return;
      }
      const fitBtn = e.target.closest('[data-fit]');
      if (fitBtn) {
        saveSettings({ readerFit: fitBtn.dataset.fit });
        r.fit = fitBtn.dataset.fit;
        r.root.classList.toggle('ehx-fit-contain', r.fit === 'contain');
        s.close();
        return;
      }
      const resBtn = e.target.closest('[data-res]');
      if (resBtn) {
        saveSettings({ readerResolution: resBtn.dataset.res });
        s.close();
        r.pages.clear();
        renderReaderLayout(r);
        toast(resBtn.dataset.res === 'original' ? 'Loading original images' : 'Using resampled images');
        return;
      }
      const b = e.target.closest('[data-rm]');
      if (!b) return;
      const act = b.dataset.rm;
      const rec = r.pages.get(r.index);
      if (act === 'jump') { s.close(); openReaderJump(r); }
      else if (act === 'reload') { s.close(); reloadIndex(r, r.index); }
      else if (act === 'image') {
        if (rec && rec.src) {
          const w = window.open(rec.src, '_blank');
          if (!w) location.href = rec.src;
        }
        s.close();
      } else if (act === 'full') {
        if (rec && rec.fullUrl) {
          const w = window.open(rec.fullUrl, '_blank');
          if (!w) location.href = rec.fullUrl;
        }
        s.close();
      } else if (act === 'gallery') {
        s.close();
        saveProgressNow(r);
        if (r.galleryUrl) navigate(r.galleryUrl);
        else toast('Gallery link not available');
      } else if (act === 'original') {
        if (rec && rec.url) location.href = originalUrl(rec.url);
        else location.href = originalUrl(location.href);
      } else if (act === 'share') {
        try {
          if (navigator.share) await navigator.share({ title: r.title, url: location.href });
          else { await navigator.clipboard.writeText(location.href); toast('Link copied'); }
        } catch { /* cancelled */ }
      }
    });
  }

  function openReaderJump(r) {
    const s = openSheet({
      title: 'Jump to page',
      body: `<div class="ehx-field"><label class="ehx-label">Page</label>
        <input class="ehx-input" id="ehx-reader-jump" type="number" inputmode="numeric" min="1" max="${r.total}" value="${r.index}"></div>
        <p style="font-size:11.5px;color:var(--muted2);margin:0">1 – ${formatNum(r.total)}</p>`,
      footer: `<button class="ehx-btn" data-x="cancel">Cancel</button><button class="ehx-btn ehx-btn-primary" data-x="go">Go</button>`,
    });
    s.sheet.addEventListener('click', (e) => {
      const b = e.target.closest('[data-x]');
      if (!b) return;
      if (b.dataset.x === 'cancel') { s.close(); return; }
      const n = clamp(num($('#ehx-reader-jump', s.sheet).value) || r.index, 1, r.total || 1);
      s.close();
      setReaderIndex(r, n, { force: true });
    });
  }
  // ---------------------------------------------------------------------------
  // Search, settings, history and toplist pages
  // ---------------------------------------------------------------------------

  const CAT_BITS = {
    Misc: 1, Doujinshi: 2, Manga: 4, 'Artist CG': 8, 'Game CG': 16,
    'Image Set': 32, Cosplay: 64, 'Asian Porn': 128, 'Non-H': 256, Western: 512,
  };

  const recentSearches = {
    list() { return store.get('searches', []); },
    add(q) {
      const v = String(q || '').trim();
      if (!v) return;
      const list = this.list().filter((x) => x !== v);
      list.unshift(v);
      store.set('searches', list.slice(0, 12));
    },
    clear() { store.set('searches', []); },
  };

  function settingRow(label, sub, control) {
    return `<div class="ehx-setting">
      <div class="ehx-setting-label">${esc(label)}${sub ? `<div class="ehx-setting-sub">${esc(sub)}</div>` : ''}</div>
      <div class="ehx-setting-value">${control}</div>
    </div>`;
  }
  function switchHtml(key, on) {
    return `<button class="ehx-switch${on ? ' ehx-on' : ''}" data-toggle="${key}" aria-label="${key}" aria-pressed="${on}"></button>`;
  }
  function segHtml(key, value, options) {
    return `<div class="ehx-seg">${options.map((o) => `<button data-set="${key}" data-value="${esc(o.value)}" class="${String(value) === String(o.value) ? 'ehx-active' : ''}">${esc(o.label)}</button>`).join('')}</div>`;
  }

  // --- search -----------------------------------------------------------------

  function renderSearchPage() {
    app.tab = 'search';
    renderTabbar();
    renderTopbar({
      left: iconBtn('back', 'back', 'Back'),
      title: 'Search',
      right: `${iconBtn('drawer', 'menu', 'Menu')}`,
    });
    document.title = 'Search · ' + SITE_NAME;

    const draftQ = app.lastQuery || parseQuery(location.href).get('f_search') || '';
    const draftCats = parseInt(app.lastFcats || parseQuery(location.href).get('f_cats') || '0', 10);
    const included = new Set(CATEGORY_ORDER.filter((c) => !(draftCats & CAT_BITS[c])));
    const recent = recentSearches.list();

    app.main.innerHTML = `<div class="ehx-settings" style="padding-top:2px">
      <div class="ehx-searchwrap" style="padding-left:0;padding-right:0">
        <div class="ehx-searchbox">
          ${icon('search', 18)}
          <input id="ehx-search-input" type="search" value="${esc(draftQ)}" placeholder="Title, artist, tag, parody…" autocomplete="off" autocapitalize="none" spellcheck="false" enterkeyhint="search">
        </div>
      </div>

      <div class="ehx-group-title">Categories</div>
      <div class="ehx-tagwrap" id="ehx-cats" style="gap:7px">
        ${CATEGORY_ORDER.map((c) => `<button class="ehx-chip${included.has(c) ? ' ehx-active' : ''}" data-cat="${esc(c)}" aria-pressed="${included.has(c)}"><span class="ehx-dot" style="background:${categoryColor(c)}"></span>${esc(c)}</button>`).join('')}
      </div>

      <details style="margin-top:14px">
        <summary style="cursor:pointer;font-size:12.5px;font-weight:700;color:var(--accent);padding:4px 0">Advanced filters</summary>
        <div class="ehx-group" style="margin-top:8px">
          ${settingRow('Minimum rating', 'f_srdd', `<select class="ehx-input" id="ehx-minrating" style="height:36px;width:120px"><option value="0">Any</option>${[2, 3, 4, 5].map((n) => `<option value="${n}">${n}+ stars</option>`).join('')}</select>`)}
          ${settingRow('Pages at least', 'f_spf', `<input class="ehx-input" id="ehx-pages-min" type="number" inputmode="numeric" min="0" placeholder="—" style="height:36px;width:96px">`)}
          ${settingRow('Pages at most', 'f_spt', `<input class="ehx-input" id="ehx-pages-max" type="number" inputmode="numeric" min="0" placeholder="—" style="height:36px;width:96px">`)}
          ${settingRow('Only torrents', 'f_sto', `<input type="checkbox" id="ehx-only-torrents" style="width:22px;height:22px;accent-color:var(--accent2)">`)}
          ${settingRow('Include expunged', 'f_sh', `<input type="checkbox" id="ehx-expunged" style="width:22px;height:22px;accent-color:var(--accent2)">`)}
        </div>
      </details>

      ${recent.length ? `<div class="ehx-group-title">Recent searches</div>
        <div class="ehx-tagwrap">${recent.map((q) => `<button class="ehx-chip" data-q="${esc(q)}">${icon('clock', 12)} ${esc(q)}</button>`).join('')}</div>
        <button class="ehx-chip" data-cmd="clear-searches" style="margin-top:8px">${icon('trash', 12)} Clear</button>` : ''}

      <button class="ehx-btn ehx-btn-primary ehx-btn-block" id="ehx-search-go" style="margin-top:18px;height:48px">${icon('search', 18)} Search galleries</button>
      <div class="ehx-note">
        Tip: use tag syntax such as <code>language:chinese</code>, <code>f:sole female</code> or <code>artist:shibi</code>.
        Search runs on ${esc(SITE_NAME)} with your current session.
      </div>
    </div>`;

    const input = $('#ehx-search-input');
    const go = () => {
      const q = input.value.trim();
      if (!q) { input.focus(); toast('Enter a search'); return; }
      const params = new URLSearchParams();
      params.set('f_search', q);
      const excluded = CATEGORY_ORDER.filter((c) => !included.has(c)).reduce((n, c) => n + CAT_BITS[c], 0);
      if (excluded) params.set('f_cats', String(excluded));
      const minRating = parseInt($('#ehx-minrating')?.value || '0', 10);
      if (minRating > 1) params.set('f_srdd', String(minRating));
      const pmin = parseInt($('#ehx-pages-min')?.value || '0', 10);
      const pmax = parseInt($('#ehx-pages-max')?.value || '0', 10);
      if (pmin > 0) params.set('f_spf', String(pmin));
      if (pmax > 0) params.set('f_spt', String(pmax));
      if ($('#ehx-only-torrents')?.checked) params.set('f_sto', 'on');
      if ($('#ehx-expunged')?.checked) params.set('f_sh', 'on');
      recentSearches.add(q);
      navigate('/?' + params.toString());
    };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); go(); }
    });
    $('#ehx-search-go').addEventListener('click', go);

    app.main.onclick = (e) => {
      const cat = e.target.closest('[data-cat]');
      if (cat) {
        const name = cat.dataset.cat;
        if (included.has(name)) { included.delete(name); cat.classList.remove('ehx-active'); cat.setAttribute('aria-pressed', 'false'); }
        else { included.add(name); cat.classList.add('ehx-active'); cat.setAttribute('aria-pressed', 'true'); }
        return;
      }
      const q = e.target.closest('[data-q]');
      if (q) { input.value = q.dataset.q; input.focus(); return; }
      const cmd = e.target.closest('[data-cmd="clear-searches"]');
      if (cmd) { recentSearches.clear(); renderSearchPage(); }
    };
  }

  // --- settings ---------------------------------------------------------------

  function renderSettingsPage() {
    app.tab = 'more';
    renderTabbar();
    renderTopbar({
      left: iconBtn('back', 'back', 'Back'),
      title: 'Settings',
      right: `${iconBtn('drawer', 'menu', 'Menu')}`,
    });
    document.title = 'Settings · ' + SITE_NAME;

    const logged = app.loggedIn === true;
    const ua = navigator.userAgent || '';
    const preloadOpts = [1, 2, 3, 4].map((n) => ({ value: n, label: String(n) }));

    app.main.innerHTML = `<div class="ehx-settings">
      <div class="ehx-group-title">Appearance</div>
      <div class="ehx-group">
        ${settingRow('Theme', 'Auto follows iOS appearance', segHtml('theme', settings.theme, [{ value: 'auto', label: 'Auto' }, { value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }]))}
        ${settingRow('Gallery layout', 'Cards or compact rows', segHtml('layout', settings.layout, [{ value: 'grid', label: 'Grid' }, { value: 'list', label: 'List' }]))}
        ${settingRow('Grid columns', 'On phones', segHtml('columns', settings.columns, [{ value: 2, label: '2' }, { value: 3, label: '3' }]))}
        ${settingRow('Show tags on cards', 'Up to three tags', switchHtml('showTags', settings.showTags))}
        ${settingRow('Blur covers', 'Tap a card once to reveal', switchHtml('blurCovers', settings.blurCovers))}
      </div>

      <div class="ehx-group-title">Reader</div>
      <div class="ehx-group">
        ${settingRow('Reading mode', 'Can also be changed inside the reader', segHtml('readerMode', settings.readerMode, [{ value: 'vertical', label: 'Vertical' }, { value: 'paged', label: 'Paged' }]))}
        ${settingRow('Image fit', 'Width fills the screen', segHtml('readerFit', settings.readerFit, [{ value: 'width', label: 'Width' }, { value: 'contain', label: 'Contain' }]))}
        ${settingRow('Image resolution', 'Resampled is faster; original can be several MB', segHtml('readerResolution', settings.readerResolution, [{ value: 'auto', label: 'Resampled' }, { value: 'original', label: 'Original' }]))}
        ${settingRow('Preload pages', 'Pages fetched ahead', segHtml('preload', settings.preload, preloadOpts))}
        ${settingRow('Tap zones', 'Left/right thirds turn pages', switchHtml('tapZones', settings.tapZones))}
      </div>

      <div class="ehx-group-title">Library</div>
      <div class="ehx-group">
        <button class="ehx-setting" data-cmd="history" style="width:100%;text-align:left">${icon('history', 20)}<div class="ehx-setting-label" style="margin-left:10px">Reading history<div class="ehx-setting-sub">${historyStore.list().length} galleries</div></div><div class="ehx-setting-value">${icon('forward', 18)}</div></button>
        <button class="ehx-setting" data-cmd="clear-progress" style="width:100%;text-align:left">${icon('book', 20)}<div class="ehx-setting-label" style="margin-left:10px">Clear reading progress<div class="ehx-setting-sub">Removes saved page positions</div></div></button>
        <button class="ehx-setting" data-cmd="clear-history" style="width:100%;text-align:left">${icon('trash', 20)}<div class="ehx-setting-label" style="margin-left:10px">Clear history<div class="ehx-setting-sub">Does not affect your E-Hentai account</div></div></button>
        <button class="ehx-setting" data-cmd="clear-cache" style="width:100%;text-align:left">${icon('refresh', 20)}<div class="ehx-setting-label" style="margin-left:10px">Clear page cache<div class="ehx-setting-sub">Re-fetch galleries from the site</div></div></button>
      </div>

      <div class="ehx-group-title">Account</div>
      <div class="ehx-group">
        ${settingRow(logged ? 'Signed in' : 'Guest', logged ? 'Favorites and watched tags are available' : 'Log in to sync with your account', logged
          ? `<button class="ehx-chip" data-cmd="logout">Log out</button>`
          : `<button class="ehx-chip ehx-active" data-cmd="login">Log in</button>`)}
        ${settingRow('Site', `${esc(SITE_NAME)} · ${esc(location.hostname)}`, `<button class="ehx-chip" data-cmd="original">Original</button>`)}
      </div>

      <div class="ehx-group-title">About</div>
      <div class="ehx-group">
        ${settingRow('E-Hentai App', 'JHenTai-inspired mobile shell', `<span class="ehx-dim" style="font-size:12px">v${VERSION}</span>`)}
        ${settingRow('Check for updates', 'Reads the version on the main branch', `<button class="ehx-chip" data-cmd="check-update">Check</button>`)}
        ${settingRow('Reference app', 'JHenTai by jiangtian616', `<a class="ehx-chip" href="https://github.com/jiangtian616/JHenTai" target="_blank" rel="noopener">GitHub</a>`)}
        ${settingRow('User agent', ua.slice(0, 46) + (ua.length > 46 ? '…' : ''), '')}
      </div>

      <button class="ehx-btn ehx-btn-block" data-cmd="reset" style="margin-top:14px;color:var(--danger)">Reset all settings</button>
      <div class="ehx-note">
        This userscript is a client-side skin. It does not bypass E-Hentai's rules, GP costs, or age gates.
        All requests go directly to ${esc(location.hostname)} using your own session.
      </div>
    </div>`;

    app.main.onclick = (e) => {
      const tog = e.target.closest('[data-toggle]');
      if (tog) {
        const key = tog.dataset.toggle;
        saveSettings({ [key]: !settings[key] });
        const y = window.scrollY;
        renderSettingsPage();
        window.scrollTo(0, y);
        return;
      }
      const set = e.target.closest('[data-set]');
      if (set) {
        const key = set.dataset.set;
        let v = set.dataset.value;
        if (v === 'true') v = true;
        else if (v === 'false') v = false;
        else if (/^\d+$/.test(v)) v = parseInt(v, 10);
        saveSettings({ [key]: v });
        const y = window.scrollY;
        renderSettingsPage();
        window.scrollTo(0, y);
        return;
      }
      const cmd = e.target.closest('[data-cmd]');
      if (!cmd) return;
      const c = cmd.dataset.cmd;
      if (c === 'history') navigate('/#ehx-history');
      else if (c === 'login') openLoginSheet();
      else if (c === 'logout') logout();
      else if (c === 'original') location.href = originalUrl(currentUrl());
      else if (c === 'check-update') checkForUpdate({ manual: true });
      else if (c === 'clear-cache') { clearRuntimeCaches(); toast('Page cache cleared'); }
      else if (c === 'clear-progress') {
        confirmSheet('Clear reading progress?', 'This removes saved page positions for every gallery on this device.', { ok: 'Clear', danger: true })
          .then((yes) => { if (yes) { progressStore.clearAll(); toast('Progress cleared'); renderSettingsPage(); } });
      } else if (c === 'clear-history') {
        confirmSheet('Clear history?', 'This only clears the local history list.', { ok: 'Clear', danger: true })
          .then((yes) => { if (yes) { historyStore.clear(); toast('History cleared'); renderSettingsPage(); } });
      } else if (c === 'reset') {
        confirmSheet('Reset all settings?', 'Theme, layout and reader preferences return to defaults.', { ok: 'Reset', danger: true })
          .then((yes) => {
            if (!yes) return;
            Object.assign(settings, DEFAULT_SETTINGS);
            store.set('settings', settings);
            applyTheme();
            renderTabbar();
            renderDrawer();
            renderSettingsPage();
            toast('Settings reset');
          });
      }
    };
  }

  // --- history ----------------------------------------------------------------

  function timeAgo(ts) {
    if (!ts) return '';
    const s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
    if (s < 60) return 'just now';
    const m = Math.floor(s / 60);
    if (m < 60) return m + 'm ago';
    const h = Math.floor(m / 60);
    if (h < 24) return h + 'h ago';
    const d = Math.floor(h / 24);
    if (d < 30) return d + 'd ago';
    return new Date(ts).toLocaleDateString();
  }

  function renderHistoryPage() {
    app.tab = 'more';
    renderTabbar();
    renderTopbar({
      left: iconBtn('back', 'back', 'Back'),
      title: 'History',
      right: `${iconBtn('clear-history', 'trash', 'Clear history')}${iconBtn('drawer', 'menu', 'Menu')}`,
    });
    document.title = 'History · ' + SITE_NAME;

    const entries = historyStore.list();
    if (!entries.length) {
      app.main.innerHTML = emptyState('No reading history', 'Galleries you open in the reader will show up here, with your page position.', `<a class="ehx-btn" href="/">Browse galleries</a>`, 'history');
      return;
    }

    const cards = entries.map((h) => {
      const prog = progressStore.get(h.gid);
      const url = (prog && prog.pageUrl) || h.galleryUrl || (h.token ? `/g/${h.gid}/${h.token}/` : '/');
      const pct = prog && prog.total ? clamp(Math.round((prog.index / prog.total) * 100), 1, 100) : 0;
      return `<a class="ehx-card" href="${esc(url)}">
        <div class="ehx-cover">
          ${h.cover ? `<img loading="lazy" src="${esc(h.cover)}" alt="">` : `<div class="ehx-center" style="height:100%;color:var(--muted2)">${icon('image', 26)}</div>`}
          <span class="ehx-badge ehx-cat" style="--catcolor:#9e9e9e">History</span>
          ${prog && prog.index ? `<span class="ehx-badge ehx-resume">P${prog.index}${prog.total ? '/' + prog.total : ''}</span><div class="ehx-progress"><i style="width:${pct}%"></i></div>` : ''}
        </div>
        <div class="ehx-card-body">
          <div class="ehx-card-title">${esc(h.title || 'Gallery ' + h.gid)}</div>
          <div class="ehx-card-sub"><span class="ehx-nowrap">${esc(timeAgo(h.updated))}</span>${prog && prog.index ? '<span class="ehx-dim" style="margin-left:auto">Continue</span>' : ''}</div>
        </div>
      </a>`;
    }).join('');

    app.main.innerHTML = `<div class="ehx-grid ehx-listmode">${cards}</div>`;
    onAction('clear-history', () => {
      confirmSheet('Clear history?', 'This only clears the local history list.', { ok: 'Clear', danger: true })
        .then((yes) => { if (yes) { historyStore.clear(); renderHistoryPage(); toast('History cleared'); } });
    });
  }

  // --- toplist ----------------------------------------------------------------

  async function renderToplistPage(route, url, initialDoc, opts = {}) {
    app.tab = 'more';
    renderTabbar();
    renderTopbar({
      left: iconBtn('back', 'back', 'Back'),
      title: 'Toplists',
      right: `${iconBtn('refresh', 'refresh', 'Refresh')}${iconBtn('drawer', 'menu', 'Menu')}`,
    });
    document.title = 'Toplists · ' + SITE_NAME;
    app.main.innerHTML = `<div class="ehx-loading"><div class="ehx-spinner"></div></div>`;

    let data = null;
    if (initialDoc) {
      try { data = parseToplist(initialDoc, url); } catch (e) { console.warn(e); }
    }
    if (!data || !data.groups.length) {
      const rec = await fetchDoc(url, { force: !!opts.force, priority: true });
      if (opts.seq && opts.seq !== app.navSeq) return;
      if (sadPanda(rec.doc) || loginPage(rec.doc)) {
        app.main.innerHTML = loginCardHtml('Log in to view your toplists.');
        return;
      }
      data = parseToplist(rec.doc, rec.url);
    }

    const current = new URL(url, location.href).searchParams.get('tl') || '';
    const chips = (data.links || []).slice(0, 12).map((l) => {
      const tl = parseQuery(l.href).get('tl') || '';
      return `<a class="ehx-chip${tl === current || (!current && !tl) ? ' ehx-active' : ''}" href="${esc(l.href)}">${esc(l.label.replace(/^Galleries\s+/i, ''))}</a>`;
    }).join('');

    const groups = data.groups.map((g) => `<div class="ehx-rankgroup">
      <h3>${esc(g.title)}</h3>
      ${g.rows.map((row) => `<a class="ehx-rankrow" href="${esc(row.url)}"><span class="ehx-rankno">${esc(row.rank || '')}</span><span class="ehx-nowrap">${esc(row.title)}</span></a>`).join('')}
    </div>`).join('');

    app.main.innerHTML = `<div class="ehx-chips">${chips || `<span class="ehx-chip ehx-active">${icon('star', 13)} Toplists</span>`}</div>
      <div class="ehx-ranklist">${groups || emptyState('No toplists', 'This toplist is empty.', '', 'star')}</div>`;

    app.refresh = () => { htmlCache.delete(url); navigate(url, { replace: true, restore: false }); };
  }
  // ---------------------------------------------------------------------------
  // Bootstrap
  // ---------------------------------------------------------------------------

  function bootStyle(on) {
    // At document-start the <html> element may not exist yet.
    if (!document.documentElement) {
      if (!on) return;
      const mo = new MutationObserver(() => {
        if (document.documentElement) {
          mo.disconnect();
          bootStyle(true);
        }
      });
      try { mo.observe(document, { childList: true, subtree: true }); } catch { /* noop */ }
      return;
    }
    let el = document.getElementById('ehx-boot');
    if (on) {
      if (!el) {
        el = document.createElement('style');
        el.id = 'ehx-boot';
        el.textContent = `
          html{background:#0f0d13!important}
          body{visibility:hidden!important}
          #ehx-boot-load{position:fixed;inset:0;z-index:2147483647;background:#0f0d13;display:flex;
            align-items:center;justify-content:center;flex-direction:column;gap:15px;
            visibility:visible!important;color:#d0bcff;
            font:600 13px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
          #ehx-boot-load .ehx-boot-logo{width:54px;height:54px;border-radius:17px;display:grid;place-items:center;
            background:linear-gradient(145deg,#d0bcff,#6750a4);color:#241a3a;font:900 23px -apple-system,sans-serif;
            box-shadow:0 10px 34px rgba(103,80,164,.45)}
          #ehx-boot-load .ehx-boot-spin{width:22px;height:22px;border-radius:50%;
            border:2px solid rgba(208,188,255,.22);border-top-color:#d0bcff;animation:ehx-boot-spin .8s linear infinite}
          @keyframes ehx-boot-spin{to{transform:rotate(360deg)}}
        `;
        (document.head || document.documentElement).appendChild(el);
      }
      if (!document.getElementById('ehx-boot-load')) {
        const load = document.createElement('div');
        load.id = 'ehx-boot-load';
        load.innerHTML = `<div class="ehx-boot-logo">${IS_EX ? 'X' : 'E'}</div><div class="ehx-boot-spin"></div><div>Starting ${esc(SITE_NAME)}…</div>`;
        document.documentElement.appendChild(load);
      }
    } else {
      if (el) el.remove();
      const load = document.getElementById('ehx-boot-load');
      if (load) load.remove();
    }
  }

  function boot() {
    if (!isAppRoute(location.href)) {
      bootStyle(false);
      return;
    }

    try {
      const initialDoc = document.cloneNode(true);
      if (challengePage(initialDoc)) {
        // Let the browser show the Cloudflare check; taking over would hide it.
        bootStyle(false);
        return;
      }
      injectStyles();
      initShell();
      app.loggedIn = detectLoggedIn();
      app.booted = true;
      bootStyle(false);

      if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

      navigate(location.href, {
        initial: true,
        replace: true,
        initialDoc,
        restore: false,
      }).catch(showError);

      // Check the auto-update source in the background. The result is cached
      // for 12 hours; a newer version shows a dismissible in-app banner.
      setTimeout(() => {
        if (navigator.onLine !== false) checkForUpdate();
      }, 3500);

      // Keep the theme in sync with iOS while "Auto" is selected.
      try {
        const mq = matchMedia('(prefers-color-scheme: dark)');
        if (mq.addEventListener) mq.addEventListener('change', () => { if (settings.theme === 'auto') applyTheme(); });
      } catch { /* noop */ }

      // Debug handle (harmless, useful in Safari Web Inspector).
      try {
        window.__EHENTAI_APP__ = { version: VERSION, settings, app, parser: { parseList, parseDetail, parseReader }, navigate, preloadFavorites, checkForUpdate };
      } catch { /* noop */ }
    } catch (err) {
      console.error('[EHX boot]', err);
      bootStyle(false);
      try {
        document.documentElement.style.visibility = '';
        document.body.innerHTML = `<div style="padding:30px;font:15px -apple-system,sans-serif;color:#eee;background:#0f0d13;min-height:100vh">
          <h2 style="margin:0 0 8px">E-Hentai App could not start</h2>
          <p style="color:#aaa;line-height:1.5">${esc(err && err.message ? err.message : String(err))}</p>
          <p><a href="${esc(originalUrl(location.href))}" style="color:#d0bcff">Open the original page</a></p>
        </div>`;
      } catch { /* noop */ }
    }
  }

  // Hide the original render as early as possible, but only on pages we own.
  if (isAppRoute(location.href)) bootStyle(true);

  // Safety valve: never leave the page invisible if something goes wrong.
  setTimeout(() => {
    if (!app.booted) bootStyle(false);
  }, 12000);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    setTimeout(boot, 0);
  }
})();
