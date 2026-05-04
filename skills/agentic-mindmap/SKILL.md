---
name: agentic-mindmap
description: Use this skill when the user wants to read, search, browse, edit, add to, delete from, rearrange, or AI-expand their Agentic Mindmap — a local XMind-style mindmap stored at ~/Library/Application Support/Agentic Mindmap/. Triggers include phrases like "my mindmap", "脑图", "思维导图", "agentic mindmap", "find X in my map", "add a branch about Y", "delete the Z node", "rename the parent to W", "expand this branch", or any reference to a node id (UUID-like). The skill orchestrates the mindmap_* MCP tools (read: mindmap_get_state / mindmap_get_subtree / mindmap_search; write: mindmap_add_node / mindmap_update_node / mindmap_delete_node / mindmap_move_node / mindmap_ai_expand) provided by the agentic-mindmap MCP server.
version: 0.2.0
license: MIT
---

# Agentic Mindmap

Help the user read, edit, and orchestrate their **local Agentic Mindmap** through the MCP tools exposed by the `agentic-mindmap` server. As of v0.4 the skill supports both reads (no app required) and writes (require the app to be running).

## When this skill applies

- The user mentions "my mindmap", "脑图", "思维导图", "the map", "the canvas", or "agentic mindmap".
- They want to **search** for a topic across their map ("find everything I have about X").
- They want to **browse** a specific branch ("show me what's under the Japan-market node", "expand the AI Expand subtree").
- They paste or reference a **node id** (UUID-shaped or `n_xxxx`) and ask what's under it.
- They ask the **state** of the mindmap ("how big is my map", "when did I last save", "is the MCP wired up").

## Available tools (provided by the `agentic-mindmap` MCP server)

### Read tools (work whether the app is running or not — backed by snapshot file)

| Tool | Purpose | Key args |
|---|---|---|
| `mindmap_get_state` | Health check + size + last-saved time. Always call this first if unsure whether the server is reachable. | _(none)_ |
| `mindmap_get_subtree` | Return a subtree as nested JSON. Use `nodeId` to target a branch; use `maxDepth` to limit size. | `nodeId?`, `maxDepth?`, `includeNotes?` |
| `mindmap_search` | Case-insensitive substring search over node text and notes. Returns matches with full path from root. | `query`, `limit?`, `includeNotes?` |

### Write tools (require Agentic Mindmap app to be open)

Each write goes through the user's normal undo history — they can hit ⌘Z to revert.

| Tool | Purpose | Key args |
|---|---|---|
| `mindmap_add_node` | Add a child under an existing parent. | `parentId`, `text`, `note?`, `icon?`, `color?`, `position?` |
| `mindmap_update_node` | Patch fields on an existing node (only the ones you set are changed). | `id`, `text?`, `icon?`, `color?`, `note?`, `collapsed?` |
| `mindmap_delete_node` | Delete a node and its entire subtree. Cannot delete the root. | `id` |
| `mindmap_move_node` | Move a node (with subtree) under a different parent. Cycles are refused. | `id`, `newParentId`, `position?` |
| `mindmap_ai_expand` | Run AI Expand on a node — same as the user clicking 🤖. Returns the new child ids. | `nodeId`, `mode?` (`fast` ~5-10s, `quality` ~30-90s) |

## How to respond

1. **Pick the right tool.**
   - Read intents: "find / search / look for / 找 / 搜" → `mindmap_search`. "Show / browse / what's under / 展开 / 看看" + a node → `mindmap_get_subtree`. "How big / status / 状态" → `mindmap_get_state`.
   - Write intents: "add / 新增 / 加 / append" + new node → `mindmap_add_node`. "Rename / fix / 改 / update / 重命名" → `mindmap_update_node`. "Delete / 删除 / remove" → `mindmap_delete_node`. "Move / 移动 / reorganize" → `mindmap_move_node`. "Expand / 拆 / 展开 / brainstorm under" → `mindmap_ai_expand`.
2. **Resolve names to ids.** If the user names a branch by text ("the Japan-market branch") instead of id, run `mindmap_search` first, pick the best match, then operate with that id.
3. **Cap output.** For large subtrees, default `maxDepth: 3`. The user can ask for more.
4. **Render readably.** Default to a Markdown nested list with bolded titles and dimmed notes. Only dump raw JSON if the user asks for it or plans to feed it to another tool.
5. **Cite paths.** When showing search results, include the path from root (`A › B › C`) so the user can locate the node visually.
6. **Confirm before destructive writes.** For `mindmap_delete_node` (or any large `mindmap_move_node` chain), say what you're about to do in one sentence and proceed unless the user has flagged "ask first" — they can always ⌘Z. For non-destructive adds and renames, just do it.
7. **Prefer batches with care.** Don't fire 30 mutations to scaffold a tree — call `mindmap_ai_expand` and let the model do tapered decomposition with sibling-aware context. Reserve direct adds for surgical insertions.

## Errors and recovery

- `Snapshot not found at …` → the user hasn't opened Agentic Mindmap yet, or hasn't made an edit since installing. Tell them: open the app and make any edit (this triggers `save()` which writes the snapshot).
- `No node with id "…"` → the id is stale (node deleted) or wrong. Suggest `mindmap_search` to find the current id.
- `Agentic Mindmap is not running …` (write tools only) → the user closed the app. Mutations require it to be open. Tell them to launch it and retry.
- `code: BUSY` → the user is currently editing that node (cursor inside it). Ask them to commit the edit (Enter / Esc / click away) and retry.
- `code: CYCLE` → a `mindmap_move_node` would put a node inside its own subtree. Re-plan the move.
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

## Example flows (write)

**User: "在我的脑图根节点下加一个『AI 培训公司日本市场』的分支，再让 AI 自动展开"**
→ `mindmap_get_state()` to find rootId.
→ `mindmap_add_node({ parentId: <rootId>, text: "AI 培训公司日本市场", icon: "🇯🇵" })`.
→ Capture the new node's id from the response.
→ `mindmap_ai_expand({ nodeId: <newId>, mode: "fast" })`.
→ Reply: "已加入分支并展开 N 个子节点（fast 模式 ~6s）"。

**User: "把『定价模型』改名为『定价与盈利模型』"**
→ `mindmap_search({ query: "定价模型", limit: 5 })` to find the id.
→ `mindmap_update_node({ id: <id>, text: "定价与盈利模型" })`.

**User: "把市场分析整个分支挪到『商业计划』下面"**
→ Two `mindmap_search` calls to resolve both ids.
→ `mindmap_move_node({ id: <market-analysis-id>, newParentId: <business-plan-id> })`.

**User: "删掉那条『不要做的功能』分支"**
→ Resolve id via `mindmap_search`.
→ Confirm in one sentence: "Will delete the '不要做的功能' branch and its N descendants — proceed (you can ⌘Z to undo)."
→ `mindmap_delete_node({ id: <id> })`.

## Style for writes

- Match the user's language in the new node's `text` and `note` (Chinese in → Chinese out).
- Add a `note` only when it carries useful context the title doesn't (a number, an entity, a tradeoff). Don't pad with filler.
- For `mindmap_add_node` followed by `mindmap_ai_expand`, set the new node's text precisely — that text is the prompt the model uses to decompose.
