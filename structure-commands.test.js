import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generate } from './build.js';
import { PROFILE_LIST } from './profiles.js';
import { parseScript } from './parse.js';
import {
  DEFAULT_PLACEMENT,
  FILL_BLOCK_LIMIT,
  assessTransfer,
  generateStructureCommands,
  mergeBoxes,
  validatePlacement,
} from './structure-commands.js';
import { MAX_BLOCKS, cellInfo, createState, resolveCells, setCell, setRoleBlock } from './structure.js';

/** @param {number} w @param {number} h @param {number} l */
const make = (w, h, l) => createState({ width: w, height: h, length: l });
/** @param {any} r */
const must = (r) => { assert.equal(r.ok, true, JSON.stringify(r)); return r.state; };

const ABS = { mode: /** @type {'absolute'} */ ('absolute'), origin: { x: 100, y: 64, z: -50 }, clearArea: false };
const REL = DEFAULT_PLACEMENT;

/**
 * A tiny interpreter for the commands this module emits (setblock / fill, absolute or ~ coordinates),
 * used to check the output against the structure cell by cell.
 * @param {string[]} commands
 * @param {{ x: number, y: number, z: number }} base  where "~ ~ ~" is
 */
function simulate(commands, base) {
  /** @type {Map<string, string>} */
  const world = new Map();
  /** @param {string} t @param {number} b */
  const coord = (t, b) => (t.startsWith('~') ? b + (t.length > 1 ? Number(t.slice(1)) : 0) : Number(t));
  for (const command of commands) {
    const parts = command.split(' ');
    if (parts[0] === 'setblock') {
      const [x, y, z] = [coord(parts[1], base.x), coord(parts[2], base.y), coord(parts[3], base.z)];
      world.set(`${x},${y},${z}`, parts[4]);
    } else if (parts[0] === 'fill') {
      const a = [coord(parts[1], base.x), coord(parts[2], base.y), coord(parts[3], base.z)];
      const b = [coord(parts[4], base.x), coord(parts[5], base.y), coord(parts[6], base.z)];
      for (let x = Math.min(a[0], b[0]); x <= Math.max(a[0], b[0]); x++)
        for (let y = Math.min(a[1], b[1]); y <= Math.max(a[1], b[1]); y++)
          for (let z = Math.min(a[2], b[2]); z <= Math.max(a[2], b[2]); z++) {
            if (parts[7] === 'minecraft:air') world.delete(`${x},${y},${z}`);
            else world.set(`${x},${y},${z}`, parts[7]);
          }
    } else assert.fail(`unexpected command ${command}`);
  }
  return world;
}

/** The structure as the editor shows it, placed at an origin. */
const expected = (/** @type {any} */ state, /** @type {{x:number,y:number,z:number}} */ o) => {
  /** @type {Map<string, string>} */
  const m = new Map();
  for (const c of resolveCells(state)) m.set(`${o.x + c.x},${o.y + c.y},${o.z + c.z}`, c.block);
  return m;
};

// ---------- output matches the layout ----------

test('commands: a small room generates exactly the commands expected, in order', () => {
  const result = generateStructureCommands(make(3, 3, 3), '26.3+', ABS);
  assert.equal(result.ok, true);
  assert.deepEqual(result.commands, [
    'fill 100 64 -50 102 64 -48 minecraft:bedrock',
    'fill 100 65 -50 102 65 -50 minecraft:glass',
    'fill 100 65 -49 100 65 -48 minecraft:glass',
    'fill 102 65 -49 102 65 -48 minecraft:glass',
    'setblock 101 65 -48 minecraft:glass',
    'fill 100 66 -50 102 66 -48 minecraft:bedrock',
  ]);
  assert.equal(result.stats.blocks, 26);
});

test('commands: the simulated world equals the structure for many sizes (absolute)', () => {
  for (const [w, h, l] of [[1, 1, 1], [1, 4, 1], [2, 2, 2], [3, 1, 5], [3, 3, 3], [4, 6, 5], [7, 5, 7], [12, 9, 3]]) {
    const state = make(w, h, l);
    const result = generateStructureCommands(state, '26.3+', ABS);
    assert.equal(result.ok, true);
    assert.deepEqual(simulate(result.commands, { x: 0, y: 0, z: 0 }), expected(state, ABS.origin), `${w}x${h}x${l}`);
  }
});

