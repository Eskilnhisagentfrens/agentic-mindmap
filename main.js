const { app, BrowserWindow, Menu, dialog, shell, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const Anthropic = require('@anthropic-ai/sdk');
const log = require('electron-log/main');
const { friendlyError } = require('./lib/friendly-error.js');

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

// `friendlyError` is now in ./lib/friendly-error.js — see that file for the
// full table of error codes and the unit tests in test/unit/.

function backupDir() {
  const dir = path.join(os.homedir(), 'Documents', 'MindMap', 'backups');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// Path the MCP server reads. Matches mcp/server.js defaultSnapshotPath().
function snapshotPath() {
  return path.join(app.getPath('userData'), 'mcp-snapshot.json');
}

// Control file for MCP write tools — port + per-launch token. The MCP server
// reads this to know where (and with what auth) to POST mutations. Permissions
// are 0600 so only this user can read the token.
function controlFilePath() {
  return path.join(app.getPath('userData'), 'mcp-control.json');
}

let mcpControlServer = null;
let mcpToken = null;
let mcpPort = null;
const pendingMutations = new Map(); // requestId → resolve fn

function startMCPControlServer() {
  mcpToken = crypto.randomBytes(24).toString('hex');

  const srv = http.createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/mutate') {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'not found' }));
      return;
    }
    const auth = req.headers['x-mindmap-token'];
    if (auth !== mcpToken) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'token mismatch', code: 'AUTH' }));
      return;
    }
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1024 * 256) { // 256 KB cap on mutation payload
        req.destroy();
      }
    });
    req.on('end', async () => {
      let cmd;
      try { cmd = JSON.parse(body); }
      catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'invalid JSON', code: 'BAD_REQUEST' }));
        return;
      }
      log.info('mcp-control mutation', { type: cmd.type });
      try {
        const result = await dispatchMutation(cmd);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err) {
        log.error('mcp-control mutation failed', err && err.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: err.message || String(err), code: 'EXCEPTION' }));
      }
    });
  });

  srv.listen(0, '127.0.0.1', () => {
    mcpPort = srv.address().port;
    const ctrl = {
      version: 1,
      port: mcpPort,
      token: mcpToken,
      pid: process.pid,
      appVersion: app.getVersion(),
      startedAt: new Date().toISOString(),
    };
    try {
      const file = controlFilePath();
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(ctrl), { mode: 0o600 });
      log.info('mcp-control listening', { port: mcpPort, file });
    } catch (err) {
      log.error('mcp-control: failed to write control file', err && err.message);
    }
  });

  srv.on('error', (err) => {
    log.error('mcp-control server error', err && err.message);
  });

  mcpControlServer = srv;
}

function stopMCPControlServer() {
  try { fs.unlinkSync(controlFilePath()); } catch (_) {}
  if (mcpControlServer) {
    try { mcpControlServer.close(); } catch (_) {}
    mcpControlServer = null;
  }
  // Reject any pending mutations.
  for (const resolve of pendingMutations.values()) {
    resolve({ ok: false, error: 'app shutting down', code: 'SHUTDOWN' });
  }
  pendingMutations.clear();
}

// Forward a mutation to the renderer and await its response. Renderer calls
// snapshot() / save() / render() exactly like a user action so undo just works.
function dispatchMutation(cmd) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return Promise.resolve({ ok: false, error: 'main window not ready', code: 'NO_WINDOW' });
  }
  return new Promise((resolve) => {
    const reqId = crypto.randomBytes(8).toString('hex');
    pendingMutations.set(reqId, resolve);
    // 150s timeout — long enough for a quality-mode AI expand mutation.
    const t = setTimeout(() => {
      if (pendingMutations.has(reqId)) {
        pendingMutations.delete(reqId);
        resolve({ ok: false, error: 'renderer timeout (150s)', code: 'TIMEOUT' });
      }
    }, 150_000);
    pendingMutations.get(reqId).__timer = t;
    mainWindow.webContents.send('apply-mutation', { id: reqId, type: cmd.type, params: cmd.params || {} });
  });
}

ipcMain.on('mutation-result', (_e, payload = {}) => {
  const { id, result } = payload;
  const resolver = pendingMutations.get(id);
  if (resolver) {
    if (resolver.__timer) clearTimeout(resolver.__timer);
    pendingMutations.delete(id);
    resolver(result || { ok: false, error: 'empty result from renderer', code: 'EMPTY' });
  }
});

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

