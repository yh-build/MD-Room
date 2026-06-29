const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron');
const fs = require('fs/promises');
const path = require('path');
const { fileURLToPath } = require('url');

const MARKDOWN_EXTENSIONS = new Set(['.md', '.markdown', '.mdown', '.mkd']);

let mainWindow = null;
let launchFilePath = null;
let rendererDirty = false;
let forceClose = false;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

function isMarkdownPath(filePath) {
  if (!filePath) return false;
  return MARKDOWN_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function findMarkdownArg(argv) {
  for (const arg of argv) {
    if (!arg || arg.startsWith('--')) continue;

    let candidate = arg;
    if (candidate.startsWith('file://')) {
      try {
        candidate = fileURLToPath(candidate);
      } catch {
        continue;
      }
    }

    candidate = candidate.replace(/^"|"$/g, '');
    if (isMarkdownPath(candidate)) {
      return path.resolve(candidate);
    }
  }

  return null;
}

async function readDocument(filePath) {
  const content = await fs.readFile(filePath, 'utf8');
  return {
    filePath,
    content: content.replace(/^\uFEFF/, '')
  };
}

async function writeDocument(filePath, content) {
  await fs.writeFile(filePath, content ?? '', 'utf8');
  return {
    filePath,
    content: content ?? ''
  };
}

async function openPathFromSystem(filePath) {
  if (!mainWindow || !filePath) return;

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.focus();

  try {
    const payload = await readDocument(filePath);
    mainWindow.webContents.send('file:open-from-system', payload);
  } catch (error) {
    mainWindow.webContents.send('file:open-error', {
      filePath,
      message: error.message
    });
  }
}

function sendCommand(command) {
  if (!mainWindow) return;
  mainWindow.webContents.send('menu:command', command);
}

function createApplicationMenu() {
  const template = [
    {
      label: '파일',
      submenu: [
        { label: '새 문서', accelerator: 'CmdOrCtrl+N', click: () => sendCommand('new') },
        { label: '열기', accelerator: 'CmdOrCtrl+O', click: () => sendCommand('open') },
        { label: '탭 닫기', accelerator: 'CmdOrCtrl+W', click: () => sendCommand('close-tab') },
        { type: 'separator' },
        { label: '저장', accelerator: 'CmdOrCtrl+S', click: () => sendCommand('save') },
        { label: '다른 이름으로 저장', accelerator: 'CmdOrCtrl+Shift+S', click: () => sendCommand('save-as') },
        { type: 'separator' },
        { role: 'quit', label: '종료' }
      ]
    },
    {
      label: '보기',
      submenu: [
        { label: '편집', accelerator: 'CmdOrCtrl+1', click: () => sendCommand('mode-edit') },
        { label: '분할', accelerator: 'CmdOrCtrl+2', click: () => sendCommand('mode-split') },
        { label: '보기', accelerator: 'CmdOrCtrl+3', click: () => sendCommand('mode-preview') },
        { type: 'separator' },
        { label: '기본 테마', click: () => sendCommand('theme-light') },
        { label: '비비드 테마', click: () => sendCommand('theme-vivid') },
        { label: '파스텔 테마', click: () => sendCommand('theme-pastel') },
        { label: '보라 테마', click: () => sendCommand('theme-purple') },
        { label: '회색조 테마', click: () => sendCommand('theme-grayscale') },
        { label: '편안한 테마', click: () => sendCommand('theme-comfort') },
        { label: '흑백 테마', click: () => sendCommand('theme-mono-dark') },
        { label: '백흑 테마', click: () => sendCommand('theme-mono-light') },
        { type: 'separator' },
        { role: 'reload', label: '새로고침' },
        { role: 'toggleDevTools', label: '개발자 도구' }
      ]
    }
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1220,
    height: 780,
    minWidth: 860,
    minHeight: 560,
    title: 'MD-Room',
    backgroundColor: '#f5f7f4',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.on('close', (event) => {
    if (!forceClose && rendererDirty) {
      event.preventDefault();
      mainWindow.webContents.send('app:confirm-close');
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.on('second-instance', (_event, argv) => {
  const filePath = findMarkdownArg(argv);
  if (filePath) {
    openPathFromSystem(filePath);
  } else if (mainWindow) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.focus();
  }
});

app.on('open-file', (event, filePath) => {
  event.preventDefault();
  if (mainWindow) {
    openPathFromSystem(filePath);
  } else {
    launchFilePath = filePath;
  }
});

app.whenReady().then(() => {
  app.setAppUserModelId('com.markdownviewer2.app');
  launchFilePath = launchFilePath || findMarkdownArg(process.argv);
  createApplicationMenu();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.handle('app:get-launch-document', async () => {
  if (!launchFilePath) return null;

  try {
    return await readDocument(launchFilePath);
  } catch (error) {
    return {
      filePath: launchFilePath,
      error: error.message
    };
  } finally {
    launchFilePath = null;
  }
});

ipcMain.on('app:set-dirty', (_event, dirty) => {
  rendererDirty = Boolean(dirty);
});

ipcMain.on('app:force-close', () => {
  forceClose = true;
  if (mainWindow) {
    mainWindow.close();
  }
});

ipcMain.handle('dialog:open-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '마크다운 열기',
    properties: ['openFile'],
    filters: [
      { name: 'Markdown', extensions: ['md', 'markdown', 'mdown', 'mkd'] },
      { name: 'Text', extensions: ['txt'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return readDocument(result.filePaths[0]);
});

ipcMain.handle('file:save', async (_event, payload) => {
  if (!payload || !payload.filePath) {
    throw new Error('저장할 파일 경로가 없습니다.');
  }

  return writeDocument(payload.filePath, payload.content);
});

ipcMain.handle('dialog:save-file-as', async (_event, payload) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: '마크다운 저장',
    defaultPath: payload?.filePath || 'untitled.md',
    filters: [
      { name: 'Markdown', extensions: ['md'] },
      { name: 'Text', extensions: ['txt'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (result.canceled || !result.filePath) {
    return null;
  }

  return writeDocument(result.filePath, payload?.content);
});

ipcMain.handle('app:open-external', async (_event, href) => {
  if (typeof href !== 'string') return false;

  if (href.startsWith('file://')) {
    await shell.openPath(fileURLToPath(href));
    return true;
  }

  await shell.openExternal(href);
  return true;
});
