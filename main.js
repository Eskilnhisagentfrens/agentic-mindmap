const { app, BrowserWindow, Menu, dialog, shell, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFileSync } = require('child_process');
const Anthropic = require('@anthropic-ai/sdk');
const log = require('electron-log/main');

log.initialize();
log.transports.file.level = 'info';
log.transports.console.level = 'info';
log.info('=== Agentic Mindmap starting ===',
  'app=', app.getName(), 'electron=', process.versions.electron,
  'node=', process.versions.node, 'platform=', process.platform);

const REPO_URL = 'https://github.com/Eskilnhisagentfrens/agentic-mindmap';

function logFilePath() {
  const t = log.transports.file;
  if (typeof t.getFile === 'function') {
    try { return t.getFile().path; } catch (_) {}
  }
  return path.join(app.getPath('logs'), 'main.log');
}

// Map low-level / SDK error messages into actionable user-facing strings.
// Returns { user, code }. Always log the original message at error level upstream.
function friendlyError(rawMsg) {
  const msg = String(rawMsg || '');
  const lo = msg.toLowerCase();
  if (lo.includes('credit balance is too low')) {
    return { user: 'DeepSeek 余额不足。请到 platform.deepseek.com 充值后重试。', code: 'INSUFFICIENT_CREDITS' };
  }
  if (lo.includes('未找到 api key') || lo.includes('not in keychain') || lo.includes('requires deepseek_api_key') || lo.includes('requires anthropic_api_key')) {
    return { user: '尚未配置 API key。在终端跑：security add-generic-password -a "$USER" -s DEEPSEEK_API_KEY -w "你的key"', code: 'NO_KEY' };
  }
  if (lo.includes('invalid api key') || lo.includes('authentication') || lo.includes('401') || lo.includes('unauthorized')) {
    return { user: 'API key 无效或已过期。请在 Keychain 或环境变量中重置。', code: 'INVALID_KEY' };
  }
  if (lo.includes('rate limit') || lo.includes('429')) {
    return { user: '请求过于频繁，请稍等几秒后重试。', code: 'RATE_LIMITED' };
  }
  if (lo.includes('quota') || lo.includes('insufficient_quota')) {
    return { user: '配额已用完，请检查账户状态或更换 provider。', code: 'QUOTA_EXCEEDED' };
  }
  if (lo.includes('timeout') || lo.includes('etimedout') || lo.includes('econnreset')) {
    return { user: '网络超时。检查 api.deepseek.com 是否可达，或稍后重试。', code: 'NETWORK_TIMEOUT' };
  }
  if (lo.includes('enotfound') || lo.includes('getaddrinfo')) {
    return { user: 'DNS 解析失败，请检查网络连接。', code: 'DNS_ERROR' };
  }
  if (lo.includes('model') && (lo.includes('not found') || lo.includes('does not exist'))) {
    return { user: '模型未找到。检查 EXPOUND_MODEL_* 环境变量是否拼写正确。', code: 'MODEL_NOT_FOUND' };
  }
  if (lo.includes('model returned non-json') || lo.includes('invalid json')) {
    return { user: 'AI 返回格式异常。如多次出现请报 Bug 并附日志。', code: 'PARSE_ERROR' };
  }
  if (lo.includes('no usable children')) {
    return { user: 'AI 没有给出有效子节点，请换个表述重试。', code: 'EMPTY_OUTPUT' };
  }
  // Generic fallback — keep raw message but truncate so the toast stays readable.
  return { user: '请求失败：' + msg.slice(0, 200), code: 'UNKNOWN' };
}

