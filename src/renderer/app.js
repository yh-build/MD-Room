const api = window.markdownApp;

const THEME_CLASSES = ['theme-light', 'theme-vivid', 'theme-purple', 'theme-mono-dark', 'theme-mono-light'];
const THEME_ALIASES = {
  dark: 'mono-dark',
  bw: 'mono-dark',
  wb: 'mono-light'
};

let nextTabId = 1;
let mermaidRenderRunId = 0;

function normalizeTheme(theme) {
  const normalized = THEME_ALIASES[theme] || theme;
  return ['light', 'vivid', 'purple', 'mono-dark', 'mono-light'].includes(normalized) ? normalized : 'light';
}

const state = {
  tabs: [],
  activeTabId: null,
  mode: localStorage.getItem('markdown-viewer-mode') || 'split',
  theme: normalizeTheme(localStorage.getItem('markdown-viewer-theme') || 'light')
};

const elements = {
  app: document.getElementById('app'),
  tabs: document.getElementById('tabs'),
  workspace: document.getElementById('workspace'),
  editor: document.getElementById('editor'),
  preview: document.getElementById('preview'),
  title: document.getElementById('document-title'),
  path: document.getElementById('document-path'),
  saveState: document.getElementById('save-state'),
  stats: document.getElementById('document-stats'),
  themeSelect: document.getElementById('theme-select'),
  modeButtons: Array.from(document.querySelectorAll('[data-mode]')),
  actionButtons: Array.from(document.querySelectorAll('[data-action]'))
};

function debounce(callback, delay) {
  let timer = null;
  return (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => callback(...args), delay);
  };
}

function getFileName(filePath) {
  if (!filePath) return '제목 없음';
  return filePath.split(/[\\/]/).pop() || filePath;
}

function getActiveTab() {
  return state.tabs.find((tab) => tab.id === state.activeTabId) || null;
}

function isTabDirty(tab) {
  return Boolean(tab) && tab.content !== tab.savedContent;
}

function hasAnyDirtyTab() {
  return state.tabs.some(isTabDirty);
}

function createTab(documentPayload = {}, markSaved = true) {
  const content = documentPayload.content || '';
  return {
    id: `tab-${nextTabId++}`,
    filePath: documentPayload.filePath || null,
    content,
    savedContent: markSaved ? content : ''
  };
}

function updateWindowTitle() {
  const tab = getActiveTab();
  const name = tab ? `${getFileName(tab.filePath)}${isTabDirty(tab) ? ' *' : ''}` : '제목 없음';
  elements.title.textContent = name;
  elements.path.textContent = tab?.filePath || '';
  elements.saveState.textContent = tab && isTabDirty(tab) ? '수정됨' : '저장됨';
  document.title = `${name} - MD-Room`;
  api.setDirty(hasAnyDirtyTab());
}

function updateStats() {
  const tab = getActiveTab();
  const content = tab?.content || '';
  const trimmed = content.trim();
  const words = trimmed ? trimmed.split(/\s+/).length : 0;
  elements.stats.textContent = `${words.toLocaleString('ko-KR')} 단어 · ${content.length.toLocaleString('ko-KR')} 글자`;
}

function renderPreview() {
  const tab = getActiveTab();
  elements.preview.innerHTML = api.renderMarkdown(tab?.content || '', tab?.filePath || null);
  renderMermaidDiagrams();
}

const renderPreviewSoon = debounce(renderPreview, 80);

function configureMermaid() {
  if (!window.mermaid) return false;

  window.mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: state.theme === 'mono-dark' ? 'dark' : 'default',
    flowchart: {
      htmlLabels: true,
      useMaxWidth: true
    }
  });

  return true;
}

async function renderMermaidDiagrams() {
  const diagrams = Array.from(elements.preview.querySelectorAll('.mermaid'));
  const runId = ++mermaidRenderRunId;

  if (diagrams.length === 0 || !configureMermaid()) {
    return;
  }

  diagrams.forEach((diagram) => {
    diagram.removeAttribute('data-processed');
  });

  try {
    await window.mermaid.run({ nodes: diagrams });
  } catch (error) {
    if (runId !== mermaidRenderRunId) return;

    diagrams.forEach((diagram) => {
      if (diagram.querySelector('svg')) return;
      diagram.classList.add('mermaid-error');
      diagram.textContent = `Mermaid render error\n${error?.message || error}`;
    });
  }
}