test('commands: edited blocks appear in the output (placed, replaced, erased, custom ids)', () => {
  let state = make(7, 5, 7);
  state = must(setCell(state, 3, 2, 3, 'minecraft:tnt'));        // placed inside
  state = must(setCell(state, 0, 2, 3, 'mymod:door'));            // replaced wall block, custom id
  state = must(setCell(state, 6, 2, 3, null));                    // erased wall block
  state = must(setCell(state, 3, 0, 3, 'oak_planks'));            // replaced floor block
  state = must(setRoleBlock(state, 'ceiling', 'stone'));
  const result = generateStructureCommands(state, '26.3+', ABS);
  const world = simulate(result.commands, { x: 0, y: 0, z: 0 });
  assert.deepEqual(world, expected(state, ABS.origin));
  assert.equal(world.get('103,66,-47'), 'minecraft:tnt');
  assert.equal(world.get('100,66,-47'), 'mymod:door');
  assert.equal(world.has('106,66,-47'), false, 'erased cell is empty');
  assert.equal(world.get('103,64,-47'), 'minecraft:oak_planks');
  assert.equal(world.get('103,68,-47'), 'minecraft:stone');
});

test('commands: relative coordinates place the structure at the origin offset from ~ ~ ~', () => {
  const state = make(3, 3, 3);
  const result = generateStructureCommands(state, '26.3+', { mode: 'relative', origin: { x: 2, y: -1, z: 4 }, clearArea: false });
  assert.equal(result.commands[0], 'fill ~2 ~-1 ~4 ~4 ~-1 ~6 minecraft:bedrock');
  const base = { x: 1000, y: 70, z: -30 };
  assert.deepEqual(simulate(result.commands, base), expected(state, { x: 1002, y: 69, z: -26 }));
  const zero = generateStructureCommands(make(1, 1, 1), '26.3+', { mode: 'relative', origin: { x: 0, y: 0, z: 0 }, clearArea: false });
  assert.deepEqual(zero.commands, ['setblock ~ ~ ~ minecraft:bedrock']);
});

test('commands: negative absolute origins are written as given', () => {
  const result = generateStructureCommands(make(1, 1, 1), '26.3+', { mode: 'absolute', origin: { x: -5, y: -60, z: -7 }, clearArea: false });
  assert.deepEqual(result.commands, ['setblock -5 -60 -7 minecraft:bedrock']);
});

// ---------- determinism, duplicates, merging ----------

test('commands: output is deterministic and independent of the order edits were made', () => {
  let a = make(6, 5, 6);
  let b = make(6, 5, 6);
  const edits = [[2, 2, 2, 'stone'], [3, 2, 4, 'sand'], [0, 2, 1, null], [5, 3, 5, 'tnt']];
  for (const [x, y, z, id] of edits) a = must(setCell(a, x, y, z, id));
  for (const [x, y, z, id] of [...edits].reverse()) b = must(setCell(b, x, y, z, id));
  assert.deepEqual(generateStructureCommands(a, '26.3+', ABS).commands, generateStructureCommands(b, '26.3+', ABS).commands);
  assert.deepEqual(generateStructureCommands(a, '26.3+', ABS), generateStructureCommands(a, '26.3+', ABS));
});

test('commands: no cell is placed twice and no placement overlaps another', () => {
  let state = make(9, 6, 9);
  for (const [x, y, z] of [[4, 3, 4], [4, 3, 5], [0, 3, 3], [8, 2, 8]]) state = must(setCell(state, x, y, z, 'stone'));
  const boxes = mergeBoxes(resolveCells(state));
  const seen = new Set();
  let total = 0;
  for (const b of boxes) for (let x = b.x1; x <= b.x2; x++) for (let y = b.y1; y <= b.y2; y++) for (let z = b.z1; z <= b.z2; z++) {
    const key = `${x},${y},${z}`;
    assert.equal(seen.has(key), false, `duplicate ${key}`);
    seen.add(key);
    assert.equal(cellInfo(state, x, y, z).block, b.block);
    total++;
  }
  assert.equal(total, resolveCells(state).length, 'every block is covered');
});

