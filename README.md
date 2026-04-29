# Agentic Mindmap

**English** · [中文](./README.zh.md) · [日本語](./README.ja.md)

A local, XMind-style mindmap that interoperates with LLM agents. Desktop (macOS Electron) and browser modes; **all data stays on your machine**.

> 🤖 **AI Expand**: select any node, click 🤖 in the toolbar, and the model auto-classifies the node, picks the best decomposition method, and chooses the depth (1–3 layers) based on complexity. Each generated child carries a one-sentence "why" explaining its role — visible inline on the canvas, no panel-opening required.

## Install

### Download a release (no build required)

[**Latest release**](https://github.com/Eskilnhisagentfrens/agentic-mindmap/releases/latest) — DMGs for Apple Silicon and Intel Macs.

```bash
# First launch needs Gatekeeper bypass (DMG is unsigned):
xattr -cr "/Applications/Agentic Mindmap.app"
```

### Build from source (developers)

```bash
git clone https://github.com/Eskilnhisagentfrens/agentic-mindmap.git
cd agentic-mindmap
npm install      # first time
npm start        # launch
npm run dist     # produce .dmg in dist/
```

### Browser

Just double-click `index.html`, or:

```bash
open index.html
```

To view on a phone, AirDrop or iCloud-sync `index.html` and open it in Safari. The layout is tuned for iPhone 17 Pro (Dynamic Island & notch).

## Setting up AI Expand

🤖 needs an API key — DeepSeek (recommended, ~30× cheaper than Anthropic) or Anthropic.

**Recommended: macOS Keychain (no shell history footprint)**

```bash
security add-generic-password -a "$USER" -s "DEEPSEEK_API_KEY" -w 'sk-...'
```

Get a DeepSeek key at https://platform.deepseek.com (international) or use Anthropic at https://console.anthropic.com.

**Alternative: environment variable** (e.g. in `~/.zshrc`):

```bash
export DEEPSEEK_API_KEY="$(security find-generic-password -a "$USER" -s DEEPSEEK_API_KEY -w)"
# or:
export ANTHROPIC_API_KEY=sk-ant-...
```

The key is loaded lazily inside the Electron main process. It never lands in `localStorage`, the renderer's memory, or shell history. See [docs/architecture.md](./docs/architecture.md) for the full security model.

## How AI Expand actually works

When you click 🤖 on a node:

1. The model **detects the kind of node** — goal, concept, question, option, process, or artifact.
2. It **judges complexity and picks depth (1–3 layers)** — atomic tasks like "重启路由器" stop at depth 1; multi-phase projects like "搭建 SaaS 产品" reach depth 3 with up to 40 nodes total. Tapered branching prevents runaway trees (3-6 top, 2-4 mid, 2-3 deep).
3. It **applies the right decomposition approach** for that kind — verb-led tasks for goals, sub-concepts for topics, comparison dimensions for options, etc.
4. **Sibling-aware**: existing peers at the same depth are passed to the model so generated children match the surrounding tree's style and granularity.
5. Each child carries a **multi-sentence "why"** explaining its role; the first ~3 lines render inline on the canvas as a subtitle under the title (with a blue dot indicator). Click 📝 for the full text.
6. The prompt explicitly demands **named entities** (real companies, regulations, products), **load-bearing numbers** (prices, deadlines, market sizes), and **concrete recommendations** — generic categories are an explicit failure mode.

A pulsing 🤖 progress overlay shows live elapsed time, a 4-phase status text, and an asymptotic progress bar (never reaches 100% until the response actually arrives, so no "stuck at 99%" feel).

## Basic operations

### Keyboard (desktop)

| Action | Shortcut |
| --- | --- |
| Add child node | `Tab` |
| Add sibling | `Enter` |
| Edit selected | `F2` or double-click |
| **Select all in editing node** | `⌘A` (or enter edit mode + select all) |
| **Copy node subtree as Markdown** | `⌘C` |
| **Paste Markdown outline as children** | `⌘V` |
| Delete | `Delete` / `Backspace` |
| Arrow navigation | `← ↑ → ↓` |
| Collapse / expand | `Space` or click the dot on the right of a node |
| Undo / redo | `⌘Z` / `⇧⌘Z` |
| Search | `⌘F`, `Enter` / `⇧Enter` to cycle |
| Fit to view | `⌘0` |
| Zoom canvas | `⌘=` / `⌘-` or scroll |
| Zoom node sizes | `⌘⇧=` / `⌘⇧-` |
| New | `⌘N` |
| Open | `⌘O` |
| Save JSON | `⌘S` |
| Export Markdown | `⌘⇧E` |
| **Export PDF** | `⌘P` |
| Outline view | `⌘⇧O` |
| Fullscreen | `⌃⌘F` |
| DevTools | `⌥⌘I` |

### Mouse / touch

- **Drag a node**:
  - Drop in the middle of another → becomes its child
  - Drop on the top / bottom edge → previous / next sibling
  - Drop on empty space → free position (the whole subtree follows; green dashed outline)
  - Press `Esc` mid-drag to cancel
- **Resize a node** (handles appear when selected):
  - Bottom-right dot → free width & height
  - Right edge → width only (text wraps)
  - Bottom edge → height only
  - `Shift` + bottom-right → proportional
- **Canvas**:
  - Scroll / two-finger trackpad → pan
  - `⌘` + scroll / pinch → zoom
  - Drag empty space → pan canvas

### iPhone

- Tap to select; double-tap or long-press to edit
- Bottom toolbar: add child, add sibling, icon, color, note, delete
- Pinch to zoom, single-finger pan
- Other features via the top toolbar

## Advanced features

### Color & icons

Toolbar 🎨 colors a node with a 12-swatch palette. **Children inherit the nearest colored ancestor**, and edge colors follow the branch. To override on a child, set its color explicitly.

Toolbar 😀 attaches an icon (24 common emoji).

### Notes & inline previews

Toolbar 📝 opens a multiline note panel in the bottom-right. A small blue dot in the top-right of the node indicates a note is present. **AI-generated children automatically populate the note with the model's "why" — visible inline on the canvas without opening the panel.**

### Relations 🔗 / Summary 📎 / Boundary ⬚ / Outline 📋 / Search

Same as before — see in-app Help (⌘?) for full details.

### Layouts

Toolbar 🗺️ / 🌳 toggles **Radial** (default) and **Right tree**.

## File formats

### JSON (lossless)

Default source format. Preserves structure, icons, colors, notes, sizes, position offsets, relations, summaries, boundaries.

`⌘S` or toolbar 💾 to save.

### Markdown (portable)

Nested lists for hierarchy. Compatible with Obsidian / Typora / GitHub. Preserves text, icons, colors, notes.

```markdown
# 🎯 Root <!-- c:#89b4fa -->

- 💡 Branch A <!-- c:#f9e2af -->
  > A note here
  - Idea 1
- ⭐ Branch B
```

`⌘⇧E` or toolbar 📤 to export.

### OPML (XMind / MindNode / Logseq compatible)

Standard OPML 2.0. Importable into **XMind**, **MindNode**, **Logseq**, **iThoughts**, **Workflowy**, **OmniOutliner** for continued editing in a different tool.

Toolbar 🌳 to export.

### PDF (vector)

Native vector PDF via Electron's `printToPDF` (A3 landscape). Infinitely zoomable, no rasterization.

`⌘P` or toolbar 📄 to export. Browser version falls back to the print dialog ("Save as PDF").

### Image export

- 🖼️ **SVG**: vector, infinitely scalable, re-editable
- 📷 **PNG**: 2× retina

Both include nodes, edges, colors, boundaries, relations, summaries.

## Reporting issues

In-app: **Help → 报 Bug** opens a prefilled GitHub issue with version, OS, Electron version, and the path to the local log file. **Help → 打开日志文件夹** opens `~/Library/Logs/Agentic Mindmap/` directly.

Logs include every AI call (timestamp, latency, detected_kind, depth) and any errors with stack traces.

## Auto-save

Browser: every change writes to `localStorage`; refresh-safe.

Desktop: same, stored in `~/Library/Application Support/Agentic Mindmap/Local Storage/`. To explicitly persist to a file, `⌘S` exports JSON.

## Project structure

```
agentic-mindmap/
├── index.html           # Single-file web app (~2700 lines, all renderer logic)
├── main.js              # Electron main: native menu, file dialogs, AI IPC, logging
├── preload.js           # IPC bridge
├── docs/
│   └── architecture.md  # AI Expand architecture & MCP roadmap
├── package.json
└── dist/                # Output of `npm run dist`
```

## Reset / clear

- Toolbar ✨ New: clears the current map (with confirmation)
- Toolbar ⟲: resets the selected node's free position / size / scale
- Full wipe: desktop `rm -rf "~/Library/Application Support/Agentic Mindmap"`; browser DevTools → Application → Local Storage → clear

## Roadmap

### Done in v0.2.0
- [x] **AI Expand** — single-button smart decompose (auto kind detection + depth 1-3 + sibling-aware + per-child why)
- [x] **PDF export** (vector, ⌘P)
- [x] **OPML export** (XMind / MindNode / Logseq compatible)
- [x] **Clipboard ops** (⌘C subtree as MD / ⌘V MD as children / ⌘A select-all in edit)
- [x] **Inline note preview** on canvas
- [x] **Progress overlay** with live elapsed + phase + asymptotic bar
- [x] **Logging & friendly errors** (electron-log + 9-case error mapping + Help menu reporting)

### Coming
- [ ] **MCP server** — expose mindmap as an MCP server so Claude Code / Desktop can read & write the canvas as a tool (no API spend, uses Max OAuth)
- [ ] In-app **Settings UI** for API keys, model selection, quality/speed presets
- [ ] **Streaming** token-by-token responses for AI Expand
- [ ] **App icon + code signing & notarization** (remove `xattr -cr` step)
- [ ] In-app chat sidebar with bidirectional sync

## Known limitations

- Markdown import ignores unrecognized syntax
- SVG / PNG export does not embed emoji fonts (relies on system font rendering)
- The first `npm run dist` downloads ~150 MB of Electron build assets
- DMG is unsigned; first launch needs `xattr -cr <app>` or right-click → Open

## License

MIT — see [LICENSE](./LICENSE).
