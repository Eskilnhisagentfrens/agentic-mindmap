# Architecture — AI Expand

This document describes how the **AI 扩展 / AI Expand** feature is wired end-to-end, the security boundaries, and how it sets up for the upcoming MCP server.

## High-level diagram

```
┌────────────────────────────────────────────────────────────────────────────┐
│                                                                            │
│  ┌─────────────────────── Electron BrowserWindow ─────────────────────┐    │
│  │                          (Chromium renderer)                       │    │
│  │                                                                    │    │
│  │  index.html                                                        │    │
│  │  ┌──────────────────────────────────────────────────────────────┐  │    │
│  │  │  UI: toolbar 🤖 button (data-act="ai-expand")                │  │    │
│  │  │     ↓ click                                                  │  │    │
│  │  │  Click listener → ACTIONS["ai-expand"]() → aiExpandSelected  │  │    │
│  │  │     ↓                                                        │  │    │
│  │  │  Collect context:                                            │  │    │
│  │  │    • text             = selected node's text                 │  │    │
│  │  │    • pathFromRoot     = pathToNode(selectedId)               │  │    │
│  │  │    • existingChildren = current children's text              │  │    │
│  │  │     ↓                                                        │  │    │
│  │  │  await window.electronAPI.aiExpand({...})                    │  │    │
│  │  └──────────────────────────────────────────────────────────────┘  │    │
│  │                          │                                         │    │
│  │  ┌───────────────────────┴── contextIsolation boundary ─────────┐  │    │
│  │  │                  preload.js (restricted Node bridge)         │  │    │
│  │  │  contextBridge.exposeInMainWorld('electronAPI', {            │  │    │
│  │  │    aiExpand: (p) => ipcRenderer.invoke('ai-expand-node', p)  │  │    │
│  │  │  })                                                          │  │    │
│  │  └──────────────────────────┬───────────────────────────────────┘  │    │
│  └─────────────────────────────│──────────────────────────────────────┘    │
│                                │ IPC: ai-expand-node (async, Promise)       │
│                                ▼                                            │
│  ┌─────────────────────── Node.js main process (main.js) ──────────────┐   │
│  │                                                                     │   │
│  │  ipcMain.handle('ai-expand-node', async (_e, payload) => {          │   │
│  │     ┌─────────────────────────────────────────────┐                 │   │
│  │     │  ① loadApiKey() — priority chain             │                 │   │
│  │     │     1. process.env.DEEPSEEK_API_KEY         │                 │   │
│  │     │     2. process.env.ANTHROPIC_API_KEY        │                 │   │
│  │     │     3. macOS Keychain: DEEPSEEK_API_KEY ────┼──→ security cmd │   │
│  │     │     4. macOS Keychain: ANTHROPIC_API_KEY    │   (subprocess)  │   │
│  │     └─────────────────────────────────────────────┘                 │   │
│  │     ┌─────────────────────────────────────────────┐                 │   │
│  │     │  ② buildClient()                            │                 │   │
│  │     │     new Anthropic({                         │                 │   │
│  │     │       apiKey,                               │                 │   │
│  │     │       baseURL: deepseek                     │                 │   │
│  │     │         ? 'api.deepseek.com/anthropic'      │                 │   │
│  │     │         : default                           │                 │   │
│  │     │     })                                      │                 │   │
│  │     └─────────────────────────────────────────────┘                 │   │
│  │     ┌─────────────────────────────────────────────┐                 │   │
│  │     │  ③ messages.create({                        │                 │   │
│  │     │     model: 'deepseek-reasoner',             │                 │   │
│  │     │     system: AI_SYSTEM_PROMPT,               │                 │   │
│  │     │     messages: [{ role:'user', content:      │                 │   │
│  │     │       Parent + Path + Existing children     │                 │   │
│  │     │     }]                                      │                 │   │
│  │     │   })                                        │                 │   │
│  │     └─────────────────────────────────────────────┘                 │   │
│  │                          │                                          │   │
│  │     ┌────────────────────▼────────────────────────┐                 │   │
│  │     │  ④ stripFence(raw) → JSON.parse → validate  │                 │   │
│  │     │     - strip ```json ... ``` fences          │                 │   │
│  │     │       (DeepSeek tends to wrap in markdown)  │                 │   │
│  │     │     - filter empty titles, cap at 8         │                 │   │
│  │     │     - on failure: { error: '...' }          │                 │   │
│  │     └─────────────────────────────────────────────┘                 │   │
│  │       return { children: [{title, note}, ...], model, provider }    │   │
│  │  })                                                                 │   │
│  └─────────────────────────────│───────────────────────────────────────┘   │
└────────────────────────────────│───────────────────────────────────────────┘
                                 │ HTTPS POST
                                 ▼
                ┌──────────────────────────────────┐
                │  api.deepseek.com/anthropic      │
                │  (Anthropic-compat endpoint)     │
                │  → routes to deepseek-reasoner   │
                └──────────────────────────────────┘
```

## Single-call sequence

