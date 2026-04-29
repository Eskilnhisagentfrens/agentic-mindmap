# Agentic Mindmap

**English** · [中文](./README.zh.md) · [日本語](./README.ja.md)

A local, XMind-style mindmap that interoperates with LLM agents. Desktop (macOS Electron) and browser modes; **all data stays on your machine**.

> 🤖 **AI Expand**: select any node, click 🤖 in the toolbar, and DeepSeek-reasoner generates 3–5 logical children for it (sub-tasks, sub-topics, key points). The child suggestions inherit the parent's language and avoid duplicating existing children.

## Run

### macOS Desktop (recommended)

```bash
git clone https://github.com/Eskilnhisagentfrens/agentic-mindmap.git
cd agentic-mindmap
npm install      # first time
npm start        # launch
```

Build a `.dmg`:

```bash
npm run dist     # output in dist/
```

### Browser

Just double-click `index.html`, or:

```bash
open index.html
```

To view on a phone, AirDrop or iCloud-sync `index.html` to the device and open it in Safari. The layout is tuned for iPhone 17 Pro (Dynamic Island & notch).

## Setting up AI Expand

The 🤖 button needs an API key — either DeepSeek (recommended, ~30× cheaper) or Anthropic.

**Option A: macOS Keychain (recommended; no shell history footprint):**

```bash
security add-generic-password -a "$USER" -s "DEEPSEEK_API_KEY" -w 'sk-...'
```

**Option B: environment variable (e.g. in `~/.zshrc`):**

```bash
export DEEPSEEK_API_KEY="$(security find-generic-password -a "$USER" -s DEEPSEEK_API_KEY -w)"
# or for Anthropic users:
export ANTHROPIC_API_KEY=sk-ant-...
```

The app reads the key lazily inside the Electron main process. It never lands in `localStorage`, the renderer's memory, or shell history. See [docs/architecture.md](./docs/architecture.md) for the full security model.

## Basic operations

### Keyboard (desktop)

| Action | Shortcut |
| --- | --- |
| Add child node | `Tab` |
| Add sibling | `Enter` |
| Edit selected | `F2` or double-click |
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

### Notes

Toolbar 📝 opens a multiline note panel in the bottom-right. A small blue dot in the top-right of the node indicates a note is present.

### Relations 🔗

Cross-tree connections (independent of parent-child structure):

1. Select source node → click 🔗
2. Click target node to create the relation
3. Double-click the line or label to edit text
4. Single-click to select, `Delete` to remove
5. `Esc` cancels the creation flow

### Summary 📎

Adds a curly brace + summary text over a range of siblings.

1. Select a node → click 📎; the summary attaches to its parent
2. `Shift`-click a sibling to extend the range
3. Double-click the label to edit text
4. Select + `Delete` removes it

### Boundary ⬚

Wraps a branch in a dashed colored frame. Select node → click ⬚ to toggle. Color follows the node by default.

### Outline 📋

Side panel showing the full tree:
- Click a row to jump and center on that node
- Double-click to edit text
- Click the disclosure triangle to collapse / expand

Bidirectional sync with the canvas.

### Layouts

Toolbar 🗺️ / 🌳 toggles:
- **Radial** (default): root centered, children fan left and right
- **Right tree**: root on the left, tree extends right

### Search

`⌘F` opens search; matches highlight while non-matches dim. `Enter` / `⇧Enter` cycles, `Esc` closes. Jumping auto-expands collapsed ancestors and pans the canvas.

## File formats

### JSON (lossless)

Default source format. Preserves structure, icons, colors, notes, sizes, position offsets, relations, summaries, boundaries.

`⌘S` or toolbar 💾 to save.

### Markdown (portable)

Nested lists for hierarchy. Compatible with Obsidian / Typora / GitHub. Preserves text, icons, colors, notes; **relations / summaries / boundaries / sizing are not exported** (kept format-portable).

```markdown
# 🎯 Root <!-- c:#89b4fa -->

- 💡 Branch A <!-- c:#f9e2af -->
  > A note here
  - Idea 1
  - Idea 2
- ⭐ Branch B
```

Rules:
- `#`-prefixed line → root
- Indented `-` / `*` / `+` two spaces deep → child
- Leading emoji → node icon
- Trailing HTML comment `<!-- c:#hex -->` → node color
- `> ` line → node note

`⌘⇧E` or toolbar 📤 to export.

### Image export

- 🖼️ **SVG**: vector, infinitely scalable, re-editable
- 📷 **PNG**: 2× retina

Both include nodes, edges, colors, boundaries, relations, summaries.

## Auto-save

Browser: every change writes to `localStorage`; refresh-safe.

Desktop: same, stored in `~/Library/Application Support/Agentic Mindmap/Local Storage/`. To explicitly persist to a file, `⌘S` exports JSON.

## Project structure

```
agentic-mindmap/
├── index.html         # Single-file web app (~2600 lines, all renderer logic)
├── main.js            # Electron main process — native menu, file dialogs, AI IPC
├── preload.js         # IPC bridge
├── docs/
│   └── architecture.md  # AI Expand architecture & roadmap
├── package.json
└── dist/              # Output of `npm run dist`
```

## Reset / clear

- Toolbar ✨ New: clears the current map (with confirmation)
- Toolbar ⟲: resets the selected node's free position / size / scale
- Full wipe: desktop `rm -rf "~/Library/Application Support/Agentic Mindmap"`; browser DevTools → Application → Local Storage → clear

## Roadmap

- [x] AI Expand button — generate children from any node via DeepSeek-reasoner
- [ ] **MCP server** — expose mindmap as an MCP server so Claude Code / Desktop can read & write the canvas as a tool (no API spend, uses Max OAuth)
- [ ] In-app chat sidebar with bidirectional sync
- [ ] Streaming token-by-token responses for AI Expand
- [ ] In-app Settings UI for API keys & model selection
- [ ] AI mode selector (`brainstorm` / `plan` / `summarize`) per click

## Known limitations

- Markdown import ignores unrecognized syntax
- SVG / PNG export does not embed emoji fonts (relies on system font rendering)
- The first `npm run dist` downloads ~150 MB of Electron build assets
- `npm run dist` produces unsigned DMGs; first launch needs `xattr -cr <app>` or right-click → Open

## License

MIT — see [LICENSE](./LICENSE).
