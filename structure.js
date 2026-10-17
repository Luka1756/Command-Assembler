// @ts-check
import { normalizeBlockId } from './blocks.js';

/**
 * The 3D editor's data model. Pure logic, no DOM.
 *
 * COORDINATE SYSTEM
 *   A structure is Width × Height × Length blocks, and these are OUTER sizes (they include the
 *   boundary layers). Cells are addressed (x, y, z), each from 0:
 *     origin (0, 0, 0) = the minimum corner: west, bottom, north
 *     +x = east   (0 … Width-1)    — Width  is the east–west size
 *     +y = up     (0 … Height-1)   — Height is the vertical size
 *     +z = south  (0 … Length-1)   — Length is the north–south size
 *   This matches Minecraft's own axes, so a block at (x, y, z) is placed at origin + (x, y, z).
 *
 * BOUNDARY ROLES
 *   Floor   y = 0                                  (bottom layer, every x and z)
 *   Ceiling y = Height-1                           (top layer, every x and z)
 *   Wall    x = 0, x = Width-1, z = 0, z = Length-1, for the layers between floor and ceiling
 *   The inside is empty (air).
 *
 * PRIORITY where roles meet (corners and edges): Floor > Ceiling > Wall.
 *   So the floor and ceiling layers are always complete, and walls fill the space between them.
 *
 * SMALL SIZES follow from the rules above:
 *   Height 1 → floor only (the ceiling would be the same layer; floor wins).
 *   Height 2 → floor and ceiling, no wall layers.
 *   Width or Length 1 → the two opposite walls are the same column, so one wall column.
 *
 * EDITS
 *   Manual changes are stored as overrides on top of the generated structure, keyed by cell:
 *   a block id (placed or replaced) or null (erased). An edit is custom and stays custom when the
 *   F/W/C blocks change or the size changes, as long as its cell is still inside the structure.
 *   An edit that sets a cell back to its generated block is removed (the cell follows its role again).
 */

export const MIN_DIMENSION = 1;
export const MAX_DIMENSION = 48;
/** Most non-air cells (generated plus custom) a structure may hold. Bounds memory, drawing and command size. */
export const MAX_BLOCKS = 16_000;

/** @typedef {'floor' | 'wall' | 'ceiling'} RoleId */
/** @typedef {{ width: number, height: number, length: number }} Dims */
/** @typedef {{ floor: string, wall: string, ceiling: string }} RoleBlocks */
/**
 * @typedef {object} StructureState
 * @property {Dims} dims
 * @property {RoleBlocks} roles
 * @property {ReadonlyMap<string, string | null>} edits  cell key → block id, or null for erased
 */
/**
 * @typedef {object} ResolvedCell
 * @property {number} x
 * @property {number} y
 * @property {number} z
 * @property {string} block
 * @property {RoleId | null} role  the generated role of this cell, if any
 * @property {boolean} custom  true when the block differs from the generated one
 */
/** @typedef {{ ok: true, state: StructureState }} StateOk */
/** @typedef {{ ok: false, error: string }} Failure */

export const ROLES = /** @type {const} */ ([
  { id: 'floor', label: 'F', name: 'Floor' },
  { id: 'wall', label: 'W', name: 'Wall' },
  { id: 'ceiling', label: 'C', name: 'Ceiling' },
]);

/** @type {RoleBlocks} */
export const DEFAULT_ROLE_BLOCKS = {
  floor: 'minecraft:bedrock',
  wall: 'minecraft:glass',
  ceiling: 'minecraft:bedrock',
};

/** @type {Dims} */
export const DEFAULT_DIMENSIONS = { width: 7, height: 5, length: 7 };

/**
 * @param {number} x
 * @param {number} y
 * @param {number} z
 */
export const keyOf = (x, y, z) => `${x},${y},${z}`;

/**
 * @param {string} key
 * @returns {[number, number, number]}
 */
export function parseKey(key) {
  const [x, y, z] = key.split(',').map(Number);
  return [x, y, z];
}

/** @param {string} message @returns {Failure} */
const fail = (message) => ({ ok: false, error: message });

/**
 * @param {Dims} dims
 * @returns {{ ok: true } | Failure}
 */
