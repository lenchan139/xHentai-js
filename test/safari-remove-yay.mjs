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
    const r = await this.req('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'remove-yay', version: '1' } });
    this.notify('notifications/initialized', {}); return r;
  }
  async call(name, args = {}, timeout = 120000) {
    const r = await this.req('tools/call', { name, arguments: args }, timeout);
    return (r.content || []).map((c) => c.text || '').join('\n');
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mcp = new Mcp();
const log = (label, v, n = 2000) => { console.log('\n=== ' + label + ' ==='); console.log(String(v).slice(0, n)); };

try {
  log('MCP', JSON.stringify((await mcp.init()).serverInfo));
  await mcp.call('create_tab', { url: 'https://exhentai.org/' });
  await mcp.call('wait_for_navigation', { timeout_seconds: 90 });
  await sleep(1000);

  const clear = `
    const before = document.cookie;
    for (const name of ['yay']) {
      for (const domain of ['', '.exhentai.org', 'exhentai.org']) {
        document.cookie = name + '=; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/' + (domain ? '; domain=' + domain : '');
      }
    }
    return JSON.stringify({ before, after: document.cookie, url: location.href });
  `;
  log('REMOVE', await mcp.call('evaluate_javascript', { expression: clear }, 30000));
  await sleep(1200);
  log('AFTER 1.2s', await mcp.call('evaluate_javascript', {
    expression: `return JSON.stringify({ cookie: document.cookie, url: location.href, title: document.title })`,
  }, 30000));
  log('PAGE INFO', await mcp.call('page_info'));
  log('CONTENT', await mcp.call('get_page_content', {
    format: 'textTree', region: 'viewport', maxWordsPerParagraph: 8, nodeIds: 'interactive',
  }, 30000), 1200);
  log('CONSOLE', await mcp.call('browser_console_messages', { clear: false, limit: 40 }), 1500);
  log('SCREENSHOT', await mcp.call('screenshot', { savePath: '/tmp/exhentai-yay-removed.png' }, 30000), 300);
} catch (e) {
  console.log('REMOVE FAILED:', e.message);
} finally {
  mcp.p.kill();
}
