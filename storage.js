// @ts-check
import { DEFAULT_SETTINGS, coerceSettings } from './settings.js';
import { parseStructure } from './structure-io.js';

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

/**
 * Saved creations, with a note for anything that had to be set aside.
 * Creations saved before 3D structures existed have no `structure` and load unchanged (the storage key and
 * format are the same: `structure` is an optional addition). A creation whose structure fails validation keeps its
 * script and settings and loses only the structure, and the issue is reported.
 * @returns {{ creations: Creation[], issues: string[] }}
 */
export function loadCreationsDetailed() {
  const data = readJson(CREATIONS_KEY);
  /** @type {string[]} */
  const issues = [];
  if (!Array.isArray(data)) return { creations: [], issues };
  /** @type {Creation[]} */
  const creations = [];
  for (const item of data) {
    if (typeof item !== 'object' || item === null) continue;
    const { id, name, script, settings, savedAt, structure } = /** @type {Record<string, unknown>} */ (item);
    const checked = coerceSettings(settings);
    if (typeof id !== 'string' || typeof name !== 'string' || typeof script !== 'string') continue;
    if (!checked.ok || typeof savedAt !== 'number') continue;
    /** @type {Creation} */
    const creation = { id, name, script, settings: checked.settings, savedAt };
    if (structure !== undefined) {
      const parsed = parseStructure(structure);
      if (parsed.ok) creation.structure = /** @type {import('./types').SerializedStructure} */ (structure);
      else issues.push(`"${name}": its 3D structure could not be read and was left out. The script and settings were kept.`);
    }
    creations.push(creation);
  }
  return { creations, issues };
}

/** @returns {Creation[]} */
export const loadCreations = () => loadCreationsDetailed().creations;

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

const PLACER_KEY = 'command-assembler:placer:v1';

/**
 * The block placer's working copy: a serialised structure (see structure-io.js) and a few preferences.
 * Returned unvalidated; structure-io's parseStructure validates the structure before it is used.
 * @returns {{ structure: unknown, prefs: Record<string, unknown> } | null}
 */
export function loadPlacer() {
  const data = /** @type {Record<string, unknown> | null} */ (readJson(PLACER_KEY));
  if (!data || typeof data !== 'object' || data.structure === undefined) return null;
  const prefs = typeof data.prefs === 'object' && data.prefs !== null ? /** @type {Record<string, unknown>} */ (data.prefs) : {};
  return { structure: data.structure, prefs };
}

/**
 * Best effort, like the script workspace.
 * @param {unknown} structure
 * @param {Record<string, unknown>} prefs
 */
export function savePlacer(structure, prefs) {
  try {
    storage()?.setItem(PLACER_KEY, JSON.stringify({ structure, prefs }));
  } catch {
    /* storage unavailable or full */
  }
}
