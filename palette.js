// @ts-check
import { COMMAND_BLOCK_TYPES } from './blocks.js';
import { ROLES } from './structure.js';

/** @typedef {import('./structure.js').ResolvedCell} ResolvedCell */

/**
 * Block colours shared by the interactive viewport and the static previews. The boundary blocks are neutral and
 * light and differ by tone and by letter; command blocks have their own tones. No green or cyan anywhere.
 */
export const ROLE_FILL = /** @type {Record<string, [number, number, number]>} */ ({
  floor: [214, 214, 214],
  wall: [246, 243, 234],
  ceiling: [172, 172, 172],
  custom: [236, 220, 150],
});
export const COMMAND_FILL = /** @type {Record<string, [number, number, number]>} */ ({
  'minecraft:command_block': [222, 150, 84],
  'minecraft:chain_command_block': [130, 150, 205],
  'minecraft:repeating_command_block': [168, 128, 206],
});
const COMMAND_LETTER = /** @type {Record<string, string>} */ (Object.fromEntries(COMMAND_BLOCK_TYPES.map((t) => [t.block, t.letter])));
const ROLE_LETTER = /** @type {Record<string, string>} */ (Object.fromEntries(ROLES.map((r) => [r.id, r.label])));

/** Brightness of each face, by index into FACES: +x, -x, +y, -y, +z, -z. */
export const SHADE = [0.82, 0.66, 1, 0.45, 0.92, 0.74];

/** @param {ResolvedCell} cell @returns {[number, number, number]} */
export function baseColor(cell) {
  if (cell.props) return COMMAND_FILL[cell.block] ?? ROLE_FILL.custom;
  return ROLE_FILL[cell.custom ? 'custom' : (cell.role ?? 'wall')];
}

/** @param {ResolvedCell} cell */
export function letterOf(cell) {
  if (cell.props) return COMMAND_LETTER[cell.block] ?? 'B';
  return cell.custom ? 'M' : ROLE_LETTER[cell.role ?? 'wall'];
}

/** @param {[number, number, number]} base @param {number} shade */
export const rgb = (base, shade) => `rgb(${Math.min(255, base[0] * shade)}, ${Math.min(255, base[1] * shade)}, ${Math.min(255, base[2] * shade)})`;
