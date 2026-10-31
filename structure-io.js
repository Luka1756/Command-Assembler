// @ts-check
import { isCommandBlock, isFacing, normalizeBlockId, validateBlockCommand } from './blocks.js';
import { COORD_LIMIT, DEFAULT_PLACEMENT, validatePlacement } from './structure-commands.js';
import { DEFAULT_ROLE_BLOCKS, MAX_BLOCKS, cellInfo, createState, keyOf, validateDimensions } from './structure.js';

/** @typedef {import('./structure.js').StructureState} StructureState */
/** @typedef {import('./structure-commands.js').PlacementOptions} PlacementOptions */

/**
 * Serialised structure format, version 1. Plain JSON, safe to store and to import:
 *   { v: 1, dims: {width,height,length}, roles: {floor,wall,ceiling}, shell: boolean,
 *     edits: [[x, y, z, blockId | null, facing?, alwaysActive?, command?], ...],
 *     gen: { mode: 'relative'|'absolute', origin: [x,y,z], clearArea: boolean } }
 * `edits` holds only cells that differ from the generated shell. Command blocks carry facing, flag and command.
 * Parsing validates every field and never executes or evaluates anything.
 */
export const STRUCTURE_FORMAT_VERSION = 1;
/** Upper bound on serialised edits; a structure never holds more than MAX_BLOCKS blocks plus erased shell cells. */
export const MAX_SERIAL_EDITS = MAX_BLOCKS + 14_000;

/**
 * @param {StructureState} state
 * @param {PlacementOptions} [gen]
 */
export function serializeStructure(state, gen = DEFAULT_PLACEMENT) {
  const edits = [];
  const keys = Array.from(state.edits.keys()).sort((a, b) => {
    const [ax, ay, az] = a.split(',').map(Number);
    const [bx, by, bz] = b.split(',').map(Number);
    return ay - by || az - bz || ax - bx;
  });
  for (const key of keys) {
    const [x, y, z] = key.split(',').map(Number);
    const block = state.edits.get(key) ?? null;
    const info = cellInfo(state, x, y, z);
    // An erase of a cell that has nothing generated changes nothing; leave it out.
    if (block === null && info.generated === null) continue;
    if (block !== null && isCommandBlock(block)) {
      const p = info.props ?? { facing: 'north', auto: false, command: '' };
      edits.push([x, y, z, block, p.facing, p.auto ? 1 : 0, p.command]);
    } else if (block !== info.generated) {
      edits.push([x, y, z, block]);
    }
  }
  return {
    v: STRUCTURE_FORMAT_VERSION,
    dims: { ...state.dims },
    roles: { ...state.roles },
    shell: state.shell,
    edits,
    gen: { mode: gen.mode, origin: [gen.origin.x, gen.origin.y, gen.origin.z], clearArea: gen.clearArea },
  };
}

/** @param {unknown} v @returns {v is Record<string, unknown>} */
const isRecord = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * @param {unknown} raw
 * @returns {{ ok: true, state: StructureState, gen: PlacementOptions } | { ok: false, error: string }}
 */
export function parseStructure(raw) {
  /** @param {string} error */
  const bad = (error) => /** @type {const} */ ({ ok: false, error: `Structure data is not valid: ${error}` });
  if (!isRecord(raw)) return bad('expected an object.');
  if (raw.v !== STRUCTURE_FORMAT_VERSION) return bad(`unsupported format version ${String(raw.v)}.`);

  const d = raw.dims;
  if (!isRecord(d)) return bad('missing dims.');
  const dims = { width: /** @type {number} */ (d.width), height: /** @type {number} */ (d.height), length: /** @type {number} */ (d.length) };
  const dimCheck = validateDimensions(dims);
  if (!dimCheck.ok) return bad(dimCheck.error);

  const rolesIn = isRecord(raw.roles) ? raw.roles : {};
  const roles = { ...DEFAULT_ROLE_BLOCKS };
  for (const role of /** @type {const} */ (['floor', 'wall', 'ceiling'])) {
    if (rolesIn[role] === undefined) continue;
    const id = normalizeBlockId(/** @type {string} */ (rolesIn[role]));
    if (!id.ok || isCommandBlock(id.id)) return bad(`the ${role} block is not a valid block id.`);
    roles[role] = id.id;
  }
  if (typeof raw.shell !== 'boolean') return bad('shell must be true or false.');
  if (!Array.isArray(raw.edits)) return bad('edits must be a list.');
  if (raw.edits.length > MAX_SERIAL_EDITS) return bad('too many edited cells.');

  const base = createState(dims, roles);
  /** @type {Map<string, string | null>} */
  const edits = new Map();
  /** @type {Map<string, import('./structure.js').CellProps>} */
  const props = new Map();
  for (const [index, entry] of raw.edits.entries()) {
    if (!Array.isArray(entry) || entry.length < 4) return bad(`edit ${index + 1} is malformed.`);
    const [x, y, z, block] = entry;
    if (![x, y, z].every(Number.isInteger)) return bad(`edit ${index + 1} has non-integer coordinates.`);
    if (x < 0 || y < 0 || z < 0 || x >= dims.width || y >= dims.height || z >= dims.length) return bad(`edit ${index + 1} is outside the structure.`);
    const key = keyOf(x, y, z);
    if (edits.has(key)) return bad(`cell (${x}, ${y}, ${z}) appears twice.`);
    if (block === null) {
      edits.set(key, null);
      continue;
    }
    const id = normalizeBlockId(block);
    if (!id.ok) return bad(`edit ${index + 1}: ${id.error}`);
    edits.set(key, id.id);
    if (isCommandBlock(id.id)) {
      const facing = entry[4];
      const command = entry[6] ?? '';
      if (!isFacing(facing)) return bad(`edit ${index + 1} has an unknown facing.`);
      const checked = validateBlockCommand(command);
      if (!checked.ok) return bad(`edit ${index + 1}: ${checked.error}`);
      props.set(key, { facing, auto: entry[5] === 1 || entry[5] === true, command: checked.text });
    }
  }
  const state = { ...base, shell: raw.shell, edits, props };

  const g = isRecord(raw.gen) ? raw.gen : {};
  const origin = Array.isArray(g.origin) ? g.origin : [DEFAULT_PLACEMENT.origin.x, DEFAULT_PLACEMENT.origin.y, DEFAULT_PLACEMENT.origin.z];
  /** @type {PlacementOptions} */
  const gen = {
    mode: /** @type {'relative' | 'absolute'} */ (g.mode ?? DEFAULT_PLACEMENT.mode),
    origin: { x: /** @type {number} */ (origin[0]), y: /** @type {number} */ (origin[1]), z: /** @type {number} */ (origin[2]) },
    clearArea: g.clearArea === true,
  };
  const placementError = validatePlacement(gen);
  if (placementError) return bad(placementError);
  return { ok: true, state, gen };
}

export { COORD_LIMIT };
