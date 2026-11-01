import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import puppeteer from 'puppeteer-core';

const root = path.resolve(import.meta.dirname, '..');
const raw = path.join(root, 'test/fixtures');
const PORT = 43123;
const BASE = `http://127.0.0.1:${PORT}`;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');

const FILE_MAP = {
  '/': 'index.html',
  '/popular': 'popular.html',
  '/favorites.php': 'favorites.html',
  '/watched': 'watched.html',
  '/toplist.php': 'toplist.html',
  '/doujinshi': 'index.html',
  '/manga': 'index.html',
  '/artistcg': 'index.html',
  '/gamecg': 'index.html',
  '/western': 'index.html',
  '/non-h': 'index.html',
  '/imageset': 'index.html',
  '/cosplay': 'index.html',
  '/asianporn': 'index.html',
  '/misc': 'index.html',
  '/g/4291744/019be8a2c7/': 'detail.html',
  '/g/4291745/d068af7fe3/': 'detail_p1.html',
  '/g/1922802/711f9187e5/': 'detail-ex.html',
  '/g/3802196/f43d61f90b/': 'detail-ex-small.html',
  '/gallerypopups.php': 'favpopup_loggedin.html',
};

function fileFor(url) {
  const u = new URL(url, BASE);
  const p = decodeURIComponent(u.pathname);
  if (p.startsWith('/s/')) return 'reader.html';
  if (p.startsWith('/tag/')) return 'tag:language:chinese.html';
  if (p.startsWith('/uploader/')) return 'index.html';
  if (p === '/' && u.searchParams.get('f_search')) return 'search.html';
  if (p === '/g/3802196/f43d61f90b/') {
    return u.searchParams.get('p') === '1' ? 'detail-ex-small-p1.html' : 'detail-ex-small.html';
  }
  if (FILE_MAP[p]) return FILE_MAP[p];
  if (p.startsWith('/g/4291744/')) return 'detail.html';
  if (p.startsWith('/g/4291745/')) return 'detail_p1.html';
  if (p.startsWith('/g/')) return 'detail.html';
  return null;
}

let lastPost = null;
let favRequests = 0;
let showpageRequests = 0;
let gRequests = 0;
let nextRequests = 0;
const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, BASE);
    if (u.pathname === '/favicon.ico') { res.writeHead(204); res.end(); return; }
    if (u.pathname === '/__lastpost') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(lastPost));
      return;
    }
    if (u.pathname === '/__stats') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ favRequests }));
      return;
    }
    if (u.pathname === '/__resetfav') { favRequests = 0; res.writeHead(204); res.end(); return; }
    if (u.pathname === '/g/999999999/abcdef1234/') {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end('Gallery not found. If you just added this gallery, you may have to wait a short while before it becomes available.');
      return;
    }
    if (u.pathname === '/g/2723308/bbe94c10b2/') {
      let html = await fsp.readFile(path.join(raw, 'gallery-copyright.html'), 'utf8');
      html = html.replace(/https?:\/\/(www\.)?(e-hentai|exhentai)\.org/g, BASE);
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(html);
      return;
    }
    if (u.pathname === '/__tagsuggest' && req.method === 'POST') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ tags: { 1: { ns: 'female', tn: 'teacher' }, 2: { ns: 'male', tn: 'teacher' } } }));
      return;
    }
    if (u.pathname === '/__showpage' && req.method === 'POST') {
      let body = '';
      for await (const chunk of req) body += chunk;
      let data = {};
      try { data = JSON.parse(body || '{}'); } catch { /* ignore */ }
      showpageRequests++;
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({
        p: data.page,
        s: `s/${data.imgkey}/sample-${data.page}`,
        n: '',
        i: `<div>page ${data.page}</div>`,
        i3: '<img id="img" src="https://ehgt.org/g/1.png?xres=800" style="width:800px;height:1122px">',
        i6: `<div><a href="/fullimg/1/${data.page}/x/1.png">original</a></div>`,
        x: '800',
        y: '1122',
      }));
      return;
    }
    if (u.pathname === '/__update') {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ version: '99.0.0' }));
      return;
    }
    if (u.searchParams.has('next')) nextRequests++;
    if (u.pathname === '/favorites.php' && !u.searchParams.has('next')) favRequests++;
    if (req.method === 'GET' && /^\/g\/\d+\//.test(u.pathname)) gRequests++;
    if (req.method === 'POST') {
      let body = '';
      for await (const chunk of req) body += chunk;
      lastPost = { url: req.url, body };
    }
    let file = fileFor(req.url);
    if (u.pathname === '/favorites.php' && /ipb_member_id=/.test(req.headers.cookie || '')) file = 'index.html';
    if (u.pathname.startsWith('/fullimg/')) {
      res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' });
      res.end(PNG);
      return;
    }
    if (!file) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('not found');
      return;
    }
    let html = await fsp.readFile(path.join(raw, file), 'utf8');
    // Make every in-page link same-origin so the SPA can fetch it locally.
    html = html.replace(/https?:\/\/(www\.)?(e-hentai|exhentai)\.org/g, BASE);
    html = html.replace(/https:\/\/api\.e-hentai\.org\/api\.php/g, BASE + '/__showpage');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(html);
  } catch (e) {
    res.writeHead(500); res.end(String(e));
  }
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

