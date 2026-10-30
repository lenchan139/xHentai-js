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
        <div class="ehx-group">
          <button class="ehx-drawer-item" data-rm="jump">${icon('jump', 20)}<span>Jump to page</span><span style="margin-left:auto;color:var(--muted2);font-size:12px">${r.index} / ${r.total}</span></button>
          <button class="ehx-drawer-item" data-rm="reload">${icon('refresh', 20)}<span>Reload this image</span></button>
          <button class="ehx-drawer-item" data-rm="image">${icon('external', 20)}<span>Open image in new tab</span></button>
          ${recNow && recNow.fullUrl ? `<button class="ehx-drawer-item" data-rm="full">${icon('image', 20)}<span>Original resolution</span></button>` : ''}
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
