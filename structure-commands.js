// @ts-check
import { generate } from './build.js';
import { MAX_COMMAND_CHARS, MAX_SCRIPT_CHARS } from './limits.js';
import { PROFILES } from './profiles.js';
import { mergeIntoScript } from './reader.js';
import { keyOf, resolveCells } from './structure.js';

/** @typedef {import('./structure.js').StructureState} StructureState */
/** @typedef {import('./structure.js').ResolvedCell} ResolvedCell */
/** @typedef {import('./types').BuildSettings} BuildSettings */
/** @typedef {import('./types').GenerateResult} GenerateResult */

/**
 * Most blocks one fill may cover. This is the default of the commandModificationBlockLimit game rule
 * (32,768), taken from the Minecraft Wiki and NOT tested in game. Every box generated here is far below it
 * (a structure holds at most 16,000 blocks), and the clear-area fill is split to stay under it.
 */
export const FILL_BLOCK_LIMIT = 32_768;

/** Largest coordinate magnitude accepted for an origin (the world border is ±29,999,984). */
export const COORD_LIMIT = 30_000_000;

/**
 * Where the structure goes.
 *  - relative: `~` coordinates, measured from the command block minecart that runs the commands. The
 *    structure's minimum corner (x 0, y 0, z 0) is placed at origin offset from the minecart.
 *    Where that minecart sits relative to the player has NOT been verified in game, so test a small
 *    structure first.
 *  - absolute: plain world coordinates for the minimum corner. These do not depend on the machine.
 * @typedef {object} PlacementOptions
 * @property {'relative' | 'absolute'} mode
 * @property {{ x: number, y: number, z: number }} origin
 * @property {boolean} clearArea  first fill the whole bounding box with air
 */

/** @type {PlacementOptions} */
export const DEFAULT_PLACEMENT = { mode: 'relative', origin: { x: 1, y: 0, z: 1 }, clearArea: false };

/**
 * @typedef {object} StructureCommands
 * @property {boolean} ok
 * @property {string[]} commands
 * @property {string[]} errors
 * @property {string[]} warnings
 * @property {{ blocks: number, boxes: number, commands: number, chars: number }} stats
 */

/**
 * Cut the cells into boxes of one block id, greedily and in a fixed order, so a filled floor becomes one
 * fill instead of hundreds of setblocks. Each cell is in exactly one box (no duplicate placements).
 * Scan order is y, then z, then x; a box grows along x, then z, then y.
 * @param {ResolvedCell[]} cells  sorted as resolveCells returns them
 * @returns {{ x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, block: string }[]}
 */
export function mergeBoxes(cells) {
  /** @type {Map<string, string>} */
  const blocks = new Map();
  for (const c of cells) blocks.set(keyOf(c.x, c.y, c.z), c.block);
  /** @type {Set<string>} */
  const used = new Set();
  /** @type {(x: number, y: number, z: number, block: string) => boolean} */
  const free = (x, y, z, block) => blocks.get(keyOf(x, y, z)) === block && !used.has(keyOf(x, y, z));

  const boxes = [];
  for (const c of cells) {
    if (used.has(keyOf(c.x, c.y, c.z))) continue;
    const { block } = c;

    let x2 = c.x;
    while (free(x2 + 1, c.y, c.z, block)) x2++;

    let z2 = c.z;
    for (;;) {
      let rowFree = true;
      for (let x = c.x; x <= x2 && rowFree; x++) rowFree = free(x, c.y, z2 + 1, block);
      if (!rowFree) break;
      z2++;
    }

    let y2 = c.y;
    for (;;) {
      let layerFree = true;
      for (let z = c.z; z <= z2 && layerFree; z++) {
        for (let x = c.x; x <= x2 && layerFree; x++) layerFree = free(x, y2 + 1, z, block);
      }
      if (!layerFree) break;
      y2++;
    }

    for (let y = c.y; y <= y2; y++) for (let z = c.z; z <= z2; z++) for (let x = c.x; x <= x2; x++) used.add(keyOf(x, y, z));
    boxes.push({ x1: c.x, y1: c.y, z1: c.z, x2, y2, z2, block });
  }
  return boxes;
}

/**
 * @param {PlacementOptions} options
 * @returns {string | null} an error message, or null when valid
 */
export function validatePlacement(options) {
  if (options.mode !== 'relative' && options.mode !== 'absolute') return 'Choose relative or absolute coordinates.';
  for (const [axis, value] of /** @type {const} */ ([['X', options.origin.x], ['Y', options.origin.y], ['Z', options.origin.z]])) {
    if (!Number.isInteger(value) || Math.abs(value) > COORD_LIMIT) {
      return `Origin ${axis} must be a whole number between -${COORD_LIMIT.toLocaleString('en-US')} and ${COORD_LIMIT.toLocaleString('en-US')}.`;
    }
  }
  return null;
}

