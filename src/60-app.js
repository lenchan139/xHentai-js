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
    { id: 'search', icon: 'search', label: 'Search', href: '/#ehx-search' },
    { id: 'more', icon: 'menu', label: 'More', act: 'drawer' },
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
        if (yes) openExternal('https://forums.e-hentai.org/index.php?act=Login&CODE=03');
      });
  }

  // --- misc UI helpers --------------------------------------------------------

  function categoryColor(cat) { return CATEGORY_COLORS[cat] || '#9e9e9e'; }
  function tagColor(ns) { return TAG_COLORS[ns] || '#d6c9e6'; }

  function tagPill(t, { nav = true, small = false } = {}) {
    const color = tagColor(t.ns);
    const attrs = nav ? `data-tag="${esc(t.full || ((t.ns ? t.ns + ':' : '') + t.name))}"` : '';
    return `<${nav ? 'button' : 'span'} class="ehx-tagpill${t.hidden ? ' ehx-hiddenop' : ''}" style="--tagc:${color}" ${attrs}>${esc(t.name || t.full)}</${nav ? 'button' : 'span'}>`;
  }

  function tagUrl(full) {
    return '/tag/' + encodeURIComponent(full).replace(/%20/g, '+').replace(/%3A/gi, ':');
  }

  function galleryCardHtml(g, opts = {}) {
    const prog = progressStore.get(g.gid);
    const cat = g.category || 'Misc';
    const color = categoryColor(cat);
    const blurred = settings.blurCovers && !opts.noBlur;
    const tags = (g.tags || []).filter((t) => t.ns !== 'language').slice(0, 3);
    const rating = g.rating ? `<span class="ehx-rating">${icon('star', 11)}${g.rating.toFixed(1)}</span>` : '';
    const pct = prog && prog.total ? clamp(Math.round((prog.index / prog.total) * 100), 1, 100) : 0;
    const pages = g.pages ? `<span class="ehx-badge ehx-pages">${formatNum(g.pages)}P</span>` : '';
    const imgAttrs = opts.eager
      ? 'loading="eager" fetchpriority="high" decoding="async"'
      : 'loading="lazy" decoding="async"';
    const cover = g.cover
      ? `<img ${imgAttrs} src="${esc(g.cover)}" alt="" class="${blurred ? 'ehx-cover-blur' : ''}">`
      : `<div class="ehx-center" style="height:100%;color:var(--muted2)">${icon('image', 28)}</div>`;
    const tagsHtml = settings.showTags && tags.length
      ? `<div class="ehx-card-tags">${tags.map((t) => `<span class="ehx-tag" style="--tagc:${tagColor(t.ns)}">${esc(t.name)}</span>`).join('')}</div>`
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
          ${g.posted ? `<span class="ehx-dim" style="margin-left:auto;font-size:9.5px">${esc(g.posted.split(' ')[0])}</span>` : ''}
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
        navigate(abs);
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

    for (const href of ['https://ehgt.org']) {
      for (const rel of ['preconnect', 'dns-prefetch']) {
        const l = document.createElement('link');
        l.rel = rel;
        l.href = href;
        document.head.appendChild(l);
      }
    }

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