export function validateDimensions(dims) {
  const entries = /** @type {const} */ ([
    ['Width', dims.width],
    ['Height', dims.height],
    ['Length', dims.length],
  ]);
  for (const [name, value] of entries) {
    if (!Number.isInteger(value) || value < MIN_DIMENSION || value > MAX_DIMENSION) {
      return fail(`${name} must be a whole number from ${MIN_DIMENSION} to ${MAX_DIMENSION}.`);
    }
  }
  const total = countGenerated(dims);
  if (total > MAX_BLOCKS) {
    return fail(`A ${dims.width} × ${dims.height} × ${dims.length} structure has ${total.toLocaleString('en-US')} blocks; the limit is ${MAX_BLOCKS.toLocaleString('en-US')}.`);
  }
  return { ok: true };
}

/**
 * Parse a size field: digits only. Returns NaN for anything else (including empty, signs, decimals).
 * @param {string} text
 */
export function parseDimension(text) {
  return /^\d{1,4}$/.test(text.trim()) ? Number(text.trim()) : NaN;
}

/**
 * Role of the generated block at a cell, or null for the inside and for cells outside the structure.
 * @param {Dims} dims
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @returns {RoleId | null}
 */
export function generatedRole(dims, x, y, z) {
  const { width, height, length } = dims;
  if (x < 0 || y < 0 || z < 0 || x >= width || y >= height || z >= length) return null;
  if (y === 0) return 'floor';
  if (y === height - 1) return 'ceiling';
  if (x === 0 || x === width - 1 || z === 0 || z === length - 1) return 'wall';
  return null;
}

/**
 * Number of generated (non-air) cells, by formula.
 * @param {Dims} dims
 */
export function countGenerated({ width, height, length }) {
  const layer = width * length;
  if (height === 1) return layer;
  const inner = Math.max(0, width - 2) * Math.max(0, length - 2);
  return 2 * layer + (height - 2) * (layer - inner);
}

/**
 * @param {Dims} [dims]
 * @param {RoleBlocks} [roles]
 * @returns {StructureState}
 */
export function createState(dims = DEFAULT_DIMENSIONS, roles = DEFAULT_ROLE_BLOCKS) {
  return { dims: { ...dims }, roles: { ...roles }, edits: new Map() };
}

/**
 * @param {StructureState} state
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @returns {string | null}
 */
export function generatedBlock(state, x, y, z) {
  const role = generatedRole(state.dims, x, y, z);
  return role ? state.roles[role] : null;
}

/**
 * Everything known about one cell.
 * @param {StructureState} state
 * @param {number} x
 * @param {number} y
 * @param {number} z
 */
export function cellInfo(state, x, y, z) {
  const { width, height, length } = state.dims;
  const inBounds = x >= 0 && y >= 0 && z >= 0 && x < width && y < height && z < length;
  const role = generatedRole(state.dims, x, y, z);
  const generated = role ? state.roles[role] : null;
  const edit = state.edits.get(keyOf(x, y, z));
  const block = edit !== undefined ? edit : generated;
  return { inBounds, role, generated, block, custom: edit !== undefined };
}

/**
 * Non-air cells, in a fixed order: layer by layer from the bottom (y), then north to south (z), then west to east (x).
 * @param {StructureState} state
 * @returns {ResolvedCell[]}
 */
export function resolveCells(state) {
  const { width, height, length } = state.dims;
  /** @type {Map<string, ResolvedCell>} */
  const cells = new Map();
  for (let y = 0; y < height; y++) {
    for (let z = 0; z < length; z++) {
      for (let x = 0; x < width; x++) {
        const role = generatedRole(state.dims, x, y, z);
        if (role) cells.set(keyOf(x, y, z), { x, y, z, block: state.roles[role], role, custom: false });
      }
    }
  }
  for (const [key, value] of state.edits) {
    const [x, y, z] = parseKey(key);
    const role = generatedRole(state.dims, x, y, z);
    if (value === null) {
      cells.delete(key);
    } else {
      cells.set(key, { x, y, z, block: value, role, custom: true });
    }
  }
  return Array.from(cells.values()).sort((a, b) => a.y - b.y || a.z - b.z || a.x - b.x);
}

/**
 * Number of non-air cells.
 * @param {StructureState} state
 */
export function countBlocks(state) {
  let total = countGenerated(state.dims);
  for (const [key, value] of state.edits) {
    const [x, y, z] = parseKey(key);
    const generated = generatedRole(state.dims, x, y, z) !== null;
    if (value === null) {
      if (generated) total--;
    } else if (!generated) {
      total++;
    }
  }
  return total;
}

