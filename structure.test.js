import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COMMON_BLOCK_IDS, normalizeBlockId } from './blocks.js';
import { createHistory } from './history.js';
import {
  DEFAULT_ROLE_BLOCKS,
  MAX_BLOCKS,
  MAX_DIMENSION,
  cellInfo,
  changeDimensions,
  countBlocks,
  countGenerated,
  createState,
  editsOutside,
  generatedRole,
  parseDimension,
  resetEdits,
  resolveCells,
  restoreCell,
  setCell,
  setRoleBlock,
  validateDimensions,
} from './structure.js';

/** @param {number} width @param {number} height @param {number} length */
const make = (width, height, length) => createState({ width, height, length });
/** @param {import('./structure.js').StructureState} state */
const roleMap = (state) => {
  /** @type {Record<string, string>} */
  const map = {};
  for (const c of resolveCells(state)) map[`${c.x},${c.y},${c.z}`] = c.role ?? '-';
  return map;
};
/** @template T @param {{ ok: boolean }} result */
const must = (result) => {
  assert.equal(result.ok, true, JSON.stringify(result));
  return /** @type {any} */ (result).state;
};

// ---------- block ids ----------

test('blocks: ids are normalised and validated by shape', () => {
  assert.deepEqual(normalizeBlockId('glass'), { ok: true, id: 'minecraft:glass' });
  assert.deepEqual(normalizeBlockId('  Minecraft:Glass '), { ok: true, id: 'minecraft:glass' });
  assert.deepEqual(normalizeBlockId('mymod:fancy/block_2'), { ok: true, id: 'mymod:fancy/block_2' });
  for (const bad of ['', '   ', 'glass[color=red]', 'chest{a:1}', '#minecraft:wool', 'a:b:c', 'my block', 'gl@ss', 'minecraft:', ':glass', 'x'.repeat(101)]) {
    assert.equal(normalizeBlockId(bad).ok, false, JSON.stringify(bad));
  }
  assert.match(/** @type {any} */ (normalizeBlockId('glass[a=b]')).error, /states/);
});

test('blocks: air is refused as a placeable block, pointing at Erase', () => {
  for (const air of ['air', 'minecraft:air', 'minecraft:cave_air', 'void_air']) {
    const result = normalizeBlockId(air);
    assert.equal(result.ok, false);
    assert.match(/** @type {any} */ (result).error, /Erase/);
  }
});

test('blocks: every id in the picker list is valid and unique', () => {
  assert.equal(new Set(COMMON_BLOCK_IDS).size, COMMON_BLOCK_IDS.length);
  for (const id of COMMON_BLOCK_IDS) assert.deepEqual(normalizeBlockId(id), { ok: true, id });
  assert.ok(COMMON_BLOCK_IDS.includes('minecraft:bedrock') && COMMON_BLOCK_IDS.includes('minecraft:glass'));
});

// ---------- dimensions ----------

test('dimensions: minimum, maximum and invalid sizes', () => {
  assert.equal(validateDimensions({ width: 1, height: 1, length: 1 }).ok, true);
  assert.equal(validateDimensions({ width: MAX_DIMENSION, height: MAX_DIMENSION, length: MAX_DIMENSION }).ok, true);
  for (const bad of [
    { width: 0, height: 3, length: 3 },
    { width: 3, height: -1, length: 3 },
    { width: 3, height: 3, length: 49 },
    { width: 2.5, height: 3, length: 3 },
    { width: NaN, height: 3, length: 3 },
    { width: 3, height: Infinity, length: 3 },
  ]) {
    const result = validateDimensions(bad);
    assert.equal(result.ok, false, JSON.stringify(bad));
    assert.match(/** @type {any} */ (result).error, /whole number from 1 to 48/);
  }
});

test('dimensions: the largest allowed structure stays inside the block limit', () => {
  assert.ok(countGenerated({ width: MAX_DIMENSION, height: MAX_DIMENSION, length: MAX_DIMENSION }) <= MAX_BLOCKS);
});

test('dimensions: size fields accept digits only', () => {
  assert.equal(parseDimension('7'), 7);
  assert.equal(parseDimension(' 12 '), 12);
  for (const bad of ['', '-1', '1.5', '1e2', 'abc', '+3', '12345']) assert.ok(Number.isNaN(parseDimension(bad)), bad);
});

// ---------- geometry ----------

