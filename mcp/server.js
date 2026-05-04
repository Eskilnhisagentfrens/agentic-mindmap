#!/usr/bin/env node
// Agentic Mindmap MCP server — Phase 1 (read) + Phase 2 (write) shipped.
// See docs/mcp-plan.md for the full design.
//
// Spawned by an MCP host (Claude Desktop / Code) over stdio.
//   READS  use a snapshot file written by the Electron main on every save();
//          the app does not need to be running.
//   WRITES POST to a localhost HTTP control server hosted by the running app
//          (port + per-launch token in mcp-control.json). App MUST be running.

const fs = require('fs');
const http = require('http');

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} = require('@modelcontextprotocol/sdk/types.js');

const {
  defaultSnapshotPath,
  defaultControlPath,
  findNode,
  trimTree,
  countNodes,
  searchTree,
} = require('./lib.js');

const SNAPSHOT_PATH = defaultSnapshotPath();
const CONTROL_PATH = defaultControlPath();

function readControl() {
  let raw;
  try {
    raw = fs.readFileSync(CONTROL_PATH, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new Error(
        'Agentic Mindmap is not running. Mutations require the app to be open. ' +
        'Launch Agentic Mindmap and retry.'
      );
    }
    throw new Error(`Failed to read control file: ${err.message}`);
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`Control file invalid JSON: ${err.message}`);
  }
}

function postMutation(type, params) {
  return new Promise((resolve, reject) => {
    let ctrl;
    try { ctrl = readControl(); }
    catch (err) { reject(err); return; }
    const body = JSON.stringify({ type, params });
    const req = http.request({
      host: '127.0.0.1',
      port: ctrl.port,
      method: 'POST',
      path: '/mutate',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'X-Mindmap-Token': ctrl.token,
      },
    }, (res) => {
      let chunks = '';
      res.on('data', (c) => { chunks += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(chunks)); }
        catch (err) {
          reject(new Error(`Bad response from app (HTTP ${res.statusCode}): ${chunks.slice(0, 200)}`));
        }
      });
    });
    req.on('error', (err) => {
      if (err.code === 'ECONNREFUSED') {
        reject(new Error(
          'Agentic Mindmap appears to have quit (control port refused connection). ' +
          'Re-launch the app and retry.'
        ));
      } else {
        reject(err);
      }
    });
    req.setTimeout(160000, () => { req.destroy(new Error('mutation timed out (160s)')); });
    req.write(body);
    req.end();
  });
}

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
  // ===== Phase 2 — write tools (require Agentic Mindmap to be running) =====
  {
    name: 'mindmap_add_node',
    description:
      'Add a new child node under an existing parent. The Agentic Mindmap app MUST be running. Use mindmap_search or mindmap_get_subtree to find a parentId first. Mutations call snapshot() first, so the user can ⌘Z to undo.',
    inputSchema: {
      type: 'object',
      properties: {
        parentId: { type: 'string', description: 'ID of the parent node (from mindmap_search / mindmap_get_subtree)' },
        text:     { type: 'string', minLength: 1, description: 'Title of the new node' },
        note:     { type: 'string', description: 'Optional multi-line note shown inline under the title' },
        icon:     { type: 'string', description: 'Optional emoji prepended to the title' },
        color:    { type: 'string', description: 'Optional hex color (e.g. "#89b4fa")' },
        position: { type: 'integer', minimum: 0, description: 'Insert at this index among siblings; defaults to end' },
      },
      required: ['parentId', 'text'],
      additionalProperties: false,
    },
  },
  {
    name: 'mindmap_update_node',
    description:
      'Update fields on an existing node. Only the fields you provide are changed; others are preserved. App must be running.',
    inputSchema: {
      type: 'object',
      properties: {
        id:        { type: 'string' },
        text:      { type: 'string' },
        icon:      { type: 'string' },
        color:     { type: 'string' },
        note:      { type: 'string' },
        collapsed: { type: 'boolean' },
      },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'mindmap_delete_node',
    description:
      'Delete a node and its entire subtree. Cannot delete the root. App must be running.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'mindmap_move_node',
    description:
      'Move a node (with its subtree) to be a child of a different parent. Refuses to create cycles or move the root. App must be running.',
    inputSchema: {
      type: 'object',
      properties: {
        id:          { type: 'string' },
        newParentId: { type: 'string' },
        position:    { type: 'integer', minimum: 0, description: 'Insert at this index among new siblings; defaults to end' },
      },
      required: ['id', 'newParentId'],
      additionalProperties: false,
    },
  },
  {
    name: 'mindmap_ai_expand',
    description:
      'Trigger AI Expand on a node — same as the user clicking 🤖 in the toolbar. Generates 3-6 children with auto-detected depth (1-3 layers) and an inline "why" on each. mode="fast" (~5-10s) or "quality" (~30-90s, deeper). App must be running. Returns the new child ids and titles.',
    inputSchema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string' },
        mode:   { type: 'string', enum: ['fast', 'quality'], default: 'fast' },
      },
      required: ['nodeId'],
      additionalProperties: false,
    },
  },
];

const WRITE_TOOLS = new Set([
  'mindmap_add_node',
  'mindmap_update_node',
  'mindmap_delete_node',
  'mindmap_move_node',
  'mindmap_ai_expand',
]);

const WRITE_TYPE_BY_TOOL = {
  mindmap_add_node:    'add_node',
  mindmap_update_node: 'update_node',
  mindmap_delete_node: 'delete_node',
  mindmap_move_node:   'move_node',
  mindmap_ai_expand:   'ai_expand',
};

// =============================================================================
//  Server
// =============================================================================

const server = new Server(
  { name: 'agentic-mindmap', version: '0.2.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params;
  try {
    // Write tools — forward to the running Electron app via HTTP control plane.
    // No snapshot read needed; the app is the source of truth for mutations.
    if (WRITE_TOOLS.has(name)) {
      const type = WRITE_TYPE_BY_TOOL[name];
      const result = await postMutation(type, args);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

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
