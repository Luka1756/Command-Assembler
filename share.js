// @ts-check
import { MAX_SCRIPT_CHARS } from './limits.js';
import { coerceSettings } from './settings.js';

/** @typedef {import('./types').AppState} AppState */

export const SHARE_KEY = 'setup';
export const SHARE_FORMAT_VERSION = 1;
/** Longest encoded payload accepted or produced (characters of the link fragment). */
export const MAX_PAYLOAD_CHARS = 60_000;

/** @param {Uint8Array} bytes */
function toBase64Url(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** @param {string} text */
function fromBase64Url(text) {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) throw new Error('invalid characters');
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

/**
 * Encode a setup (script + build settings) for a link fragment.
 * Only those two things are included; nothing else from the page or browser.
 * @param {AppState} state
 * @returns {{ ok: true, payload: string } | { ok: false, error: string }}
 */
export function encodeSetup(state) {
  const settings = coerceSettings(state.settings);
  if (!settings.ok) return { ok: false, error: `Cannot share: ${settings.error}` };
  if (state.script.length > MAX_SCRIPT_CHARS) return { ok: false, error: 'Cannot share: the script is too long.' };

  const json = JSON.stringify({ v: SHARE_FORMAT_VERSION, script: state.script, settings: settings.settings });
  const payload = toBase64Url(new TextEncoder().encode(json));
  if (payload.length > MAX_PAYLOAD_CHARS) {
    return { ok: false, error: 'This setup is too large to share as a link. Shorten the script or import it as a file.' };
  }
  return { ok: true, payload };
}

/**
 * Decode and validate an untrusted payload.
 * @param {string} payload
 * @returns {{ ok: true, state: AppState } | { ok: false, error: string }}
 */
export function decodeSetup(payload) {
  if (payload.length === 0) return { ok: false, error: 'The link has no setup data.' };
  if (payload.length > MAX_PAYLOAD_CHARS) return { ok: false, error: 'The link is too large to be a valid setup.' };

  /** @type {unknown} */
  let data;
  try {
    const bytes = fromBase64Url(payload);
    data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    return { ok: false, error: 'The link is damaged or was cut off.' };
  }

  if (typeof data !== 'object' || data === null) return { ok: false, error: 'The link does not contain a setup.' };
  const record = /** @type {Record<string, unknown>} */ (data);

  if (record.v !== SHARE_FORMAT_VERSION) {
    return { ok: false, error: 'The link was made by a different version of Command Assembler.' };
  }
  if (typeof record.script !== 'string') return { ok: false, error: 'The link has no script.' };
  if (record.script.length > MAX_SCRIPT_CHARS) return { ok: false, error: 'The script in the link is too long.' };

  const settings = coerceSettings(record.settings);
  if (!settings.ok) return { ok: false, error: settings.error };

  return { ok: true, state: { script: record.script, settings: settings.settings } };
}

/**
 * @param {string} pageUrl
 * @param {string} payload
 */
export function buildShareUrl(pageUrl, payload) {
  return `${pageUrl.split('#')[0]}#${SHARE_KEY}=${payload}`;
}

/**
 * Read the payload from a location hash, or null when the hash is not a share link.
 * @param {string} hash
 * @returns {string | null}
 */
export function extractPayload(hash) {
  const prefix = `#${SHARE_KEY}=`;
  return hash.startsWith(prefix) ? hash.slice(prefix.length) : null;
}

// ---------------------------------------------------------------------------------------------
// Compact links (format "z1"). The original format above (version 1, plain base64url JSON) is
// unchanged and still read, so every link made before this existed keeps working.
//
//   z1.<base64url(deflate-raw(UTF-8 JSON [2, script, version, spawnHeight, selfCleaning(0|1)]))>
//
// Compression is lossless. The encoder builds both forms and uses the shorter one, so a tiny script
// (where compression cannot help) still gets the short plain link. If the browser has no
// CompressionStream, the plain form is used. Decoding a z1 link needs DecompressionStream.
// ---------------------------------------------------------------------------------------------

export const COMPACT_PREFIX = 'z1.';
export const COMPACT_FORMAT_VERSION = 2;
/** Most bytes a compact link may expand to, so a small link cannot inflate into something huge. */
export const MAX_DECOMPRESSED_BYTES = 1_000_000;

/**
 * @param {Uint8Array} bytes
 * @param {'compress' | 'decompress'} direction
 * @returns {Promise<Uint8Array>}
 */
async function runStream(bytes, direction) {
  const stream = new Blob([/** @type {BlobPart} */ (bytes)]).stream().pipeThrough(direction === 'compress' ? new CompressionStream('deflate-raw') : new DecompressionStream('deflate-raw'));
  const reader = stream.getReader();
  /** @type {Uint8Array[]} */
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (direction === 'decompress' && total > MAX_DECOMPRESSED_BYTES) {
      await reader.cancel();
      throw new Error('too large');
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

export const compressionAvailable = () => typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';

/**
 * Encode a setup as the shortest valid link payload.
 * @param {AppState} state
 * @returns {Promise<{ ok: true, payload: string, format: 'plain' | 'compact', plainLength: number } | { ok: false, error: string }>}
 */
export async function encodeSetupCompact(state) {
  const plain = encodeSetup(state);
  const settings = coerceSettings(state.settings);
  if (!settings.ok) return { ok: false, error: `Cannot share: ${settings.error}` };
  if (state.script.length > MAX_SCRIPT_CHARS) return { ok: false, error: 'Cannot share: the script is too long.' };
  const plainLength = plain.ok ? plain.payload.length : Infinity;

  if (compressionAvailable()) {
    try {
      const json = JSON.stringify([COMPACT_FORMAT_VERSION, state.script, settings.settings.version, settings.settings.spawnHeight, settings.settings.selfCleaning ? 1 : 0]);
      const packed = COMPACT_PREFIX + toBase64Url(await runStream(new TextEncoder().encode(json), 'compress'));
      if (packed.length <= MAX_PAYLOAD_CHARS && packed.length < plainLength) return { ok: true, payload: packed, format: 'compact', plainLength };
    } catch {
      // Fall through to the plain form.
    }
  }
  if (plain.ok) return { ok: true, payload: plain.payload, format: 'plain', plainLength };
  return plain;
}

/**
 * Decode any link payload, old or new, validating it as untrusted input.
 * @param {string} payload
 * @returns {Promise<{ ok: true, state: AppState } | { ok: false, error: string }>}
 */
export async function decodeAnySetup(payload) {
  if (!payload.startsWith(COMPACT_PREFIX)) return decodeSetup(payload);
  if (payload.length > MAX_PAYLOAD_CHARS) return { ok: false, error: 'The link is too large to be a valid setup.' };
  if (typeof DecompressionStream !== 'function') return { ok: false, error: 'This link is compressed and this browser cannot open it. Try an up-to-date browser.' };

  /** @type {unknown} */
  let data;
  try {
    const bytes = await runStream(fromBase64Url(payload.slice(COMPACT_PREFIX.length)), 'decompress');
    data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    return { ok: false, error: 'The link is damaged or was cut off.' };
  }
  if (!Array.isArray(data) || data.length !== 5) return { ok: false, error: 'The link does not contain a setup.' };
  const [version, script, versionId, spawnHeight, selfCleaning] = data;
  if (version !== COMPACT_FORMAT_VERSION) return { ok: false, error: 'The link was made by a different version of Command Assembler.' };
  if (typeof script !== 'string') return { ok: false, error: 'The link has no script.' };
  if (script.length > MAX_SCRIPT_CHARS) return { ok: false, error: 'The script in the link is too long.' };
  if (selfCleaning !== 0 && selfCleaning !== 1) return { ok: false, error: 'The link has invalid settings.' };
  const settings = coerceSettings({ version: versionId, spawnHeight, selfCleaning: selfCleaning === 1 });
  if (!settings.ok) return { ok: false, error: settings.error };
  return { ok: true, state: { script, settings: settings.settings } };
}