test('geometry: the block count formula matches counting the cells', () => {
  for (const [w, h, l] of [[1, 1, 1], [1, 5, 1], [2, 2, 2], [3, 3, 3], [4, 1, 6], [5, 2, 5], [7, 5, 7], [2, 9, 1], [48, 48, 48]]) {
    const state = make(w, h, l);
    assert.equal(resolveCells(state).length, countGenerated(state.dims), `${w}x${h}x${l}`);
    assert.equal(countBlocks(state), countGenerated(state.dims));
  }
});

test('geometry: floor is the bottom layer, ceiling the top, walls the sides between, inside empty', () => {
  const state = make(5, 4, 6);
  const { dims } = state;
  for (let x = 0; x < 5; x++) for (let z = 0; z < 6; z++) {
    assert.equal(generatedRole(dims, x, 0, z), 'floor');
    assert.equal(generatedRole(dims, x, 3, z), 'ceiling');
  }
  for (const y of [1, 2]) {
    assert.equal(generatedRole(dims, 0, y, 3), 'wall');
    assert.equal(generatedRole(dims, 4, y, 3), 'wall');
    assert.equal(generatedRole(dims, 2, y, 0), 'wall');
    assert.equal(generatedRole(dims, 2, y, 5), 'wall');
    assert.equal(generatedRole(dims, 2, y, 3), null);
  }
  assert.equal(generatedRole(dims, 5, 0, 0), null, 'outside the structure');
  assert.equal(generatedRole(dims, -1, 0, 0), null);
});

test('geometry: corners and edges follow Floor > Ceiling > Wall', () => {
  const dims = make(4, 5, 4).dims;
  // Vertical corner column: floor at the bottom, ceiling at the top, wall between.
  assert.deepEqual([0, 1, 2, 3, 4].map((y) => generatedRole(dims, 0, y, 0)), ['floor', 'wall', 'wall', 'wall', 'ceiling']);
  // Floor edge and ceiling edge cells belong to floor / ceiling, not to the wall.
  assert.equal(generatedRole(dims, 0, 0, 2), 'floor');
  assert.equal(generatedRole(dims, 3, 4, 2), 'ceiling');
});

test('geometry: small sizes behave as documented', () => {
  assert.deepEqual(Object.values(roleMap(make(1, 1, 1))), ['floor']);
  // Height 1: floor only, however wide.
  assert.ok(Object.values(roleMap(make(3, 1, 3))).every((r) => r === 'floor'));
  // Height 2: floor and ceiling, no wall.
  const flat = Object.values(roleMap(make(3, 2, 3)));
  assert.equal(flat.filter((r) => r === 'wall').length, 0);
  assert.equal(flat.filter((r) => r === 'floor').length, 9);
  assert.equal(flat.filter((r) => r === 'ceiling').length, 9);
  // Width 1 / Length 1: opposite walls coincide, giving a single wall column per layer.
  const column = roleMap(make(1, 4, 1));
  assert.deepEqual(Object.values(column), ['floor', 'wall', 'wall', 'ceiling']);
  // 2 x 3 x 2: every side cell is wall, no interior.
  assert.equal(resolveCells(make(2, 3, 2)).filter((c) => c.role === 'wall').length, 4);
});

test('geometry: cells come out in a fixed order (y, then z, then x)', () => {
  const cells = resolveCells(make(3, 3, 3));
  const sorted = [...cells].sort((a, b) => a.y - b.y || a.z - b.z || a.x - b.x);
  assert.deepEqual(cells, sorted);
  assert.deepEqual(cells.slice(0, 4).map((c) => [c.x, c.y, c.z]), [[0, 0, 0], [1, 0, 0], [2, 0, 0], [0, 0, 1]]);
});

// ---------- roles ----------

test('roles: defaults are bedrock floor, glass wall, bedrock ceiling', () => {
  assert.deepEqual(DEFAULT_ROLE_BLOCKS, { floor: 'minecraft:bedrock', wall: 'minecraft:glass', ceiling: 'minecraft:bedrock' });
  const cells = resolveCells(make(3, 3, 3));
  for (const c of cells) assert.equal(c.block, c.role === 'wall' ? 'minecraft:glass' : 'minecraft:bedrock');
});

test('roles: changing a role block updates every cell of that role only', () => {
  let state = make(4, 4, 4);
  state = must(setRoleBlock(state, 'wall', 'stone_bricks'));
  const cells = resolveCells(state);
  for (const c of cells) {
    if (c.role === 'wall') assert.equal(c.block, 'minecraft:stone_bricks');
    if (c.role === 'floor') assert.equal(c.block, 'minecraft:bedrock');
  }
  assert.equal(setRoleBlock(state, 'wall', 'glass[x=1]').ok, false);
  assert.equal(setRoleBlock(state, 'floor', 'air').ok, false);
  assert.equal(setRoleBlock(state, 'wall', 'stone_bricks').state, state, 'no change keeps the same state');
});

