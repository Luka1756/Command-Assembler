// @ts-check
import { parseScript } from './parse.js';
import { DEFAULT_SCRIPT } from './settings.js';
import { defaultImportMode, mergeIntoScript, readCommands } from './reader.js';
import { button, createStatus, el, formatNumber, textarea } from './dom.js';

/** @typedef {import('./types').ReadResult} ReadResult */

/** Rows rendered in the preview; every command is still imported. */
const PREVIEW_LIMIT = 300;

/**
 * @param {number} n
 * @param {string} noun
 */
const plural = (n, noun) => `${formatNumber(n)} ${noun}${n === 1 ? '' : 's'}`;

/**
 * Command Reader panel: paste, preview, then import into the script on confirmation.
 * Nothing touches the script until "Import" is pressed.
 * @param {HTMLElement} root
 * @param {ReturnType<typeof import('./store.js').createStore>} store
 * @param {{ confirmReplace: () => boolean, onImported: () => void }} options
 */
export function initReaderPanel(root, store, { confirmReplace, onImported }) {
  const input = textarea(root, '#reader-input');
  const readButton = button(root, '#reader-read');
  const clearButton = button(root, '#reader-clear');
  const importButton = button(root, '#reader-import');
  const cancelButton = button(root, '#reader-cancel');
  const preview = el(root, '#reader-preview');
  const summary = el(root, '#reader-summary');
  const list = el(root, '#reader-list');
  const skippedWrap = /** @type {HTMLDetailsElement} */ (el(root, '#reader-skipped-wrap'));
  const skippedTitle = el(root, '#reader-skipped-title');
  const skippedList = el(root, '#reader-skipped');
  const warningsWrap = /** @type {HTMLDetailsElement} */ (el(root, '#reader-warnings-wrap'));
  const warningsTitle = el(root, '#reader-warnings-title');
  const warningsList = el(root, '#reader-warnings');
  const modeSet = el(root, '#reader-mode');
  const modeAppendLabel = el(root, '#reader-mode-append');
  const modeReplaceLabel = el(root, '#reader-mode-replace');
  const radios = Array.from(root.querySelectorAll('input[name="reader-mode"]'), (r) => /** @type {HTMLInputElement} */ (r));
  const setStatus = createStatus(el(root, '#reader-status'));

  /** @type {ReadResult | null} */
  let pending = null;

  const existingCommands = () => parseScript(store.get().script).commands.length;

  /** @returns {'append' | 'replace'} */
  const chosenMode = () => (radios.find((r) => r.checked)?.value === 'append' ? 'append' : 'replace');

  /**
   * @param {HTMLElement} target
   * @param {{ line: number, message: string }[]} items
   */
  function fillIssues(target, items) {
    target.replaceChildren(
      ...items.map((item) => {
        const li = document.createElement('li');
        li.textContent = `Line ${item.line}: ${item.message}`;
        return li;
      }),
    );
  }

  /** Keep the add-to-script choice in step with the current script. */
  function refreshMode() {
    if (!pending) return;
    const { script } = store.get();
    const existing = existingCommands();
    const hasExisting = existing > 0;
    modeSet.hidden = !hasExisting;
    modeAppendLabel.textContent = `Append after the ${plural(existing, 'command')} already in the script`;
    modeReplaceLabel.textContent = `Replace the current script (${plural(existing, 'command')} will be removed)`;

    const wanted = defaultImportMode(script, DEFAULT_SCRIPT, existing);
    if (!radios.some((r) => r.checked) || !hasExisting) {
      for (const r of radios) r.checked = r.value === (hasExisting ? wanted : 'replace');
    }
    importButton.textContent = `Import ${plural(pending.commands.length, 'command')}`;
  }

  function hidePreview() {
    pending = null;
    preview.hidden = true;
    for (const r of radios) r.checked = false;
  }

  /** @param {ReadResult} result */
  function showPreview(result) {
    pending = result;
    const { commands, skipped, warnings } = result;

    summary.textContent =
      `${plural(commands.length, 'command')} found` +
      ` · ${formatNumber(skipped.length)} skipped` +
      ` · ${plural(warnings.length, 'warning')}`;

    const shown = commands.slice(0, PREVIEW_LIMIT);
    list.replaceChildren(
      ...shown.map((command) => {
        const li = document.createElement('li');
        const code = document.createElement('code');
        code.textContent = command.text;
        const where = document.createElement('span');
        where.className = 'reader-line';
        where.textContent = `line ${command.line}`;
        li.append(code, where);
        return li;
      }),
    );
    if (commands.length > shown.length) {
      const more = document.createElement('li');
      more.className = 'reader-more';
      more.textContent = `…and ${formatNumber(commands.length - shown.length)} more. All ${formatNumber(commands.length)} will be imported.`;
      list.append(more);
    }
    list.hidden = commands.length === 0;

    skippedWrap.hidden = skipped.length === 0;
    skippedWrap.open = skipped.length > 0;
    skippedTitle.textContent = `${plural(skipped.length, 'entry')} skipped`;
    fillIssues(skippedList, skipped);

    warningsWrap.hidden = warnings.length === 0;
    warningsWrap.open = warnings.length > 0;
    warningsTitle.textContent = plural(warnings.length, 'warning');
    fillIssues(warningsList, warnings);

    for (const r of radios) r.checked = false;
    importButton.disabled = commands.length === 0;
    preview.hidden = false;
    refreshMode();
  }

  function run() {
    const result = readCommands(input.value);
    if (result.error) {
      hidePreview();
      setStatus(result.error, 'error');
      return;
    }
    if (result.commands.length === 0 && result.skipped.length === 0) {
      hidePreview();
      setStatus('No Command fields were found in this text. See "Supported input" for what can be read.', 'error');
      return;
    }
    setStatus('');
    showPreview(result);
  }

  readButton.addEventListener('click', run);
  input.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      run();
    }
  });
  // Editing the source makes the preview stale, so it is dropped rather than imported by mistake.
  input.addEventListener('input', () => {
    if (pending) {
      hidePreview();
      setStatus('The text changed. Read it again to refresh the preview.', 'info');
    }
  });

  clearButton.addEventListener('click', () => {
    input.value = '';
    hidePreview();
    setStatus('');
    input.focus();
  });

  cancelButton.addEventListener('click', () => {
    hidePreview();
    setStatus('Import cancelled. Your script was not changed.', 'info');
  });

  importButton.addEventListener('click', () => {
    if (!pending || pending.commands.length === 0) return;
    const mode = chosenMode();
    const before = existingCommands();
    if (mode === 'replace' && before > 0 && !confirmReplace()) return;

    const count = pending.commands.length;
    const script = mergeIntoScript(store.get().script, pending.commands, mode);
    store.set({ script });
    hidePreview();
    setStatus(
      mode === 'append' && before > 0
        ? `Imported ${plural(count, 'command')} after the existing ${plural(before, 'command')}.`
        : `Imported ${plural(count, 'command')}${before > 0 ? ', replacing the previous script' : ''}.`,
      'ok',
    );
    onImported();
  });

  return { refreshMode };
}
