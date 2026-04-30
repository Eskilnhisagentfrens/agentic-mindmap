# MCP Server — Implementation Plan

Status: **Phase 1 (read-only) in progress** — see `mcp/server.js`.

## Goal

Expose the local mindmap as an [MCP](https://modelcontextprotocol.io) server so Claude Code / Claude Desktop / any MCP host can read (and eventually write) the active canvas as a tool — driven via the user's Max OAuth, no per-call API spend.

## Why split into phases

Mutations and bidirectional sync require a live IPC channel between the MCP server process and the running Electron renderer, plus conflict semantics (what if the user is mid-drag when an MCP tool inserts a node?). Reads don't — a stale-by-≤1-save snapshot file is enough. Shipping read-only first validates the transport and tool surface end-to-end against a real MCP host before we touch the harder problem.

## Architecture

```
┌── MCP host (Claude Code / Desktop) ──┐
│                                      │
│   spawns:                            │
│     node mcp/server.js               │ ◄── stdio transport
│                                      │
└──────────────────────────────────────┘
              │ reads
              ▼
   ~/Library/Application Support/
     Agentic Mindmap/mcp-snapshot.json   ◄── written by Electron main
              ▲
              │ writes (atomic rename)
              │
┌── Electron main process ─────────────┐
│   ipcMain.handle('mindmap-snapshot') │
└──────────────────────────────────────┘
              ▲
              │ IPC (every save())
              │
┌── Renderer (index.html) ─────────────┐
│   save() → window.electronAPI        │
│             .pushSnapshot(payload)   │
└──────────────────────────────────────┘
```

Key properties:
- **MCP server runs out-of-process** from Electron — it's a plain Node script the MCP host spawns. No coupling to Electron's lifecycle for reads.
- **Snapshot file is the single source of truth** the MCP server reads. Atomic write (temp + rename) guarantees readers never see a half-written file.
- **No new permission surface** in renderer — `pushSnapshot` is added to the existing whitelist in `preload.js`.

## Snapshot file format

```json
{
  "version": 1,
  "writtenAt": "2026-04-30T03:14:15.926Z",
  "appVersion": "0.2.0",
  "layoutMode": "map",
  "nodeScale": 1,
  "root": {
    "id": "...",
    "text": "中心主题",
    "icon": "🎯",
    "color": "#89b4fa",
    "note": "",
    "collapsed": false,
    "children": [ ... ],
    "summaries": [],
    "relations": []
  }
}
```

Path:
- macOS: `~/Library/Application Support/Agentic Mindmap/mcp-snapshot.json`
- Linux: `~/.config/Agentic Mindmap/mcp-snapshot.json`
- Windows: `%APPDATA%/Agentic Mindmap/mcp-snapshot.json`
- Override: `MINDMAP_SNAPSHOT_PATH` env var (used by the MCP server too).

## Phase 1 — read-only tools (this PR)

| Tool | Args | Returns |
|---|---|---|
| `mindmap_get_state` | _(none)_ | `{ writtenAt, appVersion, layoutMode, totalNodes, rootId, rootText }` |
| `mindmap_get_subtree` | `{ nodeId?: string, maxDepth?: number, includeNotes?: boolean }` | Trimmed subtree as nested `{ id, text, icon, note?, children }`. Defaults: nodeId=root, maxDepth=unlimited, includeNotes=true. |
| `mindmap_search` | `{ query: string, limit?: number, includeNotes?: boolean }` | `[{ id, text, path: string[], snippet }, ...]` — case-insensitive substring across `text` and (optionally) `note`. |

Phase 1 is satisfied when:
1. `node mcp/server.js` runs standalone and responds to `tools/list` over stdio.
2. The Electron app writes a fresh `mcp-snapshot.json` on every `save()`.
3. Adding the server to `~/Library/Application Support/Claude/claude_desktop_config.json` exposes the three tools in Claude Desktop.

## Phase 2 — mutations (future)

| Tool | Args |
|---|---|
| `mindmap_add_node` | `{ parentId, text, icon?, note?, position? }` |
| `mindmap_update_node` | `{ id, text?, icon?, color?, note?, collapsed? }` |
| `mindmap_delete_node` | `{ id }` |
| `mindmap_set_status` | `{ id, status }` (status as a structured field, TBD) |
| `mindmap_ai_expand` | rename of existing `ai-expand-node` IPC |

Mutations need:
- A live channel back to the renderer so changes appear immediately. Options:
  - **(a) HTTP localhost** — main starts a `127.0.0.1:NNNN` server on app launch; MCP server POSTs commands. Simple, no IPC across processes.
  - **(b) Named pipe / Unix socket** — slightly more secure (no port).
  - **(c) Shared file + watcher** — MCP server appends commands; main `chokidar`-watches and applies. Coarse-grained, easy to debug.
- **Conflict policy**: while a node is `state.editing`, mutations to that node are rejected with `BUSY`. All other mutations call `snapshot()` → apply → `save()` → `render()` exactly like a user action, so undo "just works".
- **Auth**: token written to a 0600 file at app start, read by MCP server; included on every command. Defends against another local user driving the canvas.

**Decision deferred to Phase 2** — Phase 1 doesn't need to commit.

## Phase 3 — live bidirectional sync (future)

- MCP server pushes `notifications/resources/updated` so MCP hosts can re-fetch.
- Renderer subscribes to MCP-originated changes and re-renders without snapshotting (avoid undo-history pollution).
- Streaming `mindmap_ai_expand` so the host sees children appear one at a time.

## Out of scope (forever, probably)

- Multi-user / cloud sync — the app is local-first by design.
- Auth beyond local-machine — anyone with read access to the Application Support folder can already read the saved JSON.
- Running MCP server when Electron is closed — snapshot file is whatever was last written; reads still work but the data is stale.

## File layout (after this PR)

```
agentic-mindmap/
├── main.js                      # +pushSnapshot IPC handler, +writes mcp-snapshot.json
├── preload.js                   # +pushSnapshot bridge
├── index.html                   # save() also calls electronAPI.pushSnapshot
├── mcp/
│   └── server.js                # NEW — stdio MCP server, read-only tools
├── docs/
│   ├── architecture.md          # existing
│   └── mcp-plan.md              # this file
└── package.json                 # +@modelcontextprotocol/sdk dep
```

## Testing plan (Phase 1)

1. `npm install` → installs `@modelcontextprotocol/sdk`.
2. `npm start` → app runs, makes an edit, confirm `mcp-snapshot.json` exists in `~/Library/Application Support/Agentic Mindmap/`.
3. Manual stdio smoke test:
   ```bash
   node mcp/server.js
   # paste: {"jsonrpc":"2.0","id":1,"method":"tools/list"}
   # expect three tools listed
   ```
4. Wire into Claude Desktop:
   ```json
   {
     "mcpServers": {
       "agentic-mindmap": {
         "command": "node",
         "args": ["/Users/<you>/projects/mindmap/mcp/server.js"]
       }
     }
   }
   ```
   Restart Claude Desktop, confirm the tools appear and `mindmap_get_state` returns live data.