// ---------- editing ----------

test('edit: place, replace and erase a cell', () => {
  let state = make(5, 5, 5);
  // Place in an empty interior cell.
  state = must(setCell(state, 2, 2, 2, 'minecraft:stone'));
  assert.deepEqual(cellInfo(state, 2, 2, 2), { inBounds: true, role: null, generated: null, block: 'minecraft:stone', custom: true });
  assert.equal(countBlocks(state), countGenerated(state.dims) + 1);
  // Replace a generated wall block.
  state = must(setCell(state, 0, 2, 2, 'oak_planks'));
  assert.equal(cellInfo(state, 0, 2, 2).block, 'minecraft:oak_planks');
  assert.equal(cellInfo(state, 0, 2, 2).custom, true);
  assert.equal(cellInfo(state, 0, 2, 2).role, 'wall', 'the cell keeps its generated role');
  // Erase a generated block.
  state = must(setCell(state, 4, 2, 2, null));
  assert.equal(cellInfo(state, 4, 2, 2).block, null);
  assert.equal(countBlocks(state), countGenerated(state.dims) + 1 - 1);
  assert.equal(resolveCells(state).length, countBlocks(state));
  // Erase the block we placed: the cell is empty again and no edit remains for it.
  state = must(setCell(state, 2, 2, 2, null));
  assert.equal(state.edits.has('2,2,2'), false);
});

test('edit: setting a cell to its generated block, or to what it already is, changes nothing', () => {
  const state = make(4, 4, 4);
  assert.equal(setCell(state, 0, 1, 1, 'minecraft:glass').state, state);
  assert.equal(setCell(state, 1, 1, 1, null).state, state, 'erasing an empty cell');
  const edited = must(setCell(state, 0, 1, 1, 'stone'));
  const back = must(setCell(edited, 0, 1, 1, 'glass'));
  assert.equal(back.edits.size, 0, 'returning to the generated block removes the edit');
});

test('edit: custom block ids are validated', () => {
  const state = make(4, 4, 4);
  assert.equal(setCell(state, 1, 1, 1, 'mymod:thing').ok, true);
  for (const bad of ['stone[x=1]', 'a b', '', 'air']) assert.equal(setCell(state, 1, 1, 1, bad).ok, false, bad);
});

test('edit: cells outside the structure are rejected', () => {
  const state = make(4, 4, 4);
  for (const [x, y, z] of [[4, 0, 0], [0, 4, 0], [0, 0, 4], [-1, 0, 0], [0.5, 0, 0], [NaN, 0, 0]]) {
    const result = setCell(state, x, y, z, 'stone');
    assert.equal(result.ok, false, `${x},${y},${z}`);
    assert.match(/** @type {any} */ (result).error, /outside the structure/);
  }
});

test('edit: restore returns one cell to its generated block; reset clears every edit', () => {
  let state = make(5, 5, 5);
  state = must(setCell(state, 0, 2, 2, 'stone'));
  state = must(setCell(state, 2, 2, 2, 'stone'));
  state = must(setCell(state, 4, 2, 2, null));
  state = must(restoreCell(state, 0, 2, 2));
  assert.equal(cellInfo(state, 0, 2, 2).block, 'minecraft:glass');
  assert.equal(state.edits.size, 2);
  assert.equal(restoreCell(state, 1, 1, 1).state, state, 'restoring an unedited cell changes nothing');
  const reset = resetEdits(state);
  assert.equal(reset.edits.size, 0);
  assert.deepEqual(resolveCells(reset), resolveCells(make(5, 5, 5)));
  assert.equal(resetEdits(reset), reset);
});

test('edit: the block limit stops placing beyond it, and never blocks removing', () => {
  // 48 x 48 x 48 has 13,256 generated blocks, leaving room for 2,744 more.
  let state = make(48, 48, 48);
  const room = MAX_BLOCKS - countBlocks(state);
  assert.ok(room > 0);
  /** @type {import('./structure.js').StructureState} */
  const crowded = { ...state, edits: new Map() };
  const edits = new Map();
  let placed = 0;
  for (let y = 1; y < 47 && placed < room; y++) for (let z = 1; z < 47 && placed < room; z++) for (let x = 1; x < 47 && placed < room; x++) {
    edits.set(`${x},${y},${z}`, 'minecraft:stone');
    placed++;
  }
  state = { ...crowded, edits };
  assert.equal(countBlocks(state), MAX_BLOCKS);
  const refused = setCell(state, 46, 46, 46, 'minecraft:stone');
  assert.equal(refused.ok, false);
  assert.match(/** @type {any} */ (refused).error, /at most 16,000/);
  assert.equal(setCell(state, 1, 1, 1, null).ok, true);
});

