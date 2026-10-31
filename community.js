// @ts-check
import { MAX_SCRIPT_CHARS } from './limits.js';
import { coerceSettings } from './settings.js';
import { parseStructure, serializeStructure } from './structure-io.js';

/** @typedef {import('./types').BuildSettings} BuildSettings */
/** @typedef {import('./types').SerializedStructure} SerializedStructure */

/**
 * COMMUNITY LIBRARY: data model, validation and submission building. No DOM.
 *
 * HOW SHARING WORKS. The site is static (GitHub Pages / Vercel): it has no server and no database, so it cannot
 * store anything that other people can see. The library therefore reads a reviewed file, `community.json`, that
 * ships with the site. Publishing means preparing a submission that the maintainer reviews and adds to that file;
 * nothing is public until then, and nothing is sent anywhere automatically. Browser storage is never used as
 * "publication": it is private to one browser.
 */

export const COMMUNITY_URL = 'community.json';
/** Where submissions are sent: an issue in this repository. */
export const SUBMIT_REPO = 'Luka1756/Command-Assembler';
export const INDEX_VERSION = 1;
export const SUBMISSION_FORMAT = 'command-assembler-submission';

export const CATEGORIES = /** @type {const} */ (['Machines', 'Structures', 'Tools', 'Other']);
export const LIMITS = { name: 60, description: 500, author: 40, script: Math.min(100_000, MAX_SCRIPT_CHARS) };
/** An issue link longer than this may be refused by the browser or GitHub, so the file is attached by hand instead. */
export const MAX_ISSUE_URL_CHARS = 7000;

/**
 * @typedef {object} CommunityEntry
 * @property {string} id
 * @property {string} name
 * @property {string} description
 * @property {string} author
 * @property {typeof CATEGORIES[number]} category
 * @property {'structure' | 'script'} kind
 * @property {BuildSettings} settings
 * @property {string} script  the commands (kind "script"); empty for kind "structure"
 * @property {SerializedStructure | null} structure
 * @property {string} published  date the maintainer added it (YYYY-MM-DD), or '' for a submission
 */

/** @param {unknown} v @returns {v is Record<string, unknown>} */
const isRecord = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
// Control characters other than newline and tab have no place in names or descriptions.
const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f]/;

/**
 * @param {unknown} value
 * @param {number} max
 * @param {boolean} multiline
 * @returns {string | null} the trimmed text, or null when invalid
 */
function cleanText(value, max, multiline) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (text === '' || text.length > max || CONTROL.test(text)) return null;
  if (!multiline && /[\r\n\t]/.test(text)) return null;
  return text;
}

/**
 * Validate one entry. Never executes or evaluates anything in it.
 * @param {unknown} raw
 * @returns {{ ok: true, entry: CommunityEntry } | { ok: false, error: string }}
 */
export function parseEntry(raw) {
  /** @param {string} error */
  const bad = (error) => /** @type {const} */ ({ ok: false, error });
  if (!isRecord(raw)) return bad('an entry must be an object.');
  const id = typeof raw.id === 'string' && /^[A-Za-z0-9._~-]{1,80}$/.test(raw.id) ? raw.id : null;
  if (!id) return bad('the id is missing or has unsupported characters.');
  const name = cleanText(raw.name, LIMITS.name, false);
  if (!name) return bad(`the name must be 1 to ${LIMITS.name} characters on one line.`);
  const description = cleanText(raw.description, LIMITS.description, true);
  if (!description) return bad(`the description must be 1 to ${LIMITS.description} characters.`);
  const author = raw.author === undefined ? 'Anonymous' : cleanText(raw.author, LIMITS.author, false);
  if (!author) return bad(`the author must be 1 to ${LIMITS.author} characters on one line.`);
  const category = CATEGORIES.find((c) => c === raw.category) ?? 'Other';
  const settings = coerceSettings(raw.settings);
  if (!settings.ok) return bad(`the build settings are not valid: ${settings.error}`);
  const published = typeof raw.published === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.published) ? raw.published : '';

  if (raw.kind === 'structure') {
    const parsed = parseStructure(raw.structure);
    if (!parsed.ok) return bad(parsed.error);
    const structure = /** @type {SerializedStructure} */ (serializeStructure(parsed.state, parsed.gen));
    return { ok: true, entry: { id, name, description, author, category, kind: 'structure', settings: settings.settings, script: '', structure, published } };
  }
  if (raw.kind === 'script') {
    if (typeof raw.script !== 'string' || raw.script.trim() === '') return bad('a script entry needs a script.');
    if (raw.script.length > LIMITS.script) return bad(`the script is over ${LIMITS.script.toLocaleString('en-US')} characters.`);
    return { ok: true, entry: { id, name, description, author, category, kind: 'script', settings: settings.settings, script: raw.script, structure: null, published } };
  }
  return bad('the kind must be "structure" or "script".');
}

/**
 * Validate the library file. Invalid entries are skipped and counted, never silently repaired; a bad file gives an error.
 * @param {unknown} raw
 * @returns {{ ok: true, entries: CommunityEntry[], skipped: number } | { ok: false, error: string }}
 */
export function parseIndex(raw) {
  if (!isRecord(raw) || raw.v !== INDEX_VERSION || !Array.isArray(raw.entries)) {
    return { ok: false, error: 'The library file is not in a format this version understands.' };
  }
  /** @type {CommunityEntry[]} */
  const entries = [];
  const seen = new Set();
  let skipped = 0;
  for (const item of raw.entries) {
    const parsed = parseEntry(item);
    if (!parsed.ok || seen.has(parsed.entry.id)) {
      skipped++;
      continue;
    }
    seen.add(parsed.entry.id);
    entries.push(parsed.entry);
  }
  return { ok: true, entries, skipped };
}

