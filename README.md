# agentic-mindmap

> **Cognitive-map exploration of long-form research using Claude.**
> A local mindmap app — and a structured prompt workflow — built to fight the *fluency-is-not-truth* failure mode.

[![Status](https://img.shields.io/badge/status-alpha-orange)]() [![License](https://img.shields.io/badge/license-MIT-blue)]() [![Built with Claude](https://img.shields.io/badge/built%20with-Claude%20Code-purple)]()

**English** · [中文](./README.zh.md) · [日本語](./README.ja.md)

---

## The problem

When you ask an LLM to "summarize this 60-page paper," what comes back is usually fluent and usually wrong in subtle ways. Claims get conflated with their support. Tentative findings get reported as conclusions. Disputed methodology gets flattened. Whatever the paper *actually says* gets mixed with the model's prior expectations of what it should say.

This is one specific instance of the broader failure mode I call **fluency-is-not-truth** — the structural cognitive risk humans and machines share. It's the most operationally dangerous thing about the current generation of LLMs, and it doesn't get solved by prompting more carefully.

## What this is

`agentic-mindmap` is two things that compose:

**1. A local Electron mindmap app** — XMind-style, local-first. Your data never leaves your machine. Claude can read and edit your live mindmap via MCP while you work alongside it. See [The App](#the-app) section below for full feature details.

**2. A paper-reading workflow** — a set of structured Claude prompts in `prompts/` that turn a long document into an explorable cognitive map showing:
- The actual claims the paper makes (extracted, deduplicated, ranked by load-bearing weight)
- The evidence each claim rests on (direct vs. derived vs. assumed)
- The uncertainty per claim (Claude's calibrated estimate + reasoning trace)
- The contradictions and tensions between claims (which linear text routinely hides)

The app is the thinking surface. The prompts are the workflow. They're designed to be used together but work independently.

## Why mindmap, not summary

Linear summaries lose structure. Bullet lists don't show which claims depend on which. A mindmap forces the model — and you, the reader — to commit to a topological view: where the load-bearing assumption lives, where the empirical evidence cluster sits, where the unproven inference jumps out.

The map is meant to be **read together with the paper, not as a replacement**. If you only ever read the map, you've recreated the original problem one level up. See [`docs/why_mindmap_not_summary.md`](./docs/why_mindmap_not_summary.md) for the longer argument.

## The paper-reading workflow

```
[your paper PDF]
      ↓
  src/extract.py          → chunks by section → stdout
      ↓
  prompts/ (run each pass in Claude.ai or Claude Code):
   1. claims_extraction.md      → claims JSON
   2. evidence_pass.md          → evidence per claim JSON
   3. confidence_scoring.md     → confidence + reasoning JSON
   4. contradiction_surfacing.md → tensions map
      ↓
[structured Markdown output]
      ↓
[paste into agentic-mindmap app → use AI Expand + MCP to explore]
```

See `prompts/` for prompt templates and `examples/` for a worked walkthrough using Anthropic's [Constitutional AI paper](https://arxiv.org/abs/2212.08073).

## Status

**Alpha. Primary user: me. No tests for the workflow prompts. Use at your own risk.**

The Electron app (v0.4.0) is more stable than the workflow layer — the MCP server and AI Expand have integration tests. The prompt workflow is personal research practice that I'm sharing because the problem matters more than my embarrassment about the current shape.

## Why I'm building this

I spent four years at GoPlus Security building defensive infrastructure for Web3. Across that time, the deepest pattern I noticed across human and machine failure modes was: **confident articulation precedes verification, and the gap between articulation and verification is where catastrophic failure lives**. This is the same pattern in a smart contract exploit and in a model hallucination.

Anthropic's [Constitutional AI methodology](https://www.anthropic.com/constitution) is the most serious public attempt I've seen to address this gap at the model level. `agentic-mindmap` is my attempt to address it at the *workflow* level — for a single human reading a single document with a single LLM. The two should compose.

I work in [Vitalik Buterin's d/acc framework](https://vitalik.eth.limo/general/2023/11/27/techno_optimism.html) — differentially accelerate the defensive, decentralized, and accessible. A tool that helps non-engineers think more carefully with LLMs is, in a small way, defensive infrastructure.

---

## The App

### Install

#### Download a release (no build required)

[**Latest release**](https://github.com/EskilXu/agentic-mindmap/releases/latest) — DMGs for Apple Silicon and Intel Macs.

```bash
# First launch needs Gatekeeper bypass (DMG is unsigned):
xattr -cr "/Applications/Agentic Mindmap.app"
```

#### Build from source

```bash
git clone https://github.com/EskilXu/agentic-mindmap.git
cd agentic-mindmap
npm install
npm start        # launch
npm run dist     # produce .dmg in dist/
```

#### Browser (no install)

```bash
open index.html
```

### Two flagship features

**🤖 AI Expand** — select any node, click 🤖, and Claude auto-classifies it, picks the best decomposition, and generates 3–8 children with a one-line "why" on each. Fast mode (~5–10s) or Quality mode (~30–90s).

**🔌 MCP integration** — Claude Code and Claude Desktop can read and edit your live mindmap via 8 tools:
- Reads: `mindmap_get_state` / `mindmap_get_subtree` / `mindmap_search` (work without the app open)
- Writes: `mindmap_add_node` / `mindmap_update_node` / `mindmap_delete_node` / `mindmap_move_node` / `mindmap_ai_expand` (require the app open; all writes go through undo history — ⌘Z reverts any Claude-driven change)

Uses your Claude Max OAuth → **$0 per query**.

### Setting up AI Expand

🤖 needs an API key — DeepSeek (recommended, ~30× cheaper) or Anthropic.

```bash
# Recommended: macOS Keychain (no shell history footprint)
security add-generic-password -a "$USER" -s "DEEPSEEK_API_KEY" -w 'sk-...'
# or:
security add-generic-password -a "$USER" -s "ANTHROPIC_API_KEY" -w 'sk-ant-...'
```

### Use with Claude Code (plugin, one shot)

```
/plugin install EskilXu/agentic-mindmap
```

This wires up both the MCP server and an `agentic-mindmap` skill that teaches Claude when to use the tools.

### Use with Claude Desktop (manual MCP config)

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "agentic-mindmap": {
      "command": "node",
      "args": ["/absolute/path/to/agentic-mindmap/mcp/server.js"]
    }
  }
}
```

Fully quit Claude (`⌘Q`) and re-open.

### Keyboard shortcuts

| Action | Shortcut |
|---|---|
| Add child node | `Tab` |
| Add sibling | `Enter` |
| Edit selected | `F2` or double-click |
| Copy node subtree as Markdown | `⌘C` |
| Paste Markdown outline as children | `⌘V` |
| Delete | `Delete` / `Backspace` |
| Undo / redo | `⌘Z` / `⇧⌘Z` |
| Search | `⌘F` |
| Fit to view | `⌘0` |
| New | `⌘N` |
| Open | `⌘O` |
| Save JSON | `⌘S` |
| Export Markdown | `⌘⇧E` |
| Export PDF | `⌘P` |
| Outline view | `⌘⇧O` |

### File formats

- **JSON** — lossless source format (`⌘S`)
- **Markdown** — nested lists, Obsidian / Typora / GitHub compatible (`⌘⇧E`)
- **OPML** — importable into XMind, MindNode, Logseq, iThoughts
- **PDF** — vector, A3 landscape (`⌘P`)
- **SVG / PNG** — 2× retina

### Project structure

```
agentic-mindmap/
├── index.html           # Single-file web app (renderer)
├── main.js              # Electron main: native menu, file dialogs, AI IPC
├── preload.js           # IPC bridge
├── mcp/                 # MCP server (8 tools)
├── skills/              # Claude Code skill definition
├── prompts/             # Paper-reading workflow prompts ← new
├── examples/            # Worked examples ← new
├── src/                 # PDF extraction stub ← new
├── docs/                # Architecture + design essays
└── test/                # Unit + integration tests
```

---

## Roadmap

### Done (v0.4.0)
- [x] MCP write tools — add / update / delete / move / ai_expand nodes
- [x] MCP read tools — get_state / get_subtree / search
- [x] Streaming AI Expand with fast/quality mode picker
- [x] Claude Code plugin (`/plugin install`)
- [x] PDF / OPML / SVG / PNG export

### Workflow layer (in progress)
- [x] claims_extraction prompt
- [x] evidence_pass prompt
- [x] confidence_scoring prompt
- [x] contradiction_surfacing prompt
- [ ] Multi-document synthesis (2 papers → contradiction map)
- [ ] Anthropic API native (Claude Code → Claude API direct)
- [ ] Web UI for non-CLI users

## Contributing

If you've felt the fluency-is-not-truth problem, open an issue. PRs welcome — please open an issue first to align on direction. See [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

MIT — see [LICENSE](./LICENSE).

---

*Built with Claude Code by [Eskil (Yufeng Xu)](https://github.com/EskilXu). Part of the d/acc — defensive, decentralized, accessible — building thread.*
