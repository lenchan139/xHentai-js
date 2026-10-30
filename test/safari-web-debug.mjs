import { spawn } from 'node:child_process';

class McpClient {
  constructor() {
    this.p = spawn('/System/Cryptexes/App/usr/bin/safaridriver', ['--mcp'], { stdio: ['pipe', 'pipe', 'pipe'] });
    this.id = 0;
    this.pending = new Map();
    this.buffer = '';
    this.p.stdout.on('data', (d) => this.onData(d));
    this.p.stderr.on('data', (d) => process.stderr.write('[safari-mcp] ' + d.toString()));
  }
  onData(d) {
    this.buffer += d.toString();
    let i;
    while ((i = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, i).trim();
      this.buffer = this.buffer.slice(i + 1);
      if (!line) continue;
      let msg;
      try { msg = JSON.parse(line); } catch { continue; }
      if (msg.id != null && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
        else resolve(msg.result);
      }
    }
  }
  request(method, params, timeout = 120000) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (this.pending.has(id)) { this.pending.delete(id); reject(new Error('MCP timeout: ' + method)); }
      }, timeout);
      this.p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  }
  notify(method, params) { this.p.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n'); }
  async init() {
    const r = await this.request('initialize', {
      protocolVersion: '2024-11-05', capabilities: {},
      clientInfo: { name: 'opencode-safari-web-debug', version: '1.0' },
    });
    this.notify('notifications/initialized', {});
    return r;
  }
  async call(name, args = {}, timeout = 120000) {
    const r = await this.request('tools/call', { name, arguments: args }, timeout);
    return (r.content || []).map((c) => c.text || '').join('\n');
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mcp = new McpClient();
const show = (label, v, n = 1800) => {
  console.log('\n=== ' + label + ' ===');
  console.log(String(v).slice(0, n));
};

async function inspect(url, label) {
  show(label + ': create_tab', await mcp.call('create_tab', { url }, 120000));
  await mcp.call('wait_for_navigation', { timeout_seconds: 90 }, 120000);
  await sleep(2500);
  show(label + ': page_info', await mcp.call('page_info'));
  show(label + ': content', await mcp.call('get_page_content', {
    format: 'textTree', region: 'viewport', maxWordsPerParagraph: 12, nodeIds: 'interactive',
  }, 60000), 2200);
  show(label + ': network', await mcp.call('list_network_requests', {}), 5000);
  show(label + ': console', await mcp.call('browser_console_messages', { clear: false, limit: 60 }), 2500);
  const shot = await mcp.call('screenshot', { savePath: '/tmp/' + label + '.png' }, 30000).catch((e) => 'ERR ' + e.message);
  show(label + ': screenshot', shot, 300);
}

try {
  show('MCP', JSON.stringify((await mcp.init()).serverInfo));
  await inspect('https://e-hentai.org/', 'ehentai');
  await inspect('https://exhentai.org/', 'exhentai');
  await inspect('https://exhentai.org/favorites.php', 'exhentai-favorites');

  const tabs = await mcp.call('list_tabs');
  show('tabs', tabs, 3000);
  try {
    const arr = JSON.parse(tabs.match(/\[[\s\S]*\]/)[0]);
    for (const t of arr) {
      if (/exhentai\.org|e-hentai\.org/i.test(t.url || '') && t.handle) {
        await mcp.call('close_tab', { handle: t.handle }).catch(() => {});
      }
    }
  } catch { /* ignore */ }
} catch (e) {
  console.log('\nWEB DEBUG FAILED:', e.message);
} finally {
  mcp.p.kill();
}
