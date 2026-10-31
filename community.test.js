import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATEGORIES, buildEntry, buildSubmission, contentId, filterEntries, importName, issueUrl, parseEntry, parseIndex, parseSubmission } from './community.js';
import { serializeStructure } from './structure-io.js';
import { createState, setCell } from './structure.js';

const settings = { version: '26.3+', spawnHeight: 1, selfCleaning: true };
const structure = serializeStructure(/** @type {any} */ (setCell(createState({ width: 4, height: 3, length: 4 }), 1, 1, 1, 'minecraft:command_block', { facing: 'east', command: 'say hi' })).state);
const scriptEntry = { id: 'abc123', name: 'Hello', description: 'Says hello.', author: 'Alex', category: 'Tools', kind: 'script', settings, script: 'say hello' };
const structEntry = { id: 'def456', name: 'Room', description: 'A room.', category: 'Structures', kind: 'structure', settings, structure };

test('the shipped community.json is valid and empty (no invented entries)', async () => {
  const { readFile } = await import('node:fs/promises');
  const parsed = parseIndex(JSON.parse(await readFile(new URL('./community.json', import.meta.url), 'utf8')));
  assert.deepEqual(parsed, { ok: true, entries: [], skipped: 0 });
});

test('parseEntry accepts valid script and structure entries and defaults the author', () => {
  const a = parseEntry(scriptEntry);
  assert.ok(a.ok && a.entry.kind === 'script' && a.entry.structure === null);
  const b = parseEntry(structEntry);
  assert.ok(b.ok && b.entry.author === 'Anonymous' && b.entry.script === '' && b.entry.structure?.v === 1);
});

test('parseEntry rejects malformed or unsafe data with a reason', () => {
  /** @type {any[]} */
  const bad = [
    null, 'x', [], {},
    { ...scriptEntry, id: 'has space' },
    { ...scriptEntry, id: '../x' },
    { ...scriptEntry, name: '' },
    { ...scriptEntry, name: 'a\nb' },
    { ...scriptEntry, name: 'x'.repeat(61) },
    { ...scriptEntry, description: '' },
    { ...scriptEntry, description: 'x'.repeat(501) },
    { ...scriptEntry, description: 'bell\u0007' },
    { ...scriptEntry, author: 5 },
    { ...scriptEntry, settings: { version: 'nope', spawnHeight: 1, selfCleaning: true } },
    { ...scriptEntry, script: '' },
    { ...scriptEntry, script: 'x'.repeat(100001) },
    { ...scriptEntry, kind: 'exe' },
    { ...structEntry, structure: { v: 1 } },
    { ...structEntry, structure: null },
  ];
  for (const item of bad) {
    const r = parseEntry(item);
    assert.equal(r.ok, false, JSON.stringify(item)?.slice(0, 60));
    assert.ok(/** @type {any} */ (r).error.length > 3);
  }
});

test('text from entries is kept as plain data: markup and script tags are not interpreted or altered', () => {
  const r = parseEntry({ ...scriptEntry, name: '<img src=x onerror=alert(1)>', description: '<script>alert(1)</script>' });
  assert.ok(r.ok);
  assert.equal(r.entry.name, '<img src=x onerror=alert(1)>');
});

test('an unknown category becomes Other; categories are the fixed list', () => {
  const r = parseEntry({ ...scriptEntry, category: 'Weapons' });
  assert.ok(r.ok && r.entry.category === 'Other');
  assert.deepEqual([...CATEGORIES], ['Machines', 'Structures', 'Tools', 'Other']);
});

test('parseIndex: skips invalid and duplicate entries and counts them; rejects other formats', () => {
  const r = parseIndex({ v: 1, entries: [scriptEntry, { nope: 1 }, scriptEntry, structEntry] });
  assert.ok(r.ok);
  assert.equal(r.entries.length, 2);
  assert.equal(r.skipped, 2);
  for (const raw of [null, [], { v: 2, entries: [] }, { v: 1 }, { v: 1, entries: {} }, 'x']) assert.equal(parseIndex(raw).ok, false);
});

