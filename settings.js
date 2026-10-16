// @ts-check
import { isValidSpawnHeight, SPAWN_HEIGHT_MAX, SPAWN_HEIGHT_MIN } from './limits.js';
import { PROFILES } from './profiles.js';

/** @typedef {import('./types').BuildSettings} BuildSettings */
/** @typedef {import('./types').VersionId} VersionId */

/** @type {Readonly<BuildSettings>} */
export const DEFAULT_SETTINGS = Object.freeze({ version: '26.3+', spawnHeight: 1, selfCleaning: true });

export const DEFAULT_SCRIPT = 'say Hello, world!';

/**
 * Validate untrusted settings (from storage or a shared link).
 * @param {unknown} raw
 * @returns {{ ok: true, settings: BuildSettings } | { ok: false, error: string }}
 */
export function coerceSettings(raw) {
  if (typeof raw !== 'object' || raw === null) return { ok: false, error: 'Build settings are missing.' };
  const record = /** @type {Record<string, unknown>} */ (raw);

  if (typeof record.version !== 'string' || !Object.hasOwn(PROFILES, record.version)) {
    return { ok: false, error: `Minecraft version "${String(record.version)}" is not supported by this build.` };
  }
  if (typeof record.spawnHeight !== 'number' || !isValidSpawnHeight(record.spawnHeight)) {
    return { ok: false, error: `Spawn height must be a whole number from ${SPAWN_HEIGHT_MIN} to ${SPAWN_HEIGHT_MAX}.` };
  }
  if (typeof record.selfCleaning !== 'boolean') {
    return { ok: false, error: 'The self-cleaning setting is invalid.' };
  }
  return {
    ok: true,
    settings: {
      version: /** @type {VersionId} */ (record.version),
      spawnHeight: record.spawnHeight,
      selfCleaning: record.selfCleaning,
    },
  };
}
