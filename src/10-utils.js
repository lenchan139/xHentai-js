  // ---------------------------------------------------------------------------
  // Constants & tiny helpers
  // ---------------------------------------------------------------------------

  const VERSION = '1.0.7';
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
  // Namespace colors mirror JHenTai's UIConfig.
  const TAG_COLORS = {
    language: '#f5dff5',
    artist: '#ccd9cd',
    character: '#c8c8e7',
    female: '#dbceee',
    male: '#fdd7d7',
    parody: '#eed4c5',
    group: '#dfd6f7',
    mixed: '#d6e0f7',
    cosplayer: '#f6dcf3',
    reclass: '#f6dce9',
    temp: '#e9dbfa',
    other: '#fadcdb',
    location: '#f5dff5',
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
    if (route.name === 'search') return 'search';
    if (route.name === 'settings' || route.name === 'history' || route.name === 'toplist') return 'more';
    if (route.kind === 'popular') return 'popular';
    if (route.kind === 'favorites.php') return 'favorites';
    if (route.kind === 'watched') return 'more';
    const q = parseQuery(url || location.href);
    if (q.get('f_search')) return 'search';
    return 'home';
  }
