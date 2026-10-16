import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escapeSnbtString } from '../src/generator/escape.js';
import { parseScript } from '../src/generator/parse.js';
import { generate } from '../src/generator/build.js';
import { MAX_COMMAND_CHARS } from '../src/generator/limits.js';

/** @type {import('../src/types').BuildSettings} */
const DEFAULTS = { version: '26.3+', spawnHeight: 1, selfCleaning: true };

// Output shown in the reference screenshot for `say Hello, world!`
// (26.3+, spawn height 1, self-cleaning on). The screenshot reports 382 characters.
const REFERENCE_OUTPUT =
  'summon falling_block ~ ~1 ~ {BlockState:redstone_block,Passengers:[' +
  '{id:falling_block,BlockState:activator_rail},' +
  '{id:command_block_minecart,Command:"say Hello, world!"},' +
  '{id:command_block_minecart,Command:"setblock ~ ~1 ~ command_block{Command:\\"fill ~ ~ ~ ~ ~-3 ~ air\\",auto:1}"},' +
  '{id:command_block_minecart,Command:"execute align xyz run kill @e[type=command_block_minecart,dy=0]"}]}';

test('escape: backslashes are doubled before quotes are escaped', () => {
  assert.equal(escapeSnbtString('say "hi"'), 'say \\"hi\\"');
  assert.equal(escapeSnbtString('a\\b'), 'a\\\\b');
  assert.equal(escapeSnbtString('\\"'), '\\\\\\"');
  assert.equal(escapeSnbtString('plain'), 'plain');
});

test('parse: skips blank lines and # comments, trims, strips one leading slash', () => {
  const { commands, diagnostics } = parseScript('# note\n\n  say one  \n/say two\r\n   \n#another\n//x');
  assert.deepEqual(
    commands.map((c) => [c.line, c.text]),
    [
      [3, 'say one'],
      [4, 'say two'],
      [7, '/x'],
    ],
  );
  assert.equal(diagnostics.length, 0);
});

test('parse: lone slash and control characters are errors with line numbers', () => {
  const { commands, diagnostics } = parseScript('say ok\n/\nsay bad\u0001');
  assert.equal(commands.length, 1);
  assert.deepEqual(
    diagnostics.map((d) => [d.severity, d.line]),
    [
      ['error', 2],
      ['error', 3],
    ],
  );
});

test('parse: trailing backslash is a warning, command kept', () => {
  const { commands, diagnostics } = parseScript('say hi\\');
  assert.equal(commands.length, 1);
  assert.equal(diagnostics[0].severity, 'warning');
  assert.equal(diagnostics[0].line, 1);
});

test('generate: matches the reference output and its reported 382 characters', () => {
  const result = generate('say Hello, world!', DEFAULTS);
  assert.equal(result.ok, true);
  assert.equal(result.output, REFERENCE_OUTPUT);
  assert.equal(result.outputLength, 382);
  assert.equal(result.commandCount, 1);
  assert.equal(result.commandChars, 17);
  assert.equal(result.chainBlocks, 0);
});

test('generate: commands keep script order, between the rail and the cleanup', () => {
  const { output } = generate('say one\nsay two\nsay three', DEFAULTS);
  const one = output.indexOf('"say one"');
  const two = output.indexOf('"say two"');
  const three = output.indexOf('"say three"');
  const cleanup = output.indexOf('setblock');
  assert.ok(output.indexOf('activator_rail') < one && one < two && two < three && three < cleanup);
});

test('generate: quotes and backslashes in commands are escaped', () => {
  const { output, ok } = generate('tellraw @a {"text":"a\\nb"}', DEFAULTS);
  assert.equal(ok, true);
  assert.ok(output.includes('Command:"tellraw @a {\\"text\\":\\"a\\\\nb\\"}"'));
});

test('generate: self-cleaning off omits the cleanup minecarts', () => {
  const { output } = generate('say hi', { ...DEFAULTS, selfCleaning: false });
  assert.ok(!output.includes('setblock'));
  assert.ok(!output.includes('kill'));
  assert.ok(output.endsWith('Command:"say hi"}]}'));
});

test('generate: spawn height drives the summon position', () => {
  assert.ok(generate('say x', { ...DEFAULTS, spawnHeight: 0 }).output.startsWith('summon falling_block ~ ~ ~ {'));
  assert.ok(generate('say x', { ...DEFAULTS, spawnHeight: 12 }).output.startsWith('summon falling_block ~ ~12 ~ {'));
});

test('generate: invalid spawn heights are rejected', () => {
  for (const spawnHeight of [-1, 256, 1.5, Number.NaN]) {
    const result = generate('say x', { ...DEFAULTS, spawnHeight });
    assert.equal(result.ok, false, String(spawnHeight));
    assert.equal(result.output, '');
    assert.match(result.diagnostics[0].message, /Spawn height/);
  }
});

test('generate: empty or comment-only scripts give an error, not output', () => {
  for (const script of ['', '   \n\n', '# only a comment']) {
    const result = generate(script, DEFAULTS);
    assert.equal(result.ok, false);
    assert.equal(result.output, '');
    assert.match(result.diagnostics[0].message, /at least one command/);
  }
});

test('generate: a line error blocks output entirely', () => {
  const result = generate('say fine\n/', DEFAULTS);
  assert.equal(result.ok, false);
  assert.equal(result.output, '');
});

test('generate: unsupported version is rejected', () => {
  const result = generate('say x', /** @type {any} */ ({ ...DEFAULTS, version: '1.12' }));
  assert.equal(result.ok, false);
  assert.match(result.diagnostics[0].message, /Unsupported/);
});

test('generate: output over the command block limit is an error', () => {
  const script = Array.from({ length: 400 }, () => `say ${'x'.repeat(95)}`).join('\n');
  const result = generate(script, DEFAULTS);
  assert.equal(result.ok, false);
  assert.ok(result.outputLength > MAX_COMMAND_CHARS);
  assert.match(result.diagnostics.at(-1)?.message ?? '', /32,500/);
});

test('generate: output at the limit is accepted', () => {
  // Grow one command until the output is exactly the limit.
  const base = generate('say x', DEFAULTS).outputLength;
  const filler = 'x'.repeat(MAX_COMMAND_CHARS - base);
  const result = generate(`say x${filler}`, DEFAULTS);
  assert.equal(result.outputLength, MAX_COMMAND_CHARS);
  assert.equal(result.ok, true);
  assert.equal(generate(`say x${filler}x`, DEFAULTS).ok, false);
});
