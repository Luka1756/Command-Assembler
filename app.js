// @ts-check
import { generate } from './build.js';
import { decodeSetup, extractPayload } from './share.js';
import { DEFAULT_SCRIPT, DEFAULT_SETTINGS } from './settings.js';
import { createStore } from './store.js';
import { loadWorkspace, saveWorkspace } from './storage.js';
import { createNotifier, initCollapsibles, initTabs } from './chrome.js';
import { el } from './dom.js';
import { initEditor } from './editor.js';
import { initLibrary } from './library.js';
import { initOutputPanel } from './output-panel.js';
import { initReaderPanel } from './reader-panel.js';
import { initSettingsPanel } from './settings-panel.js';
import { TEMPLATE } from './template.js';

/** @typedef {import('./types').AppState} AppState */

/** @param {HTMLElement} root */
export function mountApp(root) {
  root.innerHTML = TEMPLATE;
  const notify = createNotifier(el(root, '#notice-slot'));

  /** @returns {AppState} */
  const defaults = () => ({ script: DEFAULT_SCRIPT, settings: { ...DEFAULT_SETTINGS } });

  // Starting state: a shared link wins, then the last session, then defaults.
  let initial = loadWorkspace() ?? defaults();
  /** Applies a shared link; returns the setup to load, or null. */
  function readShareLink() {
    const payload = extractPayload(window.location.hash);
    if (payload === null) return null;
    const decoded = decodeSetup(payload);
    // Remove the setup from the address bar either way, so it is not re-applied by accident.
    history.replaceState(null, '', window.location.pathname + window.location.search);
    if (decoded.ok) {
      notify('Loaded a shared setup. Your previous work stays saved until you edit this one.', 'info');
      return decoded.state;
    }
    notify(`The shared link could not be opened. ${decoded.error}`, 'error');
    return null;
  }
  const shared = readShareLink();
  if (shared) initial = shared;

  const store = createStore(initial);

  const library = initLibrary(root, store, { confirmReplace });
  /** Confirm before replacing a script that exists nowhere else. */
  function confirmReplace() {
    if (!library.hasUnsavedWork(store.get().script)) return true;
    return window.confirm('Replace the current script? Its content is not saved in My creations.');
  }

  const output = initOutputPanel(root, store);
  const settingsPanel = initSettingsPanel(root, store);
  const editor = initEditor(root, store, {
    onGenerate: () => {
      recompute();
      output.scrollIntoView();
    },
    confirmReplace,
  });
  const reader = initReaderPanel(root, store, {
    confirmReplace,
    // Show the result of an import: bring the script into view.
    onImported: () =>
      el(root, '#script').scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block: 'start',
      }),
  });
  const collapsibles = initCollapsibles(root);
  initTabs(root, collapsibles.expand);

  function recompute() {
    const { script, settings } = store.get();
    const result = generate(script, settings);
    editor.update(result);
    output.render(result);
  }

  // Persist the working copy shortly after changes (never for a freshly opened shared link).
  /** @type {number | undefined} */
  let saveTimer;
  let dirty = false;
  store.subscribe((state, meta) => {
    editor.syncFromState();
    settingsPanel.sync();
    reader.refreshMode();
    recompute();
    if (meta.persist) {
      dirty = true;
      window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(() => saveWorkspace(state), 300);
    }
  });
  window.addEventListener('pagehide', () => {
    if (!dirty) return;
    window.clearTimeout(saveTimer);
    saveWorkspace(store.get());
  });

  // A share link opened in a tab that is already running the app.
  window.addEventListener('hashchange', () => {
    const next = readShareLink();
    if (next) store.set(next, { persist: false });
  });

  editor.syncFromState();
  recompute();
}
