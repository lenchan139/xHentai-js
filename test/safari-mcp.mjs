import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const fixtures = path.join(root, 'test/fixtures');
const shots = path.join(root, 'shots');
const PORT = 43132;
const BASE = `http://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const appScript = fs.readFileSync(path.join(root, 'ehentai-app.user.js'), 'utf8');

const FILE_MAP = {
  '/': 'index.html', '/popular': 'popular.html', '/favorites.php': 'favorites.html',
  '/watched': 'watched.html', '/toplist.php': 'toplist.html',
  '/doujinshi': 'index.html', '/manga': 'index.html', '/artistcg': 'index.html',
  '/gamecg': 'index.html', '/western': 'index.html', '/non-h': 'index.html',
  '/imageset': 'index.html', '/cosplay': 'index.html', '/asianporn': 'index.html', '/misc': 'index.html',
  '/g/4291744/019be8a2c7/': 'detail.html',
};
function fileFor(url) {
  const u = new URL(url, BASE), p = decodeURIComponent(u.pathname);
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
<rect width="800" height="1122" fill="url(#g)"/><circle cx="560" cy="390" r="170" fill="rgba(255,255,255,.12)"/>
<g fill="rgba(255,255,255,.05)">${Array.from({length:10},(_,i)=>`<rect x="40" y="${70+i*70}" width="720" height="34"/>`).join('')}</g>
<rect x="0" y="992" width="800" height="130" fill="rgba(15,13,19,.6)"/>
<text x="44" y="1072" fill="#d0bcff" font-family="-apple-system,sans-serif" font-size="50" font-weight="800">E-HENTAI APP</text></svg>`;

