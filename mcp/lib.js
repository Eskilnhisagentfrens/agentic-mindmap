// Pure helpers for the Agentic Mindmap MCP server. Lives in its own module so
// it can be unit-tested without spawning the stdio server.

const path = require('path');
const os = require('os');

const PRODUCT_NAME = 'Agentic Mindmap';

function defaultSnapshotPath() {
  if (process.env.MINDMAP_SNAPSHOT_PATH) return process.env.MINDMAP_SNAPSHOT_PATH;
  const home = os.homedir();
  if (process.platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', PRODUCT_NAME, 'mcp-snapshot.json');
  }
  if (process.platform === 'win32') {
    const appdata = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
    return path.join(appdata, PRODUCT_NAME, 'mcp-snapshot.json');
  }
  const xdg = process.env.XDG_CONFIG_HOME || path.join(home, '.config');
  return path.join(xdg, PRODUCT_NAME, 'mcp-snapshot.json');
}

function defaultControlPath() {
  if (process.env.MINDMAP_CONTROL_PATH) return process.env.MINDMAP_CONTROL_PATH;
  const home = os.homedir();
  if (process.platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', PRODUCT_NAME, 'mcp-control.json');
  }
  if (process.platform === 'win32') {
    const appdata = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
    return path.join(appdata, PRODUCT_NAME, 'mcp-control.json');
  }
  const xdg = process.env.XDG_CONFIG_HOME || path.join(home, '.config');
  return path.join(xdg, PRODUCT_NAME, 'mcp-control.json');
}

function findNode(node, id) {
  if (!node) return null;
  if (node.id === id) return node;
  for (const c of node.children || []) {
    const hit = findNode(c, id);
    if (hit) return hit;
  }
  return null;
}

function trimTree(node, maxDepth, includeNotes, depth = 0) {
  const out = { id: node.id, text: node.text };
  if (node.icon) out.icon = node.icon;
  if (includeNotes && node.note) out.note = node.note;
  if (Array.isArray(node.children) && node.children.length && (maxDepth == null || depth < maxDepth)) {
    out.children = node.children.map(c => trimTree(c, maxDepth, includeNotes, depth + 1));
  }
  return out;
}

function countNodes(node) {
  if (!node) return 0;
  let n = 1;
  for (const c of node.children || []) n += countNodes(c);
  return n;
}

function searchTree(root, query, limit, includeNotes) {
  const q = String(query || '').toLowerCase();
  if (!q) return [];
  const results = [];
  const path = [];

  function walk(node) {
    if (results.length >= limit) return;
    path.push(node.text);
    const text = String(node.text || '');
    const note = includeNotes ? String(node.note || '') : '';
    const lt = text.toLowerCase();
    const ln = note.toLowerCase();
    let snippet = null;
    if (lt.includes(q)) {
      snippet = text;
    } else if (includeNotes && ln.includes(q)) {
      const i = ln.indexOf(q);
      const start = Math.max(0, i - 30);
      const end = Math.min(note.length, i + q.length + 30);
      snippet = (start > 0 ? '…' : '') + note.slice(start, end) + (end < note.length ? '…' : '');
    }
    if (snippet != null) {
      results.push({ id: node.id, text, path: path.slice(), snippet });
    }
    for (const c of node.children || []) walk(c);
    path.pop();
  }

  walk(root);
  return results;
}

module.exports = {
  PRODUCT_NAME,
  defaultSnapshotPath,
  defaultControlPath,
  findNode,
  trimTree,
  countNodes,
  searchTree,
};
