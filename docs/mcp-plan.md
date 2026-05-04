# MCP Server — Implementation Plan

Status: **Phase 1 (read-only) shipped in v0.3.0**, **Phase 2 (mutations) shipped in v0.4.0**. Phase 3 (live bidirectional sync) still future.

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

## Phase 2 — mutations (shipped in v0.4.0)

| Tool | Args |
|---|---|
| `mindmap_add_node` | `{ parentId, text, icon?, note?, color?, position? }` |
| `mindmap_update_node` | `{ id, text?, icon?, color?, note?, collapsed? }` |
| `mindmap_delete_node` | `{ id }` — deletes the subtree |
| `mindmap_move_node` | `{ id, newParentId, position? }` — refuses cycles |
| `mindmap_ai_expand` | `{ nodeId, mode? }` — `fast` (default, ~5-10s) or `quality` (~30-90s) |

`mindmap_set_status` was dropped — node "status" turned out to be a renderer concern, not a structural one. Use `mindmap_update_node` with `icon` / `color` instead.

**What we picked:** **Option (a) — HTTP localhost.**

- Electron main starts an HTTP server on `127.0.0.1` with a random port (`port: 0`) on app launch. Port + per-launch token are written to `<userData>/mcp-control.json` with `0600` perms.
- The MCP server reads that file before each write, then `POST /mutate` with body `{ type, params }` and header `X-Mindmap-Token`. Synchronous request/response — Claude's tool call returns the new state in one round-trip.
- Reads keep using the snapshot file (no app required); writes require the app to be running. If `mcp-control.json` is missing or the port refuses connection, the MCP server returns a clear "Agentic Mindmap is not running" error — much friendlier than a stale write disappearing into nowhere.
- **Conflict policy:** if `state.editing === id`, the mutation returns `code: BUSY`. All other mutations go through `snapshot()` → mutate → `save()` → `render()`, exactly like a user action — so ⌘Z undoes any Claude-driven change.
- **Auth:** the per-launch token defends against another local user (or an unauthorized process) driving the canvas. Token rotates every app launch.
- **No file-watcher:** Option (c) was rejected because reads-while-writing would race on partial writes. HTTP is request/response and atomic.

**File layout addition:**

```
main.js
  ↳ startMCPControlServer()  — listens on 127.0.0.1:<port>, writes mcp-control.json
  ↳ ipcMain.handle('apply-mutation') — forwards to renderer

preload.js
  ↳ onApplyMutation, sendMutationResult — bridges between main and renderer

index.html
  ↳ MCP_HANDLERS = { add_node, update_node, delete_node, move_node, ai_expand }
  ↳ each handler: snapshot() → mutate → save() → render() → return summary

mcp/server.js
  ↳ readControl() / postMutation() — HTTP client to the running app
  ↳ WRITE_TOOLS routes the 5 new tools through postMutation
```

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
