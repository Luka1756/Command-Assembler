// @ts-check
import {
  CATEGORIES,
  COMMUNITY_URL,
  buildEntry,
  buildSubmission,
  filterEntries,
  importName,
  issueUrl,
  loadSubmitted,
  markSubmitted,
  parseIndex,
} from './community.js';
import { copyText } from './clipboard.js';
import { button, createStatus, el, formatNumber, input, select } from './dom.js';
import { MAX_NAME_CHARS } from './storage.js';
import { generateStructureCommands } from './structure-commands.js';
import { parseStructure } from './structure-io.js';
import { drawStructurePreview } from './preview.js';
import { countBlocks } from './structure.js';

/** @typedef {import('./community.js').CommunityEntry} CommunityEntry */
/** @typedef {import('./types').Creation} Creation */

/**
 * The community library page and the publish dialog.
 * @param {HTMLElement} root
 * @param {{
 *   creations: ReturnType<typeof import('./creations-store.js').createCreationsStore>,
 *   store: ReturnType<typeof import('./store.js').createStore>,
 *   placer: { loadDoc: (s: import('./structure.js').StructureState, g?: import('./structure-commands.js').PlacementOptions) => void, hasWork: () => boolean },
 *   confirmAction: (message: string) => boolean,
 *   confirmReplace: () => boolean,
 *   navigate: (hash: string) => void,
 * }} deps
 */