/** Number of cells whose block was changed by hand. */
export const countEdits = (/** @type {StructureState} */ state) => state.edits.size;

/**
 * Place, replace or (with null) erase one cell. Returns the same state object when nothing changes.
 * @param {StructureState} state
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @param {string | null} block  a block id, or null to erase
 * @returns {StateOk | Failure}
 */
export function setCell(state, x, y, z, block) {
  const { width, height, length } = state.dims;
  if (![x, y, z].every(Number.isInteger) || !cellInfo(state, x, y, z).inBounds) {
    return fail(`Cell (${x}, ${y}, ${z}) is outside the structure (x 0–${width - 1}, y 0–${height - 1}, z 0–${length - 1}).`);
  }
  /** @type {string | null} */
  let id = null;
  if (block !== null) {
    const normalized = normalizeBlockId(block);
    if (!normalized.ok) return fail(normalized.error);
    id = normalized.id;
  }

  const info = cellInfo(state, x, y, z);
  if (info.block === id) return { ok: true, state };

  const edits = new Map(state.edits);
  const key = keyOf(x, y, z);
  if (id === info.generated) edits.delete(key);
  else edits.set(key, id);

  const next = { ...state, edits };
  if (countBlocks(next) > MAX_BLOCKS && countBlocks(next) > countBlocks(state)) {
    return fail(`A structure can hold at most ${MAX_BLOCKS.toLocaleString('en-US')} blocks.`);
  }
  return { ok: true, state: next };
}

/**
 * Put one cell back to its generated block.
 * @param {StructureState} state
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @returns {StateOk | Failure}
 */
export function restoreCell(state, x, y, z) {
  const key = keyOf(x, y, z);
  if (!state.edits.has(key)) return { ok: true, state };
  const edits = new Map(state.edits);
  edits.delete(key);
  return { ok: true, state: { ...state, edits } };
}

/**
 * Discard every manual edit, keeping size and F/W/C blocks.
 * @param {StructureState} state
 * @returns {StructureState}
 */
export function resetEdits(state) {
  return state.edits.size === 0 ? state : { ...state, edits: new Map() };
}

/**
 * Edits whose cell would fall outside a new size.
 * @param {StructureState} state
 * @param {Dims} dims
 */
export function editsOutside(state, dims) {
  let count = 0;
  for (const key of state.edits.keys()) {
    const [x, y, z] = parseKey(key);
    if (x >= dims.width || y >= dims.height || z >= dims.length) count++;
  }
  return count;
}

/**
 * Change the size. Edits inside the new size are kept at the same coordinates (the origin corner stays
 * fixed); edits outside it are dropped and counted so the caller can warn first.
 * @param {StructureState} state
 * @param {Dims} dims
 * @returns {(StateOk & { dropped: number }) | Failure}
 */
export function changeDimensions(state, dims) {
  const valid = validateDimensions(dims);
  if (!valid.ok) return valid;
  if (
    dims.width === state.dims.width &&
    dims.height === state.dims.height &&
    dims.length === state.dims.length
  ) {
    return { ok: true, state, dropped: 0 };
  }
  /** @type {Map<string, string | null>} */
  const edits = new Map();
  let dropped = 0;
  for (const [key, value] of state.edits) {
    const [x, y, z] = parseKey(key);
    if (x < dims.width && y < dims.height && z < dims.length) edits.set(key, value);
    else dropped++;
  }
  const next = { ...state, dims: { ...dims }, edits };
  if (countBlocks(next) > MAX_BLOCKS) {
    return fail(`With the edits kept, that size holds ${countBlocks(next).toLocaleString('en-US')} blocks; the limit is ${MAX_BLOCKS.toLocaleString('en-US')}.`);
  }
  return { ok: true, state: next, dropped };
}

/**
 * Change the block used for the floor, walls or ceiling. Manual edits stay as they are.
 * @param {StructureState} state
 * @param {RoleId} role
 * @param {string} input
 * @returns {StateOk | Failure}
 */
export function setRoleBlock(state, role, input) {
  const normalized = normalizeBlockId(input);
  if (!normalized.ok) return normalized;
  if (state.roles[role] === normalized.id) return { ok: true, state };
  return { ok: true, state: { ...state, roles: { ...state.roles, [role]: normalized.id } } };
}
