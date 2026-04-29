const { app, BrowserWindow, Menu, dialog, shell, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFileSync } = require('child_process');
const Anthropic = require('@anthropic-ai/sdk');

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
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
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

const AI_SYSTEM_PROMPT = `You are an assistant inside a mindmap application. The user has selected one node and wants you to generate 3-5 logical children for it.

Rules:
- Each child should be a single short phrase (5-18 characters in Chinese, 2-8 words in English).
- Children should be one level of granularity below the parent: sub-tasks if parent is a goal, sub-topics if parent is a topic, key points if parent is an argument.
- Optionally include a one-sentence note (under 30 chars) for nuance; omit the field if not useful.
- Match the language of the parent text (Chinese in → Chinese out).
- Return STRICT JSON, no markdown fences, no commentary, no preamble:
{"children": [{"title": "...", "note": "..."}, ...]}`;

function stripFence(text) {
  const t = String(text).trim();
  const m = t.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/);
  return m ? m[1].trim() : t;
}

ipcMain.handle('ai-expand-node', async (_e, { text, pathFromRoot, existingChildren } = {}) => {
  if (!text || typeof text !== 'string') {
    return { error: 'invalid input: text required' };
  }
  let bundle;
  try {
    bundle = buildClient();
  } catch (err) {
    return { error: err.message };
  }
  const { client, provider } = bundle;

  const model = provider === 'anthropic' ? 'claude-sonnet-4-6' : 'deepseek-reasoner';
  const userParts = [
    `Parent node: "${text}"`,
    Array.isArray(pathFromRoot) && pathFromRoot.length > 1
      ? `Path from root: ${pathFromRoot.join(' › ')}`
      : null,
    Array.isArray(existingChildren) && existingChildren.length
      ? `Existing children (do NOT duplicate): ${existingChildren.map(s => `"${s}"`).join(', ')}`
      : null,
    'Generate 3-5 children.',
  ].filter(Boolean).join('\n');

  try {
    const response = await client.messages.create({
      model,
      max_tokens: 1024,
      system: AI_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userParts }],
    });
    const textBlocks = (response.content || []).filter(b => b.type === 'text').map(b => b.text);
    if (!textBlocks.length) return { error: 'empty response from model' };
    const raw = textBlocks.join('\n');
    let parsed;
    try {
      parsed = JSON.parse(stripFence(raw));
    } catch (parseErr) {
      return { error: 'model returned non-JSON: ' + raw.slice(0, 200) };
    }
    const children = Array.isArray(parsed.children) ? parsed.children : [];
    const cleaned = children
      .filter(c => c && typeof c.title === 'string' && c.title.trim())
      .slice(0, 8)
      .map(c => ({ title: c.title.trim(), note: typeof c.note === 'string' ? c.note.trim() : '' }));
    if (!cleaned.length) return { error: 'no usable children in response' };
    return { children: cleaned, model, provider };
  } catch (err) {
    return { error: (err && err.message) || String(err) };
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