test('commands: runs of one block are merged into fills', () => {
  const result = generateStructureCommands(make(48, 48, 48), '26.3+', ABS);
  assert.ok(result.stats.commands < 20, `${result.stats.commands} commands for ${result.stats.blocks} blocks`);
  assert.ok(result.commands.every((c) => c.startsWith('fill ') || c.startsWith('setblock ')));
});

test('commands: every fill stays under the fill limit, including the clear-area fill', () => {
  const big = make(48, 48, 48);
  const result = generateStructureCommands(big, '26.3+', { ...ABS, clearArea: true });
  const fills = result.commands.filter((c) => c.endsWith('minecraft:air'));
  assert.ok(fills.length >= 4, 'the 110,592-cell area is split into several fills');
  for (const c of result.commands) {
    const p = c.split(' ');
    if (p[0] !== 'fill') continue;
    const v = (Math.abs(+p[4] - +p[1]) + 1) * (Math.abs(+p[5] - +p[2]) + 1) * (Math.abs(+p[6] - +p[3]) + 1);
    assert.ok(v <= FILL_BLOCK_LIMIT, c);
  }
  assert.ok(MAX_BLOCKS <= FILL_BLOCK_LIMIT);
});

// ---------- empty cells and clear-area ----------

test('commands: erased cells are not placed, and clear-area first empties the whole box', () => {
  let state = make(5, 4, 5);
  state = must(setCell(state, 0, 1, 2, null));
  const plain = generateStructureCommands(state, '26.3+', ABS);
  assert.equal(plain.commands.some((c) => c.endsWith('minecraft:air')), false);
  assert.equal(simulate(plain.commands, { x: 0, y: 0, z: 0 }).has('100,65,-48'), false);

  const cleared = generateStructureCommands(state, '26.3+', { ...ABS, clearArea: true });
  assert.equal(cleared.commands[0], 'fill 100 64 -50 104 67 -46 minecraft:air');
  assert.deepEqual(simulate(cleared.commands, { x: 0, y: 0, z: 0 }), expected(state, ABS.origin));
});

test('commands: a structure with every block erased is refused, not emitted empty', () => {
  let state = make(1, 1, 1);
  state = must(setCell(state, 0, 0, 0, null));
  const result = generateStructureCommands(state, '26.3+', ABS);
  assert.equal(result.ok, false);
  assert.equal(result.commands.length, 0);
  assert.match(result.errors[0], /no blocks/);
});

// ---------- validation ----------

test('commands: invalid origins and unknown versions are errors, never silent output', () => {
  const state = make(3, 3, 3);
  assert.equal(validatePlacement(REL), null);
  for (const origin of [{ x: 1.5, y: 0, z: 0 }, { x: 0, y: NaN, z: 0 }, { x: 0, y: 0, z: 40_000_000 }]) {
    const r = generateStructureCommands(state, '26.3+', { ...REL, origin });
    assert.equal(r.ok, false);
    assert.equal(r.commands.length, 0);
  }
  const bad = generateStructureCommands(state, '1.12', REL);
  assert.equal(bad.ok, false);
  assert.match(bad.errors[0], /Unsupported Minecraft version/);
  assert.equal(generateStructureCommands(state, '26.3+', { ...REL, mode: /** @type {any} */ ('x') }).ok, false);
});

test('commands: every generated command is a valid single script line', () => {
  let state = make(6, 5, 6);
  state = must(setCell(state, 2, 2, 2, 'mymod:thing_2'));
  const { commands } = generateStructureCommands(state, '26.3+', { ...REL, clearArea: true });
  const parsed = parseScript(commands.join('\n'));
  assert.deepEqual(parsed.diagnostics, []);
  assert.deepEqual(parsed.commands.map((c) => c.text), commands);
});

