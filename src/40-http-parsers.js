  // ---------------------------------------------------------------------------
  // Network layer (same-origin fetch + small HTML cache + concurrency limit)
  // ---------------------------------------------------------------------------

  let activeFetches = 0;
  const fetchQueue = [];
  const fetchInflight = new Map();
  const fetchStarted = new Set();
  const MAX_FETCHES = 3;

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
        if (!loginPage(doc) && !sadPanda(doc)) htmlCache.set(abs, rec);
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
    const rows = Array.from(doc.querySelectorAll('table.itg tr'));
    for (const tr of rows) {
      if (tr.querySelector('td.itd') || tr.querySelector('th')) continue;
      const link = tr.querySelector('td.gl3c a[href*="/g/"], td.gl2c a[href*="/g/"], a[href*="/g/"]');
      if (!link) continue;
      const href = absUrl(link.getAttribute('href'), base);
      const m = href.match(/\/g\/(\d+)\/([0-9a-f]+)/i);
      if (!m || seen.has(m[1])) continue;
      seen.add(m[1]);

      const titleEl = tr.querySelector('.glink');
      const title = text(titleEl) || text(link);
      if (!title) continue;

      const catEl = tr.querySelector('.gl1c .cn') || tr.querySelector('.gl1c');
      const catClass = (catEl && Array.from(catEl.classList).find((c) => /^ct[0-9a]$/.test(c))) || '';
      const category = text(catEl) || catFromClass(catClass) || 'Misc';

      const img = tr.querySelector('.gl2c img[data-src], .gl2c img[src], img[data-src]');
      let cover = img ? (img.getAttribute('data-src') || img.getAttribute('src') || '') : '';
      cover = safeImage(cover);
      if (/^data:/i.test(cover)) cover = '';

      const uploaderEl = tr.querySelector('.gl4c a[href*="/uploader/"]');
      const uploader = text(uploaderEl);

      const pagesEl = tr.querySelector('.gl4c div:last-child');
      let pages = num(text(pagesEl));
      if (!pages) {
        const pm = (tr.textContent || '').match(/([\d,]+)\s+pages?/i);
        pages = pm ? num(pm[1]) : null;
      }

      const postedEl = tr.querySelector('[id^="posted"]');
      const posted = text(postedEl);

      const tags = [];
      const tagSeen = new Set();
      for (const el of tr.querySelectorAll('.gl3c .gt')) {
        const full = (el.getAttribute('title') || text(el) || '').trim();
        if (!full || tagSeen.has(full)) continue;
        tagSeen.add(full);
        const idx = full.indexOf(':');
        tags.push({
          ns: idx > 0 ? full.slice(0, idx) : '',
          name: idx > 0 ? full.slice(idx + 1) : full,
          full,
        });
      }
      const language = (tags.find((t) => t.ns === 'language') || {}).name || null;

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
        rating: 0,
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
      for (const a of tr.querySelectorAll('td .gt a')) {
        const name = text(a);
        const full = ns ? `${ns}:${name}` : name;
        if (!name || tagSeen.has(full)) continue;
        tagSeen.add(full);
        const tEl = a.closest('.gt');
        const hidden = tEl ? (parseFloat(tEl.style.opacity || '1') < 0.7) : false;
        tags.push({ ns, name, full, href: absUrl(a.getAttribute('href'), base), hidden });
      }
    }
    // Fallback: tags as plain links under #taglist.
    if (!tags.length) {
      for (const a of doc.querySelectorAll('#taglist a[href*="/tag/"]')) {
        const full = decodeURIComponent((a.getAttribute('href') || '').split('/tag/')[1] || '').replace(/\+/g, ' ');
        if (!full) continue;
        const idx = full.indexOf(':');
        tags.push({ ns: idx > 0 ? full.slice(0, idx) : '', name: idx > 0 ? full.slice(idx + 1) : full, full, href: absUrl(a.getAttribute('href'), base), hidden: false });
      }
    }

    const thumbs = [];
    for (const a of doc.querySelectorAll('#gdt a[href*="/s/"]')) {
      const href = absUrl(a.getAttribute('href'), base);
      const im = href.match(/-(\d+)(?:\/)?$/);
      const idx = im ? parseInt(im[1], 10) : null;
      if (!idx) continue;
      const div = a.querySelector('div');
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
