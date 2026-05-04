// Integration tests for mcp/server.js's write tools (Phase 2).
// We spin up a fake Electron HTTP control plane (a tiny stub server that
// records the requests it receives), write a control file pointing at it,
// then drive the MCP server over real stdio JSON-RPC and verify each write
// tool forwards correctly with the right auth header and payload shape.
//
// Pure node:test, zero external deps.

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const SERVER = path.resolve(__dirname, '..', '..', 'mcp', 'server.js');

// ---------- helpers ----------

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
      } catch (_) { /* swallow */ }
    }
  });
  let nextId = 1;
  return {
    call: (method, params) => {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        pending.set(id, resolve);
        child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
        setTimeout(() => {
          if (pending.has(id)) { pending.delete(id); reject(new Error(`RPC ${method} timed out`)); }
        }, 5000);
      });
    },
    notify: (method, params) => {
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
    },
  };
}

// Spin up a fake Electron control HTTP server. Returns:
//   { url, port, token, calls, controlFile, close, respondWith }
//
//   calls       — array of { method, url, token, body } recorded for assertions
//   controlFile — path to a temporary mcp-control.json the test should pass via
//                 MINDMAP_CONTROL_PATH to the spawned MCP server
//   respondWith — set the next /mutate response body (object)
async function startFakeControl(t) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mindmap-fake-'));
  const calls = [];
  let nextResponse = { ok: true };

  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      let parsed = null;
      try { parsed = JSON.parse(body || 'null'); } catch (_) {}
      const token = req.headers['x-mindmap-token'] || null;
      calls.push({ method: req.method, url: req.url, token, body: parsed });
      if (token !== TOKEN) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'token mismatch', code: 'AUTH' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(nextResponse));
    });
  });

  const TOKEN = 'fake-token-' + Math.random().toString(36).slice(2, 10);

  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;

  const controlFile = path.join(tmp, 'mcp-control.json');
  fs.writeFileSync(controlFile, JSON.stringify({
    version: 1, port, token: TOKEN, pid: process.pid,
    appVersion: 'test', startedAt: new Date().toISOString(),
  }));

  // Also write a snapshot file so the MCP server doesn't error on read tools.
  const snapshotFile = path.join(tmp, 'mcp-snapshot.json');
  fs.writeFileSync(snapshotFile, JSON.stringify({
    version: 1, writtenAt: new Date().toISOString(), appVersion: 'test',
    layoutMode: 'map', root: { id: 'r', text: 'Root', children: [] },
  }));

  t.after(() => {
    try { server.close(); } catch (_) {}
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  return {
    port,
    token: TOKEN,
    calls,
    controlFile,
    snapshotFile,
    respondWith(obj) { nextResponse = obj; },
  };
}

// ---------- tests ----------

test('mindmap_add_node forwards to control server with token + correct payload', async (t) => {
  const fake = await startFakeControl(t);
  fake.respondWith({
    ok: true,
    node: { id: 'new-node-id', text: 'My new branch', hasChildren: false },
    parentId: 'p1',
  });

  const child = spawnServer({
    MINDMAP_CONTROL_PATH: fake.controlFile,
    MINDMAP_SNAPSHOT_PATH: fake.snapshotFile,
  });
  t.after(() => { try { child.kill(); } catch (_) {} });

  const rpc = rpcDriver(child);
  await rpc.call('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 't', version: '1' } });
  rpc.notify('notifications/initialized');

  const r = await rpc.call('tools/call', {
    name: 'mindmap_add_node',
    arguments: { parentId: 'p1', text: 'My new branch', icon: '🌟' },
  });

  // The MCP server should have made exactly one POST /mutate.
  assert.equal(fake.calls.length, 1, 'expected exactly one HTTP call');
  const c = fake.calls[0];
  assert.equal(c.method, 'POST');
  assert.equal(c.url, '/mutate');
  assert.equal(c.token, fake.token, 'token header must match control file');
  assert.equal(c.body.type, 'add_node');
  assert.deepEqual(c.body.params, { parentId: 'p1', text: 'My new branch', icon: '🌟' });

  // The MCP server's response should faithfully proxy the fake's JSON.
  const payload = JSON.parse(r.result.content[0].text);
  assert.equal(payload.ok, true);
  assert.equal(payload.node.id, 'new-node-id');
  assert.equal(payload.parentId, 'p1');
});

test('mindmap_update_node sends only provided fields', async (t) => {
  const fake = await startFakeControl(t);
  fake.respondWith({ ok: true, nodeId: 'n1', updated: { text: 'New title' } });

  const child = spawnServer({
    MINDMAP_CONTROL_PATH: fake.controlFile,
    MINDMAP_SNAPSHOT_PATH: fake.snapshotFile,
  });
  t.after(() => { try { child.kill(); } catch (_) {} });

  const rpc = rpcDriver(child);
  await rpc.call('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 't', version: '1' } });
  rpc.notify('notifications/initialized');

  await rpc.call('tools/call', {
    name: 'mindmap_update_node',
    arguments: { id: 'n1', text: 'New title' },
  });

  assert.equal(fake.calls.length, 1);
  assert.equal(fake.calls[0].body.type, 'update_node');
  // The update payload must NOT contain icon/color/note keys we didn't pass.
  assert.deepEqual(Object.keys(fake.calls[0].body.params).sort(), ['id', 'text']);
});

test('mindmap_delete_node forwards id', async (t) => {
  const fake = await startFakeControl(t);
  fake.respondWith({ ok: true, deletedId: 'n1', deletedSubtreeSize: 5 });

  const child = spawnServer({
    MINDMAP_CONTROL_PATH: fake.controlFile,
    MINDMAP_SNAPSHOT_PATH: fake.snapshotFile,
  });
  t.after(() => { try { child.kill(); } catch (_) {} });

  const rpc = rpcDriver(child);
  await rpc.call('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 't', version: '1' } });
  rpc.notify('notifications/initialized');

  const r = await rpc.call('tools/call', {
    name: 'mindmap_delete_node',
    arguments: { id: 'n1' },
  });

  assert.equal(fake.calls[0].body.type, 'delete_node');
  assert.deepEqual(fake.calls[0].body.params, { id: 'n1' });
  const payload = JSON.parse(r.result.content[0].text);
  assert.equal(payload.deletedSubtreeSize, 5);
});

test('mindmap_move_node forwards id + newParentId + position', async (t) => {
  const fake = await startFakeControl(t);
  fake.respondWith({ ok: true, nodeId: 'n1', newParentId: 'p2', position: 0 });

  const child = spawnServer({
    MINDMAP_CONTROL_PATH: fake.controlFile,
    MINDMAP_SNAPSHOT_PATH: fake.snapshotFile,
  });
  t.after(() => { try { child.kill(); } catch (_) {} });

  const rpc = rpcDriver(child);
  await rpc.call('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 't', version: '1' } });
  rpc.notify('notifications/initialized');

  await rpc.call('tools/call', {
    name: 'mindmap_move_node',
    arguments: { id: 'n1', newParentId: 'p2', position: 0 },
  });

  assert.equal(fake.calls[0].body.type, 'move_node');
  assert.deepEqual(fake.calls[0].body.params, { id: 'n1', newParentId: 'p2', position: 0 });
});

test('mindmap_ai_expand forwards nodeId + mode', async (t) => {
  const fake = await startFakeControl(t);
  fake.respondWith({
    ok: true, nodeId: 'n1', mode: 'fast',
    added: [{ id: 'c1', text: 'Child A', hasChildren: false }],
    addedCount: 1,
  });

  const child = spawnServer({
    MINDMAP_CONTROL_PATH: fake.controlFile,
    MINDMAP_SNAPSHOT_PATH: fake.snapshotFile,
  });
  t.after(() => { try { child.kill(); } catch (_) {} });

  const rpc = rpcDriver(child);
  await rpc.call('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 't', version: '1' } });
  rpc.notify('notifications/initialized');

  await rpc.call('tools/call', {
    name: 'mindmap_ai_expand',
    arguments: { nodeId: 'n1', mode: 'fast' },
  });

  assert.equal(fake.calls[0].body.type, 'ai_expand');
  assert.deepEqual(fake.calls[0].body.params, { nodeId: 'n1', mode: 'fast' });
});

test('write tool errors when control file is missing', async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mindmap-no-ctrl-'));
  // Snapshot exists, control does NOT.
  const snapshotFile = path.join(tmp, 'mcp-snapshot.json');
  fs.writeFileSync(snapshotFile, JSON.stringify({
    version: 1, writtenAt: new Date().toISOString(), appVersion: 'test', layoutMode: 'map',
    root: { id: 'r', text: 'Root', children: [] },
  }));
  const missingControl = path.join(tmp, 'mcp-control.json'); // intentionally not created
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

  const child = spawnServer({
    MINDMAP_CONTROL_PATH: missingControl,
    MINDMAP_SNAPSHOT_PATH: snapshotFile,
  });
  t.after(() => { try { child.kill(); } catch (_) {} });

  const rpc = rpcDriver(child);
  await rpc.call('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 't', version: '1' } });
  rpc.notify('notifications/initialized');

  const r = await rpc.call('tools/call', {
    name: 'mindmap_add_node',
    arguments: { parentId: 'p1', text: 'x' },
  });

  // The MCP server should turn this into a friendly tool error rather than
  // a JSON-RPC failure.
  assert.equal(r.result.isError, true);
  const text = r.result.content[0].text;
  assert.match(text, /Agentic Mindmap is not running/);
});

test('write tool errors when control port refuses connection', async (t) => {
  // Write a control file pointing at a port nothing is listening on.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mindmap-dead-port-'));
  const ctrl = path.join(tmp, 'mcp-control.json');
  // Pick a port in the ephemeral range that is almost certainly free.
  const deadPort = 65431;
  fs.writeFileSync(ctrl, JSON.stringify({
    version: 1, port: deadPort, token: 'whatever',
    pid: 0, appVersion: 'test', startedAt: new Date().toISOString(),
  }));
  const snap = path.join(tmp, 'mcp-snapshot.json');
  fs.writeFileSync(snap, JSON.stringify({
    version: 1, writtenAt: new Date().toISOString(), appVersion: 'test', layoutMode: 'map',
    root: { id: 'r', text: 'Root', children: [] },
  }));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

  const child = spawnServer({ MINDMAP_CONTROL_PATH: ctrl, MINDMAP_SNAPSHOT_PATH: snap });
  t.after(() => { try { child.kill(); } catch (_) {} });

  const rpc = rpcDriver(child);
  await rpc.call('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 't', version: '1' } });
  rpc.notify('notifications/initialized');

  const r = await rpc.call('tools/call', {
    name: 'mindmap_add_node',
    arguments: { parentId: 'p1', text: 'x' },
  });

  assert.equal(r.result.isError, true);
  const text = r.result.content[0].text;
  // Either ECONNREFUSED-style ("appears to have quit") or a generic connection
  // error — both are acceptable. Just make sure we got a useful message.
  assert.ok(/quit|refused|ECONNREFUSED|connect/i.test(text), `unexpected error message: ${text}`);
});
