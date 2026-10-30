  // ---------------------------------------------------------------------------
  // Gallery list page
  // ---------------------------------------------------------------------------

  const CATEGORY_TO_PATH = Object.fromEntries(Object.entries(CATEGORY_PATHS).map(([p, n]) => [n, p]));
  const listMemory = new Map();
  const favoritesCache = new Map();
  const FAVORITES_TTL = 300000;

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
  function schedulePreload() {
    if (preloadTimer) return;
    preloadTimer = setTimeout(() => { preloadTimer = 0; preloadFavorites(); }, 800);
  }

  function preloadFavorites() {
    if (app.route && (app.route.name === 'reader' || app.route.kind === 'favorites.php')) return;
    const url = canonicalListUrl('/favorites.php');
    const hit = favoritesCache.get(url);
    const weakHit = hit && hit.data && hit.data.items && hit.data.items.length && hit.data.items.every((g) => !g.cover);
    if (hit && !weakHit && Date.now() - hit.at < FAVORITES_TTL) return;
    fetchDoc(url, { ttl: 120000 })
      .then((rec) => {
        const data = parseList(rec.doc, rec.url);
        if (!data.loggedOut && !data.sad) favoritesCache.set(url, { at: Date.now(), data });
      })
      .catch(() => { /* background warm-up */ });
  }

  function canonicalListUrl(url) {
    try {
      const u = new URL(url, location.href);
      // Compact is the layout the parser and tests target, and unlike
      // `dm_e` it does not rewrite the visitor's site display-mode cookie.
      u.searchParams.set('inline_set', 'dm_l');
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
      const cachedFav = favoritesCache.get(favUrl);
      if (cachedFav && Date.now() - cachedFav.at < FAVORITES_TTL) {
        data = cachedFav.data;
        fromCache = true;
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

    if (isFav && !fromCache) favoritesCache.set(favUrl, { at: Date.now(), data });

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
