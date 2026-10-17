import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeString, defaultImportMode, mergeIntoScript, readCommands } from './reader.js';
import { generate } from './build.js';
import { parseScript } from './parse.js';

/** @param {string} source */
const texts = (source) => readCommands(source).commands.map((c) => c.text);

test('reader: reads several Command fields in the order they appear', () => {
  const source = '{id:command_block_minecart,Command:"say 1"},{id:command_block_minecart,Command:\'say 2\'},{id:command_block_minecart,Command:"say 3"}';
  const result = readCommands(source);
  assert.deepEqual(result.commands.map((c) => c.text), ['say 1', 'say 2', 'say 3']);
  assert.equal(result.skipped.length, 0);
  assert.equal(result.error, null);
});

test('reader: order follows the text, not the content, and duplicates are kept', () => {
  assert.deepEqual(texts('Command:"b" Command:"a" Command:"b"'), ['b', 'a', 'b']);
});

test('reader: reports the line of each field', () => {
  const result = readCommands('Command:"say 1"\n\nCommand:"say 2"');
  assert.deepEqual(result.commands.map((c) => c.line), [1, 3]);
});

test('reader: decodes escaped quotes, backslashes and unicode escapes', () => {
  assert.deepEqual(texts('Command:"say \\"hi\\" \\\\ there"'), ['say "hi" \\ there']);
  assert.deepEqual(texts("Command:'say it\\'s ok'"), ["say it's ok"]);
  assert.deepEqual(texts('Command:"say caf\\u00e9 \\ud83d\\ude42 \\x41"'), ['say café 🙂 A']);
  assert.deepEqual(texts('{"Command":"tellraw @a {\\"text\\":\\"x\\"}"}'), ['tellraw @a {"text":"x"}']);
});

test('reader: an escaped line break cannot live in a one-line script, so it is skipped with a reason', () => {
  const result = readCommands('Command:"say a\\nsay b"');
  assert.equal(result.commands.length, 0);
  assert.equal(result.skipped.length, 1);
  assert.match(result.skipped[0].message, /line break/);
});

test('reader: unknown escapes are kept as written and reported, not dropped', () => {
  const result = readCommands('Command:"say a\\qb"');
  assert.deepEqual(result.commands.map((c) => c.text), ['say a\\qb']);
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0].message, /\\q/);
  assert.deepEqual(decodeString('\\u12').warnings.length, 1);
});

test('reader: command text is preserved exactly (spacing, leading slash)', () => {
  assert.deepEqual(texts('Command:"  /say  hi  "'), ['  /say  hi  ']);
});

test('reader: a Command:"..." that sits inside another string is not read as a command', () => {
  // The generator's own output nests Command:\"...\" inside the setblock command string.
  const output = generate('say Hello, world!', { version: '26.3+', spawnHeight: 1, selfCleaning: true }).output;
  const result = readCommands(output);
  assert.deepEqual(result.commands.map((c) => c.text), [
    'say Hello, world!',
    'setblock ~ ~1 ~ command_block{Command:"fill ~ ~ ~ ~ ~-3 ~ air",auto:1}',
    'execute align xyz run kill @e[type=command_block_minecart,dy=0]',
  ]);
  assert.equal(result.skipped.length, 0);
});

test('reader: nested-looking text in other fields and quote styles is ignored', () => {
  const source =
    '{CustomName:\'{"text":"Command:\\"fake\\""}\',LastOutput:"Command:\\"also fake\\"",Command:"real"}';
  assert.deepEqual(texts(source), ['real']);
  assert.deepEqual(texts('{Command:"say Command:\\"inner\\" done"}'), ['say Command:"inner" done']);
});

test('reader: a recognisable copy of generator output round-trips every command faithfully', () => {
  const script = 'say "quoted"\ntellraw @a {"text":"a\\nb"}\nexecute as @a run say \\\\done';
  for (const selfCleaning of [false, true]) {
    const output = generate(script, { version: '26.3+', spawnHeight: 2, selfCleaning }).output;
    const read = texts(output);
    const original = parseScript(script).commands.map((c) => c.text);
    assert.deepEqual(read.slice(0, original.length), original, `selfCleaning=${selfCleaning}`);
    assert.equal(read.length, original.length + (selfCleaning ? 2 : 0));
  }
});

test('reader: warns when the cleanup commands this tool adds are read back in', () => {
  const output = generate('say hi', { version: '26.3+', spawnHeight: 1, selfCleaning: true }).output;
  const withCleanup = readCommands(output);
  assert.ok(withCleanup.warnings.some((w) => /Self-cleaning/.test(w.message)));
  const without = readCommands(generate('say hi', { version: '26.3+', spawnHeight: 1, selfCleaning: false }).output);
  assert.equal(without.warnings.length, 0);
});

