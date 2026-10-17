// @ts-check
import { escapeSnbtString } from './escape.js';

/** @typedef {import('./types').BuildSettings} BuildSettings */
/** @typedef {import('./types').MachinePart} MachinePart */
/** @typedef {import('./types').VersionId} VersionId */
/** @typedef {import('./types').VersionChannel} VersionChannel */

/**
 * A version profile owns everything that differs between Minecraft versions:
 * how the parts of the machine are written and how they are wrapped in the summon.
 * To add a version, add a profile here and a fixture test; nothing else changes.
 *
 * @typedef {object} VersionProfile
 * @property {VersionId} id
 * @property {VersionChannel} channel  'release' for stable versions, 'snapshot' for development builds
 * @property {string} label
 * @property {string} hint
 * @property {string[]} cleanupCommands  commands this profile appends when self-cleaning is on
 * @property {BlockPlacement} placement  how the 3D editor writes block placement for this version
 * @property {(commands: string[], settings: BuildSettings) => MachinePart[]} buildParts
 * @property {(parts: MachinePart[], settings: BuildSettings) => string} render
 */

/**
 * Block placement syntax used by the 3D editor. `pos` arguments are already formatted ("~1 ~ ~2" or "10 64 -3").
 * setblock and fill have the same shape in every release profile listed here; a profile whose syntax
 * differs supplies its own functions.
 * @typedef {object} BlockPlacement
 * @property {(pos: string, block: string) => string} setblock
 * @property {(from: string, to: string, block: string) => string} fill
 */

/** @type {BlockPlacement} */
const PLACEMENT = {
  setblock: (pos, block) => `setblock ${pos} ${block}`,
  fill: (from, to, block) => `fill ${from} ${to} ${block}`,
};

/** @param {string} command */
const minecart = (command) => `{id:command_block_minecart,Command:"${escapeSnbtString(command)}"}`;

// Cleanup commands, taken from the reference output for 26.3+ (self-cleaning on).
// The fill depth (-3) is copied from that single sample, not derived.
const CLEANUP_FILL = 'fill ~ ~ ~ ~ ~-3 ~ air';
const CLEANUP_PLACE = `setblock ~ ~1 ~ command_block{Command:"${escapeSnbtString(CLEANUP_FILL)}",auto:1}`;
const CLEANUP_KILL = 'execute align xyz run kill @e[type=command_block_minecart,dy=0]';
const CLEANUP_COMMANDS = [CLEANUP_PLACE, CLEANUP_KILL];

/**
 * The machine written with compact BlockState syntax (BlockState:redstone_block).
 * Verified against the reference output for 26.3+. Profiles that share this
 * syntax are created from here so they cannot drift apart by accident.
 * @param {{ id: VersionId, channel: VersionChannel, label: string, hint: string }} info
 * @returns {VersionProfile}
 */
function compactBlockStateProfile({ id, channel, label, hint }) {
  return {
    id,
    channel,
    label,
    hint,
    cleanupCommands: CLEANUP_COMMANDS,
    placement: PLACEMENT,

    buildParts(commands, settings) {
      /** @type {MachinePart[]} */
      const parts = [{ kind: 'rail', snbt: '{id:falling_block,BlockState:activator_rail}' }];
      for (const command of commands) parts.push({ kind: 'command', snbt: minecart(command) });
      if (settings.selfCleaning) {
        for (const command of CLEANUP_COMMANDS) parts.push({ kind: 'cleanup', snbt: minecart(command) });
      }
      return parts;
    },

    render(parts, settings) {
      const y = settings.spawnHeight === 0 ? '~' : `~${settings.spawnHeight}`;
      const passengers = parts.map((part) => part.snbt).join(',');
      return `summon falling_block ~ ${y} ~ {BlockState:redstone_block,Passengers:[${passengers}]}`;
    },
  };
}

/** @type {Record<VersionId, VersionProfile>} */
export const PROFILES = {
  '26.3+': compactBlockStateProfile({
    id: '26.3+',
    channel: 'release',
    label: '26.3+',
    hint: 'Uses compact BlockState syntax',
  }),

  // Launcher id verified as "26.4-snapshot-4" (minecraft.net and minecraft.wiki, 2026-10-13).
  // Neither source lists a change to summon, falling_block, command_block_minecart or
  // SNBT in any 26.4 snapshot, so the 26.3+ syntax is reused. Not tested in-game.
  '26.4-snapshot-4': compactBlockStateProfile({
    id: '26.4-snapshot-4',
    channel: 'snapshot',
    label: '26.4 Snapshot 4',
    hint: 'Snapshot (26.4-snapshot-4). Its notes list no changes to this syntax; snapshots can change before release.',
  }),
};

export const PROFILE_LIST = Object.values(PROFILES);

/** Display groups for the version selector, in order. Stable releases come before snapshots. */
export const CHANNELS = /** @type {const} */ ([
  { id: 'release', label: 'Release' },
  { id: 'snapshot', label: 'Snapshot' },
]);

/** Every command any profile appends for self-cleaning (used to recognise them when reading). */
export const KNOWN_CLEANUP_COMMANDS = new Set(PROFILE_LIST.flatMap((profile) => profile.cleanupCommands));