/**
 * A stable id for the content of a creation (not its name or description), so the same creation is recognised if
 * it is submitted twice. SHA-256 of the canonical content, first 16 hex characters.
 * @param {{ kind: 'structure' | 'script', script: string, structure: SerializedStructure | null, settings: BuildSettings }} content
 * @returns {Promise<string>}
 */
export async function contentId(content) {
  const canonical = JSON.stringify(content.kind === 'structure' ? { k: 's', s: content.structure, v: content.settings.version } : { k: 'c', c: content.script.trim(), v: content.settings.version });
  const bytes = new TextEncoder().encode(canonical);
  const digest = globalThis.crypto?.subtle ? new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes)) : null;
  if (digest) return Array.from(digest.slice(0, 8), (b) => b.toString(16).padStart(2, '0')).join('');
  // Fallback where SubtleCrypto is unavailable (very old or non-secure contexts): FNV-1a, twice with different seeds.
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (const b of bytes) {
    h1 = Math.imul(h1 ^ b, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ b, 0x85ebca6b) >>> 0;
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}

/**
 * Build a submission entry from a saved creation and the details the user typed. Validates exactly like the library does.
 * @param {import('./types').Creation} creation
 * @param {{ name: string, description: string, author: string, category: string }} details
 * @returns {Promise<{ ok: true, entry: CommunityEntry } | { ok: false, error: string }>}
 */
export async function buildEntry(creation, details) {
  const kind = creation.structure ? 'structure' : 'script';
  const id = await contentId({ kind, script: creation.script, structure: creation.structure ?? null, settings: creation.settings });
  return parseEntry({
    id,
    name: details.name,
    description: details.description,
    author: details.author.trim() === '' ? 'Anonymous' : details.author,
    category: details.category,
    kind,
    settings: creation.settings,
    script: kind === 'script' ? creation.script : undefined,
    structure: creation.structure,
  });
}

/**
 * The submission file: the entry, wrapped so the maintainer's tooling can recognise it.
 * @param {CommunityEntry} entry
 */
export function buildSubmission(entry) {
  const { published: _ignored, ...rest } = entry;
  return JSON.stringify({ format: SUBMISSION_FORMAT, v: INDEX_VERSION, entry: rest }, null, 2);
}

/**
 * Read a submission file back (for the maintainer, and for testing the round trip).
 * @param {string} text
 */
export function parseSubmission(text) {
  /** @type {unknown} */
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return /** @type {const} */ ({ ok: false, error: 'The file is not valid JSON.' });
  }
  if (!isRecord(data) || data.format !== SUBMISSION_FORMAT || data.v !== INDEX_VERSION) {
    return /** @type {const} */ ({ ok: false, error: 'This is not a Command Assembler submission file.' });
  }
  return parseEntry(data.entry);
}

/**
 * Link that opens a new issue with the submission filled in. The JSON goes into the body only when the whole link
 * is short enough; otherwise the body asks for the downloaded file to be attached.
 * @param {CommunityEntry} entry
 * @param {string} json
 */
export function issueUrl(entry, json) {
  const title = `Library submission: ${entry.name}`;
  const withJson = `Please review this creation for the community library.\n\n\`\`\`json\n${json}\n\`\`\`\n`;
  const withoutJson = 'Please review this creation for the community library.\n\nThe submission file is too large for a link. Attach the downloaded .json file to this issue.\n';
  const build = (/** @type {string} */ body) => `https://github.com/${SUBMIT_REPO}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
  const full = build(withJson);
  return full.length <= MAX_ISSUE_URL_CHARS ? { url: full, includesData: true } : { url: build(withoutJson), includesData: false };
}

/**
 * Search and filter. Search matches name, description and author, case-insensitively.
 * @param {CommunityEntry[]} entries
 * @param {{ query?: string, category?: string, sort?: 'newest' | 'name' }} [options]
 */
export function filterEntries(entries, { query = '', category = '', sort = 'newest' } = {}) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const matches = entries.filter((e) => {
    if (category && e.category !== category) return false;
    const hay = `${e.name}\n${e.description}\n${e.author}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
  return matches.sort((a, b) => (sort === 'name' ? a.name.localeCompare(b.name) : b.published.localeCompare(a.published) || a.name.localeCompare(b.name)));
}

/**
 * A name for an imported copy that does not clash with existing creations.
 * @param {string} name
 * @param {(candidate: string) => boolean} taken
 * @param {number} maxLength
 */
export function importName(name, taken, maxLength) {
  const fit = (/** @type {string} */ suffix) => `${name.slice(0, maxLength - suffix.length)}${suffix}`;
  if (!taken(name)) return name;
  for (let i = 1; i < 1000; i++) {
    const candidate = fit(i === 1 ? ' (imported)' : ` (imported ${i})`);
    if (!taken(candidate)) return candidate;
  }
  return fit(` (${Date.now().toString(36)})`);
}

const SUBMITTED_KEY = 'command-assembler:submitted:v1';

/** @returns {Record<string, number>} content id -> time a submission was prepared in this browser */
export function loadSubmitted() {
  try {
    const raw = JSON.parse(window.localStorage.getItem(SUBMITTED_KEY) ?? '{}');
    return isRecord(raw) ? /** @type {Record<string, number>} */ (Object.fromEntries(Object.entries(raw).filter(([, v]) => typeof v === 'number'))) : {};
  } catch {
    return {};
  }
}

/** @param {string} id */
export function markSubmitted(id) {
  try {
    window.localStorage.setItem(SUBMITTED_KEY, JSON.stringify({ ...loadSubmitted(), [id]: Date.now() }));
  } catch {
    /* best effort */
  }
}
