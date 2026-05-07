# Architecture — Agentic Mindmap v0.4.0

How the four moving pieces (Electron renderer · Electron main · MCP server · Claude host) fit together, plus the data files that glue them.

## Big picture

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                         Agentic Mindmap (Electron app)                           │
│                                                                                  │
│  ┌──────────────────────────── Renderer (index.html, ~3000 lines) ────────────┐ │
│  │                                                                             │ │
│  │  ┌────────────────────────── Canvas + State ─────────────────────────────┐  │ │
│  │  │  state.root (tree)  ·  selectedId  ·  viewport  ·  history (undo)    │  │ │
│  │  │  layoutMap() / layoutTree()  ·  render()  ·  ensureSelected()         │  │ │
│  │  └───────────────────────────────────────────────────────────────────────┘  │ │
│  │                                                                             │ │
│  │  ┌── UI ───────────────┐  ┌── AI Expand ─────────┐  ┌── Exports ────────┐   │ │
│  │  │  Toolbar (15 btns)  │  │  🤖 fast / 🧠 quality │  │  📄 PDF · 🌳 OPML │   │ │
│  │  │  Color/Icon popover │  │  Progress overlay     │  │  💾 JSON · 📤 MD  │   │ │
│  │  │  Outline panel      │  │  Streaming preview    │  │  🖼️ SVG · 📷 PNG  │   │ │
│  │  │  Search bar         │  │  Inline note preview  │  │  ⌘C/⌘V clipboard  │   │ │
│  │  └─────────────────────┘  └───────────────────────┘  └───────────────────┘   │ │
│  │                                                                             │ │
│  │  ┌── MCP_HANDLERS ────────────────────────────────────────────────────────┐  │ │
│  │  │  add_node · update_node · delete_node · move_node · ai_expand         │  │ │
│  │  │  each: snapshot() → mutate → save() → render() → toast               │  │ │
│  │  └───────────────────────────────────────────────────────────────────────┘  │ │
│  │                                                                             │ │
│  │     ↕ contextBridge (preload.js, restricted whitelist API)                 │ │
│  └─────────────────────────────────────────────────────────────────────────────┘ │
│                                       ↕                                          │
│  ┌──────────────────── Main Process (main.js) ───────────────────────────────┐  │
│  │                                                                            │  │
│  │  ┌── IPC handlers ──────────────┐  ┌── HTTP Control Server ──────────┐    │  │
│  │  │  ai-expand-node (streaming)  │  │  127.0.0.1:<random> /mutate     │    │  │
│  │  │  mindmap-snapshot            │  │  X-Mindmap-Token (per-launch)   │    │  │
│  │  │  export-pdf (printToPDF)     │  │  → forward to renderer via IPC  │    │  │
│  │  │  apply-mutation              │  │  → return result over HTTP      │    │  │
│  │  └──────────────────────────────┘  └─────────────────────────────────┘    │  │
│  │                                                                            │  │
│  │  ┌── Native menus ──────┐  ┌── Logging ──────┐  ┌── Files ──────────┐    │  │
│  │  │  ⌘N/O/S/P/⇧E/⇧L      │  │  electron-log    │  │  ~/Library/       │    │  │
│  │  │  Help → 报 Bug       │  │  ~/Library/Logs/ │  │   Application     │    │  │
│  │  │  Help → Logs/About   │  │   Agentic        │  │   Support/        │    │  │
│  │  │  lib/friendly-error  │  │   Mindmap/       │  │   Agentic         │    │  │
│  │  └──────────────────────┘  └──────────────────┘  └───────────────────┘    │  │
│  └────────────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────┬───────────────────────────────────────────┘
                                       │
        ┌──────────────────────────────┼──────────────────────────────────┐
        │                              │                                  │
        │  HTTPS → DeepSeek/Anthropic  │  File: mcp-snapshot.json (atomic) │
        │  (AI Expand)                 │  File: mcp-control.json (0600)    │
        │                              │                                  │
        ▼                              ▼                                  │
