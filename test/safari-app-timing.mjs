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
    const r = await this.req('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'app-timing', version: '1' } });
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
const show = (label, v, n = 4000) => console.log('\n=== ' + label + ' ===\n' + String(v).slice(0, n));

const script = fs.readFileSync(new URL('../ehentai-app.user.js', import.meta.url), 'utf8');
const inject = `
  return (function () {
    if (window.__EHENTAI_APP__) return 'already';
    const s = document.createElement('script');
    s.textContent = ${JSON.stringify(script)};
    document.documentElement.appendChild(s);
    return window.__EHENTAI_APP__ ? 'booted' : 'injected';
  })();
`;

const perf = `
  return (function () {
    const nav = performance.getEntriesByType('navigation')[0];
    const rows = performance.getEntriesByType('resource')
      .filter(e => /\\/g\\/|\\/s\\/|hath\\.network|ehgt\\.org|s\\.exhentai\\.org/.test(e.name))
      .map(e => ({ name: e.name.replace(/^https?:\\/\\//, '').slice(0, 110), ms: Math.round(e.duration), start: Math.round(e.startTime), size: e.transferSize, type: e.initiatorType }))
      .sort((a, b) => a.start - b.start);
    return JSON.stringify({
      url: location.href,
      nav: nav ? { ms: Math.round(nav.duration), dcl: Math.round(nav.domContentLoadedEventEnd), load: Math.round(nav.loadEventEnd) } : null,
      rows,
      detailHero: !!document.querySelector('.ehx-dcover img'),
      thumbCount: document.querySelectorAll('.ehx-thumb').length,
    });
  })();
`;

try {
  await mcp.init();
  await mcp.call('create_tab', { url: 'https://e-hentai.org/g/4292252/a86125d472/' });
  await mcp.call('wait_for_navigation', { timeout_seconds: 90 });
  await sleep(500);
  show('INJECT', await evalJs(inject, 120000));
  await sleep(1200);
  show('PAGE', await mcp.call('page_info'));
  show('DETAIL BEFORE', await evalJs(perf, 60000), 6000);

  // Tap Read through the app's own navigation to the first thumbnail page.
  show('THUMBS', await evalJs(`
    return JSON.stringify({
      count: document.querySelectorAll('.ehx-thumb').length,
      hrefs: [...document.querySelectorAll('.ehx-thumb')].map((a) => a.getAttribute('href')).slice(0, 4),
    });
  `), 1500);
  show('CLICK READ', await evalJs(`
    return (function () {
      const b = document.querySelector('[data-act="read"]');
      if (!b) return 'no read button';
      b.click();
      return 'clicked';
    })();
  `), 1000);
  await sleep(6000);
  show('ROUTE NOW', await evalJs(`
    return JSON.stringify({ url: location.href, route: window.__EHENTAI_APP__.app.route, reader: !!document.querySelector('.ehx-reader'), main: (document.querySelector('.ehx-main')||{}).className });
  `), 2000);
  show('CONSOLE', await mcp.call('browser_console_messages', { clear: false, limit: 100 }), 4000);
  show('PAGE AFTER READ', await mcp.call('page_info'));
  show('READER PERF', await evalJs(perf, 60000), 6000);
  show('READER CONTENT', await mcp.call('get_page_content', {
    format: 'textTree', region: 'viewport', maxWordsPerParagraph: 8, nodeIds: 'interactive',
  }, 60000), 2000);
  await mcp.call('screenshot', { savePath: '/tmp/app-detail-reader.png' }, 30000).catch(() => {});
} catch (e) {
  console.log('FAILED:', e.message);
} finally {
  mcp.p.kill();
}
