import { spawn } from 'node:child_process';
import fs from 'node:fs';

const LOG = '/tmp/safari-favorites-debug.log';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => {
  const line = new Date().toISOString() + ' ' + a.map((x) => typeof x === 'string' ? x : JSON.stringify(x)).join(' ');
  console.log(line);
  try { fs.appendFileSync(LOG, line + '\n'); } catch { /* noop */ }
};

class Mcp {
  constructor() {
    this.p = spawn('/System/Cryptexes/App/usr/bin/safaridriver', ['--mcp'], { stdio: ['pipe', 'pipe', 'pipe'] });
    this.id = 0; this.pending = new Map(); this.buf = '';
    this.p.stdout.on('data', (d) => this.onData(d));
    this.p.stderr.on('data', (d) => log('[stderr]', d.toString().slice(0, 300)));
  }
  onData(d) {
    this.buf += d.toString(); let i;
    while ((i = this.buf.indexOf('\n')) >= 0) {
      const line = this.buf.slice(0, i).trim(); this.buf = this.buf.slice(i + 1);
      if (!line) continue;
      let m; try { m = JSON.parse(line); } catch { continue; }
      if (m.id != null && this.pending.has(m.id)) {
        const p = this.pending.get(m.id); this.pending.delete(m.id);
        m.error ? p.reject(new Error(m.error.message || JSON.stringify(m.error))) : p.resolve(m.result);
      }
    }
  }
  req(method, params, timeout = 180000) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); reject(new Error('timeout ' + method)); } }, timeout);
      this.p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  }
  notify(method, params) { this.p.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n'); }
  async init() {
    const r = await this.req('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'safari-favorites-debug', version: '1' } });
    this.notify('notifications/initialized', {}); return r;
  }
  async call(name, args = {}, timeout = 180000) {
    const r = await this.req('tools/call', { name, arguments: args }, timeout);
    return (r.content || []).map((c) => c.text || '').join('\n');
  }
}

const mcp = new Mcp();
const show = (label, v, n = 1800) => log(label, String(v).slice(0, n));

try {
  log('MCP init', JSON.stringify((await mcp.init()).serverInfo));

  // 1. Open the forced E-Hentai login.
  await mcp.call('create_tab', { url: 'https://e-hentai.org/home.php' });
  await mcp.call('wait_for_navigation', { timeout_seconds: 90 });
  await sleep(1500);
  const info = await mcp.call('page_info');
  show('LOGIN PAGE', info, 800);
  show('LOGIN CONTENT', await mcp.call('get_page_content', {
    format: 'textTree', region: 'viewport', maxWordsPerParagraph: 8, nodeIds: 'interactive',
  }, 60000), 1200);
  await mcp.call('screenshot', { savePath: '/tmp/ehentai-login-2.png' }, 30000).catch(() => {});
  log('WAITING_FOR_LOGIN: enter E-Hentai credentials in the Safari tab.');

  // 2. Wait for login.
  let loggedIn = false;
  const start = Date.now();
  while (Date.now() - start < 20 * 60 * 1000) {
    await sleep(3000);
    try {
      const pi = JSON.parse(await mcp.call('page_info'));
      const url = pi.url || '';
      if (/bounce_login|act=Login|index\.php\?act=Login/i.test(url)) continue;
      if (/e-hentai\.org/i.test(url)) {
        const c = await mcp.call('get_page_content', { format: 'plainText', region: 'viewport', maxWordsPerParagraph: 8 }, 30000);
        if (!/requires you to log on|This page requires/i.test(c)) {
          log('LOGGED_IN', url);
          loggedIn = true;
          break;
        }
      }
    } catch { /* transition */ }
  }
  if (!loggedIn) { log('LOGIN_TIMEOUT'); mcp.p.kill(); process.exit(0); }

  // 3. Open ExHentai and remove yay immediately before favorites.
  await mcp.call('create_tab', { url: 'https://exhentai.org/' });
  await mcp.call('wait_for_navigation', { timeout_seconds: 90 });
  await sleep(1000);

  const removeYay = `
    const before = document.cookie;
    for (const domain of ['', '.exhentai.org', 'exhentai.org']) {
      document.cookie = 'yay=; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/' + (domain ? '; domain=' + domain : '');
    }
    return JSON.stringify({ before, after: document.cookie, url: location.href });
  `;
  show('YAY REMOVE', await mcp.call('evaluate_javascript', { expression: removeYay }, 30000));
  await sleep(500);
  show('YAY CHECK', await mcp.call('evaluate_javascript', {
    expression: `return JSON.stringify({ cookie: document.cookie, url: location.href })`,
  }, 30000));

  // 4. Navigate to favorites with yay gone.
  await mcp.call('navigate_to_url', { url: 'https://exhentai.org/favorites.php' }, 120000);
  await mcp.call('wait_for_navigation', { timeout_seconds: 120 }, 180000).catch(() => {});
  await sleep(3000);

  show('FAVORITES PAGE', await mcp.call('page_info'), 800);
  show('FAVORITES CONTENT', await mcp.call('get_page_content', {
    format: 'textTree', region: 'viewport', maxWordsPerParagraph: 8, nodeIds: 'interactive',
  }, 60000), 2500);

  const perf = await mcp.call('evaluate_javascript', {
    expression: `
      const nav = performance.getEntriesByType('navigation')[0];
      const res = performance.getEntriesByType('resource')
        .filter(e => /favorites|ehgt\\.org|hath\\.network|exhentai\\.org/i.test(e.name))
        .map(e => ({ name: e.name.slice(0, 180), ms: Math.round(e.duration), start: Math.round(e.startTime), size: e.transferSize, type: e.initiatorType }));
      return JSON.stringify({
        url: location.href,
        title: document.title,
        cookies: [...new Set(document.cookie.split(';').map(s => s.trim().split('=')[0]).filter(Boolean))],
        nav: nav ? { ms: Math.round(nav.duration), dcl: Math.round(nav.domContentLoadedEventEnd), load: Math.round(nav.loadEventEnd), transfer: nav.transferSize, redirects: nav.redirectCount } : null,
        resources: res,
        appCards: document.querySelectorAll('.ehx-card').length,
        tableRows: document.querySelectorAll('table.itg tr').length,
        loginText: /requires you to log on|bounce_login|sign in|log in/i.test(document.body.innerText.slice(0, 1200))
      });
    `,
  }, 60000);
  show('PERFORMANCE', perf, 9000);
  const consoleLogs = await mcp.call('browser_console_messages', { clear: false, limit: 100 });
  show('CONSOLE', consoleLogs, 4000);
  await mcp.call('screenshot', { savePath: '/tmp/exhentai-favorites-debug.png' }, 30000).catch(() => {});
  try {
    fs.writeFileSync('/tmp/exhentai-favorites-debug.json', JSON.stringify({ perf, consoleLogs }, null, 2));
    log('REPORT /tmp/exhentai-favorites-debug.json');
  } catch (e) { log('REPORT ERROR', e.message); }
  log('DEBUG_DONE');
} catch (e) {
  log('DEBUG FAILED:', e.message);
} finally {
  mcp.p.kill();
}
