// @ts-check

/** Maximum characters a Java Edition command block accepts. */
export const MAX_COMMAND_CHARS = 32_500;

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
