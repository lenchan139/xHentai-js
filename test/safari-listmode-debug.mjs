import { spawn } from 'node:child_process';

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
    const r = await this.req('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'listmode-debug', version: '1' } });
    this.notify('notifications/initialized', {}); return r;
  }
  async call(name, args = {}, timeout = 120000) {
    const r = await this.req('tools/call', { name, arguments: args }, timeout);
    return (r.content || []).map((c) => c.text || '').join('\n');
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mcp = new Mcp();
const show = (label, v, n = 3000) => console.log('\n=== ' + label + ' ===\n' + String(v).slice(0, n));
const evalJs = (expression, timeout = 60000) => mcp.call('evaluate_javascript', { expression }, timeout);

async function poll(expr, doneExpr, timeoutMs = 180000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await sleep(1500);
    const v = await evalJs(expr, 30000);
    if (v && v !== 'null' && v !== 'undefined' && v !== '""') return v;
  }
  return null;
}

try {
  await mcp.init();
  await mcp.call('create_tab', { url: 'https://e-hentai.org/' });
  await mcp.call('wait_for_navigation', { timeout_seconds: 90 });
  await sleep(1000);

  // Probe each display mode via synchronous XHR so cookies and layout are visible.
  const probe = `
    return (function () {
    const get = (u) => { const x = new XMLHttpRequest(); x.open('GET', u, false); x.send(null); return { text: x.responseText, url: x.responseURL, cookie: document.cookie }; };
    const classes = (html) => {
      const d = new DOMParser().parseFromString(html, 'text/html');
      const out = {};
      for (const el of d.querySelectorAll('[class]')) {
        for (const c of el.classList) if (/^gl[0-9][a-z]$/.test(c)) out[c] = (out[c] || 0) + 1;
      }
      return {
        classes: out,
        covers: [...d.querySelectorAll('img')].map(i => i.getAttribute('src') || i.getAttribute('data-src') || '').filter(u => /ehgt\\.org\\/w\\//.test(u)).length,
        links: d.querySelectorAll('a[href*="/g/"]').length,
        title: d.title,
      };
    };
    const before = document.cookie;
    const e = get('https://e-hentai.org/?inline_set=dm_e');
    const l = get('https://e-hentai.org/?inline_set=dm_l');
    return JSON.stringify({ before, after: document.cookie, dm_e: classes(e.text), dm_l: classes(l.text), urls: [e.url, l.url] });
    })();
  `;
  show('FETCH MODES', await evalJs(probe, 120000), 6000);

  // Load 25 compact covers in parallel and record timings.
  const startTiming = `
    return (function () {
    window.__coverResult = null;
    const d = new DOMParser().parseFromString((function(){const x=new XMLHttpRequest();x.open('GET','https://e-hentai.org/?inline_set=dm_l',false);x.send(null);return x.responseText;})(), 'text/html');
    const urls = [...d.querySelectorAll('img')].map(i => i.getAttribute('src') || i.getAttribute('data-src') || '').filter(u => /ehgt\\.org\\/w\\//.test(u)).slice(0, 25);
    const t0 = performance.now();
    const rows = [];
    let left = urls.length;
    if (!left) { window.__coverResult = JSON.stringify({ count: 0 }); return 'started'; }
    urls.forEach((u) => {
      const img = new Image();
      const s = performance.now();
      const done = (ok) => {
        rows.push({ u: u.slice(-28), ms: Math.round(performance.now() - s), w: img.naturalWidth, h: img.naturalHeight, ok });
        if (--left === 0) window.__coverResult = JSON.stringify({ count: rows.length, totalMs: Math.round(performance.now() - t0), maxMs: Math.max(...rows.map(r => r.ms)), minMs: Math.min(...rows.map(r => r.ms)), rows });
      };
      img.onload = () => done(true);
      img.onerror = () => done(false);
      img.src = u;
    });
    return 'started';
    })();
  `;
  show('START COVER LOAD', await evalJs(startTiming), 1000);
  show('COVER PARALLEL LOAD', await poll('return window.__coverResult', null, 180000), 6000);
} catch (e) {
  console.log('FAILED:', e.message);
} finally {
  mcp.p.kill();
}
