import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const shots = path.join(root, 'shots');

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
  notify(method, params) {
    this.p.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
  }
  async init() {
    const r = await this.request('initialize', {
      protocolVersion: '2024-11-05', capabilities: {},
      clientInfo: { name: 'opencode-exhentai-debug', version: '1.0' },
    });
    this.notify('notifications/initialized', {});
    return r;
  }
  async call(name, args = {}, timeout = 120000) {
    const r = await this.request('tools/call', { name, arguments: args }, timeout);
    return (r.content || []).map((c) => c.text || '').join('\n');
  }
}

const mcp = new McpClient();
const log = (label, value, n = 1200) => {
  console.log('\n=== ' + label + ' ===');
  console.log(String(value).slice(0, n));
};
let tabHandle = '';

try {
  const init = await mcp.init();
  log('MCP', JSON.stringify(init.serverInfo));

  const created = await mcp.call('create_tab', { url: 'https://exhentai.org/favorites.php' }, 120000);
  log('create_tab', created, 2000);
  if (/error|must enable/i.test(created)) {
    console.log('\nBLOCKED: Safari still refuses WebDriver sessions.');
    mcp.p.kill();
    process.exit(0);
  }

  const nav = await mcp.call('wait_for_navigation', { timeout_seconds: 90 }, 120000);
  log('navigation', nav, 1200);
  log('page_info', await mcp.call('page_info'), 1200);

  const content = await mcp.call('get_page_content', {
    format: 'textTree', region: 'viewport', maxWordsPerParagraph: 8, nodeIds: 'interactive',
  }, 60000);
  log('page_content', content, 2500);

  log('network favorites', await mcp.call('list_network_requests', { filter: { url_substring: 'favorites.php' } }), 4000);
  log('network html', await mcp.call('list_network_requests', { filter: { url_substring: 'exhentai.org' } }), 4000);
  log('network covers', await mcp.call('list_network_requests', { filter: { url_substring: 'ehgt.org' } }), 5000);
  log('network hath', await mcp.call('list_network_requests', { filter: { url_substring: 'hath.network' } }), 3000);
  log('console', await mcp.call('browser_console_messages', { clear: false, limit: 80 }), 3000);

  const shotPath = path.join(shots, 'exhentai-debug.png');
  log('screenshot', await mcp.call('screenshot', { savePath: shotPath }), 500);

  const tabs = await mcp.call('list_tabs');
  log('tabs', tabs, 2000);
  // Close only the test tab (the one pointing at exhentai).
  const jsonText = tabs.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (jsonText) {
    try {
      const parsed = JSON.parse(jsonText[0]);
      const list = Array.isArray(parsed) ? parsed : (parsed.tabs || parsed.value || []);
      const target = (Array.isArray(list) ? list : []).find((t) => /exhentai\.org/i.test(JSON.stringify(t)));
      if (target) {
        tabHandle = target.handle || target.uuid || target.id || '';
        log('test tab handle', tabHandle, 200);
        if (tabHandle) await mcp.call('close_tab', { handle: tabHandle });
      }
    } catch { /* ignore parse */ }
  }
} catch (e) {
  console.log('\nDEBUG FAILED:', e.message);
} finally {
  mcp.p.kill();
}