// Renderer pushes the current tree on every save() so the MCP server (a
// separate Node process spawned by an MCP host) can read live data.
// Atomic write: temp file + rename, so readers never see a half-written file.
ipcMain.handle('mindmap-snapshot', async (_e, payload = {}) => {
  try {
    const file = snapshotPath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const body = JSON.stringify({
      version: 1,
      writtenAt: new Date().toISOString(),
      appVersion: app.getVersion(),
      layoutMode: payload.layoutMode || null,
      nodeScale: typeof payload.nodeScale === 'number' ? payload.nodeScale : null,
      root: payload.root || null,
    });
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, body, 'utf8');
    fs.renameSync(tmp, file);
    return { ok: true, path: file };
  } catch (err) {
    log.error('mindmap-snapshot failed', err && err.message);
    return { ok: false, error: err.message };
  }
});

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

═══ LANGUAGE (read this first — non-negotiable) ═══
Detect the dominant language of the parent text. Output EVERY user-visible string — title, why, detected_kind_label, approach, depth_rationale — entirely in that SAME language. Do NOT translate. Do NOT code-switch mid-string.

  • Parent in English → titles, why, kind_label, approach, rationale ALL in English
  • Parent in 中文     → ALL 中文
  • Parent in 日本語   → ALL 日本語
  • Parent in Español / Deutsch / Français / Português / 한국어 → ALL in that language
  • Brand / product names, technical acronyms (MVP, API, GDPR, JDLA, HTTP/2) and bare numbers stay in their canonical form — that is NOT code-switching.
  • CHANGING THE NARRATIVE LANGUAGE INSIDE A SINGLE TITLE OR WHY IS A FAILURE. Do not write English structural words ("Week", "Phase", "Step", "Plan", "vs") wrapping a 中文 phrase, or 中文 wrapping English. Pick the parent's language and stay there.

FAILURE EXAMPLES (do not produce these):
  Parent: "How to launch an indie SaaS in 90 days"
    ❌ "Week 3-5: MVP 最小核心路径（非全功能）"   — narrative code-switch
    ❌ "市场验证 (market validation)"               — translation in parens, just pick one
    ✅ "Week 3-5: ship MVP core path (no nice-to-haves)"
    ✅ "Pre-launch: 50-user closed beta"

  Parent: "如何在90天内推出一款独立SaaS产品"
    ❌ "Week 3-5: MVP 核心路径"                    — English "Week 3-5" wrapping Chinese
    ✅ "第3-5周：MVP 核心路径（先不做加分项）"
    ✅ "上线前：50 个种子用户内测"

The 'detected_kind' enum value (goal/concept/question/option/process/artifact/other) stays in English — that is a machine token, not user copy.

