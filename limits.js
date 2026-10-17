// @ts-check

/**
 * Maximum characters a Java Edition command block accepts.
 * Verified: the Minecraft Wiki gives 32,500 as the text limit for commands in a command block.
 * The generated command is checked against this.
 */
export const MAX_COMMAND_CHARS = 32_500;

/**
 * Shown as "Max Edited Command Block Length". Verified only as the NBT string limit:
 * a string tag holds at most 65,535 BYTES (unsigned 16-bit length, modified UTF-8), not characters.
 * No source states it as a command-block limit, so it is displayed with an explanation and is
 * never used to accept output the 32,500 check would reject.
 */
export const MAX_EDITED_COMMAND_LENGTH = 65_535;

/** Default value of the maxCommandChainLength game rule; shown as the chain-block budget. */
export const CHAIN_BLOCK_LIMIT = 65_536;

export const SPAWN_HEIGHT_MIN = 0;
export const SPAWN_HEIGHT_MAX = 255;

/** Sanity cap for imported or shared scripts. */
export const MAX_SCRIPT_CHARS = 200_000;

/** @param {number} value */
export function isValidSpawnHeight(value) {
  return Number.isInteger(value) && value >= SPAWN_HEIGHT_MIN && value <= SPAWN_HEIGHT_MAX;
}