const userscript = fs.readFileSync(path.join(root, 'ehentai-app.user.js'), 'utf8');
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.setRequestInterception(true);
page.on('request', (req) => {
  const url = req.url();
  if (url.startsWith(BASE)) {
    // Delay gallery HTML so the instant detail preview can be asserted.
    if (/\/g\/\d+\/[0-9a-f]+\/?/.test(url) && req.resourceType() === 'fetch') {
      return setTimeout(() => req.continue().catch(() => {}), 700);
    }
    return req.continue();
  }
  if (req.resourceType() === 'image' || /\.(webp|png|jpe?g|gif)(\?|$)/i.test(url)) {
    return req.respond({ status: 200, contentType: 'image/png', body: PNG });
  }
  if (/e-hentai\.org|exhentai\.org|ehgt\.org/.test(url)) return req.abort();
  return req.abort();
});

const errors = [];
page.on('pageerror', (e) => { if (!/build_rangebar/i.test(e.message)) errors.push('pageerror: ' + e.message); });
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  const t = m.text();
  if (/Failed to load resource|net::ERR|ERR_FAILED|404|favicon|build_rangebar/i.test(t)) return;
  errors.push('console: ' + t);
});

let pass = 0;
let fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? ' — ' + extra : '')); }
};
let stepName = '';
const step = (n) => { stepName = n; console.log('   · ' + n); };
const txt = (sel) => page.$eval(sel, (el) => el.textContent.trim()).catch(() => '');
const count = (sel) => page.$$eval(sel, (els) => els.length).catch(() => 0);
const clickSel = (sel) => page.evaluate((s) => { const el = document.querySelector(s); if (el) el.click(); }, sel);

