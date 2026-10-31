import { test } from 'node:test';
import assert from 'node:assert/strict';
import { interpretCommand, interpretScript, removeDrawn } from './script-to-structure.js';
import { cellInfo, countBlocks, resolveCells } from './structure.js';
import { generateStructureCommands } from './structure-commands.js';

const status = (/** @type {string} */ script) => interpretScript(script).items.map((i) => i.status);

test('setblock: absolute and relative coordinates become cells relative to the minimum corner', () => {
  const abs = interpretScript('setblock 10 64 -5 minecraft:stone\nsetblock 12 65 -3 glass');
  assert.equal(abs.error, null);
  assert.deepEqual(abs.result?.gen, { mode: 'absolute', origin: { x: 10, y: 64, z: -5 }, clearArea: false });
  assert.deepEqual(abs.result?.state.dims, { width: 3, height: 2, length: 3 });
  assert.equal(cellInfo(abs.result.state, 0, 0, 0).block, 'minecraft:stone');
  assert.equal(cellInfo(abs.result.state, 2, 1, 2).block, 'minecraft:glass');

  const rel = interpretScript('setblock ~1 ~ ~-2 stone\nsetblock ~3 ~2 ~ stone');
  assert.deepEqual(rel.result?.gen.origin, { x: 1, y: 0, z: -2 });
  assert.equal(rel.result?.gen.mode, 'relative');
});

test('fill: region, reversed corners and block ids', () => {
  const r = interpretScript('fill 5 0 5 2 1 3 minecraft:bedrock');
  assert.equal(r.error, null);
  assert.deepEqual(r.result?.state.dims, { width: 4, height: 2, length: 3 });
  assert.equal(countBlocks(r.result.state), 24);
  assert.deepEqual(r.result.gen.origin, { x: 2, y: 0, z: 3 });
});

test('fill modes: hollow leaves the inside empty, outline keeps what was there, destroy and replace place everything', () => {
  const hollow = interpretScript('fill 0 0 0 4 4 4 stone hollow');
  assert.equal(countBlocks(hollow.result.state), 125 - 27);
  const outline = interpretScript('fill 0 0 0 2 2 2 dirt\nfill 0 0 0 2 2 2 stone outline');
  assert.equal(cellInfo(outline.result.state, 1, 1, 1).block, 'minecraft:dirt');
  assert.equal(cellInfo(outline.result.state, 0, 0, 0).block, 'minecraft:stone');
  assert.equal(countBlocks(interpretScript('fill 0 0 0 1 1 1 stone destroy').result.state), 8);
  assert.equal(countBlocks(interpretScript('fill 0 0 0 1 1 1 stone replace').result.state), 8);
});

test('order: a later command overwrites an earlier one; air erases', () => {
  const r = interpretScript('fill 0 0 0 2 0 0 stone\nsetblock 1 0 0 air\nsetblock 2 0 0 dirt');
  assert.equal(cellInfo(r.result.state, 0, 0, 0).block, 'minecraft:stone');
  assert.equal(cellInfo(r.result.state, 1, 0, 0).block, null);
  assert.equal(cellInfo(r.result.state, 2, 0, 0).block, 'minecraft:dirt');
});

test('command blocks: facing, Command and auto are read, including escaped quotes', () => {
  const r = interpretScript('setblock 0 0 0 minecraft:chain_command_block[facing=east]{Command:"say \\"hi\\" \\\\ ok",auto:1}');
  assert.equal(r.error, null);
  const info = cellInfo(r.result.state, 0, 0, 0);
  assert.equal(info.block, 'minecraft:chain_command_block');
  assert.deepEqual(info.props, { facing: 'east', command: 'say "hi" \\ ok', auto: true });
  const plain = interpretScript('setblock 0 0 0 command_block{Command:"say a",auto:0b}');
  assert.deepEqual(cellInfo(plain.result.state, 0, 0, 0).props, { facing: 'north', command: 'say a', auto: false });
});

test('command blocks: braces and commas inside the command text do not confuse the reader', () => {
  const r = interpretScript('setblock 0 0 0 command_block[facing=up]{Command:"data merge entity @s {a:1,b:\\"x}\\"}",auto:1}');
  assert.equal(r.error, null);
  assert.equal(cellInfo(r.result.state, 0, 0, 0).props?.command, 'data merge entity @s {a:1,b:"x}"}');
});

