// @ts-check
import { MAX_SCRIPT_CHARS } from './limits.js';
import { button, createStatus, el, formatNumber, input, select, textarea } from './dom.js';

/** @typedef {import('./types').GenerateResult} GenerateResult */

/** Keep in sync with --code-lh in components.css. */
const LINE_HEIGHT = 24;
const MAX_IMPORT_BYTES = 1_000_000;

/**
 * Script editor: textarea + line-number gutter, wrap toggle and .mcfunction import.
 * @param {HTMLElement} root
 * @param {ReturnType<typeof import('./store.js').createStore>} store
 * @param {{ onGenerate: () => void, confirmReplace: () => boolean }} options
 */
export function initEditor(root, store, { onGenerate, confirmReplace }) {
  const code = textarea(root, '#code');
  const gutter = el(root, '#gutter');
  const mirror = el(root, '#mirror');
  const wrapSelect = select(root, '#wrap');
  const importButton = button(root, '#import-btn');
  const fileInput = input(root, '#import-file');
  const stats = el(root, '#script-stats');
  const setStatus = createStatus(el(root, '#script-status'));

  let wrapOn = false;
  /** @type {Set<number>} */
  let errorLines = new Set();

  /** Heights of each logical line, accounting for soft wrapping. */
  function measureLines() {
    const lines = code.value.split('\n');
    if (!wrapOn) return lines.map(() => LINE_HEIGHT);

    mirror.style.width = `${code.clientWidth}px`;
    mirror.replaceChildren(
      ...lines.map((line) => {
        const row = document.createElement('div');
        row.textContent = line === '' ? '​' : line;
        return row;
      }),
    );
    return Array.from(mirror.children, (row) => Math.max(LINE_HEIGHT, /** @type {HTMLElement} */ (row).offsetHeight));
  }

  function renderGutter() {
    const heights = measureLines();
    gutter.replaceChildren(
      ...heights.map((height, index) => {
        const row = document.createElement('div');
        row.textContent = String(index + 1);
        row.style.height = `${height}px`;
        if (errorLines.has(index + 1)) row.className = 'has-error';
        return row;
      }),
    );
    gutter.scrollTop = code.scrollTop;
  }

  code.addEventListener('input', () => {
    store.set({ script: code.value });
    renderGutter();
  });
  code.addEventListener('scroll', () => {
    gutter.scrollTop = code.scrollTop;
  });
  code.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      onGenerate();
    }
  });
  new ResizeObserver(() => {
    if (wrapOn) renderGutter();
  }).observe(code);
  document.fonts?.ready.then(renderGutter);

  wrapSelect.addEventListener('change', () => {
    wrapOn = wrapSelect.value === 'on';
    code.classList.toggle('is-wrapped', wrapOn);
    mirror.classList.toggle('is-wrapped', wrapOn);
    code.wrap = wrapOn ? 'soft' : 'off';
    renderGutter();
  });

  importButton.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;

    if (file.size > MAX_IMPORT_BYTES) {
      setStatus(`${file.name} is larger than 1 MB, so it was not imported.`, 'error');
      return;
    }
    let text;
    try {
      text = await file.text();
    } catch {
      setStatus(`${file.name} could not be read.`, 'error');
      return;
    }
    if (text.includes('\u0000')) {
      setStatus(`${file.name} does not look like a text file, so it was not imported.`, 'error');
      return;
    }
    text = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
    if (text.length > MAX_SCRIPT_CHARS) {
      setStatus(`${file.name} is too long to import (over ${formatNumber(MAX_SCRIPT_CHARS)} characters).`, 'error');
      return;
    }
    if (!confirmReplace()) return;

    store.set({ script: text });
    setStatus(`Imported ${file.name}.`, 'ok');
  });

  return {
    /** Sync the textarea when the script was changed from elsewhere (examples, links). */
    syncFromState() {
      const script = store.get().script;
      if (code.value !== script) {
        code.value = script;
        renderGutter();
      }
    },

    /** @param {GenerateResult} result */
    update(result) {
      errorLines = new Set(result.diagnostics.filter((d) => d.severity === 'error' && d.line).map((d) => /** @type {number} */ (d.line)));
      const n = result.commandCount;
      stats.textContent = `${formatNumber(n)} ${n === 1 ? 'command' : 'commands'} · ${formatNumber(result.commandChars)} ${result.commandChars === 1 ? 'character' : 'characters'}`;
      renderGutter();
    },

    focus() {
      code.focus();
    },
  };
}
