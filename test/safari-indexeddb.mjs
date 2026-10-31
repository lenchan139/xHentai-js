import { spawn } from 'node:child_process';

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
    const r = await this.req('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'idb-check', version: '1' } });
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
const show = (label, v, n = 2500) => console.log('\n=== ' + label + ' ===\n' + String(v).slice(0, n));

try {
  await mcp.init();
  await mcp.call('create_tab', { url: 'https://e-hentai.org/' });
  await mcp.call('wait_for_navigation', { timeout_seconds: 90 });
  await sleep(500);
  show('SUPPORT', await evalJs(`
    return JSON.stringify({
      indexedDB: typeof indexedDB,
      open: typeof indexedDB !== 'undefined' ? typeof indexedDB.open : 'n/a',
      storage: !!navigator.storage,
      estimate: typeof (navigator.storage && navigator.storage.estimate),
      persist: typeof (navigator.storage && navigator.storage.persist),
      persisted: typeof (navigator.storage && navigator.storage.persisted),
    });
  `));
  show('START', await evalJs(`
    return (function () {
      window.__idb = 'pending';
      window.__idbEstimate = null;
      try {
        const req = indexedDB.open('__ehx_test', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('kv');
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction('kv', 'readwrite');
          tx.objectStore('kv').put({ ok: true, at: Date.now() }, 'k');
          tx.oncomplete = () => {
            const r = db.transaction('kv').objectStore('kv').get('k');
            r.onsuccess = () => { window.__idb = r.result && r.result.ok ? 'read-ok' : 'read-empty'; };
            r.onerror = () => { window.__idb = 'read-error'; };
          };
          tx.onerror = () => { window.__idb = 'write-error'; };
        };
        req.onerror = () => { window.__idb = 'open-error:' + (req.error && req.error.name); };
      } catch (e) {
        window.__idb = 'throw:' + e.name;
      }
      if (navigator.storage && navigator.storage.estimate) {
        navigator.storage.estimate().then((e) => { window.__idbEstimate = e; }).catch((e) => { window.__idbEstimate = 'error:' + e.name; });
      }
      return 'started';
    })();
  `));
  await sleep(2500);
  show('RESULT', await evalJs(`
    return JSON.stringify({ idb: window.__idb, estimate: window.__idbEstimate });
  `), 2000);
} catch (e) {
  console.log('FAILED:', e.message);
} finally {
  mcp.p.kill();
}