try {
  await page.evaluateOnNewDocument(`
    window.__EHX_UPDATE_META_URL__ = ${JSON.stringify(BASE + '/__update')};
    window.__EHX_UPDATE_INSTALL_URL__ = ${JSON.stringify(BASE + '/__update')};
    window.__EHX_TAGSUGGEST_URL__ = ${JSON.stringify(BASE + '/__tagsuggest')};
  `);
  await page.evaluateOnNewDocument(userscript);
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.ehx-card', { timeout: 8000 });

  console.log('\nHome / list');
  ok('app shell rendered', await count('#ehx-app') === 1);
  ok('25 gallery cards', await count('.ehx-card') === 25, String(await count('.ehx-card')));
  ok('bottom tab bar has 5 tabs', await count('.ehx-tab') === 5);
  ok('Watched tab present', await count('.ehx-tab[href="/watched"]') === 1);
  await page.click('.ehx-tab[href="/watched"]');
  await page.waitForFunction(() => location.pathname === '/watched', { timeout: 6000 });
  ok('Watched tab active', await count('.ehx-tab.ehx-active[href="/watched"]') === 1);
  await page.click('.ehx-tab[href="/"]');
  await page.waitForSelector('.ehx-card', { timeout: 6000 });
  ok('brand shows E-Hentai', (await txt('.ehx-brandname')) === 'E-Hentai');
  ok('category chips', await count('.ehx-chips .ehx-chip') > 10);
  ok('first card title', (await txt('.ehx-card-title')).length > 3);

  console.log('\nCovers');
  const covers = await page.$$eval('.ehx-card img', (imgs) => imgs.map((i) => ({
    src: i.getAttribute('src') || '',
    data: i.getAttribute('data-cover') || '',
  })));
  ok('first 4 covers load eagerly', covers.slice(0, 4).every((c) => /^https?:\/\//.test(c.src) && !/^data:/.test(c.src)));
  ok('every card has a cover URL', covers.every((c) => /\/w\//.test(c.src) || /\/w\//.test(c.data)));
  ok('covers use the 250px /w/ list image', covers.every((c) => !c.data || /\/w\//.test(c.data)));
  ok('off-screen covers are deferred', covers.slice(12).some((c) => !!c.data));

  console.log('\nList mode');
  await page.click('[data-act="toggle-layout"]');
  await page.waitForSelector('.ehx-grid.ehx-listmode', { timeout: 6000 });
  const listDims = await page.$eval('.ehx-listmode .ehx-card', (el) => ({
    h: el.getBoundingClientRect().height,
    cover: el.querySelector('.ehx-cover').getBoundingClientRect().width,
    stars: el.querySelectorAll('.ehx-stars .ehx-star').length,
    tags: [...el.querySelectorAll('.ehx-tag')].map((t) => t.textContent),
    lang: (el.querySelector('.ehx-pages') || {}).textContent || '',
  }));
  ok('list card is taller', listDims.h >= 130, listDims.h + 'px');
  ok('list cover is larger', listDims.cover >= 100, listDims.cover + 'px');
  ok('list card has a 5-star row', listDims.stars === 5, String(listDims.stars));
  ok('list card shows the language tag', listDims.tags.includes('portuguese'), JSON.stringify(listDims.tags));
  ok('list card shows a language label', /^PT \d+P$/.test(listDims.lang), listDims.lang);
  await page.click('[data-act="toggle-layout"]');
  await page.waitForSelector('.ehx-grid:not(.ehx-listmode)', { timeout: 6000 });

  console.log('\nScroll-to-top FAB');
  await page.evaluate(() => window.scrollTo(0, 1600));
  await page.waitForSelector('#ehx-fab.ehx-show', { timeout: 4000 });
  ok('FAB appears on scroll', true);
  ok('FAB defaults to the left', await page.$eval('#ehx-fab', (el) => el.classList.contains('ehx-fab-left')));
  await page.evaluate(() => document.querySelector('#ehx-fab').click());
  await page.waitForFunction(() => window.scrollY < 80, { timeout: 4000 });
  ok('FAB scrolls to top', true);

  console.log('\nUpdate notifier');
  await page.waitForSelector('#ehx-update', { timeout: 9000 });
  ok('update banner shows newer version', (await txt('#ehx-update')).includes('99.0.0'), await txt('#ehx-update'));
  await page.click('[data-update-close]');
  ok('update banner dismissed', await count('#ehx-update') === 0);

  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('ehx.update') || '{}');
    state.dismissedAt = Date.now() - 25 * 60 * 60 * 1000;
    localStorage.setItem('ehx.update', JSON.stringify(state));
  });
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#ehx-update', { timeout: 9000 });
  ok('update banner returns after a day', (await txt('#ehx-update')).includes('99.0.0'));
  await page.click('[data-update-close]');

  console.log('\nDetail');
  await page.click('.ehx-card');
  await page.waitForFunction(() => location.pathname.startsWith('/g/'), { timeout: 6000 });
  await page.waitForSelector('.ehx-dtitle', { timeout: 2000 });
  ok('detail hero paints before gallery HTML', await count('[data-act="fav"]') === 0);
  ok('preview offers Read immediately', await count('.ehx-actions [data-act="read"]') === 1);
  await page.waitForSelector('[data-act="fav"]', { timeout: 8000 });
  ok('detail hero title', (await txt('.ehx-dtitle')).includes('ADE'), await txt('.ehx-dtitle'));
  ok('18 thumbnails', await count('.ehx-thumb') === 18, String(await count('.ehx-thumb')));
  await page.waitForFunction(() => {
    const cells = Array.from(document.querySelectorAll('[data-sprite]'));
    return cells.length > 0 && cells.every((el) => /url\(/.test(el.style.backgroundImage || ''));
  }, { timeout: 4000 });
  ok('page previews hydrate without scrolling', await page.$$eval('.ehx-thumb', (els) => els.every((el) => {
    const inner = el.querySelector('[data-sprite]');
    return !inner || /url\(/.test(inner.style.backgroundImage || '');
  })));
  ok('tags rendered', await count('.ehx-tagpill') > 8);
  ok('read action present', await count('[data-act="read"]') >= 1);
  ok('gallery menu button', await count('[data-act="detail-menu"]') === 1);

  const cacheApi = await page.evaluate(() => typeof caches !== 'undefined');
  const gBefore = gRequests;
  await new Promise((r) => setTimeout(r, 600));
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.ehx-card', { timeout: 8000 });
  await page.click('.ehx-card');
  await page.waitForSelector('[data-act="fav"]', { timeout: 8000 });
  if (cacheApi) ok('detail reused persistent cache after reload', gRequests === gBefore, gBefore + ' -> ' + gRequests);

  console.log('\nReader');
  await page.click('[data-act="read"]');
  await page.waitForSelector('.ehx-reader .ehx-rpage img', { timeout: 10000 });
  ok('reader count 1 / 18', (await txt('.ehx-rcount')) === '1 / 18', await txt('.ehx-rcount'));
  ok('18 page slots', await count('.ehx-rpage') === 18, String(await count('.ehx-rpage')));
  ok('reader url is /s/', (await page.evaluate(() => location.pathname)).startsWith('/s/'));

  await page.evaluate(() => document.querySelector('.ehx-rchrome').classList.remove('ehx-hidden'));
  await page.click('[data-r="next"]');
  await page.waitForFunction(() => document.querySelector('.ehx-rcount')?.textContent.trim().startsWith('2 /'), { timeout: 8000 });
  ok('next page updates counter', (await txt('.ehx-rcount')) === '2 / 18', await txt('.ehx-rcount'));
  ok('reader used the showpage API', showpageRequests > 0, String(showpageRequests));

  console.log('   · reader jump');
  await page.evaluate(() => document.querySelector('.ehx-rchrome').classList.remove('ehx-hidden'));
  await page.click('[data-r="menu"]');
  await page.waitForSelector('.ehx-sheet', { timeout: 5000 });
  await new Promise((r) => setTimeout(r, 420));
  await page.click('[data-rm="jump"]');
  await page.waitForSelector('#ehx-reader-jump', { timeout: 5000 });
  await new Promise((r) => setTimeout(r, 420));
  await page.evaluate(() => { document.querySelector('#ehx-reader-jump').value = '7'; });
  await page.click('[data-x="go"]');
  await page.waitForFunction(() => document.querySelector('.ehx-rcount')?.textContent.trim().startsWith('7 /'), { timeout: 10000 });
  ok('reader jump resolves page 7', (await txt('.ehx-rcount')) === '7 / 18', await txt('.ehx-rcount'));
  await new Promise((r) => setTimeout(r, 450));

  console.log('   · reader image resolution');
  await page.evaluate(() => document.querySelector('.ehx-rchrome').classList.remove('ehx-hidden'));
  await page.click('[data-r="menu"]');
  await page.waitForSelector('[data-res="original"]', { timeout: 5000 });
  await new Promise((r) => setTimeout(r, 420));
  await page.click('[data-res="original"]');
  await page.waitForFunction(() => /\/fullimg\//.test((document.querySelector('.ehx-rpage[data-idx="7"] img') || {}).src || ''), { timeout: 10000 });
  ok('reader can switch to original resolution', true);
  ok('resolution setting saved', await page.evaluate(() => JSON.parse(localStorage.getItem('ehx.settings')).readerResolution) === 'original');

  await page.evaluate(() => document.querySelector('.ehx-rchrome').classList.remove('ehx-hidden'));
  await page.click('[data-r="menu"]');
  await page.waitForSelector('[data-res="auto"]', { timeout: 5000 });
  await new Promise((r) => setTimeout(r, 420));
  await page.click('[data-res="auto"]');
  await page.waitForFunction(() => /xres=/.test((document.querySelector('.ehx-rpage[data-idx="7"] img') || {}).src || ''), { timeout: 10000 });
  ok('reader can switch back to resampled', true);
  await new Promise((r) => setTimeout(r, 450));

  await page.evaluate(() => document.querySelector('.ehx-rchrome').classList.remove('ehx-hidden'));
  await page.click('[data-r="back"]');
  await page.waitForSelector('.ehx-dtitle', { timeout: 8000 });
  ok('back returns to detail', (await txt('.ehx-dtitle')).includes('ADE'));

  console.log('\nCategory navigation');
  await page.click('#ehx-topbar [data-act="back"]');
  await page.waitForSelector('.ehx-card', { timeout: 8000 });
  await page.click('.ehx-chips a[href="/doujinshi"]');
  await page.waitForFunction(() => location.pathname === '/doujinshi', { timeout: 8000 });
  await page.waitForSelector('.ehx-card', { timeout: 8000 });
  ok('category page renders', await count('.ehx-card') === 25, String(await count('.ehx-card')));
  ok('category chip active', await count('.ehx-chips a[href="/doujinshi"].ehx-active') === 1);

  console.log('\nSearch');
  await page.click('#ehx-topbar [data-act="search"]');
  await page.waitForSelector('#ehx-search-input', { timeout: 6000 });
  ok('search page rendered', await count('#ehx-search-input') === 1);
  await page.type('#ehx-search-input', 'blue archive');
  await page.click('#ehx-search-go');
  await page.waitForFunction(() => location.search.includes('f_search=blue'), { timeout: 8000 });
  await page.waitForSelector('.ehx-card', { timeout: 8000 });
  ok('search results rendered', await count('.ehx-card') === 25, String(await count('.ehx-card')));
  ok('search URL has f_search', (await page.evaluate(() => location.search)).includes('f_search=blue'));
  ok('search stays in the current tab', (await page.evaluate(() => location.pathname)) === '/doujinshi', await page.evaluate(() => location.pathname));

  console.log('\nSearch edit prefill');
  await page.click('[data-act="edit-search"]');
  await page.waitForSelector('#ehx-search-input', { timeout: 6000 });
  ok('edit pre-fills query', (await page.$eval('#ehx-search-input', (el) => el.value)) === 'blue archive');

  console.log('\nTag autocomplete');
  await page.type('#ehx-search-input', ' teacher');
  await page.waitForSelector('.ehx-suggest-item', { timeout: 5000 });
  ok('tag suggestions shown', await count('.ehx-suggest-item') >= 1, String(await count('.ehx-suggest-item')));
  await page.evaluate(() => document.querySelector('.ehx-suggest-item').click());
  const suggested = await page.$eval('#ehx-search-input', (el) => el.value);
  ok('suggestion inserted as namespace:quoted', /female:"teacher"/.test(suggested), suggested);

  console.log('\nCalendar jump');
  await page.evaluate(() => document.querySelector('[data-act="calendar"]').click());
  await page.waitForSelector('#ehx-calendar-date', { timeout: 4000 });
  ok('calendar min is the oldest date', await page.$eval('#ehx-calendar-date', (el) => el.min) === '2007-03-21');
  await page.$eval('#ehx-calendar-date', (el) => { el.value = '2026-10-01'; });
  await page.evaluate(() => document.querySelector('[data-x="go"]').click());
  await page.waitForFunction(() => location.search.includes('seek=2026-10-01'), { timeout: 6000 });
  ok('calendar jumps to the seek date', true);
  ok('calendar preserves the current tab', (await page.evaluate(() => location.pathname)) === '/doujinshi', await page.evaluate(() => location.pathname));

  console.log('\nSettings');
  await page.evaluate(() => document.querySelector('[data-act="drawer"]').click());
  await page.waitForSelector('.ehx-drawer.ehx-open', { timeout: 4000 });
  await new Promise((r) => setTimeout(r, 380));
  await clickSel('.ehx-drawer-item[href="/#ehx-settings"]');
  await page.waitForSelector('[data-set="theme"]', { timeout: 6000 });
  await new Promise((r) => setTimeout(r, 400));
  ok('settings page rendered', await count('[data-set="theme"]') === 3);
  ok('reader resolution setting present', await count('[data-set="readerResolution"]') === 2);
  await page.click('[data-set="scrollButton"][data-value="right"]');
  ok('FAB can move to the right', await page.$eval('#ehx-fab', (el) => el.classList.contains('ehx-fab-right')));
  await page.click('[data-set="scrollButton"][data-value="left"]');
  await page.click('[data-set="theme"][data-value="light"]');
  await page.waitForFunction(() => document.documentElement.dataset.ehxTheme === 'light', { timeout: 4000 });
  ok('light theme applied', (await page.evaluate(() => document.documentElement.dataset.ehxTheme)) === 'light');
  await page.click('[data-set="readerMode"][data-value="paged"]');
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('ehx.settings')).readerMode === 'paged', { timeout: 4000 });
  ok('paged reader setting saved', true);
  await page.click('[data-set="theme"][data-value="dark"]');

  console.log('\nHistory');
  await page.evaluate(() => document.querySelector('[data-act="drawer"]').click());
  await page.waitForSelector('.ehx-drawer.ehx-open', { timeout: 4000 });
  await new Promise((r) => setTimeout(r, 380));
  await clickSel('.ehx-drawer-item[href="/#ehx-history"]');
  await page.waitForSelector('.ehx-card', { timeout: 6000 });
  await new Promise((r) => setTimeout(r, 500));
  ok('history has an entry', await count('.ehx-card') >= 1, String(await count('.ehx-card')));
  ok('history card shows progress', (await txt('.ehx-card .ehx-badge.ehx-resume')).startsWith('P'));

  console.log('\nPaged reader from history');
  step('click history card');
  await page.evaluate(() => { const el = document.querySelector('.ehx-card'); if (el) el.click(); });
  await page.waitForSelector('.ehx-reader.ehx-paged', { timeout: 10000 });
  await page.waitForSelector('.ehx-reader .ehx-rpage img', { timeout: 10000 });
  ok('paged reader active', await count('.ehx-reader.ehx-paged') === 1);
  ok('3 paged slides', await count('.ehx-reader .ehx-rpage') === 3, String(await count('.ehx-reader .ehx-rpage')));
  await page.evaluate(() => document.querySelector('.ehx-rchrome').classList.remove('ehx-hidden'));
  await page.evaluate(() => document.querySelector('[data-r="back"]').click());
  await page.waitForSelector('.ehx-card', { timeout: 8000 });

  console.log('\nLogged-out favorites + login sheet');
  await page.evaluate(() => document.querySelector('[data-act="drawer"]').click());
  await page.waitForSelector('.ehx-drawer.ehx-open', { timeout: 4000 });
  await new Promise((r) => setTimeout(r, 380));
  await clickSel('.ehx-drawer-item[href="/favorites.php"]');
  await page.waitForSelector('.ehx-login', { timeout: 8000 });
  await new Promise((r) => setTimeout(r, 420));
  ok('login card shown', await count('.ehx-login') === 1);
  await page.click('.ehx-login [data-act="login"]');
  await page.waitForSelector('.ehx-sheet', { timeout: 4000 });
  ok('login sheet opened', await count('.ehx-sheet') === 1);
  ok('cookie login form present', await count('form[data-ehx-cookie]') === 1);
  ok('password login form present', await count('form[data-ehx-login]') === 1);
  await page.click('[data-act="close-sheet"]');

  console.log('\nToplists');
  await page.evaluate(() => document.querySelector('[data-act="drawer"]').click());
  await page.waitForSelector('.ehx-drawer.ehx-open', { timeout: 4000 });
  await new Promise((r) => setTimeout(r, 380));
  await clickSel('.ehx-drawer-item[href="/toplist.php"]');
  await page.waitForSelector('.ehx-ranklist', { timeout: 8000 });
  ok('toplist rendered', await count('.ehx-rankrow') > 5, String(await count('.ehx-rankrow')));
  ok('toplist chips', await count('.ehx-chips .ehx-chip') > 1);

  console.log('\nFavorites form (logged-in popup fixture)');
  await page.setCookie({ name: 'ipb_member_id', value: '12345', domain: '127.0.0.1', path: '/' });
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.ehx-card', { timeout: 8000 });
  await page.click('.ehx-card');
  await page.waitForSelector('.ehx-dtitle', { timeout: 8000 });
  await page.waitForSelector('[data-act="fav"]', { timeout: 8000 });
  await page.click('[data-act="fav"]');
  await page.waitForSelector('.ehx-sheet', { timeout: 8000 });
  await new Promise((r) => setTimeout(r, 420));
  ok('favorite folder form opened', await count('#ehx-favcat') === 1);
  await page.select('#ehx-favcat', '1');
  await page.type('#ehx-favnote', 'test note');
  await page.click('[data-x="save"]');
  await new Promise((r) => setTimeout(r, 700));
  const posted = await page.evaluate(() => fetch('/__lastpost').then((r) => r.json()));
  ok('favorite POST includes folder', /name="favcat"\r\n\r\n1/.test((posted && posted.body) || ''), JSON.stringify(posted));
  ok('favorite POST includes note', /name="favnote"\r\n\r\ntest note/.test((posted && posted.body) || ''), JSON.stringify(posted));
  ok('favorite POST preserves server token', /name="csrf"\r\n\r\ntest-token/.test((posted && posted.body) || ''), JSON.stringify(posted));
  ok('favorite sheet closed after save', await count('.ehx-sheet.ehx-open') === 0);

  console.log('\nFavorites warm cache');
  await page.evaluate(() => window.__EHENTAI_APP__.clearCaches());
  await new Promise((r) => setTimeout(r, 500));
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.ehx-card', { timeout: 8000 });
  await page.evaluate(() => fetch('/__resetfav'));
  await page.evaluate(() => window.__EHENTAI_APP__.preloadFavorites());
  await new Promise((r) => setTimeout(r, 2500));
  const before = await page.evaluate(() => fetch('/__stats').then((r) => r.json()));
  const t0 = Date.now();
  await page.click('.ehx-tab[href="/favorites.php"]');
  await page.waitForSelector('#ehx-gallery-grid .ehx-card', { timeout: 6000 });
  const elapsed = Date.now() - t0;
  const after = await page.evaluate(() => fetch('/__stats').then((r) => r.json()));
  ok('preload fetched favorites', before.favRequests === 1, JSON.stringify(before));
  ok('favorites tab used warm cache', after.favRequests === before.favRequests, JSON.stringify(after));
  ok('favorites rendered quickly', elapsed < 1200, elapsed + 'ms');
  ok('favorites has 25 cards', await count('.ehx-card') === 25, String(await count('.ehx-card')));
  await new Promise((r) => setTimeout(r, 4000));
  ok('favorites prefetched the next page', nextRequests > 0, String(nextRequests));

  await page.evaluate(() => fetch('/__resetfav'));
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.ehx-card', { timeout: 8000 });
  await new Promise((r) => setTimeout(r, 1200));
  const beforePersist = await page.evaluate(() => fetch('/__stats').then((r) => r.json()));
  await page.click('.ehx-tab[href="/favorites.php"]');
  await page.waitForSelector('#ehx-gallery-grid .ehx-card', { timeout: 6000 });
  const afterPersist = await page.evaluate(() => fetch('/__stats').then((r) => r.json()));
  ok('favorites reused persistent cache', afterPersist.favRequests === beforePersist.favRequests, JSON.stringify({ beforePersist, afterPersist }));

  console.log('\nExHentai wrapped page previews');
  await page.goto(BASE + '/g/1922802/711f9187e5/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.ehx-thumb', { timeout: 8000 });
  const exThumbs = await page.$$eval('.ehx-thumb', (els) => els.map((el) => {
    const sprite = el.querySelector('[data-sprite]');
    const img = el.querySelector('img');
    return { sprite: sprite ? sprite.getAttribute('data-sprite') || '' : '', img: img ? img.getAttribute('src') || '' : '' };
  }));
  ok('exhentai preview grid has 20 cells', exThumbs.length === 20, String(exThumbs.length));
  ok('every exhentai cell has art', exThumbs.every((t) => /hath\.network/.test(t.sprite) || /^https?:/.test(t.img)), JSON.stringify(exThumbs.slice(0, 2)));
  const tagStyle = await page.evaluate(() => {
    const normal = document.querySelector('.ehx-tagpill:not(.ehx-tag-watched)');
    const watched = document.querySelector('.ehx-tagpill.ehx-tag-watched');
    return {
      normal: document.querySelectorAll('.ehx-tagpill:not(.ehx-tag-watched)').length,
      watched: document.querySelectorAll('.ehx-tagpill.ehx-tag-watched').length,
      normalBg: normal ? getComputedStyle(normal).backgroundColor : '',
      watchedBg: watched ? getComputedStyle(watched).backgroundColor : '',
    };
  });
  ok('watched tags are highlighted', tagStyle.watched === 4, JSON.stringify(tagStyle));
  ok('normal tags use gray, watched use blue', tagStyle.normal > 20 && tagStyle.normalBg !== tagStyle.watchedBg, JSON.stringify(tagStyle));

  console.log('\nExHentai small thumbnail grid');
  await page.goto(BASE + '/g/3802196/f43d61f90b/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.ehx-thumb', { timeout: 8000 });
  ok('20 small previews per app page', await count('.ehx-thumb') === 20, String(await count('.ehx-thumb')));
  ok('small pager shows 5 pages', (await txt('.ehx-thumbctl .ehx-grow')).includes('/ 5'), await txt('.ehx-thumbctl .ehx-grow'));
  ok('small sprite base width is 100', await page.$eval('#ehx-thumbs', (el) => el.dataset.basew) === '100');
  ok('small first half starts at page 1', /-1$/.test(await page.$eval('.ehx-thumb', (a) => a.getAttribute('href'))));

  await page.evaluate(() => document.querySelector('[data-act="thumb-next"]').click());
  await page.waitForFunction(() => location.search.includes('ph=1'), { timeout: 5000 });
  await page.waitForFunction(() => document.querySelector('.ehx-thumbctl .ehx-grow')?.textContent.includes('2 / 5'), { timeout: 5000 });
  ok('second half keeps 20 cells', await count('.ehx-thumb') === 20, String(await count('.ehx-thumb')));
  ok('second half starts at page 21', /-21$/.test(await page.$eval('.ehx-thumb', (a) => a.getAttribute('href'))));

  await page.evaluate(() => document.querySelector('[data-act="thumb-next"]').click());
  await page.waitForFunction(() => location.search.includes('p=1'), { timeout: 5000 });
  await page.waitForFunction(() => document.querySelector('.ehx-thumbctl .ehx-grow')?.textContent.includes('3 / 5'), { timeout: 5000 });
  ok('next sheet starts at page 41', /-41$/.test(await page.$eval('.ehx-thumb', (a) => a.getAttribute('href'))), await page.$eval('.ehx-thumb', (a) => a.getAttribute('href')));

  console.log('\nMissing gallery message');
  await page.goto(BASE + '/g/999999999/abcdef1234/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.ehx-empty', { timeout: 8000 });
  ok('site error message shown', (await txt('.ehx-empty p')).includes('Gallery not found'), await txt('.ehx-empty p'));

  console.log('\nCopyright/unavailable gallery');
  await page.goto(BASE + '/g/2723308/bbe94c10b2/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.ehx-empty', { timeout: 8000 });
  const copyrightMsg = await txt('.ehx-empty p');
  ok('copyright message shown', copyrightMsg.includes('copyright claim by Irodori Comics'), copyrightMsg);
  ok('copyright message has no script text', !/popUp|window\.open|function/.test(copyrightMsg), copyrightMsg);
  await new Promise((r) => setTimeout(r, 3600));
  ok('copyright page does not auto-redirect', (await page.evaluate(() => location.pathname)) === '/g/2723308/bbe94c10b2/', await page.evaluate(() => location.href));

  console.log('\nCopyright/unavailable via in-app navigation');
  await page.evaluate(() => window.__EHENTAI_APP__.navigate('/g/2723308/bbe94c10b2/'));
  await page.waitForSelector('.ehx-error .ehx-empty p', { timeout: 8000 });
  const navMsg = await txt('.ehx-error .ehx-empty p');
  ok('HTTP error body shown', navMsg.includes('copyright claim'), navMsg);
  ok('HTTP error body has no script text', !/popUp|window\.open|function/.test(navMsg), navMsg);

  console.log('\nConsole/page errors');
  ok('no uncaught errors', errors.length === 0, errors.slice(0, 5).join(' | '));
} catch (e) {
  fail++;
  console.log('\n✗ TEST CRASH at step "' + stepName + '": ' + e.message);
  console.log(errors.slice(0, 10).join('\n'));
} finally {
  await browser.close();
  server.close();
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
