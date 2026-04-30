# Changelog

## v0.3.0 — Claude reads your mindmap

### Added
- **MCP server (read-only)** at `mcp/server.js` — exposes three tools over stdio:
  - `mindmap_get_state` — last-saved time, node count, layout mode
  - `mindmap_get_subtree({ nodeId?, maxDepth?, includeNotes? })` — return any branch as nested JSON
  - `mindmap_search({ query, limit?, includeNotes? })` — substring search with path-from-root
- **Claude Code plugin packaging** — repo is now `/plugin install`-able. Bundles:
  - `.claude-plugin/plugin.json` — manifest
  - `.mcp.json` — uses `${CLAUDE_PLUGIN_ROOT}` so the path resolves on any machine
  - `skills/agentic-mindmap/SKILL.md` — teaches Claude when to invoke the tools
- **Snapshot mirror** — Electron renderer pushes the tree to `app.getPath('userData')/mcp-snapshot.json` on every `save()`, atomic write (temp + rename). The MCP server reads from there; the app does NOT need to be running.
- **Architecture & roadmap docs** — `docs/mcp-plan.md` covers Phase 1 (this release), Phase 2 (mutations), Phase 3 (live bidirectional sync).

### Changed
- README rewritten to lead with the outcome ("Claude can read, search, and expand your local mindmap") and the one-line plugin install. Roadmap reorganized to reflect the read-only ship.

### Notes
- Mutations are deferred to v0.4. Phase 2 design is in `docs/mcp-plan.md` — open to feedback before implementation.
- The Electron app must be opened once after upgrading so the renderer writes the first `mcp-snapshot.json`.

### Known gaps
- No demo gif in README yet — recording recipe at `docs/demo-recording.md`. PRs welcome.
- DMG bundle does not include `mcp/`; users currently need the cloned repo for the plugin path. To be addressed in v0.3.1.

## v0.2.0
- AI Expand: smart decompose, depth 1-3, sibling-aware, per-child why
- PDF / OPML export, clipboard ops, inline note preview, progress overlay
- electron-log + 9-case friendly error mapping

## v0.1.0
- Initial XMind-style mindmap (Electron + browser), JSON / Markdown import & export
