// @ts-check
import { generate } from './build.js';
import { decodeAnySetup, decodeSetup, extractPayload } from './share.js';
import { DEFAULT_SCRIPT, DEFAULT_SETTINGS } from './settings.js';
import { createStore } from './store.js';
import { loadWorkspace, saveWorkspace } from './storage.js';
import { createNotifier, initCollapsibles, initTabs } from './chrome.js';
import { el } from './dom.js';
import { initEditor } from './editor.js';
import { initCommunityPanel } from './community-panel.js';
import { createCreationsStore } from './creations-store.js';
import { initPlacerCreations } from './placer-creations.js';
import { initPlacerPanel } from './placer-panel.js';
import { createRouter } from './router.js';
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
  /**
   * Opens a shared link. Old links (plain) are read at once. Compact links need an asynchronous decompress, so they
   * are applied a moment later through `applyAsync`. The setup is removed from the address bar either way.
   * @param {(state: AppState) => void} applyAsync
   * @returns {AppState | null}
   */
  function readShareLink(applyAsync) {
    const payload = extractPayload(window.location.hash);
    if (payload === null) return null;
    history.replaceState(null, '', window.location.pathname + window.location.search);
    const done = (/** @type {Awaited<ReturnType<typeof decodeAnySetup>>} */ decoded) => {
      if (decoded.ok) {
        notify('Loaded a shared setup. Your previous work stays saved until you edit this one.', 'info');
        return decoded.state;
      }
      notify(`The shared link could not be opened. ${decoded.error}`, 'error');
      return null;
    };
    if (payload.startsWith('z1.')) {
      void decodeAnySetup(payload).then((decoded) => {
        const state = done(decoded);
        if (state) applyAsync(state);
      });
      return null;
    }
    return done(decodeSetup(payload));
  }
  /** @type {(state: AppState) => void} */
  let applyShared = () => {};
  const shared = readShareLink((state) => applyShared(state));
  if (shared) initial = shared;

  const store = createStore(initial);

  const creations = createCreationsStore();
  if (creations.issues.length > 0) notify(`Some saved creations were partly restored. ${creations.issues.join(' ')}`, 'error');
  /** @type {(creation: import('./types').Creation) => void} */
  let publish = () => {};
  const library = initLibrary(root, store, creations, { confirmReplace, onPublish: (creation) => publish(creation) });
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
  const placer = initPlacerPanel(root, store, {
    confirmReplace,
    confirmAction: (message) => window.confirm(message),
    // Show the result: the generated machine and its length information are in the output panel.
    onAdded: () => {},
  });
  const community = initCommunityPanel(root, {
    creations,
    store,
    placer,
    confirmAction: (message) => window.confirm(message),
    confirmReplace,
    navigate: (hash) => {
      window.location.hash = hash;
    },
  });
  publish = community.openPublish;
  initPlacerCreations(root, { creations, placer, store, confirmAction: (message) => window.confirm(message), confirmReplace, onPublish: community.openPublish });
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
    placer.refresh();
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
  applyShared = (state) => store.set(state, { persist: false });
  window.addEventListener('hashchange', () => {
    const next = readShareLink(applyShared);
    if (next) store.set(next, { persist: false });
  });

  editor.syncFromState();
  recompute();
  createRouter(root, () => {});
}
