import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import puppeteer from 'puppeteer-core';

const root = path.resolve(import.meta.dirname, '..');
const raw = path.join(root, 'test/fixtures');
const shots = path.join(root, 'shots');
await fsp.mkdir(shots, { recursive: true });
const PORT = 43125;
const BASE = `http://127.0.0.1:${PORT}`;

const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, BASE);
    const p = decodeURIComponent(u.pathname);
    let file = null;
    if (p === '/' && u.searchParams.get('f_search')) file = 'search.html';
    else if (p === '/') file = 'index.html';
    else if (p === '/popular') file = 'popular.html';
    else if (p === '/favorites.php') file = 'favorites.html';
    else if (p === '/toplist.php') file = 'toplist.html';
    else if (p.startsWith('/tag/')) file = 'tag:language:chinese.html';
    else if (p.startsWith('/s/')) file = 'reader.html';
    else if (p.startsWith('/g/')) file = 'detail.html';
    else if (p === '/doujinshi') file = 'index.html';
    if (!file) { res.writeHead(404); res.end('no'); return; }
    let html = await fsp.readFile(path.join(raw, file), 'utf8');
    html = html.replace(/https?:\/\/(www\.)?(e-hentai|exhentai)\.org/g, BASE);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  } catch (e) { res.writeHead(500); res.end(String(e)); }
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--no-sandbox'],
});

// Build placeholder artwork so screenshots look like a real gallery.
const artPage = await browser.newPage();
const art = await artPage.evaluate(() => {
  const mk = (w, h, label, a, b) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, a); g.addColorStop(1, b);
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.fillStyle = 'rgba(255,255,255,.055)';
    for (let i = 0; i < 9; i++) x.fillRect(40, 60 + i * (h / 10), w - 80, h / 22);
    x.fillStyle = 'rgba(255,255,255,.16)';
    x.beginPath(); x.arc(w * 0.7, h * 0.35, w * 0.22, 0, Math.PI * 2); x.fill();
    x.fillStyle = 'rgba(15,13,19,.55)';
    x.fillRect(0, h - 130, w, 130);
    x.fillStyle = '#e9e1f6';
    x.font = `700 ${Math.round(w / 12)}px -apple-system, sans-serif`;
    x.fillText(label, 40, h - 48);
    return c.toDataURL('image/png');
  };
  return {
    cover: mk(600, 800, 'E-HENTAI', '#3b2b58', '#141018'),
    page: mk(800, 1122, 'PAGE', '#1d1728', '#0b0910'),
    sprite: mk(4000, 300, '', '#2a2038', '#141018'),
  };
});
await artPage.close();
const buffers = Object.fromEntries(Object.entries(art).map(([k, v]) => [k, Buffer.from(v.split(',')[1], 'base64')]));

const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
await page.setRequestInterception(true);
page.on('request', (req) => {
  const url = req.url();
  if (url.startsWith(BASE)) return req.continue();
  if (req.resourceType() === 'image' || /\.(webp|png|jpe?g|gif)/i.test(url)) {
    const body = /-0\.webp/.test(url) || /-1\.webp/.test(url) ? buffers.sprite : buffers.page;
    return req.respond({ status: 200, contentType: 'image/png', body });
  }
  return req.abort();
});

const userscript = fs.readFileSync(path.join(root, 'ehentai-app.user.js'), 'utf8');
await page.evaluateOnNewDocument(userscript);
await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.ehx-card');
await new Promise((r) => setTimeout(r, 800));
await page.screenshot({ path: path.join(shots, '01-home.png') });

await page.click('.ehx-card');
await page.waitForSelector('.ehx-dtitle', { timeout: 8000 });
await new Promise((r) => setTimeout(r, 800));
await page.screenshot({ path: path.join(shots, '02-detail.png') });

await page.click('[data-act="read"]');
await page.waitForSelector('.ehx-reader .ehx-rpage img', { timeout: 10000 });
await page.evaluate(() => document.querySelector('.ehx-rchrome')?.classList.remove('ehx-hidden'));
await new Promise((r) => setTimeout(r, 700));
await page.screenshot({ path: path.join(shots, '03-reader.png') });

// Reader menu -> paged mode, for a second reader screenshot.
await page.evaluate(() => document.querySelector('.ehx-rchrome')?.classList.remove('ehx-hidden'));
await page.click('[data-r="menu"]');
await page.waitForSelector('.ehx-sheet');
await new Promise((r) => setTimeout(r, 420));
await page.click('[data-mode="paged"]');
await new Promise((r) => setTimeout(r, 700));
await page.evaluate(() => document.querySelector('.ehx-rchrome')?.classList.remove('ehx-hidden'));
await page.screenshot({ path: path.join(shots, '03b-reader-paged.png') });

await page.evaluate(() => document.querySelector('.ehx-rchrome')?.classList.remove('ehx-hidden'));
await page.click('[data-r="back"]');
await page.waitForSelector('.ehx-dtitle', { timeout: 8000 });

await page.click('#ehx-topbar [data-act="back"]');
await page.waitForSelector('.ehx-card', { timeout: 8000 });
await page.click('.ehx-tab[href="/#ehx-search"]');
await page.waitForSelector('#ehx-search-input', { timeout: 6000 });
await new Promise((r) => setTimeout(r, 500));
await page.screenshot({ path: path.join(shots, '04-search.png') });

await page.evaluate(() => document.querySelector('[data-act="drawer"]').click());
await page.waitForSelector('.ehx-drawer.ehx-open');
await new Promise((r) => setTimeout(r, 400));
await page.click('.ehx-drawer-item[href="/#ehx-settings"]');
await page.waitForSelector('[data-set="theme"]', { timeout: 6000 });
await new Promise((r) => setTimeout(r, 500));
await page.screenshot({ path: path.join(shots, '05-settings.png') });

await page.evaluate(() => document.querySelector('[data-act="drawer"]').click());
await page.waitForSelector('.ehx-drawer.ehx-open');
await new Promise((r) => setTimeout(r, 550));
await page.screenshot({ path: path.join(shots, '06-drawer.png') });
await page.click('.ehx-drawer-item[href="/#ehx-history"]');
await page.waitForSelector('.ehx-card', { timeout: 8000 });
await new Promise((r) => setTimeout(r, 500));
await page.screenshot({ path: path.join(shots, '07-history.png') });

await page.evaluate(() => document.querySelector('[data-act="drawer"]').click());
await page.waitForSelector('.ehx-drawer.ehx-open');
await new Promise((r) => setTimeout(r, 400));
await page.click('.ehx-drawer-item[href="/favorites.php"]');
await page.waitForSelector('.ehx-login', { timeout: 8000 });
await new Promise((r) => setTimeout(r, 450));
await page.screenshot({ path: path.join(shots, '08-login.png') });
await page.click('.ehx-login [data-act="login"]');
await page.waitForSelector('.ehx-sheet');
await new Promise((r) => setTimeout(r, 450));
await page.screenshot({ path: path.join(shots, '09-login-sheet.png') });

await browser.close();
server.close();
console.log('screenshots written to', shots);
