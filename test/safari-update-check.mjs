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
    const r = await this.req('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'update-check', version: '1' } });
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

const script = fs.readFileSync('/tmp/v117.user.js', 'utf8');

try {
  await mcp.init();
  await mcp.call('create_tab', { url: 'https://e-hentai.org/' });
  await mcp.call('wait_for_navigation', { timeout_seconds: 90 });
  await sleep(500);
  show('INJECT', await evalJs(`
    return (function () {
      if (window.__EHENTAI_APP__) return 'already';
      const s = document.createElement('script');
      s.textContent = ${JSON.stringify(script)};
      document.documentElement.appendChild(s);
      return window.__EHENTAI_APP__ ? 'booted' : 'injected';
    })();
  `, 120000));

  await sleep(7000);
  show('STATE', await evalJs(`
    return JSON.stringify({
      version: window.__EHENTAI_APP__ ? window.__EHENTAI_APP__.version : null,
      banner: (document.querySelector('#ehx-update') || {}).innerText || '',
      update: localStorage.getItem('ehx.update'),
      url: location.href,
    });
  `), 2000);
  show('CONSOLE', await mcp.call('browser_console_messages', { clear: false, limit: 80 }), 4000);
} catch (e) {
  console.log('FAILED:', e.message);
} finally {
  mcp.p.kill();
}
