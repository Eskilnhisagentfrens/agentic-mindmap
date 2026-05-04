// Integration smoke test for mcp/server.js over its real stdio transport.
// We spawn the server, drive the JSON-RPC handshake, list tools, and verify
// all 8 tools are registered with proper metadata.
//
// Reads: skipped if no snapshot file exists (the server would error). The test
// only validates the protocol surface, not data correctness — that's covered
// in tests against a fixture snapshot.

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const SERVER = path.resolve(__dirname, '..', '..', 'mcp', 'server.js');

function spawnServer(env = {}) {
  return spawn(process.execPath, [SERVER], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, ...env },
  });
}

function rpcDriver(child) {
  let buf = '';
  const pending = new Map();
  child.stdout.on('data', (chunk) => {
    buf += chunk.toString('utf8');
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.id != null && pending.has(msg.id)) {
          pending.get(msg.id)(msg);
          pending.delete(msg.id);
        }
      } catch (_) { /* swallow non-JSON lines */ }
    }
  });
  let nextId = 1;
  function call(method, params) {
    const id = nextId++;
    const req = { jsonrpc: '2.0', id, method, params };
    return new Promise((resolve, reject) => {
      pending.set(id, resolve);
      child.stdin.write(JSON.stringify(req) + '\n');
      setTimeout(() => {
        if (pending.has(id)) {
          pending.delete(id);
          reject(new Error(`RPC ${method} timed out`));
        }
      }, 5000);
    });
  }
  function notify(method, params) {
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
  }
  return { call, notify };
}

test('MCP server lists all 8 tools', async (t) => {
  // Use a fixture snapshot file to keep the server happy even if no app ever ran.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mindmap-test-'));
  const fixtureSnapshot = path.join(tmp, 'snapshot.json');
  fs.writeFileSync(fixtureSnapshot, JSON.stringify({
    version: 1,
    writtenAt: new Date().toISOString(),
    appVersion: 'test',
    layoutMode: 'map',
    root: { id: 'r', text: 'Root', children: [] },
  }));

  const child = spawnServer({ MINDMAP_SNAPSHOT_PATH: fixtureSnapshot });
  t.after(() => { try { child.kill(); } catch (_) {} fs.rmSync(tmp, { recursive: true, force: true }); });

  const rpc = rpcDriver(child);

  const init = await rpc.call('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'test', version: '1' },
  });
  assert.ok(init.result, 'initialize should succeed');
  rpc.notify('notifications/initialized');

  const list = await rpc.call('tools/list');
  const names = list.result.tools.map(t => t.name);
  assert.deepEqual(names.sort(), [
    'mindmap_add_node',
    'mindmap_ai_expand',
    'mindmap_delete_node',
    'mindmap_get_state',
    'mindmap_get_subtree',
    'mindmap_move_node',
    'mindmap_search',
    'mindmap_update_node',
  ]);
});

test('mindmap_get_state on fixture snapshot returns metadata', async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mindmap-test-'));
  const fixtureSnapshot = path.join(tmp, 'snapshot.json');
  fs.writeFileSync(fixtureSnapshot, JSON.stringify({
    version: 1,
    writtenAt: '2026-01-01T00:00:00.000Z',
    appVersion: '0.4.0',
    layoutMode: 'map',
    root: {
      id: 'r',
      text: 'My fixture map',
      children: [
        { id: 'a', text: 'A', children: [{ id: 'a1', text: 'A1' }] },
        { id: 'b', text: 'B' },
      ],
    },
  }));

  const child = spawnServer({ MINDMAP_SNAPSHOT_PATH: fixtureSnapshot });
  t.after(() => { try { child.kill(); } catch (_) {} fs.rmSync(tmp, { recursive: true, force: true }); });
  const rpc = rpcDriver(child);
  await rpc.call('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 't', version: '1' } });
  rpc.notify('notifications/initialized');

  const r = await rpc.call('tools/call', { name: 'mindmap_get_state', arguments: {} });
  const payload = JSON.parse(r.result.content[0].text);
  assert.equal(payload.totalNodes, 4);
  assert.equal(payload.rootId, 'r');
  assert.equal(payload.rootText, 'My fixture map');
  assert.equal(payload.appVersion, '0.4.0');
});

test('mindmap_search returns paths from root', async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mindmap-test-'));
  const fixtureSnapshot = path.join(tmp, 'snapshot.json');
  fs.writeFileSync(fixtureSnapshot, JSON.stringify({
    version: 1, writtenAt: new Date().toISOString(), appVersion: 'test', layoutMode: 'map',
    root: {
      id: 'r', text: 'Top',
      children: [
        { id: 'a', text: 'Alpha bravo', children: [
          { id: 'a1', text: 'Charlie bravo delta' },
        ]},
      ],
    },
  }));

  const child = spawnServer({ MINDMAP_SNAPSHOT_PATH: fixtureSnapshot });
  t.after(() => { try { child.kill(); } catch (_) {} fs.rmSync(tmp, { recursive: true, force: true }); });
  const rpc = rpcDriver(child);
  await rpc.call('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 't', version: '1' } });
  rpc.notify('notifications/initialized');

  const r = await rpc.call('tools/call', { name: 'mindmap_search', arguments: { query: 'bravo' } });
  const payload = JSON.parse(r.result.content[0].text);
  assert.equal(payload.count, 2);
  // path of the deeper match should include the full chain
  const deep = payload.matches.find(m => m.id === 'a1');
  assert.deepEqual(deep.path, ['Top', 'Alpha bravo', 'Charlie bravo delta']);
});
