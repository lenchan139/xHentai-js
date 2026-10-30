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
  '/gallerypopups.php': 'favpopup_loggedin.html',
};

function fileFor(url) {
  const u = new URL(url, BASE);
  const p = decodeURIComponent(u.pathname);
  if (p.startsWith('/s/')) return 'reader.html';
  if (p.startsWith('/tag/')) return 'tag:language:chinese.html';
  if (p.startsWith('/uploader/')) return 'index.html';
  if (p === '/' && u.searchParams.get('f_search')) return 'search.html';
  if (FILE_MAP[p]) return FILE_MAP[p];
  if (p.startsWith('/g/4291744/')) return 'detail.html';
  if (p.startsWith('/g/4291745/')) return 'detail_p1.html';
  if (p.startsWith('/g/')) return 'detail.html';
  return null;
}

let lastPost = null;
let favRequests = 0;
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
    if (u.pathname === '/favorites.php') favRequests++;
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

try {
  await page.evaluateOnNewDocument(userscript);
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.ehx-card', { timeout: 8000 });

  console.log('\nHome / list');
  ok('app shell rendered', await count('#ehx-app') === 1);
  ok('25 gallery cards', await count('.ehx-card') === 25, String(await count('.ehx-card')));
  ok('bottom tab bar has 5 tabs', await count('.ehx-tab') === 5);
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

  console.log('\nDetail');
  await page.click('.ehx-card');
  await page.waitForFunction(() => location.pathname.startsWith('/g/'), { timeout: 6000 });
  await page.waitForSelector('.ehx-dtitle', { timeout: 2000 });
  ok('detail hero paints before gallery HTML', await count('[data-act="fav"]') === 0);
  ok('preview offers Read immediately', await count('.ehx-actions [data-act="read"]') === 1);
  await page.waitForSelector('[data-act="fav"]', { timeout: 8000 });
  ok('detail hero title', (await txt('.ehx-dtitle')).includes('ADE'), await txt('.ehx-dtitle'));
  ok('18 thumbnails', await count('.ehx-thumb') === 18, String(await count('.ehx-thumb')));
  ok('tags rendered', await count('.ehx-tagpill') > 8);
  ok('read action present', await count('[data-act="read"]') >= 1);
  ok('gallery menu button', await count('[data-act="detail-menu"]') === 1);

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
  await page.click('.ehx-tab[href="/#ehx-search"]');
  await page.waitForSelector('#ehx-search-input', { timeout: 6000 });
  ok('search page rendered', await count('#ehx-search-input') === 1);
  await page.type('#ehx-search-input', 'blue archive');
  await page.click('#ehx-search-go');
  await page.waitForFunction(() => location.search.includes('f_search=blue'), { timeout: 8000 });
  await page.waitForSelector('.ehx-card', { timeout: 8000 });
  ok('search results rendered', await count('.ehx-card') === 25, String(await count('.ehx-card')));
  ok('search URL has f_search', (await page.evaluate(() => location.search)).includes('f_search=blue'));

  console.log('\nSearch edit prefill');
  await page.click('[data-act="edit-search"]');
  await page.waitForSelector('#ehx-search-input', { timeout: 6000 });
  ok('edit pre-fills query', (await page.$eval('#ehx-search-input', (el) => el.value)) === 'blue archive');

  console.log('\nSettings');
  await page.evaluate(() => document.querySelector('[data-act="drawer"]').click());
  await page.waitForSelector('.ehx-drawer.ehx-open', { timeout: 4000 });
  await new Promise((r) => setTimeout(r, 380));
  await page.click('.ehx-drawer-item[href="/#ehx-settings"]');
  await page.waitForSelector('[data-set="theme"]', { timeout: 6000 });
  await new Promise((r) => setTimeout(r, 400));
  ok('settings page rendered', await count('[data-set="theme"]') === 3);
  ok('reader resolution setting present', await count('[data-set="readerResolution"]') === 2);
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
  await page.click('.ehx-drawer-item[href="/#ehx-history"]');
  await page.waitForSelector('.ehx-card', { timeout: 6000 });
  await new Promise((r) => setTimeout(r, 500));
  ok('history has an entry', await count('.ehx-card') >= 1, String(await count('.ehx-card')));
  ok('history card shows progress', (await txt('.ehx-card .ehx-badge.ehx-resume')).startsWith('P'));

  console.log('\nPaged reader from history');
  step('click history card');
  await page.$eval('.ehx-card', (el) => el.scrollIntoView({ block: 'center' }));
  await new Promise((r) => setTimeout(r, 150));
  await page.click('.ehx-card');
  await page.waitForSelector('.ehx-reader.ehx-paged', { timeout: 10000 });
  await page.waitForSelector('.ehx-reader .ehx-rpage img', { timeout: 10000 });
  ok('paged reader active', await count('.ehx-reader.ehx-paged') === 1);
  ok('3 paged slides', await count('.ehx-reader .ehx-rpage') === 3, String(await count('.ehx-reader .ehx-rpage')));
  await page.evaluate(() => document.querySelector('.ehx-rchrome').classList.remove('ehx-hidden'));
  await page.click('[data-r="back"]');
  await page.waitForSelector('.ehx-card', { timeout: 8000 });

  console.log('\nLogged-out favorites + login sheet');
  await page.evaluate(() => document.querySelector('[data-act="drawer"]').click());
  await page.waitForSelector('.ehx-drawer.ehx-open', { timeout: 4000 });
  await new Promise((r) => setTimeout(r, 380));
  await page.click('.ehx-drawer-item[href="/favorites.php"]');
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
  await page.click('.ehx-drawer-item[href="/toplist.php"]');
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
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.ehx-card', { timeout: 8000 });
  await page.evaluate(() => fetch('/__resetfav'));
  await new Promise((r) => setTimeout(r, 2400));
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
