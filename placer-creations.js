// @ts-check
import { button, createStatus, el, formatNumber, input } from './dom.js';
import { isValidSpawnHeight } from './limits.js';
import { parseStructure, serializeStructure } from './structure-io.js';
import { countBlocks } from './structure.js';

/** @typedef {import('./types').Creation} Creation */

/**
 * My creations inside the block placer: save the current structure, open, rename, delete (and publish, when offered).
 * @param {HTMLElement} root
 * @param {{
 *   creations: ReturnType<typeof import('./creations-store.js').createCreationsStore>,
 *   placer: { getDoc: () => { state: import('./structure.js').StructureState, gen: import('./structure-commands.js').PlacementOptions }, loadDoc: (s: import('./structure.js').StructureState, g?: import('./structure-commands.js').PlacementOptions) => void, hasWork: () => boolean },
 *   store: ReturnType<typeof import('./store.js').createStore>,
 *   confirmAction: (message: string) => boolean,
 *   confirmReplace: () => boolean,
 *   onPublish?: (creation: Creation) => void,
 * }} deps
 */
export function initPlacerCreations(root, { creations, placer, store, confirmAction, confirmReplace, onPublish }) {
  const nameInput = input(root, '#pl-save-name');
  const list = el(root, '#pl-creation-list');
  const restoreScript = input(root, '#pl-open-script');
  const setStatus = createStatus(el(root, '#pl-creations-status'));
  /** @type {string | null} */
  let renaming = null;
  /** @type {string | null} */
  let lastId = null;

  const threeD = () => creations.all().filter((c) => c.structure).sort((a, b) => b.savedAt - a.savedAt);

  /** @param {Creation} creation */
  function describe(creation) {
    const parsed = creation.structure ? parseStructure(creation.structure) : null;
    if (!parsed?.ok) return '';
    const d = parsed.state.dims;
    return `${d.width}×${d.height}×${d.length} · ${formatNumber(countBlocks(parsed.state))} blocks · saved ${new Date(creation.savedAt).toLocaleDateString()}`;
  }

  /** @param {string} label @param {() => void} onClick @param {string} [extra] */
  function action(label, onClick, extra = '') {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `btn ${extra}`.trim();
    b.textContent = label;
    b.addEventListener('click', onClick);
    return b;
  }

  function render() {
    const items = threeD();
    list.replaceChildren();
    if (items.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'pl-creation-empty';
      empty.textContent = 'No saved 3D creations yet. Name the current structure above and press Save current.';
      list.append(empty);
      return;
    }
    for (const creation of items) {
      const li = document.createElement('li');
      li.className = 'pl-creation';
      li.dataset.id = creation.id;
      if (creation.id === lastId) li.dataset.current = 'true';

      const head = document.createElement('div');
      head.className = 'pl-creation-head';
      if (renaming === creation.id) {
        const field = document.createElement('input');
        field.type = 'text';
        field.maxLength = 60;
        field.value = creation.name;
        field.setAttribute('aria-label', 'New name');
        const commit = () => {
          // Leave rename mode first: a successful rename re-renders the list through the store subscription.
          renaming = null;
          const result = creations.rename(creation.id, field.value);
          if (!result.ok) {
            renaming = creation.id;
            return setStatus(result.error, 'error');
          }
          setStatus('Renamed.', 'ok');
        };
        field.addEventListener('keydown', (event) => {
          if (event.key === 'Enter') commit();
          if (event.key === 'Escape') {
            renaming = null;
            render();
          }
        });
        head.append(field, action('Save name', commit), action('Cancel', () => ((renaming = null), render())));
        queueMicrotask(() => field.focus());
      } else {
        const name = document.createElement('strong');
        name.textContent = creation.name;
        const meta = document.createElement('span');
        meta.className = 'pl-creation-meta';
        meta.textContent = describe(creation);
        head.append(name, meta);
      }
      li.append(head);

      if (renaming !== creation.id) {
        const row = document.createElement('div');
        row.className = 'pl-creation-actions';
        row.append(
          action('Open', () => open(creation)),
          action('Rename', () => ((renaming = creation.id), render())),
          ...(onPublish ? [action('Publish', () => onPublish(creation))] : []),
          action('Delete', () => remove(creation), 'btn-grey'),
        );
        li.append(row);
      }
      list.append(li);
    }
  }

  /** @param {Creation} creation */
  function open(creation) {
    const parsed = creation.structure ? parseStructure(creation.structure) : null;
    if (!parsed?.ok) return setStatus('This creation\'s structure could not be read.', 'error');
    if (placer.hasWork() && !confirmAction(`Open "${creation.name}"? The current blocks will be replaced. You can undo this.`)) return;
    if (restoreScript.checked && !confirmReplace()) return;
    placer.loadDoc(parsed.state, parsed.gen);
    /** @type {Partial<import('./types').AppState>} */
    const change = { settings: { ...creation.settings } };
    if (restoreScript.checked) change.script = creation.script;
    store.set(change);
    lastId = creation.id;
    render();
    setStatus(`Opened "${creation.name}"${restoreScript.checked ? ' with its script' : ''}. Undo returns to the previous blocks.`, 'ok');
  }

  /** @param {Creation} creation */
  function remove(creation) {
    if (!confirmAction(`Delete "${creation.name}"? This cannot be undone.`)) return;
    const done = creations.remove(creation.id);
    if (!done.ok) return setStatus(done.error, 'error');
    if (lastId === creation.id) lastId = null;
    setStatus(`Deleted "${creation.name}".`, 'ok');
  }

  button(root, '#pl-save').addEventListener('click', () => {
    const name = nameInput.value.trim();
    const { script, settings } = store.get();
    if (!isValidSpawnHeight(settings.spawnHeight)) return setStatus('Fix the spawn height in Settings before saving.', 'error');
    const { state, gen } = placer.getDoc();
    if (countBlocks(state) === 0) return setStatus('Nothing to save: the grid is empty.', 'error');
    const existing = name ? creations.findByName(name) : undefined;
    if (existing && !confirmAction(`A creation named "${existing.name}" already exists. Replace it?`)) return;
    const saved = creations.save({ name, script, settings, structure: /** @type {import('./types').SerializedStructure} */ (serializeStructure(state, gen)) });
    if (!saved.ok) return setStatus(saved.error, 'error');
    lastId = saved.id;
    nameInput.value = '';
    setStatus(saved.updated ? `Updated "${name}".` : `Saved "${name}".`, 'ok');
  });
  nameInput.addEventListener('keydown', (event) => event.key === 'Enter' && button(root, '#pl-save').click());

  creations.subscribe(render);
  render();
}
