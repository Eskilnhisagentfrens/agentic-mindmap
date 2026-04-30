#!/usr/bin/env node
// Agentic Mindmap MCP server — Phase 1 (read-only).
// See docs/mcp-plan.md for the full design.
//
// Spawned by an MCP host (Claude Desktop / Code) over stdio. Reads the active
// mindmap from a snapshot file written by the Electron main process on every
// save(). The Electron app does NOT need to be running for reads — the file
// just becomes stale.

const fs = require('fs');
const path = require('path');
const os = require('os');

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} = require('@modelcontextprotocol/sdk/types.js');

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

const SNAPSHOT_PATH = defaultSnapshotPath();

function readSnapshot() {
  let raw;
  try {
    raw = fs.readFileSync(SNAPSHOT_PATH, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new Error(
        `Snapshot not found at ${SNAPSHOT_PATH}. ` +
        `Open Agentic Mindmap and make any edit to write the first snapshot.`
      );
    }
    throw new Error(`Failed to read snapshot: ${err.message}`);
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`Snapshot is not valid JSON: ${err.message}`);
  }
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
      results.push({
        id: node.id,
        text,
        path: path.slice(),
        snippet,
      });
    }
    for (const c of node.children || []) walk(c);
    path.pop();
  }

  walk(root);
  return results;
}

// =============================================================================
//  Tool definitions
// =============================================================================

const TOOLS = [
  {
    name: 'mindmap_get_state',
    description:
      'Get metadata about the current mindmap: when it was last saved, how many nodes it has, and the root node id/text. Use this first to confirm the mindmap is reachable before deeper queries.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: 'mindmap_get_subtree',
    description:
      'Return the subtree rooted at a given node as a nested JSON tree. Defaults to the whole mindmap. Use maxDepth to truncate large trees.',
    inputSchema: {
      type: 'object',
      properties: {
        nodeId: {
          type: 'string',
          description: 'The id of the node to return. Defaults to the root.',
        },
        maxDepth: {
          type: 'integer',
          minimum: 0,
          description: 'Max depth from the requested node (0 = just that node). Omit for unlimited.',
        },
        includeNotes: {
          type: 'boolean',
          default: true,
          description: 'Include each node\'s note field in the output.',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'mindmap_search',
    description:
      'Case-insensitive substring search over node text (and optionally notes). Returns matches with their path from root.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', minLength: 1 },
        limit: { type: 'integer', minimum: 1, maximum: 200, default: 25 },
        includeNotes: { type: 'boolean', default: true },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
];

// =============================================================================
//  Server
// =============================================================================

const server = new Server(
  { name: 'agentic-mindmap', version: '0.1.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params;
  try {
    const snap = readSnapshot();
    const root = snap.root;

    if (name === 'mindmap_get_state') {
      const result = {
        snapshotPath: SNAPSHOT_PATH,
        writtenAt: snap.writtenAt || null,
        appVersion: snap.appVersion || null,
        layoutMode: snap.layoutMode || null,
        totalNodes: countNodes(root),
        rootId: root && root.id,
        rootText: root && root.text,
      };
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    if (name === 'mindmap_get_subtree') {
      const includeNotes = args.includeNotes !== false;
      const target = args.nodeId ? findNode(root, args.nodeId) : root;
      if (!target) {
        return {
          isError: true,
          content: [{ type: 'text', text: `No node with id "${args.nodeId}".` }],
        };
      }
      const tree = trimTree(target, args.maxDepth, includeNotes);
      return { content: [{ type: 'text', text: JSON.stringify(tree, null, 2) }] };
    }

    if (name === 'mindmap_search') {
      const limit = Math.max(1, Math.min(200, args.limit || 25));
      const includeNotes = args.includeNotes !== false;
      const matches = searchTree(root, args.query, limit, includeNotes);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ count: matches.length, matches }, null, 2),
        }],
      };
    }

    return {
      isError: true,
      content: [{ type: 'text', text: `Unknown tool: ${name}` }],
    };
  } catch (err) {
    return {
      isError: true,
      content: [{ type: 'text', text: err.message || String(err) }],
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Stay alive on stdio. Errors go to stderr so the host can surface them.
  process.stderr.write(`[agentic-mindmap-mcp] connected, snapshot=${SNAPSHOT_PATH}\n`);
}

main().catch((err) => {
  process.stderr.write(`[agentic-mindmap-mcp] fatal: ${err.message}\n`);
  process.exit(1);
});
