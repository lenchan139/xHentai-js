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
