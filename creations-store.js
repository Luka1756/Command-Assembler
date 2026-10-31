// @ts-check
import { MAX_CREATIONS, MAX_NAME_CHARS, loadCreationsDetailed, saveCreations } from './storage.js';

/** @typedef {import('./types').Creation} Creation */

/** @returns {string} */
function newId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * The user's saved creations, shared by the example library and the block placer so both always show the same list.
 * Creations live in this browser only (localStorage); nothing here is published or sent anywhere.
 */
export function createCreationsStore() {
  const loaded = loadCreationsDetailed();
  let list = loaded.creations;
  /** @type {Set<() => void>} */
  const listeners = new Set();
  const notify = () => listeners.forEach((fn) => fn());

  /** @param {Creation[]} next @returns {{ ok: true } | { ok: false, error: string }} */
  function commit(next) {
    const saved = saveCreations(next);
    if (!saved.ok) return saved;
    list = next;
    notify();
    return { ok: true };
  }

  /** @param {string} name @param {string} [exceptId] */
  const nameTaken = (name, exceptId) => list.find((c) => c.name.toLowerCase() === name.toLowerCase() && c.id !== exceptId);

  /** @param {string} raw */
  function checkName(raw) {
    const name = raw.trim();
    if (!name) return /** @type {const} */ ({ ok: false, error: 'Enter a name for this creation.' });
    if (name.length > MAX_NAME_CHARS) return /** @type {const} */ ({ ok: false, error: `Names can be up to ${MAX_NAME_CHARS} characters.` });
    return /** @type {const} */ ({ ok: true, name });
  }

  return {
    /** Anything set aside while loading (for a notice). */
    issues: loaded.issues,
    all: () => list,
    /** @param {string} id */
    get: (id) => list.find((c) => c.id === id),
    /** @param {string} name */
    findByName: (name) => nameTaken(name.trim()),
    /** @param {() => void} fn */
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    /**
     * Save a creation. A creation with the same name (any case) is updated in place, keeping its id.
     * @param {{ name: string, script: string, settings: import('./types').BuildSettings, structure?: import('./types').SerializedStructure }} input
     * @returns {{ ok: true, id: string, updated: boolean } | { ok: false, error: string }}
     */
    save({ name: rawName, script, settings, structure }) {
      const checked = checkName(rawName);
      if (!checked.ok) return checked;
      const existing = nameTaken(checked.name);
      if (!existing && list.length >= MAX_CREATIONS) return { ok: false, error: `You can save up to ${MAX_CREATIONS} creations. Delete one first.` };
      /** @type {Creation} */
      const creation = { id: existing?.id ?? newId(), name: checked.name, script, settings: { ...settings }, savedAt: Date.now() };
      if (structure) creation.structure = structure;
      const next = existing ? list.map((c) => (c.id === existing.id ? creation : c)) : [...list, creation];
      const done = commit(next);
      return done.ok ? { ok: true, id: creation.id, updated: !!existing } : done;
    },

    /** @param {string} id @param {string} rawName */
    rename(id, rawName) {
      const checked = checkName(rawName);
      if (!checked.ok) return checked;
      if (!list.some((c) => c.id === id)) return /** @type {const} */ ({ ok: false, error: 'That creation no longer exists.' });
      if (nameTaken(checked.name, id)) return /** @type {const} */ ({ ok: false, error: `A creation named "${checked.name}" already exists.` });
      return commit(list.map((c) => (c.id === id ? { ...c, name: checked.name } : c)));
    },

    /** @param {string} id */
    remove(id) {
      if (!list.some((c) => c.id === id)) return /** @type {const} */ ({ ok: false, error: 'That creation no longer exists.' });
      return commit(list.filter((c) => c.id !== id));
    },
  };
}
