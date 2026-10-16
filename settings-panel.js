// @ts-check
import { SPAWN_HEIGHT_MAX, SPAWN_HEIGHT_MIN, isValidSpawnHeight } from './limits.js';
import { PROFILES, PROFILE_LIST } from './profiles.js';
import { DEFAULT_SETTINGS } from './settings.js';
import { button, el, input, select } from './dom.js';

/** @typedef {import('./types').VersionId} VersionId */

/**
 * Build settings: Minecraft version, spawn height, self-cleaning.
 * Only settings visible in the reference are implemented; see README.
 * @param {HTMLElement} root
 * @param {ReturnType<typeof import('./store.js').createStore>} store
 */
export function initSettingsPanel(root, store) {
  const versionSelect = select(root, '#version');
  const versionHint = el(root, '#version-hint');
  const heightInput = input(root, '#spawn-height');
  const heightError = el(root, '#height-error');
  const selfCleaning = button(root, '#self-cleaning');
  const reset = button(root, '#reset-settings');

  for (const profile of PROFILE_LIST) versionSelect.add(new Option(profile.label, profile.id));

  versionSelect.addEventListener('change', () => {
    store.set({ settings: { ...store.get().settings, version: /** @type {VersionId} */ (versionSelect.value) } });
  });

  heightInput.addEventListener('input', () => {
    const raw = heightInput.value.trim();
    const spawnHeight = /^\d+$/.test(raw) ? Number(raw) : Number.NaN;
    store.set({ settings: { ...store.get().settings, spawnHeight } });
  });

  selfCleaning.addEventListener('click', () => {
    const settings = store.get().settings;
    store.set({ settings: { ...settings, selfCleaning: !settings.selfCleaning } });
  });

  reset.addEventListener('click', () => {
    store.set({ settings: { ...DEFAULT_SETTINGS } });
  });

  heightError.textContent = `Enter a whole number from ${SPAWN_HEIGHT_MIN} to ${SPAWN_HEIGHT_MAX}.`;

  /** Reflect store state in the controls. */
  function sync() {
    const { settings } = store.get();
    versionSelect.value = settings.version;
    versionHint.textContent = PROFILES[settings.version]?.hint ?? '';
    selfCleaning.setAttribute('aria-checked', String(settings.selfCleaning));

    const valid = isValidSpawnHeight(settings.spawnHeight);
    // Do not overwrite what the user is typing while it is invalid.
    if (valid && heightInput.value.trim() !== String(settings.spawnHeight)) {
      heightInput.value = String(settings.spawnHeight);
    }
    heightInput.setAttribute('aria-invalid', String(!valid));
    heightError.hidden = valid;
  }

  sync();
  return { sync };
}
