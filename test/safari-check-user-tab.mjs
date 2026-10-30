import { spawn } from 'node:child_process';
import fs from 'node:fs';

class Mcp {
  constructor() {
    this.p = spawn('/System/Cryptexes/App/usr/bin/safaridriver', ['--mcp'], { stdio: ['pipe', 'pipe', 'pipe'] });
    this.id = 0; this.pending = new Map(); this.buf = '';
    this.p.stdout.on('data', (d) => this.onData(d));
    this.p.stderr.on('data', (d) => process.stderr.write('[stderr] ' + d.toString().slice(0, 300)));
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
  req(method, params, timeout = 120000) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); reject(new Error('timeout ' + method)); } }, timeout);
      this.p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  }
  notify(method, params) { this.p.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n'); }
  async init() {
    const r = await this.req('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'user-exhentai-check', version: '1' } });
    this.notify('notifications/initialized', {}); return r;
  }
  async call(name, args = {}, timeout = 120000) {
    const r = await this.req('tools/call', { name, arguments: args }, timeout);
    return (r.content || []).map((c) => c.text || '').join('\n');
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mcp = new Mcp();
const log = (label, v, n = 3000) => { console.log('\n=== ' + label + ' ==='); console.log(String(v).slice(0, n)); };

try {
  log('MCP', JSON.stringify((await mcp.init()).serverInfo));
  const tabsText = await mcp.call('list_tabs');
  log('TABS', tabsText, 3000);
  let handle = '';
  try {
    const tabs = JSON.parse(tabsText.match(/\[[\s\S]*\]/)[0]);
    const ex = tabs.find((t) => /exhentai\.org/i.test(t.url || ''));
    if (ex) handle = ex.handle;
    if (handle) await mcp.call('switch_tab', { handle });
  } catch { /* ignore */ }

  if (!handle) {
    log('No ExHentai tab found; opening one.');
    await mcp.call('create_tab', { url: 'https://exhentai.org/favorites.php' });
    await mcp.call('wait_for_navigation', { timeout_seconds: 90 });
    await sleep(2000);
  }

  log('PAGE INFO', await mcp.call('page_info'), 1000);
  log('COOKIE NAMES + PERF', await mcp.call('evaluate_javascript', {
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
  }, 60000), 7000);

  log('CONTENT', await mcp.call('get_page_content', {
    format: 'textTree', region: 'viewport', maxWordsPerParagraph: 8, nodeIds: 'interactive',
  }, 60000), 3500);
  log('CONSOLE', await mcp.call('browser_console_messages', { clear: false, limit: 100 }), 5000);
  log('SCREENSHOT', await mcp.call('screenshot', { savePath: '/tmp/user-exhentai-check.png' }, 30000), 300);
} catch (e) {
  console.log('CHECK FAILED:', e.message);
} finally {
  mcp.p.kill();
}
