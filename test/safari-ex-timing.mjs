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
    const r = await this.req('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'ex-timing', version: '1' } });
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

const timingExpr = `
  return (function () {
    const nav = performance.getEntriesByType('navigation')[0];
    if (!nav) return JSON.stringify({ error: 'no navigation entry' });
    const r = (n) => Math.round(n || 0);
    return JSON.stringify({
      url: location.href,
      requestStart: r(nav.requestStart),
      responseStart: r(nav.responseStart),
      responseEnd: r(nav.responseEnd),
      domContentLoaded: r(nav.domContentLoadedEventEnd),
      load: r(nav.loadEventEnd),
      ttfb: r(nav.responseStart - nav.requestStart),
      htmlDownload: r(nav.responseEnd - nav.responseStart),
      transfer: nav.transferSize,
      encoded: nav.encodedBodySize,
      decoded: nav.decodedBodySize,
      redirects: nav.redirectCount,
      redirectTime: r(nav.redirectEnd - nav.redirectStart),
    });
  })();
`;

try {
  await mcp.init();
  await mcp.call('create_tab', { url: 'https://exhentai.org/' });
  await mcp.call('wait_for_navigation', { timeout_seconds: 90 });
  await sleep(500);

  show('SET COOKIES', await evalJs(`
    return (function () {
      const cookies = ${JSON.stringify(COOKIES)};
      document.cookie = 'yay=; Max-Age=0; path=/; domain=.exhentai.org';
      for (const [k, v] of Object.entries(cookies)) {
        document.cookie = k + '=' + v + '; path=/; domain=.exhentai.org';
        document.cookie = k + '=' + v + '; path=/';
      }
      return 'ok';
    })();
  `));

  for (const url of [
    'https://exhentai.org/',
    'https://exhentai.org/favorites.php',
    'https://exhentai.org/g/1922802/711f9187e5/',
    'https://exhentai.org/',
  ]) {
    await mcp.call('navigate_to_url', { url }, 120000);
    await mcp.call('wait_for_navigation', { timeout_seconds: 120 }, 180000).catch(() => {});
    await sleep(300);
    show(url, await evalJs(timingExpr), 1200);
  }

  show('RESOURCES (last page)', await evalJs(`
    return JSON.stringify(performance.getEntriesByType('resource')
      .filter((e) => /exhentai\\.org|x\\.css|ehgt\\.org|hath\\.network/.test(e.name))
      .map((e) => ({ name: e.name.replace(/^https?:\\/\\//, '').slice(0, 90), ms: Math.round(e.duration), start: Math.round(e.startTime), size: e.transferSize, type: e.initiatorType }))
      .slice(0, 20));
  `), 4000);
} catch (e) {
  console.log('FAILED:', e.message);
} finally {
  mcp.p.kill();
}
