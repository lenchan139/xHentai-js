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
    const r = await this.req('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'ex-thumbs', version: '1' } });
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
const show = (label, v, n = 3000) => console.log('\n=== ' + label + ' ===\n' + String(v).slice(0, n));

const COOKIES = {
  igneous: 'gcagl88mqh9v5q1wl',
  ipb_member_id: '516170',
  ipb_pass_hash: '0007348a8a8730f3e7ddff950abaa7e9',
};
const script = fs.readFileSync(new URL('../ehentai-app.user.js', import.meta.url), 'utf8');

const state = `
  return JSON.stringify({
    url: location.href,
    thumbs: document.querySelectorAll('.ehx-thumb').length,
    sprites: document.querySelectorAll('[data-sprite]').length,
    painted: [...document.querySelectorAll('[data-sprite]')].filter((el) => /url\\(/.test(el.style.backgroundImage || '')).length,
    pager: (document.querySelector('.ehx-thumbctl .ehx-grow') || {}).textContent || '',
    firstHref: (document.querySelector('.ehx-thumb') || {}).getAttribute ? document.querySelector('.ehx-thumb').getAttribute('href') : '',
    firstSprite: (document.querySelector('[data-sprite]') || {}).getAttribute ? document.querySelector('[data-sprite]').getAttribute('data-sprite') : '',
    dtitle: (document.querySelector('.ehx-dtitle') || {}).textContent || '',
  });
`;

const spritePerf = `
  return JSON.stringify(performance.getEntriesByType('resource')
    .filter((e) => /3802196-\\d+\\.webp/.test(e.name))
    .map((e) => ({ name: e.name.split('/').pop(), start: Math.round(e.startTime), ms: Math.round(e.duration), size: e.transferSize })));
`;

try {
  await mcp.init();
  await mcp.call('create_tab', { url: 'https://exhentai.org/' });
  await mcp.call('wait_for_navigation', { timeout_seconds: 90 });
  await sleep(500);
  show('COOKIES', await evalJs(`
    return (function () {
      const c = ${JSON.stringify(COOKIES)};
      document.cookie = 'yay=; Max-Age=0; path=/; domain=.exhentai.org';
      for (const [k, v] of Object.entries(c)) {
        document.cookie = k + '=' + v + '; path=/; domain=.exhentai.org';
        document.cookie = k + '=' + v + '; path=/';
      }
      return 'ok';
    })();
  `));

  await mcp.call('navigate_to_url', { url: 'https://exhentai.org/g/3802196/f43d61f90b/' }, 120000);
  await mcp.call('wait_for_navigation', { timeout_seconds: 120 }, 180000).catch(() => {});
  await sleep(400);

  // Inject the app on the native p=1 page.
  show('INJECT', await evalJs(`
    return (function () {
      if (window.__EHENTAI_APP__) return 'already';
      const s = document.createElement('script');
      s.textContent = ${JSON.stringify(script)};
      document.documentElement.appendChild(s);
      return 'injected';
    })();
  `, 120000));
  await sleep(2500);
  show('P1 STATE', await evalJs(state));

  // Navigate within the app to p=2 via the page control.
  show('CLICK NEXT THUMB PAGE', await evalJs(`
    return (function () {
      const b = document.querySelector('[data-act="thumb-next"]');
      if (!b) return 'no button';
      b.click();
      return 'clicked';
    })();
  `));
  await sleep(9000);
  show('P2 BEFORE SCROLL', await evalJs(state));
  show('CONSOLE', await mcp.call('browser_console_messages', { clear: false, limit: 60 }), 2500);
  show('ALL HATH', await evalJs(`
    return JSON.stringify(performance.getEntriesByType('resource')
      .filter((e) => /hath\.network/.test(e.name))
      .map((e) => ({ name: e.name.split('/').pop(), start: Math.round(e.startTime), ms: Math.round(e.duration), size: e.transferSize })));
  `), 2000);
  show('SPRITE PERF BEFORE SCROLL', await evalJs(spritePerf));

  // Scroll the grid into view as a user would.
  await evalJs(`
    return (function () {
      const el = document.querySelector('#ehx-thumbs');
      if (el) el.scrollIntoView({ block: 'center' });
      return !!el;
    })();
  `);
  await sleep(1500);
  show('P2 AFTER SCROLL 1.5s', await evalJs(state));
  await sleep(3000);
  show('P2 AFTER SCROLL 4.5s', await evalJs(state));
  show('SPRITE PERF AFTER SCROLL', await evalJs(spritePerf));
} catch (e) {
  console.log('FAILED:', e.message);
} finally {
  mcp.p.kill();
}