test('reader: malformed fields are skipped with reasons and the good ones still import', () => {
  const result = readCommands('{Command:"ok1"},{Command:5},{Command:},{Command:{}},{Command:""},{Command:"ok2"}');
  assert.deepEqual(result.commands.map((c) => c.text), ['ok1', 'ok2']);
  assert.equal(result.skipped.length, 4);
  assert.match(result.skipped[0].message, /not a quoted string/);
  assert.match(result.skipped[1].message, /no value/);
  assert.match(result.skipped[2].message, /compound or list/);
  assert.match(result.skipped[3].message, /empty/);
});

test('reader: an unterminated string and a field with nothing after it are reported', () => {
  const open = readCommands('{Command:"ok"},{Command:"never closed');
  assert.deepEqual(open.commands.map((c) => c.text), ['ok']);
  assert.match(open.skipped[0].message, /never closed/);
  const bare = readCommands('say hi Command:');
  assert.equal(bare.commands.length, 0);
  assert.match(bare.skipped[0].message, /no value/);
});

test('reader: a command that would be a comment in the script is skipped, not lost silently', () => {
  const result = readCommands('Command:"# note"');
  assert.equal(result.commands.length, 0);
  assert.match(result.skipped[0].message, /comment/);
});

test('reader: text that sits inside another string (escaped copy) is explained, not misread', () => {
  const result = readCommands('Command:\\"say hi\\"');
  assert.equal(result.commands.length, 0);
  assert.equal(result.skipped.length, 1);
  assert.match(result.skipped[0].message, /backslash/);
});

test('reader: empty or whitespace-only input is an error, never an import', () => {
  for (const source of ['', '   ', '\n\t\n']) {
    const result = readCommands(source);
    assert.ok(result.error, JSON.stringify(source));
    assert.equal(result.commands.length, 0);
  }
});

test('reader: text with no Command fields finds nothing and skips nothing', () => {
  const result = readCommands('Just some notes: "say hi" and {a:1}');
  assert.equal(result.error, null);
  assert.equal(result.commands.length, 0);
  assert.equal(result.skipped.length, 0);
});

test('reader: unrelated fields are never imported', () => {
  const source =
    '{CustomName:\'"Command"\',LastOutput:"say no",command:"say lower",Commands:"x",Command2:"y",CommandStats:{},TrackOutput:1b,auto:1b,Command:"say yes"}';
  assert.deepEqual(texts(source), ['say yes']);
});

test('reader: prose around the data does not confuse it, including apostrophes', () => {
  assert.deepEqual(texts("don't worry, here it is: {Command:\"say ok\"} and that's all"), ['say ok']);
});

test('reader: /data get output, JSON keys and item data all work', () => {
  assert.deepEqual(texts('{Command: "say hi", LastOutput: \'{"text":"hi"}\', auto: 0b, powered: 0b}'), ['say hi']);
  assert.deepEqual(texts('{"Command":"say json"}'), ['say json']);
  assert.deepEqual(texts("{'Command':'say single'}"), ['say single']);
  assert.deepEqual(texts('give @p command_block[block_entity_data={id:command_block,Command:"say item"}]'), ['say item']);
  assert.deepEqual(texts('give @p command_block{BlockEntityTag:{Command:"say old"}}'), ['say old']);
});

test('reader: bare Command lines pasted one per line', () => {
  assert.deepEqual(texts('Command:"say 1"\nCommand:"say 2"'), ['say 1', 'say 2']);
});

test('reader: very long commands import with a warning', () => {
  const long = `say ${'x'.repeat(32_600)}`;
  const result = readCommands(`Command:"${long}"`);
  assert.equal(result.commands.length, 1);
  assert.match(result.warnings[0].message, /32,500/);
});

test('reader: huge input is refused', () => {
  const result = readCommands('x'.repeat(1_000_001));
  assert.ok(result.error);
});

test('merge: append keeps existing commands first and the read order after', () => {
  const commands = [
    { text: 'say b', line: 1 },
    { text: 'say c', line: 2 },
  ];
  assert.equal(mergeIntoScript('say a', commands, 'append'), 'say a\nsay b\nsay c');
  assert.equal(mergeIntoScript('say a\n\n', commands, 'append'), 'say a\nsay b\nsay c');
  assert.equal(mergeIntoScript('say a', commands, 'replace'), 'say b\nsay c');
  assert.equal(mergeIntoScript('   \n', commands, 'append'), 'say b\nsay c');
});

test('merge: the merged script parses back to the same commands in order', () => {
  const read = readCommands('{Command:"say 2"},{Command:"say 3"}').commands;
  const merged = mergeIntoScript('say 1', read, 'append');
  assert.deepEqual(parseScript(merged).commands.map((c) => c.text), ['say 1', 'say 2', 'say 3']);
});

test('merge: default mode replaces an untouched or empty script and appends to real work', () => {
  assert.equal(defaultImportMode('say Hello, world!', 'say Hello, world!', 1), 'replace');
  assert.equal(defaultImportMode('', 'say Hello, world!', 0), 'replace');
  assert.equal(defaultImportMode('say mine', 'say Hello, world!', 1), 'append');
});