```
User    UI(index.html)         preload         main.js          DeepSeek API
 │            │                   │               │                  │
 │  click 🤖 │                    │               │                  │
 ├───────────►│ aiExpandSelected  │               │                  │
 │            │ collect context   │               │                  │
 │            │ window.electronAPI.aiExpand(...)  │                  │
 │            ├──────────────────►│               │                  │
 │            │                   │ ipcRenderer   │                  │
 │            │                   │  .invoke()    │                  │
 │            │                   ├──────────────►│                  │
 │            │ toast("AI 思考中…")│               │ loadApiKey()     │
 │            │                   │               │ buildClient()    │
 │            │                   │               │ messages.create  │
 │            │                   │               ├─────────────────►│
 │            │                   │               │                  │ ⏳ 1-3s
 │            │                   │               │                  │   reasoning
 │            │                   │               │◄─────────────────┤
 │            │                   │               │ stripFence       │
 │            │                   │               │ JSON.parse       │
 │            │                   │               │ filter           │
 │            │                   │◄──────────────┤ {children:[…]}   │
 │            │◄──────────────────┤               │                  │
 │            │ snapshot()        │               │                  │
 │            │ for each child:   │               │                  │
 │            │   createNode +    │               │                  │
 │            │   push to tree    │               │                  │
 │            │ save() render()   │               │                  │
 │            │ toast("✅ added N nodes")          │                  │
```

## Security model — why split this way

| Layer | Capabilities | Why |
|---|---|---|
| **Renderer** (Chromium sandbox) | No Node API, no filesystem, no arbitrary network | `contextIsolation: true` + `nodeIntegration: false` (main.js:24-26). Even if index.html were XSSed, the attacker can't reach the API key. |
| **preload.js** (restricted bridge) | Exposes only whitelisted methods on `window.electronAPI` | `contextBridge` freezes the surface; the renderer never sees full `ipcRenderer`. |
| **Main process** (Node.js) | Filesystem, network, Keychain, shell | The API key only exists here, in the closure of one async handler. Discarded after the call. |
| **Keychain** | Encrypted at rest | macOS gates access behind user unlock. |

**No path** lets the API key leak into:
- ❌ localStorage / IndexedDB (renderer-readable)
- ❌ shell history (`security` reads silently in a child process)
- ❌ the renderer's heap (only the IPC result crosses the boundary)

## File responsibilities

| File | Δ Lines | Adds | Responsibility |
|---|---|---|---|
| `main.js` | +107 | `loadApiKey` / `buildClient` / `ipcMain.handle('ai-expand-node')` / `AI_SYSTEM_PROMPT` | LLM call, key management, JSON validation |
| `preload.js` | +1 | `aiExpand` bridge | Restricted exposure |
| `index.html` | +53 | toolbar button, `ACTIONS['ai-expand']`, `aiExpandSelected`, `pathToNode` helper | UI, state collection, applying results to the tree |
| `package.json` | +1 dep | `@anthropic-ai/sdk@^0.91.1` | Dependency |

## How this prepares for the MCP server (next phase)

The upcoming **MCP server** (Tier-S in the roadmap) reuses ~80% of this scaffolding:

```
                   ┌── existing ── ai-expand-node IPC handler ─────────┐
                   │                                                   │
Electron main ────┼── new ─── MCP server subprocess (stdio transport) ┤── DeepSeek API
                   │            tools:                                  │
                   │              mindmap_get_subtree                   │
                   │              mindmap_add_node                      │
                   │              mindmap_search                        │── Claude Code CLI
                   │              mindmap_set_status                    │   (OAuth/Max,
                   │              ...                                   │    no API spend)
                   │                                                    │
                   └── new ─── two-way sync with renderer (IPC events) ─┘
                                state changes broadcast to all clients
```

Key reuse:
- `loadApiKey()`, `buildClient()` — unchanged.
- `ai-expand-node` becomes one of many MCP tools (renamed `mindmap_ai_expand`).
- All mindmap CRUD goes through the same IPC routing pattern.

## Configuration knobs (current)

| Variable | Value | Effect |
|---|---|---|
| `DEEPSEEK_API_KEY` (env or Keychain) | string | Use DeepSeek as provider |
| `ANTHROPIC_API_KEY` (env or Keychain) | string | Use Anthropic as fallback |
| `AI_SYSTEM_PROMPT` (constant in main.js) | string | Tunes child-generation behaviour |
| `max_tokens` | 1024 | Cap on response size |
| Model | `deepseek-reasoner` (DeepSeek path), `claude-sonnet-4-6` (Anthropic path) | Hardcoded; future: env-overridable |

## Future improvements

1. Make model selection env-overridable (`MINDMAP_AI_MODEL=...`).
2. Add `mode=brainstorm | plan | summarize` to the IPC payload, with different system prompts.
3. Stream the response back to the renderer (Anthropic SDK supports streaming).
4. Persist the last N AI calls per node as a "history" panel for re-rolling.
5. Settings UI to enter the API key inside the app (instead of relying on env / Keychain).
