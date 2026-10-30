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
    const r = await this.req('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'cover-timing', version: '1' } });
    this.notify('notifications/initialized', {}); return r;
  }
  async call(name, args = {}, timeout = 120000) {
    const r = await this.req('tools/call', { name, arguments: args }, timeout);
    return (r.content || []).map((c) => c.text || '').join('\n');
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mcp = new Mcp();
const show = (label, v, n = 5000) => console.log('\n=== ' + label + ' ===\n' + String(v).slice(0, n));
const evalJs = (expression, timeout = 60000) => mcp.call('evaluate_javascript', { expression }, timeout);
async function poll(expr, timeoutMs = 180000) {
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

  const start = `
    return (function () {
      window.__coverResult = null;
      const x = new XMLHttpRequest();
      x.open('GET', 'https://e-hentai.org/?inline_set=dm_l', false);
      x.send(null);
      const d = new DOMParser().parseFromString(x.responseText, 'text/html');
      const urls = [...d.querySelectorAll('img')]
        .map(i => i.getAttribute('data-src') || i.getAttribute('src') || '')
        .filter(u => /ehgt\\.org\\/w\\//.test(u))
        .slice(0, 25);
      const t0 = performance.now();
      const rows = [];
      let left = urls.length;
      if (!left) { window.__coverResult = JSON.stringify({ count: 0 }); return 'none'; }
      urls.forEach((u) => {
        const img = new Image();
        const s = performance.now();
        const done = (ok) => {
          rows.push({ u: u.slice(-26), ms: Math.round(performance.now() - s), w: img.naturalWidth, h: img.naturalHeight, ok });
          if (--left === 0) window.__coverResult = JSON.stringify({
            count: rows.length,
            totalMs: Math.round(performance.now() - t0),
            maxMs: Math.max(...rows.map(r => r.ms)),
            minMs: Math.min(...rows.map(r => r.ms)),
            rows: rows.sort((a, b) => a.ms - b.ms),
          });
        };
        img.onload = () => done(true);
        img.onerror = () => done(false);
        img.src = u;
      });
      return 'started:' + urls.length;
    })();
  `;
  show('START', await evalJs(start), 1000);
  show('RESULT', await poll('return window.__coverResult'), 8000);
} catch (e) {
  console.log('FAILED:', e.message);
} finally {
  mcp.p.kill();
}