export function initCommunityPanel(root, { creations, store, placer, confirmAction, confirmReplace, navigate }) {
  const listView = el(root, '#cm-list-view');
  const detailView = el(root, '#cm-detail-view');
  const detail = el(root, '#cm-detail');
  const grid = el(root, '#cm-grid');
  const search = input(root, '#cm-search');
  const categorySelect = select(root, '#cm-category');
  const sortSelect = select(root, '#cm-sort');
  const count = el(root, '#cm-count');
  const empty = el(root, '#cm-empty');
  const emptyTitle = el(root, '#cm-empty-title');
  const emptyText = el(root, '#cm-empty-text');
  const retry = button(root, '#cm-retry');
  const setStatus = createStatus(el(root, '#cm-status'));

  /** @type {CommunityEntry[]} */
  let entries = [];
  /** @type {'idle' | 'loading' | 'ready' | 'failed'} */
  let phase = 'idle';
  let skipped = 0;
  let failure = '';
  /** @type {Promise<void> | null} */
  let loading = null;

  for (const c of CATEGORIES) categorySelect.add(new Option(c, c));

  /** Load the library file once (again on retry). Safe to call repeatedly. */
  function load(force = false) {
    if (loading && !force) return loading;
    phase = 'loading';
    loading = (async () => {
      try {
        const response = await fetch(COMMUNITY_URL, { cache: 'no-cache' });
        if (!response.ok) throw new Error(`The library file returned ${response.status}.`);
        const parsed = parseIndex(await response.json());
        if (!parsed.ok) throw new Error(parsed.error);
        entries = parsed.entries;
        skipped = parsed.skipped;
        phase = 'ready';
      } catch (error) {
        phase = 'failed';
        failure = error instanceof Error ? error.message : 'The library could not be loaded.';
      }
    })().then(() => render());
    render();
    return loading;
  }

  // ---------- previews ----------
  /** @param {CommunityEntry} entry @param {string} className */
  function previewNode(entry, className) {
    if (entry.kind === 'structure' && entry.structure) {
      const parsed = parseStructure(entry.structure);
      if (parsed.ok) {
        const canvas = document.createElement('canvas');
        canvas.className = className;
        canvas.setAttribute('role', 'img');
        canvas.setAttribute('aria-label', `Preview of ${entry.name}`);
        queueMicrotask(() => drawStructurePreview(canvas, parsed.state));
        return canvas;
      }
    }
    const pre = document.createElement('pre');
    pre.className = `${className} cm-code`;
    pre.textContent = entry.script.split('\n').slice(0, className.includes('big') ? 12 : 5).join('\n');
    return pre;
  }

  // ---------- list ----------
  function render() {
    const route = /^#\/community\/(.+)$/.exec(window.location.hash);
    listView.hidden = route !== null;
    detailView.hidden = route === null;
    if (route) return renderDetail(decodeURIComponent(route[1]));

    const shown = filterEntries(entries, { query: search.value, category: categorySelect.value, sort: sortSelect.value === 'name' ? 'name' : 'newest' });
    grid.replaceChildren();
    empty.hidden = true;
    retry.hidden = true;

    if (phase === 'loading' || phase === 'idle') {
      count.textContent = 'Loading…';
      return;
    }
    if (phase === 'failed') {
      count.textContent = '';
      empty.hidden = false;
      emptyTitle.textContent = 'The library could not be loaded';
      emptyText.textContent = `${failure} Check your connection and try again. Your own creations are not affected.`;
      retry.hidden = false;
      return;
    }
    count.textContent = `${formatNumber(shown.length)} of ${formatNumber(entries.length)} ${entries.length === 1 ? 'creation' : 'creations'}${skipped > 0 ? ` · ${formatNumber(skipped)} skipped because they were not valid` : ''}`;
    if (entries.length === 0) {
      empty.hidden = false;
      emptyTitle.textContent = 'Nothing has been published yet';
      emptyText.textContent = 'When creations are submitted and accepted, they will appear here. You can be first: save a creation in the Block placer, then choose Publish in My creations.';
      return;
    }
    if (shown.length === 0) {
      empty.hidden = false;
      emptyTitle.textContent = 'No matches';
      emptyText.textContent = 'Try a different search or category.';
      return;
    }
    for (const entry of shown) grid.append(card(entry));
  }

  /** @param {CommunityEntry} entry */
  function card(entry) {
    const li = document.createElement('li');
    li.className = 'cm-card';
    li.dataset.id = entry.id;
    const name = document.createElement('h2');
    name.className = 'cm-card-name';
    name.textContent = entry.name;
    const desc = document.createElement('p');
    desc.className = 'cm-card-desc';
    desc.textContent = entry.description;
    const meta = document.createElement('p');
    meta.className = 'cm-meta';
    meta.textContent = [`by ${entry.author}`, entry.category, entry.kind === 'structure' ? '3D structure' : 'Script', entry.published].filter(Boolean).join(' · ');
    const actions = document.createElement('div');
    actions.className = 'cm-actions';
    const inspect = document.createElement('a');
    inspect.className = 'btn';
    inspect.href = `#/community/${encodeURIComponent(entry.id)}`;
    inspect.textContent = 'Inspect';
    inspect.setAttribute('aria-label', `Inspect ${entry.name}`);
    const importBtn = document.createElement('button');
    importBtn.type = 'button';
    importBtn.className = 'btn';
    importBtn.textContent = 'Import';
    importBtn.setAttribute('aria-label', `Import ${entry.name} to My creations`);
    importBtn.addEventListener('click', () => importEntry(entry));
    actions.append(inspect, importBtn);
    li.append(previewNode(entry, 'cm-preview'), name, desc, meta, actions);
    return li;
  }

  // ---------- inspect ----------
  /** @param {string} id */
  function renderDetail(id) {
    detail.replaceChildren();
    if (phase !== 'ready') {
      const p = document.createElement('p');
      p.textContent = phase === 'failed' ? failure : 'Loading…';
      detail.append(p);
      return;
    }
    const entry = entries.find((e) => e.id === id);
    if (!entry) {
      const p = document.createElement('p');
      p.textContent = 'That creation is not in the library.';
      detail.append(p);
      return;
    }
    const h = document.createElement('h2');
    h.className = 'cm-card-name';
    h.textContent = entry.name;
    const meta = document.createElement('p');
    meta.className = 'cm-meta';
    meta.textContent = [`by ${entry.author} (not verified)`, entry.category, entry.kind === 'structure' ? '3D structure' : 'Script', `Minecraft ${entry.settings.version}`, entry.published].filter(Boolean).join(' · ');
    const desc = document.createElement('p');
    desc.className = 'cm-detail-desc';
    desc.textContent = entry.description;
    detail.append(h, meta, desc);

    /** @type {string} */
    let commands = entry.script;
    if (entry.kind === 'structure' && entry.structure) {
      const parsed = parseStructure(entry.structure);
      if (parsed.ok) {
        const d = parsed.state.dims;
        const facts = document.createElement('p');
        facts.className = 'cm-meta';
        facts.textContent = `${d.width} × ${d.height} × ${d.length} grid · ${formatNumber(countBlocks(parsed.state))} blocks`;
        detail.append(previewNode(entry, 'cm-preview cm-big'), facts);
        const generated = generateStructureCommands(parsed.state, entry.settings.version, parsed.gen);
        commands = generated.ok ? generated.commands.join('\n') : generated.errors.join('\n');
      }
    }
    const heading = document.createElement('h3');
    heading.className = 'cm-subhead';
    heading.textContent = entry.kind === 'structure' ? 'Commands this structure generates' : 'Script';
    const pre = document.createElement('pre');
    pre.className = 'e3-cmds cm-commands';
    pre.tabIndex = 0;
    pre.textContent = commands.length > 20_000 ? `${commands.slice(0, 20_000)}\n… (shortened here; the full text is imported)` : commands;
    const note = document.createElement('p');
    note.className = 'hint';
    note.textContent = 'Reviewed by the maintainer for format, not tested in game. Check the version and try it in a backup world first. Nothing here runs until you use it yourself.';

    const actions = document.createElement('div');
    actions.className = 'cm-actions';
    const importBtn = document.createElement('button');
    importBtn.type = 'button';
    importBtn.className = 'btn btn-primary';
    importBtn.textContent = 'Import to My creations';
    importBtn.addEventListener('click', () => importEntry(entry));
    const useBtn = document.createElement('button');
    useBtn.type = 'button';
    useBtn.className = 'btn';
    useBtn.textContent = entry.kind === 'structure' ? 'Open in Block placer' : 'Load into the script';
    useBtn.addEventListener('click', () => use(entry));
    actions.append(importBtn, useBtn);
    detail.append(heading, pre, note, actions);
  }

  // ---------- import and use ----------
  /** @param {CommunityEntry} entry */
  function importEntry(entry) {
    const name = importName(entry.name, (n) => creations.findByName(n) !== undefined, MAX_NAME_CHARS);
    const saved = creations.save({ name, script: entry.script, settings: entry.settings, structure: entry.structure ?? undefined });
    setStatus(saved.ok ? `Imported "${name}" to My creations.` : saved.error, saved.ok ? 'ok' : 'error');
    if (!saved.ok) window.alert(saved.error);
  }

  /** @param {CommunityEntry} entry */
  function use(entry) {
    if (entry.kind === 'structure' && entry.structure) {
      const parsed = parseStructure(entry.structure);
      if (!parsed.ok) return setStatus(parsed.error, 'error');
      if (placer.hasWork() && !confirmAction(`Open "${entry.name}"? The blocks in the Block placer will be replaced. You can undo this in the placer.`)) return;
      placer.loadDoc(parsed.state, parsed.gen);
      navigate('#/placer');
    } else {
      if (!confirmReplace()) return;
      store.set({ script: entry.script });
      navigate('#/');
    }
  }

  // ---------- publish dialog ----------
  const dialog = /** @type {HTMLDialogElement} */ (el(root, '#pub-dialog'));
  const pubName = input(root, '#pub-name');
  const pubDesc = /** @type {HTMLTextAreaElement} */ (el(root, '#pub-desc'));
  const pubAuthor = input(root, '#pub-author');
  const pubCategory = select(root, '#pub-category');
  const pubError = el(root, '#pub-error');
  const pubNote = el(root, '#pub-note');
  const pubPreview = el(root, '#pub-preview');
  const pubText = /** @type {HTMLTextAreaElement} */ (el(root, '#pub-text'));
  const pubIssue = /** @type {HTMLAnchorElement} */ (el(root, '#pub-issue'));
  const pubDownload = button(root, '#pub-download');
  const pubCopy = button(root, '#pub-copy');
  /** @type {Creation | null} */
  let publishing = null;
  /** @type {{ entry: CommunityEntry, json: string } | null} */
  let prepared = null;
  let token = 0;

  /** @param {boolean} on */
  function setActionsEnabled(on) {
    pubDownload.disabled = !on;
    pubCopy.disabled = !on;
    pubIssue.setAttribute('aria-disabled', String(!on));
    pubIssue.tabIndex = on ? 0 : -1;
    pubIssue.classList.toggle('is-disabled', !on);
  }

  /** Re-validate whenever a field changes. Duplicate checks use the library file and what this browser already prepared. */
  async function revalidate() {
    if (!publishing) return;
    const mine = ++token;
    await load();
    const result = await buildEntry(publishing, { name: pubName.value, description: pubDesc.value, author: pubAuthor.value, category: pubCategory.value });
    if (mine !== token) return;
    prepared = null;
    pubText.value = '';
    pubNote.textContent = '';
    pubError.hidden = true;
    if (!result.ok) {
      // Do not nag before the user has typed anything.
      const touched = pubName.value.trim() !== '' || pubDesc.value.trim() !== '';
      pubError.textContent = touched ? `Cannot publish yet: ${result.error}` : '';
      pubError.hidden = !touched;
      return setActionsEnabled(false);
    }
    const inLibrary = entries.find((e) => e.id === result.entry.id);
    if (inLibrary) {
      pubError.textContent = `This creation is already in the library as "${inLibrary.name}". It was not prepared again.`;
      pubError.hidden = false;
      return setActionsEnabled(false);
    }
    const json = buildSubmission(result.entry);
    prepared = { entry: result.entry, json };
    pubText.value = json;
    const before = loadSubmitted()[result.entry.id];
    if (before) pubNote.textContent = `You already prepared a submission for this creation on ${new Date(before).toLocaleDateString()}. Sending it again creates a duplicate for the maintainer to sort out.`;
    const link = issueUrl(result.entry, json);
    pubIssue.href = link.url;
    pubIssue.title = link.includesData ? '' : 'The submission is too large for a link: download the file and attach it to the issue.';
    if (!link.includesData) pubNote.textContent = `${pubNote.textContent} The submission is too large for a link: download the file and attach it to the issue.`.trim();
    setActionsEnabled(true);
  }

  for (const field of [pubName, pubDesc, pubAuthor, pubCategory]) field.addEventListener(field instanceof HTMLSelectElement ? 'change' : 'input', () => void revalidate());

  /** @param {Creation} creation */
  function openPublish(creation) {
    publishing = creation;
    pubName.value = creation.name;
    pubDesc.value = '';
    pubAuthor.value = '';
    pubCategory.value = creation.structure ? 'Structures' : 'Tools';
    pubPreview.replaceChildren();
    if (creation.structure) {
      const parsed = parseStructure(creation.structure);
      if (parsed.ok) {
        const canvas = document.createElement('canvas');
        canvas.className = 'cm-preview';
        canvas.setAttribute('role', 'img');
        canvas.setAttribute('aria-label', `Preview of ${creation.name}`);
        pubPreview.append(canvas);
        if (typeof dialog.showModal === 'function') dialog.showModal();
        else dialog.setAttribute('open', '');
        drawStructurePreview(canvas, parsed.state);
      }
    } else {
      const pre = document.createElement('pre');
      pre.className = 'cm-preview cm-code';
      pre.textContent = creation.script.split('\n').slice(0, 6).join('\n');
      pubPreview.append(pre);
    }
    if (!dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    }
    setActionsEnabled(false);
    void revalidate();
    pubDesc.focus();
  }

  const closeDialog = () => {
    token++;
    publishing = null;
    prepared = null;
    if (typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
  };
  button(root, '#pub-cancel').addEventListener('click', closeDialog);
  dialog.addEventListener('cancel', () => {
    token++;
    publishing = null;
  });
  el(root, '#pub-form').addEventListener('submit', (event) => event.preventDefault());

  pubIssue.addEventListener('click', (event) => {
    if (!prepared) return event.preventDefault();
    markSubmitted(prepared.entry.id);
    pubNote.textContent = 'GitHub opened in a new tab. Press "Submit new issue" there to send it. Nothing is sent from this page.';
  });
  pubDownload.addEventListener('click', () => {
    if (!prepared) return;
    try {
      const url = URL.createObjectURL(new Blob([prepared.json], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${prepared.entry.name.replace(/[^A-Za-z0-9._-]+/g, '-').slice(0, 40) || 'submission'}.submission.json`;
      document.body.append(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      markSubmitted(prepared.entry.id);
      pubNote.textContent = 'File downloaded. Attach it to a new issue in the repository to submit it.';
    } catch {
      pubNote.textContent = 'The download was blocked. Use Copy text, or open "Submission text" below and copy it.';
      el(root, '#pub-text-wrap').setAttribute('open', '');
    }
  });
  pubCopy.addEventListener('click', async () => {
    if (!prepared) return;
    if (await copyText(prepared.json)) {
      markSubmitted(prepared.entry.id);
      pubNote.textContent = 'Submission text copied. Paste it into a new issue in the repository.';
    } else {
      pubNote.textContent = 'Copying was blocked by the browser. Open "Submission text" below and copy it by hand.';
      el(root, '#pub-text-wrap').setAttribute('open', '');
      pubText.select();
    }
  });

  // ---------- wiring ----------
  for (const field of [search, categorySelect, sortSelect]) field.addEventListener(field === search ? 'input' : 'change', render);
  retry.addEventListener('click', () => void load(true));
  window.addEventListener('hashchange', () => {
    if (window.location.hash.startsWith('#/community')) {
      void load();
      render();
    }
  });
  if (window.location.hash.startsWith('#/community')) void load();
  render();

  return { openPublish, load };
}
