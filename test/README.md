# Tests

Three layers, run with different cadence and cost.

## Layout

```
test/
├── unit/                 — pure functions, no I/O. Run on every commit.
│   └── mcp-lib.test.js   — tree helpers (findNode / trimTree / countNodes / searchTree)
├── integration/          — spawns processes, fixture filesystem. Run on PRs.
│   └── mcp-stdio.test.js — drives mcp/server.js over real stdio JSON-RPC
└── prompt/               — live-API evals. Run before releases or after prompt changes.
    └── language-match.eval.js — checks output language matches parent language
```

## Commands

| Goal | Command | Cost |
|---|---|---|
| Fast sanity (~50ms) | `npm run test:unit` | free |
| Full local run (~3s) | `npm test` | free (unit + integration) |
| Prompt regression | `npm run eval:prompt` | ~$0.001 / case (DeepSeek-chat × 4 cases) |
| Single file | `node --test test/unit/mcp-lib.test.js` | free |

`npm test` skips the `prompt/` evals automatically (those have a `.eval.js` suffix and run only via `eval:prompt`).

## TDD workflow

1. **Bug or feature** → write a failing test that captures the desired behaviour. Use `unit/` for pure logic, `integration/` for process boundaries.
2. **Implement** the smallest change that makes it pass.
3. **Refactor** with confidence; the test now guards against regression.
4. **For prompt changes** → write a `*.eval.js` assertion FIRST (e.g. "input X must produce output property Y"), then iterate the prompt until the eval passes.
5. **Pre-release** → run all three layers (`npm test && npm run eval:prompt`).

## Prompt evals — cost & determinism

LLM output is non-deterministic. The eval files therefore:
- Assert on **invariants** (language match, no placeholders, has at least N children) rather than exact strings.
- Use the cheaper `deepseek-chat` model so the eval suite costs <1¢ per full run.
- Are **skipped** if `DEEPSEEK_API_KEY` is not in env or Keychain — CI without the secret won't fail.

To add a new prompt invariant:
1. Drop a representative parent text into the eval.
2. Define the invariant as a pure-JS check on the parsed JSON.
3. Iterate the prompt in `main.js` until it passes.

## Coverage roadmap

| Area | Status | Notes |
|---|---|---|
| MCP read tool helpers | ✅ unit + integration | `mcp/lib.js` is fully covered |
| MCP stdio JSON-RPC surface | ✅ integration | `tools/list` + `mindmap_get_state` + `mindmap_search` |
| MCP write tools (HTTP control) | ⏳ next | needs a fake Electron HTTP server fixture |
| Renderer pure helpers (toMarkdown, parseMarkdown, pathToNode) | ⏳ next | extract to `renderer/lib.js` then mirror tree-helper tests |
| AI Expand prompt — language match | ✅ eval | en / zh / ja covered |
| AI Expand prompt — specificity | ⏳ next | invariant: "title must contain a digit OR an entity name with ≥2 capitals" |
| AI Expand prompt — depth judgement | ⏳ next | invariant: "去买牛奶" → depth 1; "搭建 SaaS 产品" → depth 2-3 |
| Friendly error mapping | ⏳ next | extract `friendlyError` from `main.js` to `lib/friendly-error.js` |
| Electron app E2E | ⏭ later | Playwright Electron driver, run on PRs to renderer |

## Running on CI

GitHub Actions, suggested workflow:

```yaml
- run: npm ci
- run: npm run test:unit       # fast, always
- run: npm test                 # full unit + integration
# eval:prompt only on tag pushes (uses DEEPSEEK_API_KEY secret)
```

## Why node:test (no Jest / Vitest)

- Built into Node 20+ → zero dev dependency
- Native ESM/CJS support, no transpiler
- Same `assert` library used by node-core
- Output is parseable by GitHub Actions out of the box (TAP)

If we later need watch mode or rich diffs we can swap to Vitest with minimal API change — `test()` and `assert.equal()` survive the transition.
