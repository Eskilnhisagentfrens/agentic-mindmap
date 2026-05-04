// Prompt regression eval — checks that the SMART_DECOMPOSE_SYSTEM_PROMPT in
// main.js produces output in the parent's language across English / 中文 /
// 日本語. This is an EVAL not a unit test: it costs API credits and is
// non-deterministic. Run via `npm run eval:prompt`.
//
// Skipped automatically if DEEPSEEK_API_KEY is not in env or Keychain.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const Anthropic = require('@anthropic-ai/sdk');

function loadKey() {
  if (process.env.DEEPSEEK_API_KEY) return process.env.DEEPSEEK_API_KEY;
  if (process.platform === 'darwin') {
    try {
      const out = execFileSync('security',
        ['find-generic-password', '-a', process.env.USER, '-s', 'DEEPSEEK_API_KEY', '-w'],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
      if (out) return out;
    } catch (_) {}
  }
  return null;
}

const KEY = loadKey();

const MAIN_JS = fs.readFileSync(path.resolve(__dirname, '..', '..', 'main.js'), 'utf8');
const promptMatch = MAIN_JS.match(/const SMART_DECOMPOSE_SYSTEM_PROMPT = `([\s\S]+?)`;/);
const SYSTEM_PROMPT = promptMatch && promptMatch[1].replace(/\$\{MAX_TOTAL_NODES\}/g, '40');

function stripFence(text) {
  const t = String(text).trim();
  const m = t.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/);
  return m ? m[1].trim() : t;
}

async function runExpand(parentText) {
  const client = new Anthropic({ apiKey: KEY, baseURL: 'https://api.deepseek.com/anthropic' });
  const r = await client.messages.create({
    model: 'deepseek-chat',
    max_tokens: 6000,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: `Parent node: "${parentText}"\n\nNow detect kind, decide depth, and decompose.` }],
  });
  const txt = r.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
  return JSON.parse(stripFence(txt));
}

// Simple language detector — checks for CJK / Latin / Hiragana-Katakana ranges.
function dominantScript(s) {
  const text = String(s || '');
  let cjk = 0, kana = 0, latin = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp >= 0x3040 && cp <= 0x30FF) kana++;       // hiragana + katakana
    else if (cp >= 0x4E00 && cp <= 0x9FFF) cjk++;   // CJK ideographs
    else if ((cp >= 0x41 && cp <= 0x5A) || (cp >= 0x61 && cp <= 0x7A)) latin++;
  }
  if (kana > 0) return 'ja';
  if (cjk > latin) return 'zh';
  if (latin > 0) return 'en';
  return 'unknown';
}

test('eval: prompt is loaded from main.js', () => {
  if (!SYSTEM_PROMPT) {
    assert.fail('SMART_DECOMPOSE_SYSTEM_PROMPT not found in main.js');
  }
  assert.match(SYSTEM_PROMPT, /LANGUAGE/, 'prompt should have a LANGUAGE section');
});

// Wrap each live-API eval so node:test's `{ skip }` only fires when truly
// missing the key. Passing `{ skip: null }` confuses the spec reporter.
const live = (name, fn) =>
  KEY ? test(name, fn) : test(name, { skip: 'DEEPSEEK_API_KEY not set' }, () => {});

live('eval: English parent → English titles', async () => {
  const out = await runExpand('How to launch an indie SaaS in 90 days');
  assert.ok(Array.isArray(out.children) && out.children.length > 0, 'should have children');
  for (const c of out.children) {
    const s = dominantScript(c.title);
    assert.ok(s === 'en' || s === 'unknown',
      `child title "${c.title}" should be English (detected ${s})`);
  }
  // detected_kind_label and approach should also be English
  assert.ok(['en', 'unknown'].includes(dominantScript(out.detected_kind_label)),
    `detected_kind_label should be English: "${out.detected_kind_label}"`);
  assert.ok(['en', 'unknown'].includes(dominantScript(out.approach)),
    `approach should be English: "${out.approach}"`);
});

live('eval: 中文 parent → 中文 titles', async () => {
  const out = await runExpand('如何在90天内推出一款独立SaaS产品');
  for (const c of out.children) {
    assert.equal(dominantScript(c.title), 'zh',
      `child title "${c.title}" should be Chinese`);
  }
});

live('eval: 日本語 parent → 日本語 titles', async () => {
  const out = await runExpand('90日でインディー SaaS を立ち上げる方法');
  for (const c of out.children) {
    const s = dominantScript(c.title);
    // Japanese can be a mix of kana (definitive) + kanji + Latin brand names
    assert.ok(s === 'ja' || s === 'zh',
      `child title "${c.title}" should be Japanese (detected ${s})`);
  }
});

live('eval: titles avoid placeholders across languages', async () => {
  const out = await runExpand('Plan a product launch');
  for (const c of out.children) {
    const t = c.title.toLowerCase();
    for (const bad of ['n/a', 'tbd', 'unknown', 'placeholder', 'tba']) {
      assert.ok(!t.includes(bad), `title "${c.title}" contains placeholder "${bad}"`);
    }
  }
});
