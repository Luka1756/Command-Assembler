// @ts-check
import { commandBlockType, isCommandBlock, isFacing, normalizeBlockId, validateBlockCommand } from './blocks.js';
import { parseScript } from './parse.js';
import { decodeString } from './reader.js';
import { FILL_BLOCK_LIMIT } from './structure-commands.js';
import { MAX_BLOCKS, MAX_DIMENSION, createState, defaultProps, keyOf } from './structure.js';

/** @typedef {import('./structure.js').StructureState} StructureState */
/** @typedef {import('./structure-commands.js').PlacementOptions} PlacementOptions */

/**
 * Read a script's `setblock` and `fill` commands into a structure, so they can be seen and edited in 3D.
 *
 * WHAT IS UNDERSTOOD (everything else is left alone, labelled, and never drawn):
 *   setblock <x> <y> <z> <block> [replace | destroy]
 *   fill <x1> <y1> <z1> <x2> <y2> <z2> <block> [replace | destroy | hollow | outline]
 *   - Coordinates: whole numbers, `~` or `~n`. A command's coordinates must all be absolute or all relative; the
 *     first understood command fixes the frame and commands in the other frame are labelled unsupported.
 *     Local (`^`) and decimal coordinates are unsupported.
 *   - Blocks: `namespace:id` (namespace optional), air included (it erases). Block states and NBT are unsupported
 *     because the 3D model cannot carry them, EXCEPT on the three command block types, where `facing`, `conditional=false`,
 *     `{Command:"…"}` and `{auto:…}` are understood.
 *   - `fill … replace <filter>` and `fill … keep` depend on what is already in the world, so they are unsupported.
 *   - Order is kept: a later command overwrites an earlier one at the same cell.
 *
 * The script itself is never changed here. The caller decides what to do with the result.
 *
 * @typedef {object} Placement
 * @property {number} line
 * @property {string} text
 * @property {'setblock' | 'fill'} kind
 * @property {'abs' | 'rel'} frame
 * @property {[number, number, number]} from
 * @property {[number, number, number]} to
 * @property {string | null} block  null for air
 * @property {'set' | 'hollow' | 'outline'} shape
 * @property {import('./structure.js').CellProps | null} props
 *
 * @typedef {'drawn' | 'unsupported' | 'other'} ItemStatus
 * @typedef {{ line: number, text: string, status: ItemStatus, reason: string }} Item
 *
 * @typedef {object} Interpretation
 * @property {Item[]} items  every command, in script order
 * @property {{ drawn: number, unsupported: number, other: number }} counts
 * @property {string | null} error  set when nothing can be loaded (for example the size is over the limit)
 * @property {{ state: StructureState, gen: PlacementOptions } | null} result
 */

const AIR = new Set(['air', 'cave_air', 'void_air', 'minecraft:air', 'minecraft:cave_air', 'minecraft:void_air']);

/**
 * @param {string} token
 * @returns {{ kind: 'abs' | 'rel', value: number } | null}
 */
function parseCoord(token) {
  if (/^-?\d{1,9}$/.test(token)) return { kind: 'abs', value: Number(token) };
  const rel = /^~(-?\d{1,9})?$/.exec(token);
  if (rel) return { kind: 'rel', value: rel[1] === undefined ? 0 : Number(rel[1]) };
  return null;
}

/**
 * Skip over a balanced `{…}` or `[…]` that starts at `start`, honouring quoted strings. Returns the index after it, or -1.
 * @param {string} text
 * @param {number} start
 */
function skipBalanced(text, start) {
  const open = text[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"' || ch === "'") {
      for (i++; i < text.length && text[i] !== ch; i++) if (text[i] === '\\') i++;
      if (i >= text.length) return -1;
    } else if (ch === open) depth++;
    else if (ch === close && --depth === 0) return i + 1;
  }
  return -1;
}

/**
 * Parse `{key:value,…}` at the top level into raw value strings (nested values are not interpreted).
 * @param {string} body  text between the braces
 * @returns {Map<string, string> | null}
 */
