const { contextBridge, ipcRenderer } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');
const MarkdownIt = require('markdown-it');
const markdownItFootnote = require('markdown-it-footnote');
const markdownItTaskLists = require('markdown-it-task-lists');
const hljs = require('highlight.js');
const sanitizeHtml = require('sanitize-html');

function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isExternalOrSpecialUrl(value) {
  return /^(https?:|mailto:|tel:|data:|#)/i.test(value);
}

function isWindowsAbsolutePath(value) {
  return /^[a-zA-Z]:[\\/]/.test(value);
}

function resolveLocalResource(value, baseFilePath) {
  if (!value || !baseFilePath || isExternalOrSpecialUrl(value)) {
    return value;
  }

  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value) && !isWindowsAbsolutePath(value)) {
    return value;
  }

  const hashIndex = value.indexOf('#');
  const resource = hashIndex >= 0 ? value.slice(0, hashIndex) : value;
  const hash = hashIndex >= 0 ? value.slice(hashIndex) : '';

  const resolved = path.resolve(path.dirname(baseFilePath), resource);
  return `${pathToFileURL(resolved).href}${hash}`;
}

function createMarkdownRenderer() {
  const md = new MarkdownIt({
    html: false,
    linkify: true,
    typographer: true,
    breaks: false,
    highlight(code, language) {
      const trimmedLanguage = language && language.trim();
      if (trimmedLanguage && hljs.getLanguage(trimmedLanguage)) {
        try {
          const highlighted = hljs.highlight(code, {
            language: trimmedLanguage,
            ignoreIllegals: true
          }).value;
          return `<pre class="hljs"><code class="language-${escapeHtml(trimmedLanguage)}">${highlighted}</code></pre>`;
        } catch {
          return `<pre class="hljs"><code>${escapeHtml(code)}</code></pre>`;
        }
      }

      return `<pre class="hljs"><code>${escapeHtml(code)}</code></pre>`;
    }
  })
    .use(markdownItFootnote)
    .use(markdownItTaskLists, { enabled: false, label: false });

  const defaultImageRule = md.renderer.rules.image;
  md.renderer.rules.image = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const srcIndex = token.attrIndex('src');
    if (srcIndex >= 0) {
      token.attrs[srcIndex][1] = resolveLocalResource(token.attrs[srcIndex][1], env.filePath);
    }
    token.attrSet('loading', 'lazy');
    return defaultImageRule(tokens, idx, options, env, self);
  };

  const defaultLinkOpenRule =
    md.renderer.rules.link_open ||
    ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));

  md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const hrefIndex = token.attrIndex('href');
    if (hrefIndex >= 0) {
      token.attrs[hrefIndex][1] = resolveLocalResource(token.attrs[hrefIndex][1], env.filePath);
    }
    token.attrSet('target', '_blank');
    token.attrSet('rel', 'noreferrer');
    return defaultLinkOpenRule(tokens, idx, options, env, self);
  };

  return md;
}

const markdownRenderer = createMarkdownRenderer();

function renderMarkdown(source, filePath) {
  const rendered = markdownRenderer.render(source || '', { filePath });
  return sanitizeHtml(rendered, {
    allowedTags: [
      ...sanitizeHtml.defaults.allowedTags,
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'img',
      'hr',
      'table',
      'thead',
      'tbody',
      'tr',
      'th',
      'td',
      'del',
      'input',
      'span',
      'sup',
      'sub'
    ],
    allowedAttributes: {
      a: ['href', 'target', 'rel', 'name', 'id'],
      img: ['src', 'alt', 'title', 'loading'],
      code: ['class'],
      pre: ['class'],
      span: ['class'],
      input: ['type', 'checked', 'disabled', 'class'],
      h1: ['id'],
      h2: ['id'],
      h3: ['id'],
      h4: ['id'],
      h5: ['id'],
      h6: ['id'],
      li: ['class'],
      ol: ['class'],
      ul: ['class'],
      sup: ['class', 'id'],
      table: ['class']
    },
    allowedClasses: {
      code: ['language-*'],
      pre: ['hljs'],
      span: [/^hljs-/],
      input: ['task-list-item-checkbox'],
      li: ['task-list-item'],
      ul: ['contains-task-list']
    },
    allowedSchemes: ['http', 'https', 'mailto', 'tel', 'data', 'file'],
    allowedSchemesByTag: {
      img: ['http', 'https', 'data', 'file'],
      a: ['http', 'https', 'mailto', 'tel', 'file']
    }
  });
}

contextBridge.exposeInMainWorld('markdownApp', {
  platform: process.platform,
  renderMarkdown,
  getLaunchDocument: () => ipcRenderer.invoke('app:get-launch-document'),
  openFile: () => ipcRenderer.invoke('dialog:open-file'),
  saveFile: (filePath, content) => ipcRenderer.invoke('file:save', { filePath, content }),
  saveFileAs: (filePath, content) => ipcRenderer.invoke('dialog:save-file-as', { filePath, content }),
  openExternal: (href) => ipcRenderer.invoke('app:open-external', href),
  setDirty: (dirty) => ipcRenderer.send('app:set-dirty', dirty),
  forceClose: () => ipcRenderer.send('app:force-close'),
  onSystemOpen: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('file:open-from-system', listener);
    return () => ipcRenderer.removeListener('file:open-from-system', listener);
  },
  onOpenError: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('file:open-error', listener);
    return () => ipcRenderer.removeListener('file:open-error', listener);
  },
  onMenuCommand: (callback) => {
    const listener = (_event, command) => callback(command);
    ipcRenderer.on('menu:command', listener);
    return () => ipcRenderer.removeListener('menu:command', listener);
  },
  onConfirmClose: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('app:confirm-close', listener);
    return () => ipcRenderer.removeListener('app:confirm-close', listener);
  }
});
