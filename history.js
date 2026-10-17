// @ts-check

/**
 * Undo/redo over whole immutable states. Because each entry is a complete state (size, F/W/C blocks and
 * edits), dimension changes and resets are ordinary steps: undoing one restores exactly what was there,
 * so history cannot be left pointing at cells that no longer exist.
 * @template T
 * @param {T} initial
 * @param {number} [limit]  most undo steps kept
 */
export function createHistory(initial, limit = 100) {
  let present = initial;
  /** @type {T[]} */
  let past = [];
  /** @type {T[]} */
  let future = [];

  return {
    get present() {
      return present;
    },
    get canUndo() {
      return past.length > 0;
    },
    get canRedo() {
      return future.length > 0;
    },

    /**
     * Record a new state. A state identical (same object) to the current one is ignored.
     * @param {T} next
     * @returns {boolean} whether anything was recorded
     */
    commit(next) {
      if (Object.is(next, present)) return false;
      past.push(present);
      if (past.length > limit) past.shift();
      future = [];
      present = next;
      return true;
    },

    undo() {
      const previous = past.pop();
      if (previous === undefined) return present;
      future.push(present);
      present = previous;
      return present;
    },

    redo() {
      const next = future.pop();
      if (next === undefined) return present;
      past.push(present);
      present = next;
      return present;
    },
  };
}
