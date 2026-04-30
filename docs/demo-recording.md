# Demo recording recipe

Goal: a ~10-second gif at the top of the README showing **Claude searching a real mindmap via the MCP plugin**. This file is the script + the toolchain so anyone (you, contributors) can re-record cleanly.

## What the demo should show

1. Open Claude Code or Claude Desktop with the `agentic-mindmap` plugin installed.
2. User types: **"我的脑图里关于 MCP 的部分？"** (or in English: *"What's in my mindmap about MCP?"*).
3. The tool call surface appears — `mindmap_search({ query: "MCP" })`.
4. The tool returns a JSON list of matches with paths.
5. Claude's response renders the matches as a tidy nested bullet list with paths.

Total runtime: 8–12 seconds. Skip the typing animation if too slow — start the recording right before the user hits enter.

## Recording (macOS, no extra apps)

```
⌘⇧5  →  "Record Selected Portion"  →  drag a ~1280×800 frame  →  Record
```

Save to `~/Desktop/demo.mov`. Trim with QuickTime if needed (`Edit → Trim`).

## Converting `.mov` → `.gif`

The cleanest pipeline (small files, sharp text) is **ffmpeg + gifski**:

```bash
brew install ffmpeg gifski

# 1. Extract frames at 12 fps, scale to ~720px wide
ffmpeg -i ~/Desktop/demo.mov -vf "fps=12,scale=720:-1:flags=lanczos" -y /tmp/demo-%04d.png

# 2. Encode with gifski — quality 90, ~2-3 MB target
gifski --fps 12 --quality 90 -o docs/demo.gif /tmp/demo-*.png

# 3. Cleanup
rm /tmp/demo-*.png
```

## Size budget

| Width | FPS | Length | Target |
|---|---|---|---|
| 720 px | 12 | 8–12 s | ≤ 3 MB |

GitHub renders gifs up to 10 MB inline; under 3 MB keeps the README snappy on slow connections.

## Update the README

Once `docs/demo.gif` exists, in `README.md` swap the `<em>` placeholder paragraph for:

```html
<p align="center">
  <img src="./docs/demo.gif" width="720" alt="Claude searching a local mindmap via MCP">
</p>
```

## Tips

- **Hide your toolbar** in Claude Desktop while recording — it dates the gif and adds visual noise.
- **Use a fresh-but-realistic mindmap.** A 3-node example feels toy; 30+ nodes feels real. Open `~/projects/mindmap` or your own working map.
- **Match light/dark to the README's expected viewer.** GitHub's default is light — record on a light theme so the gif doesn't fight the page.
- Pre-warm the MCP server: run one query before recording so the cold-start delay doesn't pad the gif.
