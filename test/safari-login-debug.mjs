import { spawn } from 'node:child_process';
import fs from 'node:fs';

const LOG = '/tmp/safari-login-debug.log';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => {
  const line = new Date().toISOString() + ' ' + a.map((x) => typeof x === 'string' ? x : JSON.stringify(x)).join(' ');
  console.log(line);
  try { fs.appendFileSync(LOG, line + '\n'); } catch { /* noop */ }
};

class McpClient {
  constructor() {
    this.p = spawn('/System/Cryptexes/App/usr/bin/safaridriver', ['--mcp'], { stdio: ['pipe', 'pipe', 'pipe'] });
    this.id = 0;
    this.pending = new Map();
    this.buffer = '';
    this.p.stdout.on('data', (d) => this.onData(d));
    this.p.stderr.on('data', (d) => log('[stderr]', d.toString().slice(0, 300)));
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
  request(method, params, timeout = 180000) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (this.pending.has(id)) { this.pending.delete(id); reject(new Error('MCP timeout: ' + method)); }
      }, timeout);
      this.p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  }
  notify(method, params) { this.p.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n'); }
  async init() {
    const r = await this.request('initialize', {
      protocolVersion: '2024-11-05', capabilities: {},
      clientInfo: { name: 'opencode-exhentai-login', version: '1.0' },
    });
    this.notify('notifications/initialized', {});
    return r;
  }
  async call(name, args = {}, timeout = 180000) {
    const r = await this.request('tools/call', { name, arguments: args }, timeout);
    return (r.content || []).map((c) => c.text || '').join('\n');
  }
}

const mcp = new McpClient();
const text = (label, value, n = 1200) => log(label, String(value).slice(0, n));
const clearJs = (domains) => `
  const names = [...new Set(document.cookie.split(';').map(s => s.trim().split('=')[0]).filter(Boolean))];
  for (const n of names) {
    for (const d of ${JSON.stringify(domains)}) {
      document.cookie = n + '=; Max-Age=0; path=/' + (d ? '; domain=' + d : '');
    }
  }
  return JSON.stringify({ names, url: location.href });
`;

try {
  log('MCP init:', JSON.stringify((await mcp.init()).serverInfo));

  // 1. Clear e-hentai cookies.
  await mcp.call('create_tab', { url: 'https://e-hentai.org/' }, 120000);
  await mcp.call('wait_for_navigation', { timeout_seconds: 60 }, 120000);
  text('e-hentai cookies cleared:', await mcp.call('evaluate_javascript', {
    expression: clearJs(['.e-hentai.org', 'e-hentai.org', '']),
  }, 30000));

  // 2. Clear exhentai cookies (if the tab lands on exhentai; otherwise this clears
  //    whatever origin the redirect landed on).
  await mcp.call('create_tab', { url: 'https://exhentai.org/' }, 120000);
  await mcp.call('wait_for_navigation', { timeout_seconds: 60 }, 120000);
  text('exhentai cookies cleared:', await mcp.call('evaluate_javascript', {
    expression: clearJs(['.exhentai.org', 'exhentai.org', '']),
  }, 30000));
  text('exhentai page:', await mcp.call('page_info'), 600);

  // 3. Open the forced login page.
  await mcp.call('create_tab', { url: 'https://e-hentai.org/home.php' }, 120000);
  await mcp.call('wait_for_navigation', { timeout_seconds: 90 }, 120000);
  await sleep(1500);
  const info = await mcp.call('page_info');
  text('LOGIN PAGE:', info, 800);
  text('LOGIN PAGE CONTENT:', await mcp.call('get_page_content', {
    format: 'textTree', region: 'viewport', maxWordsPerParagraph: 10, nodeIds: 'interactive',
  }, 60000), 1400);
  const shot = await mcp.call('screenshot', { savePath: '/tmp/ehentai-login.png' }, 30000).catch((e) => 'ERR ' + e.message);
  text('login screenshot:', shot, 300);
  log('WAITING_FOR_LOGIN: enter your credentials in the Safari tab.');

  // 4. Wait for the user to log in (up to 20 minutes).
  let loggedIn = false;
  const start = Date.now();
  while (Date.now() - start < 20 * 60 * 1000) {
    await sleep(3000);
    try {
      const pi = JSON.parse(await mcp.call('page_info'));
      const url = pi.url || '';
      if (/bounce_login|act=Login|index\.php\?act=Login/i.test(url)) continue;
      if (/e-hentai\.org/i.test(url) && !/bounce_login/i.test(url)) {
        const c = await mcp.call('get_page_content', {
          format: 'plainText', region: 'viewport', maxWordsPerParagraph: 8,
        }, 30000);
        if (!/requires you to log on|This page requires/i.test(c)) {
          log('LOGGED_IN at', url);
          text('home content:', c, 600);
          loggedIn = true;
          break;
        }
      }
    } catch { /* page transitioning */ }
  }

  if (!loggedIn) {
    log('LOGIN_TIMEOUT');
    mcp.p.kill();
    process.exit(0);
  }

  // 5. Open ExHentai favorites and collect timings.
  await sleep(1500);
  await mcp.call('create_tab', { url: 'https://exhentai.org/favorites.php' }, 120000);
  await mcp.call('wait_for_navigation', { timeout_seconds: 120 }, 180000);
  await sleep(2500);
  text('favorites page:', await mcp.call('page_info'), 800);
  text('favorites content:', await mcp.call('get_page_content', {
    format: 'textTree', region: 'viewport', maxWordsPerParagraph: 8, nodeIds: 'interactive',
  }, 60000), 2500);

  const favNet = await mcp.call('list_network_requests', { filter: { url_substring: 'favorites.php' } });
  text('favorites network:', favNet, 4000);
  const allNet = await mcp.call('list_network_requests', {});
  text('all network:', allNet, 6000);
  const covers = await mcp.call('list_network_requests', { filter: { url_substring: 'ehgt.org' } });
  text('cover network:', covers, 5000);
  const consoleLogs = await mcp.call('browser_console_messages', { clear: false, limit: 80 });
  text('console:', consoleLogs, 3000);
  const favShot = await mcp.call('screenshot', { savePath: '/tmp/exhentai-favorites.png' }, 30000).catch((e) => 'ERR ' + e.message);
  text('favorites screenshot:', favShot, 300);

  try {
    fs.writeFileSync('/tmp/exhentai-debug.json', JSON.stringify({
      favNet, allNet, covers, consoleLogs,
    }, null, 2));
    log('REPORT_WRITTEN /tmp/exhentai-debug.json');
  } catch (e) { log('REPORT_ERROR', e.message); }

  log('DEBUG_DONE');
} catch (e) {
  log('LOGIN_DEBUG_FAILED:', e.message);
} finally {
  mcp.p.kill();
}