function backupDir() {
  const dir = path.join(os.homedir(), 'Documents', 'MindMap', 'backups');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 640,
    minHeight: 480,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#1e1e2e',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile('index.html');

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

function send(channel, ...args) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, ...args);
  }
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    }] : []),
    {
      label: '文件',
      submenu: [
        { label: '新建', accelerator: 'CmdOrCtrl+N', click: () => send('menu', 'new') },
        { type: 'separator' },
        { label: '打开…', accelerator: 'CmdOrCtrl+O', click: openFile },
        { label: '导入 Markdown…', click: () => openFile('md') },
        { type: 'separator' },
        { label: '保存 JSON…', accelerator: 'CmdOrCtrl+S', click: () => send('menu', 'save-json') },
        { label: '导出 Markdown…', accelerator: 'CmdOrCtrl+Shift+E', click: () => send('menu', 'export-md') },
        { label: '导出 OPML…（XMind/MindNode 可再编辑）', click: () => send('menu', 'export-opml') },
        { label: '导出 PDF…', accelerator: 'CmdOrCtrl+P', click: () => send('menu', 'export-pdf') },
        { label: '导出 SVG…', click: () => send('menu', 'export-svg') },
        { label: '导出 PNG…', click: () => send('menu', 'export-png') },
        { type: 'separator' },
        { label: '快照…', accelerator: 'CmdOrCtrl+Shift+L', click: () => send('menu', 'snapshots') },
        { label: '打开备份文件夹', click: () => shell.openPath(backupDir()) },
        ...(isMac ? [] : [{ type: 'separator' }, { role: 'quit' }]),
      ],
    },
    {
      label: '编辑',
      submenu: [
        { label: '撤销', accelerator: 'CmdOrCtrl+Z', click: () => send('menu', 'undo') },
        { label: '重做', accelerator: 'Shift+CmdOrCtrl+Z', click: () => send('menu', 'redo') },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
        { type: 'separator' },
        { label: '查找', accelerator: 'CmdOrCtrl+F', click: () => send('menu', 'search') },
      ],
    },
    {
      label: '视图',
      submenu: [
        { label: '放大', accelerator: 'CmdOrCtrl+=', click: () => send('menu', 'zoom-in') },
        { label: '缩小', accelerator: 'CmdOrCtrl+-', click: () => send('menu', 'zoom-out') },
        { label: '适配', accelerator: 'CmdOrCtrl+0', click: () => send('menu', 'zoom-fit') },
        { type: 'separator' },
        { label: '切换布局', click: () => send('menu', 'toggle-layout') },
        { label: '大纲视图', accelerator: 'CmdOrCtrl+Shift+O', click: () => send('menu', 'outline') },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { role: 'toggleDevTools' },
      ],
    },
    {
      role: 'window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac ? [{ type: 'separator' }, { role: 'front' }] : [{ role: 'close' }]),
      ],
    },
    {
      role: 'help',
      submenu: [
        { label: '快捷键帮助', click: () => send('menu', 'help') },
        { type: 'separator' },
        { label: '报 Bug…', click: openBugReport },
        { label: '打开日志文件夹', click: openLogsFolder },
        { type: 'separator' },
        { label: '关于 Agentic Mindmap', click: openAbout },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function openLogsFolder() {
  const dir = path.dirname(logFilePath());
  log.info('open-logs-folder', dir);
  shell.openPath(dir);
}

function openBugReport() {
  const lp = logFilePath();
  // Prefilled body. URL-encode and keep under ~2kB.
  const body = [
    '## 描述 (What happened?)',
    '',
    '<!-- Briefly describe the bug or feature request -->',
    '',
    '## 复现步骤 (Steps to reproduce)',
    '',
    '1. ',
    '2. ',
    '3. ',
    '',
    '## 环境 (Environment)',
    '',
    `- App version: ${app.getVersion()}`,
    `- Electron: ${process.versions.electron}`,
    `- Node: ${process.versions.node}`,
    `- OS: ${process.platform} ${os.release()}`,
    `- Locale: ${app.getLocale()}`,
    '',
    '## 日志 (Logs)',
    '',
    `请附上日志文件以便定位（路径：\`${lp}\`）。「Help → 打开日志文件夹」可一键打开。`,
    '',
  ].join('\n');
  const url = REPO_URL + '/issues/new?title=' + encodeURIComponent('[Bug] ') + '&body=' + encodeURIComponent(body);
  log.info('open-bug-report', { lp });
  shell.openExternal(url);
}

function openAbout() {
  const lp = logFilePath();
  const detail = [
    `Version ${app.getVersion()}`,
    `Electron ${process.versions.electron}, Node ${process.versions.node}`,
    `Repo: ${REPO_URL}`,
    `Logs: ${lp}`,
    `License: MIT`,
  ].join('\n');
  log.info('about-dialog');
  dialog.showMessageBox(mainWindow || undefined, {
    type: 'info',
    title: '关于 Agentic Mindmap',
    message: 'Agentic Mindmap',
    detail,
    buttons: ['OK', '打开仓库'],
    defaultId: 0,
  }).then(({ response }) => {
    if (response === 1) shell.openExternal(REPO_URL);
  });
}

async function openFile(forceType) {
  if (!mainWindow) return;
  const filters = forceType === 'md'
    ? [{ name: 'Markdown', extensions: ['md', 'markdown', 'txt'] }]
    : [
        { name: '思维导图', extensions: ['json', 'md', 'markdown', 'txt'] },
        { name: '所有文件', extensions: ['*'] },
      ];
  const result = await dialog.showOpenDialog(mainWindow, { properties: ['openFile'], filters });
  if (result.canceled || !result.filePaths[0]) return;
  const filePath = result.filePaths[0];
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    send('file-opened', { path: filePath, name: path.basename(filePath), content });
  } catch (err) {
    dialog.showErrorBox('打开失败', err.message);
  }
}

ipcMain.handle('write-backup', async (_e, { name, content }) => {
  try {
    const dir = backupDir();
    const safe = String(name).replace(/[\/\\:*?"<>|]/g, '_');
    const file = path.join(dir, safe);
    fs.writeFileSync(file, content, 'utf8');
    // Prune: keep most recent 30 backups by mtime.
    const entries = fs.readdirSync(dir)
      .filter(f => f.endsWith('.json'))
      .map(f => ({ f, mt: fs.statSync(path.join(dir, f)).mtimeMs }))
      .sort((a, b) => b.mt - a.mt);
    for (const { f } of entries.slice(30)) {
      try { fs.unlinkSync(path.join(dir, f)); } catch (_) {}
    }
    return { path: file };
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle('open-backup-folder', () => { shell.openPath(backupDir()); });

// Export current canvas to PDF via Electron's native printToPDF.
// Renderer asks for an export, we open a save dialog, then printToPDF directly
// from the main window's webContents — vector quality, no external deps.
ipcMain.handle('export-pdf', async (event, { defaultName } = {}) => {
  if (!mainWindow) return { saved: false, error: 'no window' };
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: (defaultName || 'mindmap') + '.pdf',
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  if (result.canceled || !result.filePath) return { saved: false };
  try {
    const pdfBuffer = await mainWindow.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A3',
      landscape: true,
      margins: { marginType: 'custom', top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 },
    });
    fs.writeFileSync(result.filePath, pdfBuffer);
    log.info('export-pdf saved', { path: result.filePath, bytes: pdfBuffer.length });
    return { saved: true, path: result.filePath };
  } catch (err) {
    log.error('export-pdf failed', err && err.message);
    return { saved: false, error: err.message };
  }
});

// ===========================================================================
//  AI: expand a mindmap node into children via DeepSeek (Anthropic-compat)
// ===========================================================================

function loadApiKey() {
  // 1. Process env
  if (process.env.DEEPSEEK_API_KEY) {
    return { key: process.env.DEEPSEEK_API_KEY, source: 'env:DEEPSEEK_API_KEY', provider: 'deepseek' };
  }
  if (process.env.ANTHROPIC_API_KEY) {
    return { key: process.env.ANTHROPIC_API_KEY, source: 'env:ANTHROPIC_API_KEY', provider: 'anthropic' };
  }
  // 2. macOS Keychain (silent if not found)
  if (process.platform === 'darwin') {
    for (const [service, provider] of [['DEEPSEEK_API_KEY', 'deepseek'], ['ANTHROPIC_API_KEY', 'anthropic']]) {
      try {
        const out = execFileSync('security', ['find-generic-password', '-a', os.userInfo().username, '-s', service, '-w'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
        const trimmed = String(out).trim();
        if (trimmed) return { key: trimmed, source: `keychain:${service}`, provider };
      } catch (_) { /* not in keychain, try next */ }
    }
  }
  return null;
}

function buildClient() {
  const auth = loadApiKey();
  if (!auth) {
    throw new Error('未找到 API key。请设置 DEEPSEEK_API_KEY 或 ANTHROPIC_API_KEY 环境变量，或存入 macOS Keychain。');
  }
  const opts = { apiKey: auth.key };
  if (auth.provider === 'deepseek') {
    opts.baseURL = 'https://api.deepseek.com/anthropic';
  }
  return { client: new Anthropic(opts), provider: auth.provider, source: auth.source };
}

const MAX_DEPTH = 3;
const MAX_TOTAL_NODES = 40;

const SMART_DECOMPOSE_SYSTEM_PROMPT = `You are a senior domain expert helping the user think via a mindmap. The user selected one node and clicked "expand" — your job is ONE excellent decomposition that genuinely informs their decision.

THIS IS NOT a generic outline tool. The output must reflect actual expertise, not safe generalities.

═══ EXPERTISE & SPECIFICITY (most important) ═══
When the topic is country-, industry-, or technology-specific, you MUST:
  • Name actual entities: real companies, products, regulations, government programs, communities, frameworks (キカガク / Aidemy / JDLA / 経営管理ビザ / Apollo MCP / FedRAMP / ISO 27001…). Generic categories like "竞品分析" without a single name are a failure.
  • Cite specific numbers when load-bearing: prices, deadlines, thresholds, market sizes, sample ranges (e.g. "登記費約24万日元", "客単価500万-5000万日元", "minimum capital 500万円", "回款周期90天").
  • Surface non-obvious tradeoffs and culturally / legally / operationally specific constraints.
  • Make a concrete recommendation when one option is meaningfully better. "建议直接做株式会社" beats "可以考虑多种法人形态".
  • If you genuinely lack specific knowledge of an area, say so honestly in 'depth_rationale' instead of fabricating.

═══ STEP 1 — Detect the kind of node ═══
  - "goal"      — something to achieve / a project / an outcome
  - "concept"   — an abstract subject, definition, or topic
  - "question"  — something to investigate (how/why/whether)
  - "option"    — a choice or alternative among possibilities
  - "process"   — a sequence of phases or steps over time
  - "artifact"  — a thing being constructed (essay, plan, document, codebase)
  - "other"     — describe in 'detected_kind_label'

═══ STEP 2 — Judge complexity, choose depth (1-3) ═══
  - depth = 1: parent is simple, atomic, or already concrete ("去买牛奶", "重启路由器")
  - depth = 2: medium scope, benefits from one level of refinement under each top child
  - depth = 3: large, multi-phase project or rich abstract concept where the user genuinely needs to reach specific actionable instances at the leaves

DO NOT default to maximum depth. Going deeper than warranted produces filler; shallower than warranted leaves the user with nothing actionable.

═══ STEP 3 — Decomposition approach for the detected kind ═══
  - goal      → actionable sub-tasks (verb-led, specific; if relevant, time-boxed or sized)
  - concept   → sub-concepts or facets (mutually distinct; named entities preferred over abstractions)
  - question  → sub-questions or candidate avenues (each pointing to a real next investigation)
  - option    → distinct alternatives OR comparison dimensions — whichever helps the user decide. Recommend one if you can.
  - process   → ordered phases (real milestones, not "planning / execution / review")
  - artifact  → real sections / components / chapters

═══ STEP 4 — Generate children with TAPERED branching ═══
  - Layer 1 (top): 3-6 children
  - Layer 2: 2-4 per layer-1 (only when depth ≥ 2)
  - Layer 3: 2-3 per layer-2 (only when depth = 3)
  - HARD CAP: total nodes ≤ ${MAX_TOTAL_NODES}. PRUNE before outputting.
  - A branch may legitimately need less depth than its siblings — leave its 'children' empty.

═══ STEP 5 — For EACH child at every level ═══

title (CRITICAL — this is the ONLY thing the user sees on the canvas at a glance):
  • PACK the title with the single most distinctive specific signal you can: a number, an entity/product name, a load-bearing qualifier. A title without any specific signal is a failure mode — even if the 'why' is good.
  • DO NOT artificially shorten. If the title is "法人形态选择", you under-specified — make it "株式会社（24万日元登記費・推荐）".
  • Examples that PASS:
      "株式会社 KK（24万日元登記費）"
      "JDLA G検定/E資格認定講座"
      "Enterprise 层 + Agentic AI/MCP 差异化"
      "B2B 客単価 500-5000万日元"
      "Cookie 第三方 vs 第一方追踪"
      "RAG ($0.02/query) vs 微调 ($5K一次性)"
  • Examples that FAIL — too generic, no signal:
      "法人形态选择" / "目标客户" / "运营推广" / "Strategy" / "Implementation" / "市场分析" / "竞品分析"
  • Self-test: if you can swap the title with another topic's title without anyone noticing, you under-specified. Add the entity/number that makes it irreplaceable.

why (1-3 sentences, mini-analysis):
  • Include specific entities, numbers, or tradeoffs.
  • Make it a thinking aid, not a tautology of the title.
  • If a recommendation exists among siblings, state it here ("建议先从 X 切入而不是 Y，因为…").
  • Avoid hedging filler like "需要综合考虑".

═══ CRITICAL RULES ═══
- Match the language of the parent (Chinese in → Chinese out).
- DO NOT repeat or paraphrase the parent text in titles.
- DO NOT use placeholders ("N/A", "TBD", "Unknown", "None").
- Match style/granularity of any existing peers/cousins given.
- Never duplicate existing children.

═══ OUTPUT ═══
STRICT JSON, no markdown fences, no commentary, no preamble:
{
  "detected_kind": "goal" | "concept" | "question" | "option" | "process" | "artifact" | "other",
  "detected_kind_label": "短中/英文描述识别结果（含具体语境，如「日本市场B2B切入」而不只是「商业问题」）",
  "approach": "短描述你采用的分解策略",
  "chosen_depth": 1 | 2 | 3,
  "depth_rationale": "一句说明为什么选这个深度",
  "children": [
    {
      "title": "...",
      "why": "1-3 句具体分析，含实体/数字/tradeoff/明确推荐",
      "children": [
        { "title": "...", "why": "...", "children": [...] }
      ]
    }
  ]
}`;

function stripFence(text) {
  const t = String(text).trim();
  const m = t.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/);
  return m ? m[1].trim() : t;
}

ipcMain.handle('ai-expand-node', async (_e, payload = {}) => {
  const startedAt = Date.now();
  const {
    text,
    pathFromRoot,
    existingChildren,
    cousinTexts,
    parentSiblingTexts,
    parentNote,
    selectedNote,
  } = payload;

  log.info('ai-expand-node start', {
    textPreview: typeof text === 'string' ? text.slice(0, 60) : null,
    pathDepth: Array.isArray(pathFromRoot) ? pathFromRoot.length : 0,
    cousinCount: Array.isArray(cousinTexts) ? cousinTexts.length : 0,
    childCount: Array.isArray(existingChildren) ? existingChildren.length : 0,
    hasParentNote: !!(parentNote && String(parentNote).trim()),
  });

  if (!text || typeof text !== 'string') {
    log.warn('ai-expand-node invalid input');
    const f = friendlyError('invalid input: text required');
    return { error: f.user, code: f.code };
  }

  let bundle;
  try {
    bundle = buildClient();
  } catch (err) {
    log.error('ai-expand-node buildClient failed', err && err.message);
    const f = friendlyError(err && err.message);
    return { error: f.user, code: f.code };
  }
  const { client, provider, source } = bundle;
  log.info('ai-expand-node client built', { provider, source });

  const model = provider === 'anthropic' ? 'claude-sonnet-4-6' : 'deepseek-reasoner';

  // Cousin context (children of selected's siblings) is the same depth as the new
  // children — best style reference. Fall back to parent's siblings if absent.
  const peerRef = (Array.isArray(cousinTexts) && cousinTexts.length)
    ? { label: 'Existing peers at the same depth as the new children (match THEIR style and granularity)', items: cousinTexts.slice(0, 12) }
    : (Array.isArray(parentSiblingTexts) && parentSiblingTexts.length)
      ? { label: 'Sibling nodes of the parent (loose context for tone)', items: parentSiblingTexts.slice(0, 8) }
      : null;

  const userParts = [
    `Parent node: "${text}"`,
    Array.isArray(pathFromRoot) && pathFromRoot.length > 1
      ? `Path from root: ${pathFromRoot.join(' › ')}`
      : null,
    peerRef
      ? `${peerRef.label}:\n  - ${peerRef.items.map(s => `"${s}"`).join('\n  - ')}`
      : null,
    Array.isArray(existingChildren) && existingChildren.length
      ? `Already-present children (do NOT duplicate):\n  - ${existingChildren.map(s => `"${s}"`).join('\n  - ')}`
      : null,
    parentNote && typeof parentNote === 'string' && parentNote.trim()
      ? `Parent's note (user intent hint): ${parentNote.trim().slice(0, 200)}`
      : null,
    selectedNote && typeof selectedNote === 'string' && selectedNote.trim()
      ? `Selected node's own note (additional context): ${selectedNote.trim().slice(0, 200)}`
      : null,
    'Now: detect the node kind, choose the best decomposition approach, and produce children with one-sentence whys.',
  ].filter(Boolean).join('\n\n');

  // Recursive cleaner: validates titles, trims whys, enforces depth + total cap.
  // Returns [cleaned, totalCount] so we can stop at the global node budget.
  function cleanChildren(rawChildren, currentDepth, budgetRef) {
    if (currentDepth > MAX_DEPTH) return [];
    if (!Array.isArray(rawChildren)) return [];
    const out = [];
    for (const c of rawChildren) {
      if (!c || typeof c.title !== 'string' || !c.title.trim()) continue;
      if (budgetRef.remaining <= 0) break;
      budgetRef.remaining -= 1;
      const node = {
        title: c.title.trim(),
        why: typeof c.why === 'string' ? c.why.trim() : '',
      };
      if (currentDepth < MAX_DEPTH && Array.isArray(c.children) && c.children.length) {
        const sub = cleanChildren(c.children, currentDepth + 1, budgetRef);
        if (sub.length) node.children = sub;
      }
      out.push(node);
    }
    return out;
  }

  function countNodes(arr) {
    let n = 0;
    for (const c of arr || []) {
      n += 1;
      if (Array.isArray(c.children)) n += countNodes(c.children);
    }
    return n;
  }

  try {
    const response = await client.messages.create({
      model,
      max_tokens: 12000,
      system: SMART_DECOMPOSE_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userParts }],
    });
    const textBlocks = (response.content || []).filter(b => b.type === 'text').map(b => b.text);
    if (!textBlocks.length) {
      log.error('ai-expand-node empty response', { stop_reason: response.stop_reason });
      const f = friendlyError('empty response from model');
      return { error: f.user, code: f.code };
    }
    const raw = textBlocks.join('\n');

    // Detect token-budget truncation BEFORE attempting JSON parse so the
    // error surfaced to the user is actionable instead of "non-JSON".
    if (response.stop_reason === 'max_tokens') {
      log.error('ai-expand-node truncated by max_tokens', { rawTail: raw.slice(-200), rawLen: raw.length });
      return {
        error: 'AI 输出过长被截断（达到 max_tokens 上限）。请缩小话题范围、清理父节点的备注，或重试一次。',
        code: 'TRUNCATED',
      };
    }

    let parsed;
    try {
      parsed = JSON.parse(stripFence(raw));
    } catch (parseErr) {
      log.error('ai-expand-node non-JSON', {
        stop_reason: response.stop_reason,
        rawLen: raw.length,
        rawHead: raw.slice(0, 300),
        rawTail: raw.slice(-200),
      });
      const f = friendlyError('model returned non-JSON');
      return { error: f.user, code: f.code };
    }

    const budget = { remaining: MAX_TOTAL_NODES };
    const cleaned = cleanChildren(parsed.children, 1, budget);
    if (!cleaned.length) {
      log.warn('ai-expand-node no usable children', { kind: parsed.detected_kind });
      const f = friendlyError('no usable children in response');
      return { error: f.user, code: f.code };
    }

    const total = countNodes(cleaned);
    const depths = (function maxDepth(arr, d) {
      let m = d;
      for (const c of arr || []) {
        if (Array.isArray(c.children) && c.children.length) {
          m = Math.max(m, maxDepth(c.children, d + 1));
        }
      }
      return m;
    })(cleaned, 1);

    const elapsedMs = Date.now() - startedAt;
    log.info('ai-expand-node ok', {
      elapsedMs,
      provider,
      model,
      detected_kind: parsed.detected_kind,
      chosen_depth: parsed.chosen_depth,
      actual_depth: depths,
      total_nodes: total,
    });

    return {
      children: cleaned,
      detected_kind: typeof parsed.detected_kind === 'string' ? parsed.detected_kind : 'other',
      detected_kind_label: typeof parsed.detected_kind_label === 'string' ? parsed.detected_kind_label.trim() : '',
      approach: typeof parsed.approach === 'string' ? parsed.approach.trim() : '',
      chosen_depth: typeof parsed.chosen_depth === 'number' ? parsed.chosen_depth : depths,
      depth_rationale: typeof parsed.depth_rationale === 'string' ? parsed.depth_rationale.trim() : '',
      actual_depth: depths,
      total_nodes: total,
      model,
      provider,
    };
  } catch (err) {
    const elapsedMs = Date.now() - startedAt;
    const rawMsg = (err && err.message) || String(err);
    log.error('ai-expand-node failed', { elapsedMs, error: rawMsg, stack: err && err.stack });
    const f = friendlyError(rawMsg);
    return { error: f.user, code: f.code };
  }
});

ipcMain.handle('save-file', async (_event, { defaultName, content, filters }) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultName,
    filters: filters || [{ name: '所有文件', extensions: ['*'] }],
  });
  if (result.canceled || !result.filePath) return { saved: false };
  try {
    if (content instanceof Uint8Array || Buffer.isBuffer(content)) {
      fs.writeFileSync(result.filePath, Buffer.from(content));
    } else {
      fs.writeFileSync(result.filePath, content, 'utf8');
    }
    return { saved: true, path: result.filePath };
  } catch (err) {
    dialog.showErrorBox('保存失败', err.message);
    return { saved: false, error: err.message };
  }
});

app.whenReady().then(() => {
  createWindow();
  buildMenu();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
