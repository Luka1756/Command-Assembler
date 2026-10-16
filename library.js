// @ts-check
import { isValidSpawnHeight } from './limits.js';
import { EXAMPLES } from './examples.js';
import { DEFAULT_SCRIPT } from './settings.js';
import { MAX_CREATIONS, MAX_NAME_CHARS, loadCreations, saveCreations } from './storage.js';
import { button, createStatus, el, input, select } from './dom.js';

/** @typedef {import('./types').Creation} Creation */

/** @returns {string} */
function newId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Example library: bundled community examples (read-only) and the user's own
 * creations (saved in this browser).
 * @param {HTMLElement} root
 * @param {ReturnType<typeof import('./store.js').createStore>} store
 * @param {{ confirmReplace: () => boolean }} options
 */
export function initLibrary(root, store, { confirmReplace }) {
  const sourceButtons = Array.from(root.querySelectorAll('.source-row'), (b) => /** @type {HTMLButtonElement} */ (b));
  const countMine = el(root, '#count-mine');
  const countCommunity = el(root, '#count-community');
  const exampleSelect = select(root, '#example-select');
  const loadButton = button(root, '#load-example');
  const deleteButton = button(root, '#delete-creation');
  const description = el(root, '#example-desc');
  const mineTools = el(root, '#mine-tools');
  const nameInput = input(root, '#creation-name');
  const saveButton = button(root, '#save-creation');
  const setStatus = createStatus(el(root, '#library-status'));

  /** @type {'mine' | 'community'} */
  let source = 'community';
  let creations = loadCreations();

  /** @param {string} id */
  const findCreation = (id) => creations.find((c) => c.id === id);

  function fillSelect(selectedId = '') {
    exampleSelect.replaceChildren();
    const empty = source === 'mine' && creations.length === 0;
    exampleSelect.add(new Option(empty ? 'No saved creations yet' : 'Choose an example…', ''));

    if (source === 'community') {
      /** @type {Map<string, HTMLOptGroupElement>} */
      const groups = new Map();
      for (const example of EXAMPLES) {
        let group = groups.get(example.category);
        if (!group) {
          group = document.createElement('optgroup');
          group.label = example.category;
          groups.set(example.category, group);
          exampleSelect.append(group);
        }
        group.append(new Option(example.title, example.id));
      }
    } else {
      for (const creation of [...creations].sort((a, b) => b.savedAt - a.savedAt)) {
        exampleSelect.add(new Option(creation.name, creation.id));
      }
    }
    exampleSelect.disabled = empty;
    exampleSelect.value = selectedId;
    if (exampleSelect.value !== selectedId) exampleSelect.value = '';
  }

  function describeSelection() {
    const id = exampleSelect.value;
    loadButton.disabled = !id;
    deleteButton.disabled = !id;
    if (!id) {
      description.textContent =
        source === 'community'
          ? 'Bundled examples. Loading one replaces the script and keeps your build settings.'
          : 'Your saved scripts and their build settings, stored in this browser only.';
    } else if (source === 'community') {
      description.textContent = EXAMPLES.find((example) => example.id === id)?.description ?? '';
    } else {
      const creation = findCreation(id);
      description.textContent = creation
        ? `Saved ${new Date(creation.savedAt).toLocaleDateString()}. Loading restores the script and its build settings.`
        : '';
    }
  }

  function refresh(selectedId = '') {
    countMine.textContent = String(creations.length);
    countCommunity.textContent = String(EXAMPLES.length);
    for (const b of sourceButtons) b.setAttribute('aria-pressed', String(b.dataset.source === source));
    mineTools.hidden = source !== 'mine';
    deleteButton.hidden = source !== 'mine';
    fillSelect(selectedId);
    describeSelection();
  }

  for (const b of sourceButtons) {
    b.addEventListener('click', () => {
      source = /** @type {'mine' | 'community'} */ (b.dataset.source);
      setStatus('');
      refresh();
    });
  }
  exampleSelect.addEventListener('change', describeSelection);

  loadButton.addEventListener('click', () => {
    const id = exampleSelect.value;
    if (!id) return;

    if (source === 'community') {
      const example = EXAMPLES.find((item) => item.id === id);
      if (!example || !confirmReplace()) return;
      store.set({ script: example.script });
      setStatus(`Loaded "${example.title}". Your build settings were kept.`, 'ok');
    } else {
      const creation = findCreation(id);
      if (!creation || !confirmReplace()) return;
      store.set({ script: creation.script, settings: { ...creation.settings } });
      setStatus(`Loaded "${creation.name}" with its saved build settings.`, 'ok');
    }
  });

  saveButton.addEventListener('click', () => {
    const name = nameInput.value.trim();
    const { script, settings } = store.get();
    if (!name) return setStatus('Enter a name for this creation.', 'error');
    if (name.length > MAX_NAME_CHARS) return setStatus(`Names can be up to ${MAX_NAME_CHARS} characters.`, 'error');
    if (!script.trim()) return setStatus('Nothing to save: the script is empty.', 'error');
    if (!isValidSpawnHeight(settings.spawnHeight)) return setStatus('Fix the spawn height before saving.', 'error');

    const existing = creations.find((c) => c.name.toLowerCase() === name.toLowerCase());
    if (!existing && creations.length >= MAX_CREATIONS) {
      return setStatus(`You can save up to ${MAX_CREATIONS} creations. Delete one first.`, 'error');
    }

    /** @type {Creation} */
    const creation = { id: existing?.id ?? newId(), name, script, settings: { ...settings }, savedAt: Date.now() };
    const next = existing ? creations.map((c) => (c.id === existing.id ? creation : c)) : [...creations, creation];
    const saved = saveCreations(next);
    if (!saved.ok) return setStatus(saved.error, 'error');

    creations = next;
    source = 'mine';
    nameInput.value = '';
    refresh(creation.id);
    setStatus(existing ? `Updated "${name}".` : `Saved "${name}".`, 'ok');
  });

  deleteButton.addEventListener('click', () => {
    const creation = findCreation(exampleSelect.value);
    if (!creation) return;
    if (!window.confirm(`Delete "${creation.name}"? This cannot be undone.`)) return;
    const next = creations.filter((c) => c.id !== creation.id);
    const saved = saveCreations(next);
    if (!saved.ok) return setStatus(saved.error, 'error');
    creations = next;
    refresh();
    setStatus(`Deleted "${creation.name}".`, 'ok');
  });

  refresh();

  return {
    /**
     * True when the script has content that exists nowhere else
     * (not the default, an example or a saved creation).
     * @param {string} script
     */
    hasUnsavedWork(script) {
      const trimmed = script.trim();
      if (trimmed === '' || trimmed === DEFAULT_SCRIPT) return false;
      if (EXAMPLES.some((example) => example.script.trim() === trimmed)) return false;
      return !creations.some((creation) => creation.script.trim() === trimmed);
    },
  };
}