═══ EXPERTISE & SPECIFICITY (most important) ═══
When the topic is country-, industry-, or technology-specific, you MUST:
  • Name actual entities: real companies, products, regulations, government programs, communities, frameworks. Generic categories like "competitor analysis" / "竞品分析" / "市場分析" without a single name are a failure.
  • Cite specific numbers when load-bearing: prices, deadlines, thresholds, market sizes, sample ranges.
  • Surface non-obvious tradeoffs and culturally / legally / operationally specific constraints.
  • Make a concrete recommendation when one option is meaningfully better — name the choice rather than balancing all options.
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
  • DO NOT artificially shorten. Generic titles like "Strategy" / "Implementation" / "法人形态选择" / "市場分析" should be replaced with something like "Series A ($3M, 18mo runway)" / "株式会社 KK (24万日元登記費)" / "GoToMarket: PLG vs sales-led".
  • Pass examples (multi-language — the model must mirror the user's language):
      English  → "Series A ($3M target, 18mo runway)"
                 "RAG ($0.02/query) vs fine-tune ($5K one-shot)"
                 "Cookie: 1st-party vs 3rd-party tracking"
      中文      → "B2B 客单价 500-5000 万日元"
                 "上海经营管理签证 + 资本金 500万円"
      日本語    → "株式会社 KK（24万日元登記費）"
                 "JDLA G検定 / E資格認定講座"
      Español  → "Sucursal LATAM (cumplimiento RGPD/LGPD)"
  • Failure examples (across all languages — same shape, no signal):
      English  → "Strategy" / "Implementation" / "Target customers" / "Competitor analysis"
      中文      → "法人形态选择" / "目标客户" / "运营推广" / "市场分析" / "竞品分析"
      日本語    → "戦略" / "目標顧客" / "競合分析"
  • Self-test: if you can swap the title with another topic's title without anyone noticing, you under-specified. Add the entity/number that makes it irreplaceable — IN THE PARENT'S LANGUAGE.

why (1-3 sentences, mini-analysis):
  • Include specific entities, numbers, or tradeoffs.
  • Make it a thinking aid, not a tautology of the title.
  • If a recommendation exists among siblings, state it here ("建议先从 X 切入而不是 Y，因为…").
  • Avoid hedging filler like "需要综合考虑".

═══ CRITICAL RULES ═══
- Mirror the parent's language across every user-facing string (see LANGUAGE section above).
- DO NOT repeat or paraphrase the parent text in titles.
- DO NOT use placeholders ("N/A", "TBD", "Unknown", "None", "未知", "未定").
- Match style/granularity of any existing peers/cousins given.
- Never duplicate existing children.

═══ OUTPUT ═══
STRICT JSON, no markdown fences, no commentary, no preamble.
All user-visible string values (title, why, detected_kind_label, approach, depth_rationale) MUST be in the parent's language. The 'detected_kind' enum stays in English (machine token).

{
  "detected_kind": "goal" | "concept" | "question" | "option" | "process" | "artifact" | "other",
  "detected_kind_label": "<short label in the parent's language, with specific context — e.g. 'Japan B2B market entry' or 「日本市場B2B 切入」 or 「日本市場の B2B 参入」, never just 'business problem'>",
  "approach": "<short description of the decomposition strategy you used, in the parent's language>",
  "chosen_depth": 1 | 2 | 3,
  "depth_rationale": "<one sentence explaining why this depth, in the parent's language>",
  "children": [
    {
      "title": "<specific phrase in parent's language>",
      "why": "<1-3 sentences in parent's language with entities/numbers/tradeoff/recommendation>",
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

// Model routing by speed/quality mode. 'fast' favors snappy general-purpose
// models (~5-10s typical); 'quality' uses reasoning-class models that take
// 30-90s but reach deeper for complex topics.
const MODEL_BY_MODE = {
  fast:    { deepseek: 'deepseek-chat',     anthropic: 'claude-haiku-4-5'   },
  quality: { deepseek: 'deepseek-reasoner', anthropic: 'claude-sonnet-4-6' },
};

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
    mode,
    requestId,
  } = payload;
  const resolvedMode = mode === 'quality' ? 'quality' : 'fast';
  const reqId = String(requestId || Date.now());

  log.info('ai-expand-node start', {
    requestId: reqId,
    mode: resolvedMode,
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
  const model = (MODEL_BY_MODE[resolvedMode] && MODEL_BY_MODE[resolvedMode][provider])
    || (provider === 'anthropic' ? 'claude-sonnet-4-6' : 'deepseek-reasoner');
  log.info('ai-expand-node client built', { provider, source, mode: resolvedMode, model });

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
    // Streaming: forward token deltas to the renderer for live progress UI.
    // We throttle webContents.send to ~10 Hz so the UI doesn't get flooded.
    const stream = client.messages.stream({
      model,
      max_tokens: 12000,
      system: SMART_DECOMPOSE_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userParts }],
    });

    let accumulated = '';
    let firstTokenAt = 0;
    let lastSentAt = 0;
    const SEND_INTERVAL_MS = 100;

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta && event.delta.type === 'text_delta') {
        const piece = event.delta.text || '';
        accumulated += piece;
        if (!firstTokenAt) {
          firstTokenAt = Date.now();
          log.info('ai-expand-node first-token', { ms: firstTokenAt - startedAt, mode: resolvedMode });
        }
        const now = Date.now();
        if (now - lastSentAt >= SEND_INTERVAL_MS && mainWindow && !mainWindow.isDestroyed()) {
          lastSentAt = now;
          mainWindow.webContents.send('ai-stream', {
            requestId: reqId,
            tail: accumulated.slice(-220),
            chars: accumulated.length,
            elapsedMs: now - startedAt,
          });
        }
      }
    }

    const finalMessage = await stream.finalMessage();
    // Emit one final tail update so the UI can settle on the actual end-of-stream content.
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('ai-stream', {
        requestId: reqId,
        tail: accumulated.slice(-220),
        chars: accumulated.length,
        elapsedMs: Date.now() - startedAt,
        done: true,
      });
    }

    const textBlocks = (finalMessage.content || []).filter(b => b.type === 'text').map(b => b.text);
    if (!textBlocks.length) {
      log.error('ai-expand-node empty response', { stop_reason: finalMessage.stop_reason });
      const f = friendlyError('empty response from model');
      return { error: f.user, code: f.code };
    }
    const raw = textBlocks.join('\n');

    // Detect token-budget truncation BEFORE attempting JSON parse so the
    // error surfaced to the user is actionable instead of "non-JSON".
    if (finalMessage.stop_reason === 'max_tokens') {
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
        stop_reason: finalMessage.stop_reason,
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
      mode: resolvedMode,
      firstTokenMs: firstTokenAt ? firstTokenAt - startedAt : null,
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
      mode: resolvedMode,
      elapsedMs,
      firstTokenMs: firstTokenAt ? firstTokenAt - startedAt : null,
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
  startMCPControlServer();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => {
  stopMCPControlServer();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