test('commands: warns when the structure overlaps the machine column (relative only)', () => {
  const state = make(3, 3, 3);
  const hit = generateStructureCommands(state, '26.3+', { mode: 'relative', origin: { x: 0, y: -1, z: 0 }, clearArea: false });
  assert.equal(hit.ok, true);
  assert.match(hit.warnings[0], /machine's own column/);
  assert.equal(generateStructureCommands(state, '26.3+', REL).warnings.length, 0);
  assert.equal(generateStructureCommands(state, '26.3+', { ...ABS, origin: { x: 0, y: 0, z: 0 } }).warnings.length, 0);
  // Origin far above the cleared column is fine.
  assert.equal(generateStructureCommands(state, '26.3+', { mode: 'relative', origin: { x: 0, y: 5, z: 0 }, clearArea: false }).warnings.length, 0);
});

// ---------- version profiles ----------

test('profiles: each listed version yields commands through its own placement syntax', () => {
  const state = make(4, 4, 4);
  for (const profile of PROFILE_LIST) {
    const result = generateStructureCommands(state, profile.id, ABS);
    assert.equal(result.ok, true, profile.id);
    assert.ok(result.commands.length > 0);
    assert.deepEqual(simulate(result.commands, { x: 0, y: 0, z: 0 }), expected(state, ABS.origin), profile.id);
  }
});

test('profiles: a profile with different syntax is honoured', () => {
  const original = PROFILE_LIST[0].placement;
  try {
    PROFILE_LIST[0].placement = { setblock: (p, b) => `SET ${p} ${b}`, fill: (a, c, b) => `FILL ${a} ${c} ${b}` };
    const result = generateStructureCommands(make(2, 2, 2), PROFILE_LIST[0].id, ABS);
    assert.ok(result.commands.every((c) => c.startsWith('FILL ') || c.startsWith('SET ')));
  } finally {
    PROFILE_LIST[0].placement = original;
  }
});

// ---------- transfer into the script ----------

const SETTINGS = { version: /** @type {'26.3+'} */ ('26.3+'), spawnHeight: 1, selfCleaning: true };

test('transfer: append keeps every existing command, in order, before the structure', () => {
  const commands = generateStructureCommands(make(3, 3, 3), '26.3+', ABS).commands;
  const before = 'say one\nsay two';
  const { script } = assessTransfer(before, commands, 'append', SETTINGS);
  assert.deepEqual(parseScript(script).commands.map((c) => c.text), ['say one', 'say two', ...commands]);
  assert.ok(script.startsWith(before));
});

test('transfer: replace swaps the script for the structure commands only', () => {
  const commands = generateStructureCommands(make(3, 3, 3), '26.3+', ABS).commands;
  const { script } = assessTransfer('say one\nsay two', commands, 'replace', SETTINGS);
  assert.deepEqual(parseScript(script).commands.map((c) => c.text), commands);
});

test('transfer: the existing generator builds the machine from the merged script', () => {
  const commands = generateStructureCommands(make(3, 3, 3), '26.3+', ABS).commands;
  const { generated, overLimitBy } = assessTransfer('say hi', commands, 'append', SETTINGS);
  assert.equal(generated.ok, true);
  assert.equal(overLimitBy, 0);
  assert.equal(generated.commandCount, 1 + commands.length);
  for (const c of commands) assert.ok(generated.output.includes(c.replaceAll('\\', '\\\\').replaceAll('"', '\\"')));
});

test('transfer: a structure whose commands exceed the length limit is reported, not truncated', () => {
  // A checkerboard of custom blocks defeats merging and produces thousands of commands.
  let state = make(48, 4, 48);
  for (let y = 1; y < 3; y++) for (let z = 1; z < 47; z++) for (let x = 1; x < 47; x++) {
    if ((x + y + z) % 2 === 0) state = must(setCell(state, x, y, z, 'minecraft:stone'));
  }
  const result = generateStructureCommands(state, '26.3+', ABS);
  assert.equal(result.ok, true);
  assert.ok(result.stats.commands > 1000);
  const assessed = assessTransfer('say hi', result.commands, 'append', SETTINGS);
  assert.equal(assessed.generated.ok, false);
  assert.ok(assessed.overLimitBy > 0);
  assert.equal(parseScript(assessed.script).commands.length, 1 + result.commands.length, 'every command is still present');
  assert.match(assessed.generated.diagnostics.map((d) => d.message).join(' '), /over the 32,500/);
});

test('transfer: an enormous result is flagged as too long for a script', () => {
  let state = make(48, 8, 48);
  for (let y = 1; y < 7; y++) for (let z = 1; z < 47; z++) for (let x = 1; x < 47; x++) {
    if ((x + y + z) % 2 === 0) { const r = setCell(state, x, y, z, 'minecraft:stone'); if (r.ok) state = r.state; }
  }
  const result = generateStructureCommands(state, '26.3+', ABS);
  const assessed = assessTransfer('', result.commands, 'replace', SETTINGS);
  assert.equal(assessed.tooLongForScript, true);
});
