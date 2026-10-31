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

    let data = null;
    if (initialDoc) {
      if (sadPanda(initialDoc) || loginPage(initialDoc)) {
        app.main.innerHTML = loginCardHtml(sadPanda(initialDoc)
          ? 'ExHentai needs valid cookies before it will show galleries. Use Cookie login below.'
          : 'Log in to view this gallery.');
        return;
      }
      try { data = parseDetail(initialDoc, url); } catch (e) { console.warn(e); }
    }

    if (!data || !data.title) {
      const rec = await fetchDoc(url, { force: !!opts.force, priority: true });
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
    const thumbPage = thumbPageOf(url);
    const pageCount = data.thumbRange ? Math.ceil(data.thumbRange.total / 20) : Math.ceil((data.pages || 0) / 20);

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
          <div class="ehx-section-title">Pages <span>${esc(data.gpc || (data.thumbs.length + ' shown'))}</span></div>
          <button class="ehx-chip" data-act="jump-page">${icon('jump', 13)} Jump</button>
        </div>
        ${renderThumbGrid(data, gid)}
        <div class="ehx-thumbctl">
          <button class="ehx-iconbtn ehx-small" data-act="thumb-prev" ${thumbPage <= 0 ? 'disabled' : ''}>${icon('back', 18)}</button>
          <div class="ehx-grow">Page ${Math.min(thumbPage + 1, Math.max(1, pageCount))} / ${Math.max(1, pageCount)}</div>
          <button class="ehx-iconbtn ehx-small" data-act="thumb-next" ${thumbPage >= pageCount - 1 ? 'disabled' : ''}>${icon('forward', 18)}</button>
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
        const clear = () => {
          thumbsEl.querySelectorAll('.ehx-thumb-loading').forEach((el) => el.classList.remove('ehx-thumb-loading'));
        };
        probe.onload = clear;
        probe.onerror = clear;
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

    onAction('thumb-prev', () => {
      if (thumbPage > 0) navigate(detailPageUrl(galleryUrl, thumbPage - 1), { restore: false });
    });
    onAction('thumb-next', () => {
      if (thumbPage < pageCount - 1) navigate(detailPageUrl(galleryUrl, thumbPage + 1), { restore: false });
    });

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
