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

  const TAGSUGGEST_URL = (typeof window !== 'undefined' && window.__EHX_TAGSUGGEST_URL__)
    || (IS_EX ? 'https://s.exhentai.org/api.php' : 'https://api.e-hentai.org/api.php');

  async function fetchTagSuggestions(text) {
    const q = String(text || '').trim();
    if (!q) return [];
    try {
      const res = await fetch(TAGSUGGEST_URL, {
        method: 'POST',
        credentials: 'omit',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: 'tagsuggest', text: q }),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      const tags = data && data.tags && typeof data.tags === 'object' ? Object.values(data.tags) : [];
      return tags
        .map((t) => ({ ns: t.ns || '', name: t.tn || '', full: `${t.ns}:${t.tn}` }))
        .filter((t) => t.ns && t.name)
        .slice(0, 10);
    } catch {
      return localTagSuggestions(q);
    }
  }

  function openCalendarSheet(baseUrl) {
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const s = openSheet({
      title: 'Jump to date',
      body: `<div class="ehx-field"><label class="ehx-label">Date</label>
        <input class="ehx-input" id="ehx-calendar-date" type="date" value="${today}" min="2007-01-01" max="${today}"></div>
        <p style="font-size:11.5px;color:var(--muted2);margin:0">The list starts at this date. Scroll down for newer galleries.</p>`,
      footer: `<button class="ehx-btn" data-x="cancel">Cancel</button><button class="ehx-btn ehx-btn-primary" data-x="go">Go</button>`,
    });
    s.sheet.addEventListener('click', (e) => {
      if (e.target.closest('[data-x="cancel"]')) { s.close(); return; }
      if (!e.target.closest('[data-x="go"]')) return;
      const input = s.sheet.querySelector('#ehx-calendar-date');
      const date = input && input.value;
      if (!date) { toast('Choose a date'); return; }
      const u = new URL(baseUrl || currentUrl(), location.href);
      for (const k of ['next', 'prev', 'p', 'seek']) u.searchParams.delete(k);
      u.searchParams.set('seek', date);
      s.close();
      navigate(u.href, { restore: false });
      setTimeout(() => window.scrollTo(0, 0), 0);
    });
  }

  function renderSearchPage() {
    app.tab = 'more';
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
    const baseUrl = app.searchBase || absUrl('/');
    let basePath = '/';
    try { basePath = new URL(baseUrl, location.href).pathname; } catch { /* noop */ }
    const baseLabel = basePath === '/favorites.php' ? 'Favorites'
      : basePath === '/watched' ? 'Watched'
        : basePath.startsWith('/tag/') ? 'Tag'
          : basePath.startsWith('/uploader/') ? 'Uploader'
            : 'All galleries';

    app.main.innerHTML = `<div class="ehx-settings" style="padding-top:2px">
      <div class="ehx-tagwrap" style="margin:2px 0 10px">
        <span class="ehx-chip ehx-active">${icon('search', 12)} ${esc(baseLabel)}</span>
        ${baseLabel !== 'All galleries' ? `<button class="ehx-chip" data-cmd="search-all">${icon('home', 12)} All galleries</button>` : ''}
      </div>
      <div class="ehx-searchwrap" style="padding-left:0;padding-right:0">
        <div class="ehx-searchbox">
          ${icon('search', 18)}
          <input id="ehx-search-input" type="search" value="${esc(draftQ)}" placeholder="Title, artist, tag, parody…" autocomplete="off" autocapitalize="none" spellcheck="false" enterkeyhint="search">
          <button class="ehx-iconbtn" data-act="calendar" aria-label="Jump to date">${icon('calendar', 18)}</button>
        </div>
      </div>
      <div class="ehx-suggest" id="ehx-suggest" hidden></div>

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
      const u = new URL(baseUrl, location.href);
      for (const k of ['f_search', 'f_cats', 'f_srdd', 'f_spf', 'f_spt', 'f_sto', 'f_sh', 'seek', 'next', 'prev', 'p']) {
        u.searchParams.delete(k);
      }
      for (const [k, v] of params) u.searchParams.set(k, v);
      navigate(u.href);
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
      if (cmd) { recentSearches.clear(); renderSearchPage(); return; }
      if (e.target.closest('[data-cmd="search-all"]')) {
        app.searchBase = absUrl('/');
        renderSearchPage();
      }
    };

    const suggestBox = $('#ehx-suggest');
    let suggestTimer = 0;
    let suggestSeq = 0;
    const hideSuggest = () => {
      suggestSeq++;
      if (suggestBox) { suggestBox.hidden = true; suggestBox.innerHTML = ''; }
    };
    const showSuggest = (list, operator) => {
      if (!suggestBox) return;
      if (!list.length) { hideSuggest(); return; }
      suggestBox.hidden = false;
      suggestBox.innerHTML = list.map((t) => `<button class="ehx-suggest-item" data-full="${esc(t.full)}"><b>${esc(t.ns)}</b>:${esc(t.name)}</button>`).join('');
      suggestBox.onclick = (e) => {
        const btn = e.target.closest('[data-full]');
        if (!btn) return;
        const full = btn.dataset.full || '';
        const idx = full.indexOf(':');
        const ns = idx > 0 ? full.slice(0, idx) : '';
        const name = idx > 0 ? full.slice(idx + 1) : full;
        const parts = input.value.split(/\s+/);
        parts.pop();
        parts.push(`${operator}${ns}:"${name}"`);
        input.value = parts.join(' ') + ' ';
        hideSuggest();
        input.focus();
      };
    };
    input.addEventListener('input', () => {
      clearTimeout(suggestTimer);
      const value = input.value;
      const parts = value.split(/\s+/);
      const last = parts[parts.length - 1] || '';
      const operator = last[0] === '-' || last[0] === '~' ? last[0] : '';
      const text = operator ? last.slice(1) : last;
      if (text.length < 2) { hideSuggest(); return; }
      const seq = ++suggestSeq;
      suggestTimer = setTimeout(async () => {
        const list = await fetchTagSuggestions(text);
        if (seq !== suggestSeq || input.value !== value) return;
        showSuggest(list, operator);
      }, 260);
    });
    input.addEventListener('blur', () => setTimeout(hideSuggest, 180));
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
        ${settingRow('Scroll-to-top button', 'Side of the floating button', segHtml('scrollButton', settings.scrollButton, [{ value: 'left', label: 'Left' }, { value: 'right', label: 'Right' }, { value: 'off', label: 'Off' }]))}
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
        if (key === 'scrollButton') renderFab();
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
            renderFab();
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