┌──────────────────────┐  ┌────────────────────────────────────────────┐  │
│  AI Provider         │  │  Snapshot file (read tools work without app)│  │
│   • DeepSeek-chat    │  │  Control file (write tools require app)     │  │
│   • DeepSeek-reasoner│  │                                              │  │
│   • Claude haiku /   │  └────────────────────────┬───────────────────┘  │
│     sonnet           │                            │                       │
└──────────────────────┘                            ▼                       │
                                  ┌─────────────────────────────────────────┴─┐
                                  │     MCP Server (mcp/server.js, stdio)      │
                                  │                                            │
                                  │  ┌─ Read tools (snapshot file) ─────────┐  │
                                  │  │  • mindmap_get_state                 │  │
                                  │  │  • mindmap_get_subtree               │  │
                                  │  │  • mindmap_search                    │  │
                                  │  └──────────────────────────────────────┘  │
                                  │                                            │
                                  │  ┌─ Write tools (HTTP → control plane) ─┐  │
                                  │  │  • mindmap_add_node                  │  │
                                  │  │  • mindmap_update_node               │  │
                                  │  │  • mindmap_delete_node               │  │
                                  │  │  • mindmap_move_node                 │  │
                                  │  │  • mindmap_ai_expand                 │  │
                                  │  └──────────────────────────────────────┘  │
                                  │                                            │
                                  │  Pure helpers in mcp/lib.js (unit-tested) │
                                  └────────────────────┬──────────────────────┘
                                                       │ stdio JSON-RPC
                                                       ▼
                                       ┌──────────────────────────────────┐
                                       │  Claude Code / Claude Desktop    │
                                       │   ↑ uses Max OAuth → $0/query     │
                                       │   ↑ skills/SKILL.md teaches it    │
                                       │     when to use which tool        │
                                       └──────────────────────────────────┘
```

## Three data flows

| Direction | Path | When |
|---|---|---|
| **User edit → file** | renderer → preload → main IPC `mindmap-snapshot` → atomic write `mcp-snapshot.json` | every `save()` |
| **Claude reads** | host → stdio → MCP server reads `mcp-snapshot.json` | any time (app does not need to be running) |
| **Claude writes** | host → MCP server → HTTP POST `127.0.0.1:port/mutate` (with token) → main IPC `apply-mutation` → renderer applies → snapshot + save + render → response back over HTTP | only when the app is running |

## Files on disk

```
~/Library/Application Support/Agentic Mindmap/
├── Local Storage/leveldb/    — Chromium localStorage (full mindmap state)
├── mcp-snapshot.json         — atomic mirror, written on every save()
└── mcp-control.json          — port + per-launch token (0600 perms)

~/Library/Logs/Agentic Mindmap/
└── main.log                  — electron-log timestamps every AI call + errors

