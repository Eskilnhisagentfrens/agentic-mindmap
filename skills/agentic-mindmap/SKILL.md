---
name: agentic-mindmap
description: Use this skill when the user wants to read, search, browse, or reason about their Agentic Mindmap — a local XMind-style mindmap stored at ~/Library/Application Support/Agentic Mindmap/mcp-snapshot.json. Triggers include phrases like "my mindmap", "脑图", "思维导图", "agentic mindmap", "find X in my map", "show me the Y branch", "what nodes do I have about Z", or any reference to a node id (UUID-like). The skill orchestrates the mindmap_* MCP tools (mindmap_get_state, mindmap_get_subtree, mindmap_search) provided by the agentic-mindmap MCP server.
version: 0.1.0
license: MIT
---

# Agentic Mindmap

Help the user read and reason about their **local Agentic Mindmap** through the read-only MCP tools exposed by the `agentic-mindmap` server.

## When this skill applies

- The user mentions "my mindmap", "脑图", "思维导图", "the map", "the canvas", or "agentic mindmap".
- They want to **search** for a topic across their map ("find everything I have about X").
- They want to **browse** a specific branch ("show me what's under the Japan-market node", "expand the AI Expand subtree").
- They paste or reference a **node id** (UUID-shaped or `n_xxxx`) and ask what's under it.
- They ask the **state** of the mindmap ("how big is my map", "when did I last save", "is the MCP wired up").

## Available tools (provided by the `agentic-mindmap` MCP server)

| Tool | Purpose | Key args |
|---|---|---|
| `mindmap_get_state` | Health check + size + last-saved time. Always call this first if unsure whether the server is reachable. | _(none)_ |
| `mindmap_get_subtree` | Return a subtree as nested JSON. Use `nodeId` to target a branch; use `maxDepth` to limit size. | `nodeId?`, `maxDepth?`, `includeNotes?` |
| `mindmap_search` | Case-insensitive substring search over node text and notes. Returns matches with full path from root. | `query`, `limit?`, `includeNotes?` |

## How to respond

1. **Pick the right tool.**
   - "Find / search / look for / 找 / 搜" → `mindmap_search`.
   - "Show / open / browse / what's under / 展开 / 看看" + a node → `mindmap_get_subtree` (use `mindmap_search` first if you only have a name, not an id).
   - "How big / when saved / status / 状态" → `mindmap_get_state`.
2. **Resolve names to ids.** If the user names a branch by text ("the Japan-market branch") instead of id, run `mindmap_search` first, pick the best match, then `mindmap_get_subtree` with that id.
3. **Cap output.** For large subtrees, default `maxDepth: 3`. The user can ask for more.
4. **Render readably.** Default to a Markdown nested list with bolded titles and dimmed notes. Only dump raw JSON if the user asks for it or plans to feed it to another tool.
5. **Cite paths.** When showing search results, include the path from root (`A › B › C`) so the user can locate the node visually.

## Errors and recovery

- `Snapshot not found at …` → the user hasn't opened Agentic Mindmap yet, or hasn't made an edit since installing. Tell them: open the app and make any edit (this triggers `save()` which writes the snapshot).
- `No node with id "…"` → the id is stale (node deleted) or wrong. Suggest `mindmap_search` to find the current id.
- Tools not appearing at all → the MCP server isn't connected to this Claude client. Point at the README's "Use with Claude Desktop / Code" section.

## Style

- Match the user's language (中文 in → 中文 out).
- Be concise. The mindmap is the user's own thinking — don't lecture them on what their map says.
- Surface the **why/note** field when present; that's where the most user-curated context lives.

## Example flows

**User: "找一下我脑图里关于 MCP 的部分"**
→ `mindmap_search({ query: "MCP" })`
→ Render top matches with `path` and short snippets.

**User: "Show me what's under the AI Expand branch, 2 levels deep"**
→ `mindmap_search({ query: "AI Expand", limit: 5 })` to get the id
→ `mindmap_get_subtree({ nodeId: <id>, maxDepth: 2 })`
→ Render as nested Markdown.

**User: "我的脑图现在多大了？"**
→ `mindmap_get_state()`
→ "上次保存于 …，共 N 个节点。根节点：…"

## Out of scope (for this skill)

This skill is **read-only**. Do not promise edits, additions, or deletions until the Phase 2 mutation tools land (`mindmap_add_node` / `mindmap_update_node` / `mindmap_delete_node`). If the user asks to write, explain the limitation and point them at `docs/mcp-plan.md`.
