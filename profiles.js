// @ts-check
import { escapeSnbtString } from './escape.js';

/** @typedef {import('../types').BuildSettings} BuildSettings */
/** @typedef {import('../types').MachinePart} MachinePart */
/** @typedef {import('../types').VersionId} VersionId */

/**
 * A version profile owns everything that differs between Minecraft versions:
 * how the parts of the machine are written and how they are wrapped in the summon.
 * To add a version, add a profile here and a fixture test; nothing else changes.
 *
 * @typedef {object} VersionProfile
 * @property {VersionId} id
 * @property {string} label
 * @property {string} hint
 * @property {(commands: string[], settings: BuildSettings) => MachinePart[]} buildParts
 * @property {(parts: MachinePart[], settings: BuildSettings) => string} render
 */

/** @param {string} command */
const minecart = (command) => `{id:command_block_minecart,Command:"${escapeSnbtString(command)}"}`;

// Cleanup commands, taken from the reference output for 26.3+ (self-cleaning on).
// The fill depth (-3) is copied from that single sample, not derived.
const CLEANUP_FILL = 'fill ~ ~ ~ ~ ~-3 ~ air';
const CLEANUP_PLACE = `setblock ~ ~1 ~ command_block{Command:"${escapeSnbtString(CLEANUP_FILL)}",auto:1}`;
const CLEANUP_KILL = 'execute align xyz run kill @e[type=command_block_minecart,dy=0]';

/** @type {VersionProfile} */
const profile26_3 = {
  id: '26.3+',
  label: '26.3+',
  hint: 'Uses compact BlockState syntax',

  buildParts(commands, settings) {
    /** @type {MachinePart[]} */
    const parts = [{ kind: 'rail', snbt: '{id:falling_block,BlockState:activator_rail}' }];
    for (const command of commands) parts.push({ kind: 'command', snbt: minecart(command) });
    if (settings.selfCleaning) {
      parts.push({ kind: 'cleanup', snbt: minecart(CLEANUP_PLACE) });
      parts.push({ kind: 'cleanup', snbt: minecart(CLEANUP_KILL) });
    }
    return parts;
  },

  render(parts, settings) {
    const y = settings.spawnHeight === 0 ? '~' : `~${settings.spawnHeight}`;
    const passengers = parts.map((part) => part.snbt).join(',');
    return `summon falling_block ~ ${y} ~ {BlockState:redstone_block,Passengers:[${passengers}]}`;
  },
};

/** @type {Record<VersionId, VersionProfile>} */
export const PROFILES = { '26.3+': profile26_3 };

export const PROFILE_LIST = Object.values(PROFILES);
