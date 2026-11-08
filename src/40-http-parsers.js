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
      // My Tags carries the account API key; never persist it.
      if (/^\/(favorites\.php|watched|home\.php|mytags)(\/|$)/.test(u.pathname)) return false;
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
          let bodyText = '';
          try {
            const bodyHtml = await res.text();
            const errDoc = new DOMParser().parseFromString(bodyHtml, 'text/html');
            const d = errDoc.querySelector('.d');
            bodyText = d
              ? text(d.querySelector('p') || d)
              : bodyHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
            bodyText = bodyText.slice(0, 500);
          } catch { /* no body */ }
          const err = new Error('HTTP ' + res.status);
          err.status = res.status;
          err.bodyText = bodyText;
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
        // E-Hentai answers multipart/form-data POSTs to gallerypopups.php with
        // "403 Forbidden Request forbidden by administrative rules." Its forms
        // are ordinary application/x-www-form-urlencoded forms, so encode
        // FormData that way (spaces become '+', UTF-8 is percent-encoded).
        let body = formData;
        const headers = {};
        if (typeof FormData !== 'undefined' && formData instanceof FormData) {
          const params = new URLSearchParams();
          for (const [key, value] of formData.entries()) params.append(key, String(value));
          body = params;
          headers['Content-Type'] = 'application/x-www-form-urlencoded';
        }
        if (referer) headers.Referer = referer;
        const res = await fetch(abs, {
          method: 'POST',
          credentials: 'same-origin',
          body,
          headers: Object.keys(headers).length ? headers : undefined,
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

    const bodyEl = doc.querySelector('.d');
    const bodyText = bodyEl ? text(bodyEl.querySelector('p') || bodyEl) : (doc.documentElement ? text(doc.body) : '');
    const error = !items.length && bodyText && bodyText.length < 500
      && /not found|invalid|error|removed|unavailable|no hits|no results/i.test(bodyText)
      ? bodyText
      : '';

    return {
      items,
      favLinks,
      error,
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
    // ExHentai now shows the folder name ("Favorites 3") when favorited and
    // "Add to Favorites" otherwise; older markup used "Remove from Favorites".
    const favorited = !!favText && !/add to favorites/i.test(favText);
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
      error: title ? '' : (() => {
        const d = doc.querySelector('.d');
        const msg = d ? text(d.querySelector('p') || d) : (doc.documentElement ? (text(doc.body) || text(doc.documentElement)) : '');
        return msg.slice(0, 600);
      })(),
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

  // The My Tags page lists the user's tag sets. Each row has a
  // `#tagwatch_<id>` checkbox; the checked ones are watched tags.
  function parseWatchedTags(doc) {
    const out = [];
    const seen = new Set();
    for (const box of doc.querySelectorAll('[id^="usertag_"]')) {
      const id = (box.id || '').replace('usertag_', '');
      if (!/^\d+$/.test(id)) continue;
      const watch = box.querySelector(`#tagwatch_${id}`);
      if (!watch || !(watch.checked || watch.hasAttribute('checked'))) continue;
      const a = box.querySelector('a[href*="/tag/"]');
      if (!a) continue;
      const href = a.getAttribute('href') || '';
      let full = href.split('/tag/')[1] || '';
      try { full = decodeURIComponent(full); } catch { /* keep raw */ }
      full = full.replace(/\+/g, ' ').replace(/\/+$/, '').trim();
      if (!full || seen.has(full)) continue;
      seen.add(full);
      out.push(full);
    }
    return out;
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
