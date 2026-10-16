// @ts-check
import { DEFAULT_SETTINGS, coerceSettings } from './settings.js';

/** @typedef {import('./types').AppState} AppState */
/** @typedef {import('./types').Creation} Creation */

const WORKSPACE_KEY = 'command-assembler:workspace:v1';
const CREATIONS_KEY = 'command-assembler:creations:v1';

export const MAX_CREATIONS = 100;
export const MAX_NAME_CHARS = 60;

/** localStorage can be missing or throw (private windows, blocked storage). */
function storage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * @param {string} key
 * @returns {unknown}
 */
function readJson(key) {
  try {
    const raw = storage()?.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** @returns {AppState | null} */
export function loadWorkspace() {
  const data = /** @type {Record<string, unknown> | null} */ (readJson(WORKSPACE_KEY));
  if (!data || typeof data.script !== 'string') return null;
  const settings = coerceSettings(data.settings);
  return { script: data.script, settings: settings.ok ? settings.settings : { ...DEFAULT_SETTINGS } };
}

/**
 * Best effort; failures are silent because the workspace copy is only a convenience.
 * An invalid spawn height (mid-edit) is stored as the default.
 * @param {AppState} state
 */
export function saveWorkspace(state) {
  const settings = coerceSettings(state.settings);
  try {
    storage()?.setItem(
      WORKSPACE_KEY,
      JSON.stringify({ script: state.script, settings: settings.ok ? settings.settings : DEFAULT_SETTINGS }),
    );
  } catch {
    /* storage unavailable or full */
  }
}

/** @returns {Creation[]} */
export function loadCreations() {
  const data = readJson(CREATIONS_KEY);
  if (!Array.isArray(data)) return [];
  /** @type {Creation[]} */
  const creations = [];
  for (const item of data) {
    if (typeof item !== 'object' || item === null) continue;
    const { id, name, script, settings, savedAt } = /** @type {Record<string, unknown>} */ (item);
    const checked = coerceSettings(settings);
    if (typeof id !== 'string' || typeof name !== 'string' || typeof script !== 'string') continue;
    if (!checked.ok || typeof savedAt !== 'number') continue;
    creations.push({ id, name, script, settings: checked.settings, savedAt });
  }
  return creations;
}

/**
 * @param {Creation[]} creations
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
export function saveCreations(creations) {
  const store = storage();
  if (!store) return { ok: false, error: 'Browser storage is unavailable, so creations cannot be saved here.' };
  try {
    store.setItem(CREATIONS_KEY, JSON.stringify(creations));
    return { ok: true };
  } catch {
    return { ok: false, error: 'Browser storage is full or blocked, so the creation was not saved.' };
  }
}