test('contentId: same content gives the same id regardless of name; different content differs', async () => {
  const a = await contentId({ kind: 'script', script: 'say a', structure: null, settings });
  const b = await contentId({ kind: 'script', script: 'say a\n', structure: null, settings });
  const c = await contentId({ kind: 'script', script: 'say b', structure: null, settings });
  assert.match(a, /^[0-9a-f]{16}$/);
  assert.equal(a, b);
  assert.notEqual(a, c);
});

test('buildEntry + submission file round trip; duplicates share an id', async () => {
  const creation = { id: 'x', name: 'Mine', script: 'say hello', settings, savedAt: 1 };
  const one = await buildEntry(creation, { name: 'Greeter', description: 'Says hello.', author: '  ', category: 'Tools' });
  assert.ok(one.ok);
  assert.equal(one.entry.author, 'Anonymous');
  const json = buildSubmission(one.entry);
  assert.ok(!json.includes('"published"'));
  const back = parseSubmission(json);
  assert.ok(back.ok);
  assert.deepEqual({ ...back.entry }, { ...one.entry });
  const two = await buildEntry({ ...creation, name: 'Renamed' }, { name: 'Other name', description: 'Again.', author: 'B', category: 'Tools' });
  assert.ok(two.ok && two.entry.id === one.entry.id);
  assert.equal((await buildEntry(creation, { name: '', description: 'd', author: '', category: 'Tools' })).ok, false);
  assert.equal((await buildEntry(creation, { name: 'n', description: '', author: '', category: 'Tools' })).ok, false);
  const withStructure = await buildEntry({ ...creation, structure }, { name: 'Room', description: 'A room.', author: '', category: 'Structures' });
  assert.ok(withStructure.ok && withStructure.entry.kind === 'structure');
  assert.ok(parseSubmission(buildSubmission(withStructure.entry)).ok);
});

test('parseSubmission rejects other files', () => {
  assert.equal(parseSubmission('not json').ok, false);
  assert.equal(parseSubmission('{"format":"other"}').ok, false);
  assert.equal(parseSubmission('{"format":"command-assembler-submission","v":1,"entry":{}}').ok, false);
});

test('issueUrl: includes the data when short, otherwise asks for the file to be attached', () => {
  const entry = /** @type {any} */ (parseEntry(scriptEntry)).entry;
  const short = issueUrl(entry, buildSubmission(entry));
  assert.ok(short.includesData && short.url.startsWith('https://github.com/Luka1756/Command-Assembler/issues/new?title='));
  const long = issueUrl(entry, 'x'.repeat(20000));
  assert.ok(!long.includesData && long.url.length < 1500);
});

test('filterEntries: search across fields, category, sort', () => {
  const entries = /** @type {any[]} */ ([
    parseEntry({ ...scriptEntry, id: 'a1', name: 'Alpha clock', published: '2026-01-02' }),
    parseEntry({ ...scriptEntry, id: 'b1', name: 'Beta door', description: 'Opens a door', author: 'Sam', category: 'Machines', published: '2026-03-01' }),
    parseEntry({ ...structEntry, id: 'c1', name: 'Cellar', published: '2025-12-01' }),
  ]).map((r) => r.entry);
  assert.equal(filterEntries(entries, { query: 'DOOR' }).length, 1);
  assert.equal(filterEntries(entries, { query: 'sam beta' }).length, 1);
  assert.equal(filterEntries(entries, { query: 'zzz' }).length, 0);
  assert.equal(filterEntries(entries, { category: 'Structures' })[0].id, 'c1');
  assert.deepEqual(filterEntries(entries).map((e) => e.id), ['b1', 'a1', 'c1']);
  assert.deepEqual(filterEntries(entries, { sort: 'name' }).map((e) => e.id), ['a1', 'b1', 'c1']);
});

test('importName avoids clashes and respects the name length', () => {
  const names = new Set(['Room', 'Room (imported)']);
  assert.equal(importName('Fresh', (n) => names.has(n), 60), 'Fresh');
  assert.equal(importName('Room', (n) => names.has(n), 60), 'Room (imported 2)');
  assert.ok(importName('x'.repeat(60), (n) => n === 'x'.repeat(60), 60).length <= 60);
});