function topLevelEntries(body) {
  /** @type {Map<string, string>} */
  const entries = new Map();
  let i = 0;
  const n = body.length;
  const skipWs = () => {
    while (i < n && /\s/.test(body[i])) i++;
  };
  skipWs();
  while (i < n) {
    const keyStart = i;
    if (body[i] === '"' || body[i] === "'") {
      const q = body[i];
      for (i++; i < n && body[i] !== q; i++) if (body[i] === '\\') i++;
      i++;
    } else {
      while (i < n && /[A-Za-z0-9_.+-]/.test(body[i])) i++;
    }
    let key = body.slice(keyStart, i);
    if (key === '') return null;
    if (key[0] === '"' || key[0] === "'") key = key.slice(1, -1);
    skipWs();
    if (body[i] !== ':') return null;
    i++;
    skipWs();
    const valueStart = i;
    if (body[i] === '"' || body[i] === "'") {
      const q = body[i];
      for (i++; i < n && body[i] !== q; i++) if (body[i] === '\\') i++;
      if (i >= n) return null;
      i++;
    } else if (body[i] === '{' || body[i] === '[') {
      const end = skipBalanced(body, i);
      if (end === -1) return null;
      i = end;
    } else {
      while (i < n && body[i] !== ',') i++;
    }
    entries.set(key, body.slice(valueStart, i).trim());
    skipWs();
    if (i < n) {
      if (body[i] !== ',') return null;
      i++;
      skipWs();
    }
  }
  return entries;
}

/**
 * @param {string} raw  a raw SNBT value
 * @returns {boolean | null}
 */
function asBool(raw) {
  if (/^(1|1b|true)$/i.test(raw)) return true;
  if (/^(0|0b|false)$/i.test(raw)) return false;
  return null;
}

/**
 * Read a block spec `id[states]{nbt}` from the start of `text`.
 * @param {string} text
 * @returns {{ ok: true, block: string | null, props: import('./structure.js').CellProps | null, rest: string } | { ok: false, reason: string }}
 */
