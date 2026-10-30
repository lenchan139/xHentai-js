import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const fixtures = path.join(root, 'test/fixtures');
const shots = path.join(root, 'shots');
const PORT = 43131;
const BASE = `http://127.0.0.1:${PORT}`;
const DRIVER_PORT = 4445;
const DRIVER = 'http://127.0.0.1:' + DRIVER_PORT;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
};

function fileFor(url) {
  const u = new URL(url, BASE);
  const p = decodeURIComponent(u.pathname);
  if (p.startsWith('/s/')) return 'reader.html';
  if (p.startsWith('/tag/')) return 'tag:language:chinese.html';
  if (p.startsWith('/uploader/')) return 'index.html';
  if (p === '/' && u.searchParams.get('f_search')) return 'search.html';
  if (FILE_MAP[p]) return FILE_MAP[p];
  if (p.startsWith('/g/')) return 'detail.html';
  return null;
}

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1122" viewBox="0 0 800 1122">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3b2b58"/><stop offset="1" stop-color="#0f0d13"/></linearGradient></defs>
<rect width="800" height="1122" fill="url(#g)"/>
<circle cx="560" cy="390" r="170" fill="rgba(255,255,255,.12)"/>
<g fill="rgba(255,255,255,.05)"><rect x="40" y="70" width="720" height="34"/><rect x="40" y="140" width="720" height="34"/><rect x="40" y="210" width="720" height="34"/><rect x="40" y="280" width="720" height="34"/><rect x="40" y="350" width="720" height="34"/><rect x="40" y="420" width="720" height="34"/><rect x="40" y="490" width="720" height="34"/><rect x="40" y="560" width="720" height="34"/><rect x="40" y="630" width="720" height="34"/><rect x="40" y="700" width="720" height="34"/></g>
<rect x="0" y="992" width="800" height="130" fill="rgba(15,13,19,.6)"/>
<text x="44" y="1072" fill="#d0bcff" font-family="-apple-system,BlinkMacSystemFont,sans-serif" font-size="50" font-weight="800">E-HENTAI APP</text>
</svg>`;

let appScript = '';
const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, BASE);
    const p = decodeURIComponent(u.pathname);
    if (p === '/favicon.ico') { res.writeHead(204); res.end(); return; }
    if (p === '/__img.svg') {
      res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=3600' });
      res.end(SVG);
      return;
    }
    if (p === '/ehentai-app.user.js') {
      res.writeHead(200, { 'Content-Type': 'application/javascript' });
      res.end(appScript);
      return;
    }
    const file = fileFor(req.url);
    if (!file) { res.writeHead(404); res.end('not found'); return; }
    let html = await fsp.readFile(path.join(fixtures, file), 'utf8');
    // Strip the site's own scripts/styles/ads; we only need the content for the app.
    html = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
    html = html.replace(/<link\b[^>]*rel=["']stylesheet["'][^>]*>/gi, '');
    html = html.replace(/<ins\b[\s\S]*?<\/ins>/gi, '');
    html = html.replace(/<iframe\b[\s\S]*?<\/iframe>/gi, '');
    // Local links, local placeholder images.
    html = html.replace(/https?:\/\/[^\s"'<>()]+/g, (url) => {
      if (/\.(?:webp|png|jpe?g|gif|avif)(?:\?|$)/i.test(url) || /ehgt\.org|hath\.network/i.test(url)) return '/__img.svg';
      return url.replace(/^https?:\/\/(www\.)?(e-hentai|exhentai)\.org/i, BASE);
    });
    // Run the userscript like a manager at document-end.
    html = html.replace(/<\/body>/i, '<script src="/ehentai-app.user.js"></script></body>');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(html);
  } catch (e) {
    res.writeHead(500); res.end(String(e));
  }
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
appScript = fs.readFileSync(path.join(root, 'ehentai-app.user.js'), 'utf8');

const driver = spawn('/System/Cryptexes/App/usr/bin/safaridriver', ['-p', String(DRIVER_PORT)], { stdio: 'ignore' });
let sid = null;

async function wd(method, p, body) {
  const res = await fetch(DRIVER + p, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || (json.value && json.value.error)) {
    throw new Error((json.value && json.value.message) || `WebDriver ${res.status}`);
  }
  return json.value;
}
async function waitFor(sel, timeout = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const ok = await wd('POST', `/session/${sid}/execute/sync`, {
      script: `return !!document.querySelector(${JSON.stringify(sel)})`,
      args: [],
    });
    if (ok) return true;
    await sleep(180);
  }
  throw new Error('Timeout waiting for ' + sel);
}
async function click(sel) {
  const el = await wd('POST', `/session/${sid}/element`, { using: 'css selector', value: sel });
  const key = el['element-6066-11e4-a52e-4f735466cecf'];
  if (!key) throw new Error('No element for ' + sel);
  await wd('POST', `/session/${sid}/element/${key}/click`, {});
}
async function shot(name) {
  const b64 = await wd('GET', `/session/${sid}/screenshot`);
  fs.writeFileSync(path.join(shots, name), Buffer.from(b64, 'base64'));
  console.log('screenshot:', name);
}
async function text(sel) {
  return wd('POST', `/session/${sid}/execute/sync`, {
    script: `const e=document.querySelector(${JSON.stringify(sel)}); return e ? e.textContent.trim() : ''`,
    args: [],
  });
}
async function count(sel) {
  return wd('POST', `/session/${sid}/execute/sync`, {
    script: `return document.querySelectorAll(${JSON.stringify(sel)}).length`,
    args: [],
  });
}

try {
  let ready = false;
  for (let i = 0; i < 60 && !ready; i++) {
    try {
      const st = await fetch(DRIVER + '/status').then((r) => r.json());
      ready = !!(st.value && st.value.ready);
    } catch { /* starting */ }
    if (!ready) await sleep(100);
  }
  if (!ready) throw new Error('safaridriver did not become ready');

  const session = await wd('POST', '/session', { capabilities: { alwaysMatch: { browserName: 'safari' } } });
  sid = session.sessionId;
  if (!sid) throw new Error('No Safari session id');

  await wd('POST', `/session/${sid}/window/rect`, { width: 430, height: 900 }).catch(() => {});
  await wd('POST', `/session/${sid}/url`, { url: BASE + '/' });
  await waitFor('.ehx-card');
  console.log('Safari home cards:', await count('.ehx-card'), '| brand:', await text('.ehx-brandname'));
  await sleep(900);
  await shot('safari-home.png');

  await click('.ehx-card');
  await waitFor('.ehx-dtitle');
  console.log('Safari detail:', (await text('.ehx-dtitle')).slice(0, 60), '| thumbs:', await count('.ehx-thumb'));
  await sleep(700);
  await shot('safari-detail.png');

  await click('[data-act="read"]');
  await waitFor('.ehx-rpage img');
  await sleep(900);
  console.log('Safari reader:', await text('.ehx-rcount'));
  await wd('POST', `/session/${sid}/execute/sync`, {
    script: `document.querySelector('.ehx-rchrome')?.classList.remove('ehx-hidden'); return true`,
    args: [],
  });
  await shot('safari-reader.png');

  await wd('POST', `/session/${sid}/url`, { url: BASE + '/#ehx-search' });
  await waitFor('#ehx-search-input');
  await sleep(600);
  console.log('Safari search page:', await count('#ehx-search-input'));
  await shot('safari-search.png');
} catch (e) {
  console.error('SAFARI TEST FAILED:', e.message);
  if (sid) {
    try { await shot('safari-failure.png'); } catch { /* noop */ }
  }
} finally {
  if (sid) { try { await wd('DELETE', `/session/${sid}`); } catch { /* noop */ } }
  driver.kill();
  server.close();
}
