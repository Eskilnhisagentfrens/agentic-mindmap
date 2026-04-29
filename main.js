const { app, BrowserWindow, Menu, dialog, shell, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

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