function renderTabs() {
  elements.tabs.replaceChildren();

  state.tabs.forEach((tab) => {
    const tabElement = document.createElement('div');
    tabElement.className = 'tab';
    tabElement.dataset.tabId = tab.id;
    tabElement.setAttribute('role', 'tab');
    tabElement.setAttribute('aria-selected', String(tab.id === state.activeTabId));
    tabElement.classList.toggle('active', tab.id === state.activeTabId);

    const title = document.createElement('span');
    title.className = 'tab-title';
    title.textContent = `${getFileName(tab.filePath)}${isTabDirty(tab) ? ' *' : ''}`;

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'tab-close';
    closeButton.title = '탭 닫기';
    closeButton.setAttribute('aria-label', '탭 닫기');
    closeButton.textContent = '×';
    closeButton.addEventListener('click', (event) => {
      event.stopPropagation();
      closeTab(tab.id);
    });

    tabElement.append(title, closeButton);
    tabElement.addEventListener('click', () => activateTab(tab.id));
    elements.tabs.append(tabElement);
  });
}

function refreshActiveDocument() {
  const tab = getActiveTab();
  elements.editor.value = tab?.content || '';
  renderPreview();
  renderTabs();
  updateWindowTitle();
  updateStats();
}

function activateTab(tabId) {
  if (state.activeTabId === tabId) return;
  state.activeTabId = tabId;
  refreshActiveDocument();
}

function addTab(documentPayload = {}, markSaved = true) {
  const tab = createTab(documentPayload, markSaved);
  state.tabs.push(tab);
  state.activeTabId = tab.id;
  refreshActiveDocument();
  elements.editor.focus();
}

function confirmCloseTab(tab) {
  if (!isTabDirty(tab)) return true;
  return window.confirm(`${getFileName(tab.filePath)}에 저장하지 않은 변경 내용이 있습니다. 탭을 닫을까요?`);
}

function closeTab(tabId = state.activeTabId) {
  const tabIndex = state.tabs.findIndex((tab) => tab.id === tabId);
  if (tabIndex < 0) return;

  const tab = state.tabs[tabIndex];
  if (!confirmCloseTab(tab)) return;

  state.tabs.splice(tabIndex, 1);

  if (state.tabs.length === 0) {
    addTab({ filePath: null, content: '' });
    return;
  }

  if (state.activeTabId === tabId) {
    const nextIndex = Math.min(tabIndex, state.tabs.length - 1);
    state.activeTabId = state.tabs[nextIndex].id;
  }

  refreshActiveDocument();
}

function confirmCloseAllTabs() {
  if (!hasAnyDirtyTab()) return true;
  return window.confirm('저장하지 않은 변경 내용이 있는 탭이 있습니다. 종료할까요?');
}

function setMode(mode) {
  state.mode = mode;
  localStorage.setItem('markdown-viewer-mode', mode);
  elements.workspace.dataset.mode = mode;
  elements.modeButtons.forEach((button) => {
    const active = button.dataset.mode === mode;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });

  if (mode !== 'edit') {
    renderPreview();
  }
}

function setTheme(theme) {
  state.theme = normalizeTheme(theme);
  localStorage.setItem('markdown-viewer-theme', state.theme);
  elements.app.classList.remove(...THEME_CLASSES);
  elements.app.classList.add(`theme-${state.theme}`);
  elements.themeSelect.value = state.theme;
  renderPreview();
}

function showToast(message) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.append(toast);
  window.setTimeout(() => {
    toast.remove();
  }, 3000);
}

async function newDocument() {
  addTab({ filePath: null, content: '' });
}

async function openDocumentFromDialog() {
  try {
    const documentPayload = await api.openFile();
    if (documentPayload) {
      addTab(documentPayload);
    }
  } catch (error) {
    showToast(`파일을 열 수 없습니다. ${error.message}`);
  }
}