test('unsupported commands are labelled with a reason, kept out of the drawing, and never dropped silently', () => {
  const script = [
    'setblock 0 0 0 stone',
    'setblock 1 0 0 oak_stairs[facing=north]', // states
    'setblock 2 0 0 chest{Items:[]}', // nbt
    'setblock ~1 0 0 stone', // mixed
    'setblock 1.5 0 0 stone', // decimal
    'setblock ^ ^ ^1 stone', // local
    'fill 0 0 0 1 1 1 stone keep',
    'fill 0 0 0 1 1 1 stone replace dirt',
    'setblock 0 0 0 command_block[conditional=true]',
    'setblock 0 0 0 command_block{CustomName:\'"x"\'}',
    'say hello',
    'summon pig ~ ~ ~',
    'setblock 3 0 0',
    'fill 0 0 0',
  ].join('\n');
  const r = interpretScript(script);
  assert.deepEqual(r.counts, { drawn: 1, unsupported: 11, other: 2 });
  for (const item of r.items.filter((i) => i.status === 'unsupported')) assert.ok(item.reason.length > 5, item.text);
  assert.equal(r.items.length, 14);
  assert.equal(countBlocks(r.result.state), 1);
});

test('malformed input never throws', () => {
  for (const s of ['setblock', 'setblock 1 2', 'fill 1 2 3 4 5', 'setblock 0 0 0 stone[', 'setblock 0 0 0 stone{', 'setblock 0 0 0 command_block{Command:"x', 'setblock 0 0 0 command_block{Command:5}', 'setblock 0 0 0 command_block{auto:maybe}', '', '   \n  ', '# only a comment', 'setblock 0 0 0 BAD ID', 'setblock 0 0 0 :', 'setblock 99999999999 0 0 stone']) {
    assert.doesNotThrow(() => interpretScript(s), s);
    assert.equal(interpretScript(s).result, null, s);
  }
});

test('limits: a span or fill over the grid limits is refused with a message, nothing truncated', () => {
  assert.match(interpretScript('setblock 0 0 0 stone\nsetblock 60 0 0 stone').error ?? '', /over the 48/);
  assert.match(interpretScript('fill 0 0 0 39 39 10 stone').error ?? '', /over the 16,000/);
  assert.match(interpretScript('fill 0 0 0 47 47 47 stone').error ?? '', /over the 32,768/);
});

test('comments, blank lines and a leading slash are handled like the rest of the app', () => {
  const r = interpretScript('# build\n\n/setblock 0 0 0 stone');
  assert.equal(r.counts.drawn, 1);
  assert.equal(r.items[0].line, 3);
});

test('round trip: reading generated commands and regenerating gives the same blocks', () => {
  const script = 'fill 0 0 0 4 0 4 stone\nfill 0 1 0 0 3 4 glass\nsetblock 2 1 2 command_block[facing=west]{Command:"say x",auto:1}';
  const r = interpretScript(script);
  const gen = generateStructureCommands(r.result.state, '26.3+', r.result.gen);
  assert.equal(gen.ok, true);
  const again = interpretScript(gen.commands.join('\n'));
  assert.deepEqual(resolveCells(again.result.state).map((c) => [c.x, c.y, c.z, c.block, c.props?.facing, c.props?.command]), resolveCells(r.result.state).map((c) => [c.x, c.y, c.z, c.block, c.props?.facing, c.props?.command]));
});

test('removeDrawn keeps the other commands in order and removes only matching lines once each', () => {
  const script = 'say start\nsetblock 0 0 0 stone\nsetblock 0 0 0 stone\nsay end';
  assert.deepEqual(removeDrawn(script, ['setblock 0 0 0 stone']), { script: 'say start\nsetblock 0 0 0 stone\nsay end', removed: 1 });
  assert.deepEqual(removeDrawn(script, ['setblock 0 0 0 stone', 'setblock 0 0 0 stone']).script, 'say start\nsay end');
});

test('interpretCommand: non-placement commands are reported as other', () => {
  assert.equal(interpretCommand('say hi', 1).kind, 'other');
  assert.deepEqual(status('say hi'), ['other']);
});
