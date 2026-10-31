import { spawn } from 'node:child_process';
import fs from 'node:fs';

class Mcp {
  constructor() {
    this.p = spawn('/System/Cryptexes/App/usr/bin/safaridriver', ['--mcp'], { stdio: ['pipe', 'pipe', 'pipe'] });
    this.id = 0; this.pending = new Map(); this.buf = '';
    this.p.stdout.on('data', (d) => this.onData(d));
    this.p.stderr.on('data', (d) => process.stderr.write('[stderr] ' + d.toString().slice(0, 200)));
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
    const r = await this.req('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'fav-scroll', version: '1' } });
    this.notify('notifications/initialized', {}); return r;
  }
  async call(name, args = {}, timeout = 120000) {
    const r = await this.req('tools/call', { name, arguments: args }, timeout);
    return (r.content || []).map((c) => c.text || '').join('\n');
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mcp = new Mcp();
const evalJs = (expression, timeout = 60000) => mcp.call('evaluate_javascript', { expression }, timeout);
const show = (label, v, n = 6000) => console.log('\n=== ' + label + ' ===\n' + String(v).slice(0, n));

const COOKIES = {
  igneous: 'gcagl88mqh9v5q1wl',
  ipb_member_id: '516170',
  ipb_pass_hash: '0007348a8a8730f3e7ddff950abaa7e9',
};
const script = fs.readFileSync(new URL('../ehentai-app.user.js', import.meta.url), 'utf8');

try {
  await mcp.init();
  await mcp.call('create_tab', { url: 'https://exhentai.org/' });
  await mcp.call('wait_for_navigation', { timeout_seconds: 90 });
  await sleep(500);
  await evalJs(`
    return (function () {
      const c = ${JSON.stringify(COOKIES)};
      document.cookie = 'yay=; Max-Age=0; path=/; domain=.exhentai.org';
      for (const [k, v] of Object.entries(c)) {
        document.cookie = k + '=' + v + '; path=/; domain=.exhentai.org';
        document.cookie = k + '=' + v + '; path=/';
      }
      return 'ok';
    })();
  `);
  await mcp.call('navigate_to_url', { url: 'https://exhentai.org/favorites.php' }, 120000);
  await mcp.call('wait_for_navigation', { timeout_seconds: 120 }, 180000).catch(() => {});
  await sleep(400);
  show('INJECT', await evalJs(`
    return (function () {
      if (window.__EHENTAI_APP__) return 'already';
      const s = document.createElement('script');
      s.textContent = ${JSON.stringify(script)};
      document.documentElement.appendChild(s);
      return window.__EHENTAI_APP__ ? 'booted' : 'injected';
    })();
  `, 120000));
  await sleep(3000);
  show('FIRST PAGE', await evalJs(`
    return JSON.stringify({ cards: document.querySelectorAll('.ehx-card').length, url: location.href, height: document.body.scrollHeight });
  `));
  await evalJs(`return (function () { window.scrollTo(0, document.body.scrollHeight); return 'scrolled'; })();`);
  await sleep(4000);
  await evalJs(`return (function () { window.scrollTo(0, document.body.scrollHeight); return 'scrolled2'; })();`);
  await sleep(22000);
  show('AFTER SCROLL', await evalJs(`
    return JSON.stringify({ cards: document.querySelectorAll('.ehx-card').length, height: document.body.scrollHeight, url: location.href });
  `));
  show('RESOURCES', await evalJs(`
    return JSON.stringify(performance.getEntriesByType('resource')
      .filter((e) => /favorites\\.php|s\\.exhentai\\.org\\/w\\/|ehgt\\.org\\/w\\//.test(e.name))
      .map((e) => ({ name: e.name.replace(/^https?:\\/\\//, '').slice(0, 95), start: Math.round(e.startTime), ms: Math.round(e.duration), size: e.transferSize, type: e.initiatorType }))
      .sort((a, b) => a.start - b.start)
      .slice(-45));
  `), 8000);
} catch (e) {
  console.log('FAILED:', e.message);
} finally {
  mcp.p.kill();
}
