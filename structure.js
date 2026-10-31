// @ts-check
import { FACINGS, commandBlockType, isCommandBlock, isFacing, normalizeBlockId, validateBlockCommand } from './blocks.js';

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
 * SHELL
 *   The F/W/C boundary can be switched off (state.shell = false). Then nothing is generated and the
 *   structure holds only blocks placed by hand, on an empty grid of the same Width × Length.
 *
 * COMMAND BLOCKS
 *   A hand-placed command block carries props: its facing, its command and its Always Active flag.
 *   Props exist only for cells whose edit is a command block id; they follow the edit (erase, restore,
 *   reset and out-of-range resizes remove them together).
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
 * @typedef {object} CellProps
 * @property {import('./blocks.js').Facing} facing
 * @property {string} command
 * @property {boolean} auto  Always Active
 */
/**
 * @typedef {object} StructureState
 * @property {Dims} dims
 * @property {RoleBlocks} roles
 * @property {boolean} shell  generate the floor, wall and ceiling
 * @property {ReadonlyMap<string, string | null>} edits  cell key → block id, or null for erased
 * @property {ReadonlyMap<string, CellProps>} props  command block settings, by cell key
 */
/**
 * @typedef {object} ResolvedCell
 * @property {number} x
 * @property {number} y
 * @property {number} z
 * @property {string} block
 * @property {RoleId | null} role  the generated role of this cell, if any
 * @property {boolean} custom  true when the block differs from the generated one
 * @property {CellProps | null} props  command block settings, when the block is a command block
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
  return { dims: { ...dims }, roles: { ...roles }, shell: true, edits: new Map(), props: new Map() };
}

/**
 * Role of the generated block, taking the shell switch into account.
 * @param {StructureState} state
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @returns {RoleId | null}
 */
const roleAt = (state, x, y, z) => (state.shell ? generatedRole(state.dims, x, y, z) : null);

/** @param {StructureState} state */
const generatedCount = (state) => (state.shell ? countGenerated(state.dims) : 0);

/** Default props for a new command block of the given block id. */
export function defaultProps(/** @type {string} */ blockId, /** @type {import('./blocks.js').Facing} */ facing = 'north') {
  const type = commandBlockType(blockId);
  return { facing, command: '', auto: type ? type.autoByDefault : false };
}

/**
 * @param {StructureState} state
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @returns {string | null}
 */
export function generatedBlock(state, x, y, z) {
  const role = roleAt(state, x, y, z);
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
  const role = roleAt(state, x, y, z);
  const generated = role ? state.roles[role] : null;
  const edit = state.edits.get(keyOf(x, y, z));
  const block = edit !== undefined ? edit : generated;
  const props = block !== null && isCommandBlock(block) ? (state.props.get(keyOf(x, y, z)) ?? defaultProps(block)) : null;
  // An erase edit on a cell that has nothing generated changes nothing, so it is not shown as custom.
  return { inBounds, role, generated, block, custom: edit !== undefined && edit !== generated, props };
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
        const role = roleAt(state, x, y, z);
        if (role) cells.set(keyOf(x, y, z), { x, y, z, block: state.roles[role], role, custom: false, props: null });
      }
    }
  }
  for (const [key, value] of state.edits) {
    const [x, y, z] = parseKey(key);
    const role = roleAt(state, x, y, z);
    if (value === null) {
      cells.delete(key);
    } else {
      const props = isCommandBlock(value) ? (state.props.get(key) ?? defaultProps(value)) : null;
      cells.set(key, { x, y, z, block: value, role, custom: value !== (role ? state.roles[role] : null), props });
    }
  }
  return Array.from(cells.values()).sort((a, b) => a.y - b.y || a.z - b.z || a.x - b.x);
}

/**
 * Number of non-air cells.
 * @param {StructureState} state
 */
export function countBlocks(state) {
  let total = generatedCount(state);
  for (const [key, value] of state.edits) {
    const [x, y, z] = parseKey(key);
    const generated = roleAt(state, x, y, z) !== null;
    if (value === null) {
      if (generated) total--;
    } else if (!generated) {
      total++;
    }
  }
  return total;
}

/** Number of cells whose block was changed by hand. */
export function countEdits(/** @type {StructureState} */ state) {
  let total = 0;
  for (const [key, value] of state.edits) {
    const [x, y, z] = parseKey(key);
    const role = roleAt(state, x, y, z);
    if (value !== (role ? state.roles[role] : null) || state.props.has(key)) total++;
  }
  return total;
}

/**
 * Place, replace or (with null) erase one cell. Returns the same state object when nothing changes.
 * A command block gets props (given, or defaults); any other block, and erasing, removes props.
 * @param {StructureState} state
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @param {string | null} block  a block id, or null to erase
 * @param {Partial<CellProps>} [propsIn]  facing / command / auto for a command block
 * @returns {StateOk | Failure}
 */
