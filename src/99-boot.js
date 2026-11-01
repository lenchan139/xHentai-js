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

  // The site's "gallery unavailable" page (copyright/removed) schedules a
  // redirect to the front page after 3s. Drop only that timer so the error
  // message stays readable instead of disappearing into the front page.
  try {
    if (/^\/g\/\d+\//.test(location.pathname)) {
      const nativeSetTimeout = window.setTimeout;
      window.setTimeout = function (fn, delay, ...args) {
        if (typeof fn === 'string' && /gotonext\s*\(/.test(fn)) return 0;
        return nativeSetTimeout.call(window, fn, delay, ...args);
      };
    }
  } catch { /* noop */ }

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
        window.__EHENTAI_APP__ = { version: VERSION, settings, app, parser: { parseList, parseDetail, parseReader }, navigate, preloadFavorites, checkForUpdate, clearCaches: clearRuntimeCaches };
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