/**
 * Generate the placement commands for the edited structure (not just the initial size).
 * @param {StructureState} state
 * @param {string} versionId  a profile id
 * @param {PlacementOptions} [options]
 * @returns {StructureCommands}
 */
export function generateStructureCommands(state, versionId, options = DEFAULT_PLACEMENT) {
  /** @type {StructureCommands} */
  const result = { ok: false, commands: [], errors: [], warnings: [], stats: { blocks: 0, boxes: 0, commands: 0, chars: 0 } };

  const profile = Object.hasOwn(PROFILES, versionId) ? PROFILES[/** @type {keyof typeof PROFILES} */ (versionId)] : undefined;
  if (!profile) result.errors.push(`Unsupported Minecraft version "${versionId}".`);
  const placementError = validatePlacement(options);
  if (placementError) result.errors.push(placementError);
  const cells = resolveCells(state);
  if (cells.length === 0) result.errors.push('The structure has no blocks, so there is nothing to place.');
  if (!profile || result.errors.length > 0) return result;

  const { origin, mode } = options;
  /** @type {(n: number) => string} */
  const relative = (n) => (n === 0 ? '~' : `~${n}`);
  /** @type {(x: number, y: number, z: number) => string} */
  const pos = (x, y, z) =>
    mode === 'relative'
      ? `${relative(origin.x + x)} ${relative(origin.y + y)} ${relative(origin.z + z)}`
      : `${origin.x + x} ${origin.y + y} ${origin.z + z}`;

  const { width, height, length } = state.dims;
  const commands = result.commands;

  if (options.clearArea) {
    const perChunk = Math.max(1, Math.floor(FILL_BLOCK_LIMIT / (width * length)));
    for (let y = 0; y < height; y += perChunk) {
      const top = Math.min(height - 1, y + perChunk - 1);
      commands.push(profile.placement.fill(pos(0, y, 0), pos(width - 1, top, length - 1), 'minecraft:air'));
    }
  }

  const boxes = mergeBoxes(cells);
  for (const box of boxes) {
    const volume = (box.x2 - box.x1 + 1) * (box.y2 - box.y1 + 1) * (box.z2 - box.z1 + 1);
    if (volume > FILL_BLOCK_LIMIT) {
      result.errors.push(`A fill would cover ${volume.toLocaleString('en-US')} blocks, over the ${FILL_BLOCK_LIMIT.toLocaleString('en-US')} limit.`);
      return result;
    }
    commands.push(
      volume === 1
        ? profile.placement.setblock(pos(box.x1, box.y1, box.z1), box.block)
        : profile.placement.fill(pos(box.x1, box.y1, box.z1), pos(box.x2, box.y2, box.z2), box.block),
    );
  }

  if (mode === 'relative') {
    // The machine's own column: self-cleaning fills ~ ~ ~ ~ ~-3 ~ with air, and the machine sits there.
    const cx = -origin.x;
    const cz = -origin.z;
    const hit = cells.some((c) => c.x === cx && c.z === cz && c.y + origin.y >= -3 && c.y + origin.y <= 1);
    if (hit) {
      result.warnings.push(
        'Part of the structure is inside the machine\'s own column (relative x 0, z 0, y -3 to 1). With Self-cleaning on, those blocks are cleared. Move the origin so the structure avoids that column.',
      );
    }
  }

  result.ok = true;
  result.stats = {
    blocks: cells.length,
    boxes: boxes.length,
    commands: commands.length,
    chars: commands.reduce((total, command) => total + command.length, 0),
  };
  return result;
}

/**
 * What adding these commands to a script would produce: the merged script, and what the existing
 * generator makes of it. Nothing is truncated; an over-length result is reported, not hidden.
 * @param {string} script
 * @param {string[]} commands
 * @param {'append' | 'replace'} mode
 * @param {BuildSettings} settings
 * @returns {{ script: string, generated: GenerateResult, tooLongForScript: boolean, overLimitBy: number }}
 */
export function assessTransfer(script, commands, mode, settings) {
  const merged = mergeIntoScript(script, commands.map((text) => ({ text, line: 0 })), mode);
  const generated = generate(merged, settings);
  return {
    script: merged,
    generated,
    tooLongForScript: merged.length > MAX_SCRIPT_CHARS,
    overLimitBy: Math.max(0, generated.outputLength - MAX_COMMAND_CHARS),
  };
}
