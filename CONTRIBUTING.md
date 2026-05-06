# Contributing to agentic-mindmap

This is an alpha-stage project — one primary author, no release cadence, no roadmap guarantees. That's not a warning to stay away; it's an invitation to shape things early. Contributions here have more influence than on a mature project.

## Before you open a PR

**Open an issue first.** Not because of process, but because direction can shift fast at this stage and I don't want you to spend time on something I'm about to rethink. A short issue ("I want to fix X because Y") takes five minutes and saves both of us.

Exceptions: typos, broken links, one-line fixes — go ahead and PR directly.

## What's most useful right now

In rough priority order:

1. **Failure modes from real use** — if a prompt in `prompts/` gave you wrong or misleading output on a real paper, that's the highest-value thing you can report. Include the paper title, which prompt failed, and what the output got wrong.

2. **Worked examples** — a new entry in `examples/` showing the workflow applied to a paper in your domain. Non-CS papers especially welcome.

3. **Prompt improvements** — if you've iterated on one of the `prompts/` templates and found better output, open an issue with before/after and reasoning. I'll test and incorporate.

4. **App bugs** — standard bug report: OS, version, steps to reproduce, what happened, what you expected.

5. **New prompt passes** — if you think there's a missing step in the workflow (e.g. a "methodology assessment" pass), open an issue to discuss before writing it.

## What I'm not looking for right now

- Dependency upgrades unless they fix a known vulnerability
- Refactors to the Electron renderer (`index.html`) — it's a deliberate single-file architecture
- New features without a prior issue discussion

## How to set up locally

```bash
git clone https://github.com/EskilXu/agentic-mindmap.git
cd agentic-mindmap
npm install
npm start
```

Tests:
```bash
npm test
```

## Prompt contributions

The `prompts/` directory uses plain Markdown with `INPUT / INSTRUCTION / OUTPUT FORMAT` sections. If you improve a prompt:

1. Keep the JSON output schema compatible (or flag the breaking change in the PR)
2. Show a concrete before/after example in the PR description
3. Note which paper you tested it on

## Code style

No linter configured yet. Match the style of the file you're editing. Prefer clarity over cleverness — this codebase is meant to be readable by people who are learning JavaScript alongside using it.

## License

By contributing, you agree your contributions will be licensed under the project's MIT license.

---

Questions? Open an issue or email eskilca2024 [at] gmail [dot] com.