const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, BASE), p = decodeURIComponent(u.pathname);
    if (p === '/favicon.ico') { res.writeHead(204); res.end(); return; }
    if (p === '/__img.svg') { res.writeHead(200, {'Content-Type':'image/svg+xml'}); res.end(SVG); return; }
    if (p === '/ehentai-app.user.js') { res.writeHead(200, {'Content-Type':'application/javascript'}); res.end(appScript); return; }
    const file = fileFor(req.url);
    if (!file) { res.writeHead(404); res.end('not found'); return; }
    let html = await fsp.readFile(path.join(fixtures, file), 'utf8');
    html = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
    html = html.replace(/<link\b[^>]*rel=["']stylesheet["'][^>]*>/gi, '');
    html = html.replace(/<ins\b[\s\S]*?<\/ins>/gi, '');
    html = html.replace(/<iframe\b[\s\S]*?<\/iframe>/gi, '');
    html = html.replace(/https?:\/\/[^\s"'<>()]+/g, (url) => {
      if (/\.(?:webp|png|jpe?g|gif|avif)(?:\?|$)/i.test(url) || /ehgt\.org|hath\.network/i.test(url)) return '/__img.svg';
      return url.replace(/^https?:\/\/(www\.)?(e-hentai|exhentai)\.org/i, BASE);
    });
    html = html.replace(/<\/body>/i, '<script src="/ehentai-app.user.js"></script></body>');
    res.writeHead(200, {'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
    res.end(html);
  } catch (e) { res.writeHead(500); res.end(String(e)); }
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

class McpClient {
  constructor() {
    this.p = spawn('/System/Cryptexes/App/usr/bin/safaridriver', ['--mcp'], { stdio: ['pipe', 'pipe', 'pipe'] });
    this.id = 0;
    this.pending = new Map();
    this.buffer = '';
    this.p.stdout.on('data', (d) => this.onData(d));
    this.p.stderr.on('data', (d) => process.stderr.write('[safari-mcp] ' + d.toString()));
  }
  onData(d) {
    this.buffer += d.toString();
    let i;
    while ((i = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, i).trim();
      this.buffer = this.buffer.slice(i + 1);
      if (!line) continue;
      let msg;
      try { msg = JSON.parse(line); } catch { continue; }
      if (msg.id != null && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
        else resolve(msg.result);
      }
    }
  }
  request(method, params) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (this.pending.has(id)) { this.pending.delete(id); reject(new Error('MCP timeout: ' + method)); }
      }, 60000);
      this.p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  }
  notify(method, params) {
    this.p.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
  }
  async init() {
    const r = await this.request('initialize', {
      protocolVersion: '2024-11-05', capabilities: {},
      clientInfo: { name: 'opencode-safari-test', version: '1.0' },
    });
    this.notify('notifications/initialized', {});
    return r;
  }
  async call(name, args = {}) {
    const r = await this.request('tools/call', { name, arguments: args });
    const text = (r.content || []).map((c) => c.text || '').join('\n');
    return text;
  }
}
const mcp = new McpClient();
let tabHandle = '';
try {
  const init = await mcp.init();
  console.log('MCP server:', JSON.stringify(init.serverInfo));

  const created = await mcp.call('create_tab', { url: BASE + '/' });
  console.log('create_tab:', created.slice(0, 400));
  const tabsBefore = await mcp.call('list_tabs');
  console.log('tabs:', tabsBefore.slice(0, 700));
  const handles = [...tabsBefore.matchAll(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi)].map((m) => m[0]);
  if (handles.length) {
    await mcp.call('switch_tab', { handle: handles[0] }).catch((e) => console.log('switch_tab err:', e.message));
  }
  console.log('page_info:', (await mcp.call('page_info')).slice(0, 300));
  await mcp.call('wait_for_navigation', { timeout_seconds: 20 });
  await mcp.call('set_viewport_size', { width: 390, height: 844 });

  for (let i = 0; i < 80; i++) {
    const ok = await mcp.call('evaluate_javascript', { expression: `return !!document.querySelector('.ehx-card')` });
    if (/true/i.test(ok)) break;
    await sleep(150);
  }
  console.log('home cards:', (await mcp.call('evaluate_javascript', { expression: `return document.querySelectorAll('.ehx-card').length` })).slice(0, 80));
  await mcp.call('screenshot', { savePath: path.join(shots, 'safari-mcp-home.png') });

  await mcp.call('evaluate_javascript', { expression: `document.querySelector('.ehx-card').click(); return true` });
  for (let i = 0; i < 100; i++) {
    const ok = await mcp.call('evaluate_javascript', { expression: `return !!document.querySelector('.ehx-dtitle')` });
    if (/true/i.test(ok)) break;
    await sleep(150);
  }
  console.log('detail:', (await mcp.call('evaluate_javascript', { expression: `return document.querySelector('.ehx-dtitle')?.textContent.trim().slice(0,60)` })).slice(0, 100));
  await mcp.call('screenshot', { savePath: path.join(shots, 'safari-mcp-detail.png') });

  await mcp.call('evaluate_javascript', { expression: `document.querySelector('[data-act="read"]')?.click(); return true` });
  for (let i = 0; i < 120; i++) {
    const ok = await mcp.call('evaluate_javascript', { expression: `return !!document.querySelector('.ehx-rpage img')` });
    if (/true/i.test(ok)) break;
    await sleep(150);
  }
  await sleep(700);
  console.log('reader:', (await mcp.call('evaluate_javascript', { expression: `return document.querySelector('.ehx-rcount')?.textContent.trim()` })).slice(0, 80));
  await mcp.call('evaluate_javascript', { expression: `document.querySelector('.ehx-rchrome')?.classList.remove('ehx-hidden'); return true` });
  await mcp.call('screenshot', { savePath: path.join(shots, 'safari-mcp-reader.png') });

  const tabs = await mcp.call('list_tabs');
  const m = tabs.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  tabHandle = m ? m[0] : '';
  if (tabHandle) await mcp.call('close_tab', { handle: tabHandle });
  console.log('closed test tab:', tabHandle || '(none)');
} catch (e) {
  console.error('SAFARI MCP TEST FAILED:', e.message);
} finally {
  mcp.p.kill();
  server.close();
}