function parseBlockSpec(text) {
  const idMatch = /^[^\s[{]+/.exec(text);
  if (!idMatch) return { ok: false, reason: 'No block was given.' };
  let i = idMatch[0].length;
  const rawId = idMatch[0];
  /** @type {Map<string, string>} */
  const states = new Map();
  if (text[i] === '[') {
    const end = skipBalanced(text, i);
    if (end === -1) return { ok: false, reason: 'The block states are not closed.' };
    const inner = text.slice(i + 1, end - 1).trim();
    if (inner !== '') {
      for (const part of inner.split(',')) {
        const eq = part.indexOf('=');
        if (eq < 1) return { ok: false, reason: `The block state "${part.trim()}" is malformed.` };
        states.set(part.slice(0, eq).trim(), part.slice(eq + 1).trim());
      }
    }
    i = end;
  }
  /** @type {Map<string, string> | null} */
  let nbt = null;
  if (text[i] === '{') {
    const end = skipBalanced(text, i);
    if (end === -1) return { ok: false, reason: 'The block data is not closed.' };
    nbt = topLevelEntries(text.slice(i + 1, end - 1));
    if (!nbt) return { ok: false, reason: 'The block data could not be read.' };
    i = end;
  }
  const rest = text.slice(i);
  if (rest !== '' && !/^\s/.test(rest)) return { ok: false, reason: 'Unexpected text after the block.' };

  if (AIR.has(rawId)) {
    if (states.size > 0 || nbt) return { ok: false, reason: 'Air with states or data is not supported.' };
    return { ok: true, block: null, props: null, rest: rest.trim() };
  }
  const normalized = normalizeBlockId(rawId);
  if (!normalized.ok) return { ok: false, reason: normalized.error };
  const id = normalized.id;

  if (!isCommandBlock(id)) {
    if (states.size > 0) return { ok: false, reason: 'Block states are not drawn, so this command is left in the script as it is.' };
    if (nbt) return { ok: false, reason: 'Block data (NBT) is not drawn, so this command is left in the script as it is.' };
    return { ok: true, block: id, props: null, rest: rest.trim() };
  }

  const props = defaultProps(id);
  for (const [key, value] of states) {
    if (key === 'facing') {
      if (!isFacing(value)) return { ok: false, reason: `Unknown facing "${value}".` };
      props.facing = value;
    } else if (key === 'conditional') {
      if (value !== 'false') return { ok: false, reason: 'Conditional command blocks are not supported.' };
    } else {
      return { ok: false, reason: `The block state "${key}" is not supported on command blocks.` };
    }
  }
  if (nbt) {
    for (const [key, raw] of nbt) {
      if (key === 'Command') {
        const quote = raw[0];
        if ((quote !== '"' && quote !== "'") || raw[raw.length - 1] !== quote || raw.length < 2) return { ok: false, reason: 'The Command value is not a quoted string.' };
        const decoded = decodeString(raw.slice(1, -1));
        if (decoded.warnings.length > 0) return { ok: false, reason: 'The Command text has an unreadable escape.' };
        const checked = validateBlockCommand(decoded.value);
        if (!checked.ok) return { ok: false, reason: checked.error };
        props.command = checked.text;
      } else if (key === 'auto') {
        const auto = asBool(raw);
        if (auto === null) return { ok: false, reason: 'The auto value is not 0, 1, true or false.' };
        props.auto = auto;
      } else {
        return { ok: false, reason: `The block data "${key}" is not supported.` };
      }
    }
  }
  return { ok: true, block: id, props, rest: rest.trim() };
}

/**
 * @param {string} text  one command
 * @param {number} line
 * @returns {{ kind: 'placement', placement: Placement } | { kind: 'unsupported', reason: string } | { kind: 'other' }}
 */
export function interpretCommand(text, line) {
  const head = /^(setblock|fill)\s+/.exec(text);
  if (!head) return { kind: 'other' };
  const kind = /** @type {'setblock' | 'fill'} */ (head[1]);
  let rest = text.slice(head[0].length);
  const count = kind === 'setblock' ? 3 : 6;
  /** @type {number[]} */
  const values = [];
  /** @type {Set<'abs' | 'rel'>} */
  const frames = new Set();
  for (let k = 0; k < count; k++) {
    const m = /^(\S+)\s*/.exec(rest);
    if (!m) return { kind: 'unsupported', reason: `${kind} needs ${count} coordinates.` };
    const c = parseCoord(m[1]);
    if (!c) {
      return {
        kind: 'unsupported',
        reason: /[\^]/.test(m[1]) ? 'Local (^) coordinates are not drawn.' : /\./.test(m[1]) ? 'Decimal coordinates are not drawn.' : `"${m[1]}" is not a whole-number or ~ coordinate.`,
      };
    }
    frames.add(c.kind);
    values.push(c.value);
    rest = rest.slice(m[0].length);
  }
  if (frames.size > 1) return { kind: 'unsupported', reason: 'Absolute and ~ coordinates are mixed in one command.' };
  const frame = /** @type {'abs' | 'rel'} */ (Array.from(frames)[0]);
  const spec = parseBlockSpec(rest);
  if (!spec.ok) return { kind: 'unsupported', reason: spec.reason };

  /** @type {'set' | 'hollow' | 'outline'} */
  let shape = 'set';
  const mode = spec.rest;
  if (mode !== '') {
    if (kind === 'setblock' && (mode === 'replace' || mode === 'destroy')) shape = 'set';
    else if (kind === 'fill' && (mode === 'replace' || mode === 'destroy')) shape = 'set';
    else if (kind === 'fill' && (mode === 'hollow' || mode === 'outline')) shape = mode;
    else if (mode === 'keep') return { kind: 'unsupported', reason: 'The keep mode depends on what is already in the world.' };
    else return { kind: 'unsupported', reason: `The mode "${mode}" is not drawn.` };
  }
  if (spec.props && kind === 'fill' && spec.props.command !== '') return { kind: 'unsupported', reason: 'Fill cannot carry a command.' };
  const from = /** @type {[number, number, number]} */ (values.slice(0, 3));
  const to = /** @type {[number, number, number]} */ (kind === 'setblock' ? from : values.slice(3, 6));
  return { kind: 'placement', placement: { line, text, kind, frame, from, to, block: spec.block, shape, props: spec.props } };
}

/**
 * Read a whole script.
 * @param {string} script
 * @returns {Interpretation}
 */
export function interpretScript(script) {
  const parsed = parseScript(script);
  /** @type {Item[]} */
  const items = [];
  /** @type {Placement[]} */
  const placements = [];
  /** @type {'abs' | 'rel' | null} */
  let frame = null;

  for (const command of parsed.commands) {
    const r = interpretCommand(command.text, command.line);
    if (r.kind === 'other') {
      items.push({ line: command.line, text: command.text, status: 'other', reason: 'Not a block placement. It stays in the script and is not drawn.' });
    } else if (r.kind === 'unsupported') {
      items.push({ line: command.line, text: command.text, status: 'unsupported', reason: r.reason });
    } else if (frame !== null && r.placement.frame !== frame) {
      items.push({
        line: command.line,
        text: command.text,
        status: 'unsupported',
        reason: `The script uses ${frame === 'abs' ? 'absolute' : '~'} coordinates; this command uses ${frame === 'abs' ? '~' : 'absolute'} coordinates and cannot share the same grid.`,
      });
    } else {
      frame = r.placement.frame;
      placements.push(r.placement);
      items.push({ line: command.line, text: command.text, status: 'drawn', reason: '' });
    }
  }

  const counts = {
    drawn: items.filter((i) => i.status === 'drawn').length,
    unsupported: items.filter((i) => i.status === 'unsupported').length,
    other: items.filter((i) => i.status === 'other').length,
  };
  /** @param {string} error @returns {Interpretation} */
  const failed = (error) => ({ items, counts, error, result: null });
  if (placements.length === 0 || frame === null) return failed(counts.unsupported + counts.other === 0 ? 'The script has no commands.' : 'No setblock or fill commands could be drawn.');

  // Bounding box of everything drawn.
  /** @type {[number, number, number]} */
  const min = [Infinity, Infinity, Infinity];
  /** @type {[number, number, number]} */
  const max = [-Infinity, -Infinity, -Infinity];
  for (const p of placements) {
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], p.from[k], p.to[k]);
      max[k] = Math.max(max[k], p.from[k], p.to[k]);
    }
  }
  const size = [max[0] - min[0] + 1, max[1] - min[1] + 1, max[2] - min[2] + 1];
  const names = ['Width', 'Height', 'Length'];
  for (let k = 0; k < 3; k++) {
    if (size[k] > MAX_DIMENSION) {
      return failed(`The placements span ${size[0]} × ${size[1]} × ${size[2]} blocks. ${names[k]} is ${size[k]}, over the ${MAX_DIMENSION} the 3D grid holds. Nothing was drawn and nothing was cut.`);
    }
  }

  const state0 = createState({ width: size[0], height: size[1], length: size[2] });
  /** @type {Map<string, string | null>} */
  const cells = new Map();
  /** @type {Map<string, import('./structure.js').CellProps>} */
  const props = new Map();
  for (const p of placements) {
    const lo = [0, 1, 2].map((k) => Math.min(p.from[k], p.to[k]) - min[k]);
    const hi = [0, 1, 2].map((k) => Math.max(p.from[k], p.to[k]) - min[k]);
    const volume = (hi[0] - lo[0] + 1) * (hi[1] - lo[1] + 1) * (hi[2] - lo[2] + 1);
    if (volume > FILL_BLOCK_LIMIT) return failed(`Line ${p.line}: the fill covers ${volume.toLocaleString('en-US')} blocks, over the ${FILL_BLOCK_LIMIT.toLocaleString('en-US')} limit.`);
    for (let y = lo[1]; y <= hi[1]; y++) {
      for (let z = lo[2]; z <= hi[2]; z++) {
        for (let x = lo[0]; x <= hi[0]; x++) {
          const edge = [x === lo[0] || x === hi[0], y === lo[1] || y === hi[1], z === lo[2] || z === hi[2]].filter(Boolean).length;
          let value = p.block;
          let write = true;
          if (p.shape === 'hollow') {
            if (edge === 0) value = null;
          } else if (p.shape === 'outline' && edge === 0) write = false;
          if (!write) continue;
          const key = keyOf(x, y, z);
          cells.set(key, value);
          if (value !== null && p.props) props.set(key, { ...p.props });
          else props.delete(key);
        }
      }
    }
  }
  // Air placed where nothing exists is not an edit.
  const edits = new Map([...cells].filter(([, v]) => v !== null));
  for (const key of props.keys()) if (!edits.has(key)) props.delete(key);
  if (edits.size > MAX_BLOCKS) return failed(`The placements make ${edits.size.toLocaleString('en-US')} blocks, over the ${MAX_BLOCKS.toLocaleString('en-US')} the 3D grid holds. Nothing was drawn and nothing was cut.`);

  const state = { ...state0, shell: false, edits, props };
  /** @type {PlacementOptions} */
  const gen = { mode: frame === 'rel' ? 'relative' : 'absolute', origin: { x: min[0], y: min[1], z: min[2] }, clearArea: false };
  return { items, counts, error: null, result: { state, gen } };
}

/**
 * The script without the commands that were drawn (matched by exact text, one for one), so the structure's
 * regenerated commands can replace them while everything else in the script stays, in order.
 * @param {string} script
 * @param {string[]} drawnTexts
 * @returns {{ script: string, removed: number }}
 */
export function removeDrawn(script, drawnTexts) {
  /** @type {Map<string, number>} */
  const pending = new Map();
  for (const t of drawnTexts) pending.set(t, (pending.get(t) ?? 0) + 1);
  const keep = [];
  let removed = 0;
  for (const raw of script.split(/\r\n|\r|\n/)) {
    let text = raw.trim();
    if (text.startsWith('/')) text = text.slice(1).trimStart();
    const left = pending.get(text) ?? 0;
    if (text !== '' && !text.startsWith('#') && left > 0) {
      pending.set(text, left - 1);
      removed++;
    } else keep.push(raw);
  }
  return { script: keep.join('\n').replace(/^\n+|\n+$/g, ''), removed };
}

export { commandBlockType };