// ---------- dimension changes after editing ----------

test('resize: edits inside the new size are kept at the same coordinates', () => {
  let state = make(7, 5, 7);
  state = must(setCell(state, 3, 2, 3, 'stone'));
  state = must(setCell(state, 0, 2, 3, 'oak_planks'));
  const result = changeDimensions(state, { width: 9, height: 6, length: 8 });
  assert.equal(result.ok, true);
  const next = must(result);
  assert.equal(/** @type {any} */ (result).dropped, 0);
  assert.equal(cellInfo(next, 3, 2, 3).block, 'minecraft:stone');
  assert.equal(cellInfo(next, 0, 2, 3).block, 'minecraft:oak_planks');
  assert.equal(next.roles.wall, 'minecraft:glass');
});

test('resize: edits that fall outside are dropped and reported, so the caller can warn first', () => {
  let state = make(7, 5, 7);
  state = must(setCell(state, 6, 2, 3, 'stone'));
  state = must(setCell(state, 2, 2, 2, 'stone'));
  assert.equal(editsOutside(state, { width: 5, height: 5, length: 7 }), 1);
  const result = changeDimensions(state, { width: 5, height: 5, length: 7 });
  assert.equal(/** @type {any} */ (result).dropped, 1);
  assert.equal(/** @type {any} */ (result).state.edits.size, 1);
});

test('resize: invalid sizes are refused and the state is untouched', () => {
  const state = make(7, 5, 7);
  for (const dims of [{ width: 0, height: 5, length: 7 }, { width: 7, height: 49, length: 7 }]) {
    assert.equal(changeDimensions(state, dims).ok, false);
  }
  assert.equal(changeDimensions(state, { width: 7, height: 5, length: 7 }).state, state);
});

test('resize: a kept custom block stays custom when the role blocks change', () => {
  let state = make(5, 5, 5);
  state = must(setCell(state, 0, 2, 2, 'oak_planks'));
  state = must(setRoleBlock(state, 'wall', 'stone'));
  assert.equal(cellInfo(state, 0, 2, 2).block, 'minecraft:oak_planks');
  assert.equal(cellInfo(state, 0, 2, 3).block, 'minecraft:stone');
});

// ---------- history ----------

test('history: undo and redo walk through edits, and a new edit clears redo', () => {
  const h = createHistory(make(5, 5, 5));
  assert.equal(h.canUndo, false);
  const a = must(setCell(h.present, 2, 2, 2, 'stone'));
  assert.equal(h.commit(a), true);
  const b = must(setCell(h.present, 2, 2, 1, 'oak_planks'));
  h.commit(b);
  assert.equal(h.commit(b), false, 'committing the same state is ignored');
  assert.equal(h.undo(), a);
  assert.equal(h.undo().edits.size, 0);
  assert.equal(h.canUndo, false);
  assert.equal(h.canRedo, true);
  assert.equal(h.redo(), a);
  const c = must(setCell(h.present, 1, 1, 1, 'sand'));
  h.commit(c);
  assert.equal(h.canRedo, false, 'a new action discards redo');
  assert.equal(h.undo(), a);
});

test('history: resizing and resetting are undoable and never corrupt earlier states', () => {
  const h = createHistory(make(7, 5, 7));
  h.commit(must(setCell(h.present, 6, 2, 3, 'stone')));
  const edited = h.present;
  const shrunk = must(changeDimensions(h.present, { width: 4, height: 5, length: 7 }));
  h.commit(shrunk);
  assert.equal(shrunk.edits.size, 0, 'the out-of-range edit was dropped');
  const touched = must(setCell(h.present, 1, 2, 1, 'sand'));
  h.commit(touched);
  h.commit(resetEdits(h.present));
  assert.equal(h.present.edits.size, 0);
  assert.equal(h.undo(), touched, 'undo brings back the edits a reset discarded');
  assert.equal(h.undo(), shrunk);
  assert.equal(h.undo(), edited, 'undo brings the dropped edit and the old size back');
  assert.equal(cellInfo(h.present, 6, 2, 3).block, 'minecraft:stone');
  assert.equal(h.present.dims.width, 7);
});

test('history: the number of undo steps is bounded', () => {
  const h = createHistory(0, 3);
  for (let i = 1; i <= 10; i++) h.commit(i);
  let steps = 0;
  while (h.canUndo) { h.undo(); steps++; }
  assert.equal(steps, 3);
  assert.equal(h.present, 7);
});