~/Documents/MindMap/backups/  — manual `⌘S` JSON exports + auto-backups
```

## AI Expand pipeline (in detail)

When the user clicks 🤖 (fast) or 🧠 (quality):

1. **Renderer** collects context: parent text, path-from-root, cousins (children of siblings), parent's note. Generates a request id and shows the streaming progress overlay.
2. **IPC** carries the request to main with `mode = 'fast' | 'quality'` selecting the model:
   - `fast`: `deepseek-chat` / `claude-haiku-4-5` (~5–10 s)
   - `quality`: `deepseek-reasoner` / `claude-sonnet-4-6` (~30–90 s)
3. **API key** is loaded lazily inside main: `process.env.DEEPSEEK_API_KEY` → `process.env.ANTHROPIC_API_KEY` → macOS Keychain via `security`. Never reaches the renderer.
4. **`messages.stream()`** gives token deltas. Main throttles them to ~10 Hz and forwards via `ai-stream` IPC events; the renderer updates the live tail under the progress bar so the user feels motion within ~1 s.
5. **Response** is parsed (with a markdown-fence stripper since DeepSeek's Anthropic-compat shim sometimes wraps JSON), validated (max depth 3, max 40 nodes, recursive title/why cleanup), and returned to the renderer.
6. **Renderer** snapshots the tree, recursively inserts the children with their `why` as note, saves, re-renders, and toasts the kind/approach/depth/elapsed.

The system prompt lives in `main.js` as `SMART_DECOMPOSE_SYSTEM_PROMPT`. It demands: language match, named entities, load-bearing numbers, anti-code-switching, tapered branching by depth, and JSON-only output. The prompt is locked in by the language-match eval in `test/prompt/`.

## MCP Phase 1 + 2 (read + write)

| Tool | Phase | Where it goes |
|---|---|---|
| `mindmap_get_state` | 1 | reads `mcp-snapshot.json` |
| `mindmap_get_subtree` | 1 | reads `mcp-snapshot.json` |
| `mindmap_search` | 1 | reads `mcp-snapshot.json` |
| `mindmap_add_node` | 2 | HTTP `/mutate` → renderer applies |
| `mindmap_update_node` | 2 | HTTP `/mutate` → renderer applies |
| `mindmap_delete_node` | 2 | HTTP `/mutate` → renderer applies |
| `mindmap_move_node` | 2 | HTTP `/mutate` → renderer applies |
| `mindmap_ai_expand` | 2 | HTTP → triggers existing AI Expand path |

### Why HTTP (not file watcher)

We considered three options for write transport (see [`docs/mcp-plan.md`](./mcp-plan.md)):

- **(a) HTTP localhost — picked.** Synchronous request/response. Per-launch token in a 0600 file. Simple, debuggable, easy to test (the integration suite mocks the control server with `http.createServer`).
- (b) Named pipe / Unix socket — slightly more secure but harder to mock and test.
- (c) Shared file + `chokidar` watcher — coarse-grained, race-prone for reads-while-writing. Rejected.

### Mutation safety

Every mutation:

1. Validates parent / target exists. Returns `code: NOT_FOUND` if not.
2. Refuses cycles for `move_node` (`code: CYCLE`) and root deletion (`code: ROOT`).
3. Refuses if the user is currently editing the target (`state.editing === id` → `code: BUSY`).
4. Otherwise: `snapshot()` (so ⌘Z works) → mutate → `save()` (writes new mcp-snapshot.json atomically) → `render()`.
5. Toasts "🔌 Claude: <op>" on the canvas so the user sees what happened.

## Security boundaries

| Layer | Capabilities | Why |
|---|---|---|
| **Renderer** (Chromium sandbox) | No Node API, no filesystem, no arbitrary network | `contextIsolation: true` + `nodeIntegration: false`. Even if `index.html` were XSSed, an attacker can't reach an API key or write the snapshot. |
| **preload.js** | Whitelisted bridge methods on `window.electronAPI` | `contextBridge` freezes the surface; the renderer never sees full `ipcRenderer`. |
| **Main process** | Filesystem, network, Keychain, shell | The API key, token, and ports only exist here. Discarded after each call. |
| **HTTP control server** | `127.0.0.1` only, `X-Mindmap-Token` required | Localhost-bound + per-launch token defends against another local user driving the canvas. |
| **Keychain** | Encrypted at rest | macOS gates access behind user unlock. |

No path lets API keys / tokens leak into:
- ❌ `localStorage` / IndexedDB (renderer-readable)
- ❌ shell history (`security` reads silently in a child process)
- ❌ the renderer's heap (only IPC results cross the boundary)

## File responsibilities

| File | Purpose |
|---|---|
| `main.js` | Electron main: HTTP control server, IPC handlers, native menus, AI Expand IPC, logging |
| `preload.js` | `contextBridge` whitelisted API surface |
| `index.html` | Renderer: canvas, state, UI, exports, MCP mutation handlers |
| `lib/friendly-error.js` | Error-message mapping (pure, unit-tested) |
| `mcp/server.js` | MCP server (stdio JSON-RPC), tool definitions, HTTP client for writes |
| `mcp/lib.js` | Pure tree helpers (findNode / trimTree / countNodes / searchTree) |
| `.claude-plugin/plugin.json` | Plugin manifest for `/plugin install` |
| `.mcp.json` | MCP server entry config (uses `${CLAUDE_PLUGIN_ROOT}` for path) |
| `skills/agentic-mindmap/SKILL.md` | Teaches Claude when to invoke which tool |

## Tests

```
test/
├── unit/                 — pure functions, no I/O. Run on every commit.
│   ├── mcp-lib.test.js          — tree helpers (8 tests)
│   └── friendly-error.test.js   — error mapping (14 tests)
├── integration/          — spawn processes, fixture filesystem.
│   ├── mcp-stdio.test.js        — stdio JSON-RPC + read tools (3 tests)
│   └── mcp-mutations.test.js    — fake control plane + 5 write tools + 2 error paths (7 tests)
└── prompt/               — live-API evals.
    └── language-match.eval.js   — en / zh / ja language match + no-placeholder (4 evals)
```

| Layer | Cmd | Cost | Cadence |
|---|---|---|---|
| unit | `npm run test:unit` | free | every commit |
| unit + integration | `npm test` | free | PR / pre-push |
| prompt evals | `npm run eval:prompt` | ~$0.002/run | pre-release / after prompt change |

## Roadmap (where this architecture is heading)

- **v0.5 — MCP Phase 3.** Bidirectional sync: server-pushed `notifications/resources/updated` whenever the user edits, so Claude re-fetches without re-asking. Streaming `mindmap_ai_expand` so children appear live in Claude's transcript.
- **In-app Settings UI** — drop the `security add-generic-password` requirement; let users paste a key in a prefs window.
- **App icon + code signing & notarization** — drop the `xattr -cr` step. Requires Apple Developer Program ($99/year).
