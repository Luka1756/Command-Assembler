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
