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
    const r = await this.req('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'cover-debug', version: '1' } });
    this.notify('notifications/initialized', {}); return r;
  }
  async call(name, args = {}, timeout = 120000) {
    const r = await this.req('tools/call', { name, arguments: args }, timeout);
    return (r.content || []).map((c) => c.text || '').join('\n');
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mcp = new Mcp();
const log = (label, v, n = 5000) => { console.log('\n=== ' + label + ' ==='); console.log(String(v).slice(0, n)); };

try {
  log('MCP', JSON.stringify((await mcp.init()).serverInfo));
  await mcp.call('create_tab', { url: 'https://e-hentai.org/?inline_set=dm_e' });
  await mcp.call('wait_for_navigation', { timeout_seconds: 90 });
  await sleep(4000);

  const perf = await mcp.call('evaluate_javascript', {
    expression: `
      const nav = performance.getEntriesByType('navigation')[0];
      const res = performance.getEntriesByType('resource')
        .filter(e => /ehgt\\.org|hath\\.network|\\.webp|\\.jpe?g|\\.png/i.test(e.name))
        .map(e => ({ name: e.name.slice(0, 170), ms: Math.round(e.duration), start: Math.round(e.startTime), size: e.transferSize, type: e.initiatorType }));
      return JSON.stringify({
        nav: nav ? { ms: Math.round(nav.duration), dcl: Math.round(nav.domContentLoadedEventEnd), load: Math.round(nav.loadEventEnd), transfer: nav.transferSize, redirects: nav.redirectCount } : null,
        resources: res,
        coverHostCount: res.filter(e => /ehgt\\.org/i.test(e.name)).length,
        hathCount: res.filter(e => /hath\\.network/i.test(e.name)).length
      });
    `,
  }, 60000);
  log('PERFORMANCE', perf, 8000);

  log('CONSOLE', await mcp.call('browser_console_messages', { clear: false, limit: 100 }), 6000);
  log('PAGE', await mcp.call('page_info'), 1000);

  const tabs = await mcp.call('list_tabs');
  try {
    const arr = JSON.parse(tabs.match(/\[[\s\S]*\]/)[0]);
    for (const t of arr) if (/e-hentai\.org/i.test(t.url || '') && t.handle) await mcp.call('close_tab', { handle: t.handle }).catch(() => {});
  } catch { /* ignore */ }
} catch (e) {
  console.log('COVER DEBUG FAILED:', e.message);
} finally {
  mcp.p.kill();
}
