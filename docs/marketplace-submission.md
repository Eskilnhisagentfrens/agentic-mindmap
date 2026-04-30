# Plugin marketplace submission — `claude-plugins-official`

This file is the form-ready submission text for getting Agentic Mindmap listed in the official Claude Code plugin marketplace, so users can `/plugin install agentic-mindmap@claude-plugins-official` (no GitHub username needed) and discover it via `/plugin > Discover`.

## Submit via

**Form:** https://clau.de/plugin-directory-submission

**Marketplace repo:** the form routes to the curators of [claude-plugins-official](https://github.com/anthropics/claude-plugins) (Anthropic team).

## Pre-flight checklist

- [x] `.claude-plugin/plugin.json` exists with `name`, `description`, `author`, `license`
- [x] `.mcp.json` uses `${CLAUDE_PLUGIN_ROOT}` so paths resolve on any machine
- [x] At least one skill in `skills/<name>/SKILL.md` with a real `description` (trigger conditions)
- [x] LICENSE file at repo root (MIT)
- [ ] **A real demo gif at the top of the README** — single biggest factor for approval and adoption (see `docs/demo-recording.md`)
- [ ] Tagged release on GitHub (`v0.3.0`) so the marketplace can pin a stable `ref`
- [ ] End-to-end test on a clean machine: `/plugin install <gh-user>/agentic-mindmap` → tools appear → search works
- [ ] Add a 2-3 line "Privacy & data" note to the README — what the MCP reads, what stays local, what never leaves the machine. Marketplace reviewers care about this.

## Form-ready text

### Plugin name
```
agentic-mindmap
```

### Description (1-2 sentences, action-focused, ≤200 chars)
```
Read, search, and browse your local Agentic Mindmap from Claude Code or Desktop. Bundles an MCP server (3 read-only tools) and a skill that auto-routes natural-language queries to the right tool. Read-only in v0.3; mutations coming in v0.4.
```

### Category
```
productivity
```

### Source (matches marketplace.json schema)
```json
{
  "name": "agentic-mindmap",
  "description": "Read, search, and browse your local Agentic Mindmap from Claude Code or Desktop. Bundles an MCP server (3 read-only tools) and a skill that auto-routes natural-language queries to the right tool.",
  "author": {
    "name": "Eskil",
    "url": "https://github.com/Eskilnhisagentfrens"
  },
  "category": "productivity",
  "source": {
    "source": "url",
    "url": "https://github.com/Eskilnhisagentfrens/agentic-mindmap.git",
    "ref": "v0.3.0"
  },
  "homepage": "https://github.com/Eskilnhisagentfrens/agentic-mindmap"
}
```

### Author / contact
- GitHub: `Eskilnhisagentfrens`
- Repo homepage: https://github.com/Eskilnhisagentfrens/agentic-mindmap

### One-line elevator pitch (for the form's optional "why this plugin" field)
```
A local mindmap that Claude can read, search, and reason over via MCP — local-first, no API key needed for queries (uses Claude Max OAuth), $0 per query.
```

## After submission

Expect 1-2 rounds of review:
1. **Technical review** — does `/plugin install` resolve cleanly? Do the tools register? Does the skill description trigger appropriately and not fight existing skills?
2. **Quality review** — is the demo persuasive, is the README clear about the security boundary, is the project actively maintained?

If accepted, the plugin appears in `/plugin > Discover` and is installable as `agentic-mindmap@claude-plugins-official` (shorter than the GitHub-based path).

## Don't submit until

- The demo gif is live in the README. Submission without it is wasted attempts — the reviewers and end users both judge by the gif.
- A v0.3.0 tag exists, so the marketplace pins a fixed ref instead of chasing main.