export function setCell(state, x, y, z, block, propsIn) {
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
  const key = keyOf(x, y, z);

  /** @type {CellProps | null} */
  let nextProps = null;
  if (id !== null && isCommandBlock(id)) {
    const base = state.props.get(key) ?? defaultProps(id);
    nextProps = { ...base, ...propsIn };
    if (!isFacing(nextProps.facing)) return fail('Choose a facing: north, south, east, west, up or down.');
    const checked = validateBlockCommand(nextProps.command);
    if (!checked.ok) return fail(checked.error);
  }
  const previous = state.props.get(key) ?? null;
  const sameProps = JSON.stringify(previous) === JSON.stringify(nextProps) || (previous === null && nextProps === null);
  const wantEdit = !(id === info.generated && nextProps === null);
  if (info.block === id && sameProps && wantEdit === state.edits.has(key)) return { ok: true, state };

  const edits = new Map(state.edits);
  const props = new Map(state.props);
  // A command block is always stored as an edit, even where the shell would put the same id, so its props have a home.
  if (id === info.generated && nextProps === null) edits.delete(key);
  else edits.set(key, id);
  if (nextProps) props.set(key, nextProps);
  else props.delete(key);

  const next = { ...state, edits, props };
  if (countBlocks(next) > MAX_BLOCKS && countBlocks(next) > countBlocks(state)) {
    return fail(`A structure can hold at most ${MAX_BLOCKS.toLocaleString('en-US')} blocks.`);
  }
  return { ok: true, state: next };
}

/**
 * Change the facing, command or Always Active flag of a command block that is already placed.
 * @param {StructureState} state
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @param {Partial<CellProps>} change
 * @returns {StateOk | Failure}
 */
export function setProps(state, x, y, z, change) {
  const info = cellInfo(state, x, y, z);
  if (!info.inBounds || info.block === null || !isCommandBlock(info.block)) return fail('Select a command block first.');
  return setCell(state, x, y, z, info.block, change);
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
  const props = new Map(state.props);
  edits.delete(key);
  props.delete(key);
  return { ok: true, state: { ...state, edits, props } };
}

/**
 * Discard every manual edit, keeping size, F/W/C blocks and the shell setting.
 * @param {StructureState} state
 * @returns {StructureState}
 */
export function resetEdits(state) {
  return state.edits.size === 0 ? state : { ...state, edits: new Map(), props: new Map() };
}

/**
 * Remove every block, generated and hand-placed, and keep the size and settings.
 * @param {StructureState} state
 * @returns {StructureState}
 */
export function clearAll(state) {
  /** @type {Map<string, string | null>} */
  const edits = new Map();
  for (const c of resolveCells(state)) edits.set(keyOf(c.x, c.y, c.z), null);
  return edits.size === 0 && state.edits.size === 0 ? state : { ...state, edits, props: new Map() };
}

/**
 * Turn the generated F/W/C boundary on or off. Edits stay as they are.
 * @param {StructureState} state
 * @param {boolean} shell
 * @returns {StructureState}
 */
export function setShell(state, shell) {
  return state.shell === shell ? state : { ...state, shell };
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
  if (dims.width === state.dims.width && dims.height === state.dims.height && dims.length === state.dims.length) {
    return { ok: true, state, dropped: 0 };
  }
  /** @type {Map<string, string | null>} */
  const edits = new Map();
  /** @type {Map<string, CellProps>} */
  const props = new Map();
  let dropped = 0;
  for (const [key, value] of state.edits) {
    const [x, y, z] = parseKey(key);
    if (x < dims.width && y < dims.height && z < dims.length) {
      edits.set(key, value);
      const p = state.props.get(key);
      if (p) props.set(key, p);
    } else dropped++;
  }
  const next = { ...state, dims: { ...dims }, edits, props };
  if (countBlocks(next) > MAX_BLOCKS) {
    return fail(`With the edits kept, that size holds ${countBlocks(next).toLocaleString('en-US')} blocks; the limit is ${MAX_BLOCKS.toLocaleString('en-US')}.`);
  }
  return { ok: true, state: next, dropped };
}

/**
 * Change the block used for the floor, walls or ceiling. Manual edits stay as they are.
 * Command blocks are refused here: they need a direction and a command, so use the Place tool.
 * @param {StructureState} state
 * @param {RoleId} role
 * @param {string} input
 * @returns {StateOk | Failure}
 */
export function setRoleBlock(state, role, input) {
  const normalized = normalizeBlockId(input);
  if (!normalized.ok) return normalized;
  if (isCommandBlock(normalized.id)) return fail('A command block cannot be a boundary block. Place command blocks with the Place tool.');
  if (state.roles[role] === normalized.id) return { ok: true, state };
  return { ok: true, state: { ...state, roles: { ...state.roles, [role]: normalized.id } } };
}

export { FACINGS };
