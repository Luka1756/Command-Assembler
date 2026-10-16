// @ts-check

/** @typedef {import('./types').AppState} AppState */
/** @typedef {{ persist: boolean }} ChangeMeta */
/** @typedef {(state: AppState, meta: ChangeMeta) => void} Listener */

/**
 * @param {AppState} a
 * @param {AppState} b
 */
function sameState(a, b) {
  return (
    a.script === b.script &&
    a.settings.version === b.settings.version &&
    Object.is(a.settings.spawnHeight, b.settings.spawnHeight) &&
    a.settings.selfCleaning === b.settings.selfCleaning
  );
}

/**
 * Minimal observable store. Listeners run synchronously after every real change.
 * @param {AppState} initial
 */
export function createStore(initial) {
  let state = initial;
  /** @type {Set<Listener>} */
  const listeners = new Set();

  return {
    get: () => state,

    /**
     * @param {Partial<AppState>} patch
     * @param {Partial<ChangeMeta>} [meta]
     */
    set(patch, meta = {}) {
      const next = { ...state, ...patch };
      if (sameState(state, next)) return;
      state = next;
      for (const listener of listeners) listener(state, { persist: meta.persist ?? true });
    },

    /** @param {Listener} listener */
    subscribe(listener) {
      listeners.add(listener);
    },
  };
}
