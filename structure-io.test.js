import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseStructure, serializeStructure } from './structure-io.js';
import { cellInfo, countBlocks, createState, resolveCells, setCell, setShell } from './structure.js';

/** @param {any} r */ const st = (r) => r.state;

test('structure io: round trip keeps size, roles, shell, edits, command blocks and options', () => {
  let s = createState({ width: 6, height: 4, length: 5 }, { floor: 'minecraft:stone', wall: 'minecraft:glass', ceiling: 'minecraft:bedrock' });
  s = st(setCell(s, 2, 1, 2, 'minecraft:command_block', { facing: 'west', command: 'say "x" \\ y' }));
  s = st(setCell(s, 3, 1, 2, 'minecraft:chain_command_block', { facing: 'down', auto: false }));
  s = st(setCell(s, 0, 1, 1, null));
  s = st(setCell(s, 1, 1, 1, 'minecraft:stone'));
  const gen = { mode: /** @type {'absolute'} */ ('absolute'), origin: { x: -4, y: 70, z: 12 }, clearArea: true };
  const json = JSON.parse(JSON.stringify(serializeStructure(s, gen)));
  const back = parseStructure(json);
  assert.ok(back.ok);
  assert.deepEqual(back.gen, gen);
  assert.deepEqual(resolveCells(back.state), resolveCells(s));
  assert.equal(cellInfo(back.state, 2, 1, 2).props?.command, 'say "x" \\ y');
  assert.equal(cellInfo(back.state, 3, 1, 2).props?.auto, false);
  assert.equal(countBlocks(back.state), countBlocks(s));
});

test('structure io: shell off round trip', () => {
  const s = setShell(st(setCell(createState({ width: 4, height: 3, length: 4 }), 1, 1, 1, 'minecraft:stone')), false);
  const back = parseStructure(JSON.parse(JSON.stringify(serializeStructure(s))));
  assert.ok(back.ok && back.state.shell === false && countBlocks(back.state) === 1);
});

test('structure io: malformed input is rejected with a message, never thrown', () => {
  const good = serializeStructure(createState({ width: 4, height: 3, length: 4 }));
  /** @type {any[]} */
  const cases = [
    null, 5, 'x', [], {},
    { ...good, v: 2 },
    { ...good, dims: { width: 0, height: 3, length: 4 } },
    { ...good, dims: { width: 'a', height: 3, length: 4 } },
    { ...good, shell: 'yes' },
    { ...good, edits: 'no' },
    { ...good, edits: [[1, 1]] },
    { ...good, edits: [[1.5, 1, 1, 'minecraft:stone']] },
    { ...good, edits: [[9, 1, 1, 'minecraft:stone']] },
    { ...good, edits: [[1, 1, 1, 'minecraft:stone'], [1, 1, 1, 'minecraft:dirt']] },
    { ...good, edits: [[1, 1, 1, 'Bad Id!']] },
    { ...good, edits: [[1, 1, 1, 'minecraft:air']] },
    { ...good, edits: [[1, 1, 1, 'minecraft:command_block', 'sideways', 0, 'say hi']] },
    { ...good, edits: [[1, 1, 1, 'minecraft:command_block', 'north', 0, 'a\nb']] },
    { ...good, roles: { floor: 'minecraft:command_block' } },
    { ...good, gen: { mode: 'sideways', origin: [0, 0, 0] } },
    { ...good, gen: { mode: 'absolute', origin: [1e12, 0, 0] } },
  ];
  for (const input of cases) {
    const r = parseStructure(input);
    assert.equal(r.ok, false, JSON.stringify(input)?.slice(0, 80));
    assert.match(/** @type {any} */ (r).error, /^Structure data is not valid/);
  }
});

test('structure io: output never includes erases of cells that have nothing generated', () => {
  const s = setShell(st(setCell(createState({ width: 4, height: 3, length: 4 }), 0, 1, 1, null)), false);
  assert.deepEqual(serializeStructure(s).edits, []);
});