async function saveDocument() {
  const tab = getActiveTab();
  if (!tab) return;

  try {
    if (!tab.filePath) {
      await saveDocumentAs();
      return;
    }

    const saved = await api.saveFile(tab.filePath, tab.content);
    tab.filePath = saved.filePath;
    tab.savedContent = tab.content;
    refreshActiveDocument();
    showToast('저장했습니다.');
  } catch (error) {
    showToast(`저장할 수 없습니다. ${error.message}`);
  }
}

async function saveDocumentAs() {
  const tab = getActiveTab();
  if (!tab) return;

  try {
    const saved = await api.saveFileAs(tab.filePath, tab.content);
    if (!saved) return;
    tab.filePath = saved.filePath;
    tab.savedContent = tab.content;
    refreshActiveDocument();
    showToast('저장했습니다.');
  } catch (error) {
    showToast(`저장할 수 없습니다. ${error.message}`);
  }
}

async function openSystemDocument(payload) {
  if (!payload) return;

  if (payload.error) {
    showToast(`파일을 열 수 없습니다. ${payload.error}`);
    return;
  }

  addTab(payload);
}

function handleAction(action) {
  switch (action) {
    case 'new':
      newDocument();
      break;
    case 'open':
      openDocumentFromDialog();
      break;
    case 'save':
      saveDocument();
      break;
    case 'save-as':
      saveDocumentAs();
      break;
    case 'print':
      renderPreview();
      window.print();
      break;
    default:
      break;
  }
}

elements.editor.addEventListener('input', () => {
  const tab = getActiveTab();
  if (!tab) return;

  tab.content = elements.editor.value;
  updateWindowTitle();
  updateStats();
  renderTabs();
  renderPreviewSoon();
});

elements.preview.addEventListener('click', (event) => {
  const link = event.target.closest('a');
  if (!link) return;

  const href = link.getAttribute('href');
  if (!href || href.startsWith('#')) return;

  event.preventDefault();
  api.openExternal(href);
});

elements.actionButtons.forEach((button) => {
  button.addEventListener('click', () => handleAction(button.dataset.action));
});

elements.modeButtons.forEach((button) => {
  button.addEventListener('click', () => setMode(button.dataset.mode));
});

elements.themeSelect.addEventListener('change', () => {
  setTheme(elements.themeSelect.value);
});

api.onSystemOpen(openSystemDocument);
api.onOpenError((payload) => showToast(`${payload.filePath}: ${payload.message}`));
api.onConfirmClose(() => {
  if (confirmCloseAllTabs()) {
    api.forceClose();
  }
});
api.onMenuCommand((command) => {
  const commandMap = {
    new: () => newDocument(),
    open: () => openDocumentFromDialog(),
    save: () => saveDocument(),
    'save-as': () => saveDocumentAs(),
    'close-tab': () => closeTab(),
    'mode-edit': () => setMode('edit'),
    'mode-split': () => setMode('split'),
    'mode-preview': () => setMode('preview'),
    'theme-light': () => setTheme('light'),
    'theme-vivid': () => setTheme('vivid'),
    'theme-purple': () => setTheme('purple'),
    'theme-mono-dark': () => setTheme('mono-dark'),
    'theme-mono-light': () => setTheme('mono-light')
  };

  commandMap[command]?.();
});

window.addEventListener('keydown', (event) => {
  if (event.key === 'Tab' && document.activeElement === elements.editor) {
    event.preventDefault();
    const start = elements.editor.selectionStart;
    const end = elements.editor.selectionEnd;
    const value = elements.editor.value;
    elements.editor.value = `${value.slice(0, start)}  ${value.slice(end)}`;
    elements.editor.selectionStart = elements.editor.selectionEnd = start + 2;
    elements.editor.dispatchEvent(new Event('input'));
  }
});

async function bootstrap() {
  setTheme(state.theme);
  setMode(state.mode);

  const launchDocument = await api.getLaunchDocument();
  if (launchDocument) {
    await openSystemDocument(launchDocument);
  } else {
    addTab({ filePath: null, content: '' });
  }
}

bootstrap();
