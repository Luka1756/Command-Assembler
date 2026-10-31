import { test } from 'node:test';
import assert from 'node:assert/strict';

/** Minimal localStorage so the storage module runs under Node. */
function fakeStorage(/** @type {Record<string, string>} */ seed = {}) {
  const data = { ...seed };
  return {
    data,
    getItem: (/** @type {string} */ k) => (k in data ? data[k] : null),
    setItem: (/** @type {string} */ k, /** @type {string} */ v) => { data[k] = v; },
  };
}
const KEY = 'command-assembler:creations:v1';
const settings = { version: '26.3+', spawnHeight: 1, selfCleaning: true };

async function fresh(/** @type {Record<string, string>} */ seed) {
  const ls = fakeStorage(seed);
  /** @type {any} */ (globalThis).window = { localStorage: ls };
  const mod = await import(`./creations-store.js?${Math.random()}`);
  return { ls, store: mod.createCreationsStore() };
}

test('creations saved before 3D structures existed load unchanged', async () => {
  const old = [{ id: 'a', name: 'Old one', script: 'say hi', settings, savedAt: 1000 }];
  const { store } = await fresh({ [KEY]: JSON.stringify(old) });
  assert.equal(store.all().length, 1);
  assert.deepEqual(store.all()[0], old[0]);
  assert.equal(store.issues.length, 0);
});

test('save, update by name, rename, delete; names are unique case-insensitively', async () => {
  const { store, ls } = await fresh({});
  const a = store.save({ name: 'Room', script: 'say a', settings });
  assert.ok(a.ok && !a.updated);
  const again = store.save({ name: 'room', script: 'say b', settings });
  assert.ok(again.ok && again.updated && again.id === a.id);
  assert.equal(store.all().length, 1);
  assert.equal(store.all()[0].script, 'say b');
  const b = store.save({ name: 'Other', script: '', settings });
  assert.ok(b.ok);
  assert.equal(store.rename(b.id, 'ROOM').ok, false);
  assert.equal(store.rename(b.id, 'Renamed').ok, true);
  assert.equal(store.rename(b.id, '   ').ok, false);
  assert.equal(store.rename(b.id, 'x'.repeat(61)).ok, false);
  assert.equal(JSON.parse(ls.data[KEY]).length, 2);
  assert.equal(store.remove(a.id).ok, true);
  assert.equal(store.remove(a.id).ok, false);
  assert.equal(JSON.parse(ls.data[KEY]).length, 1);
});

test('a 3D creation keeps its structure; an invalid structure is set aside with a note, keeping script and settings', async () => {
  const { serializeStructure } = await import('./structure-io.js');
  const { createState, setCell } = await import('./structure.js');
  const good = serializeStructure(/** @type {any} */ (setCell(createState({ width: 4, height: 3, length: 4 }), 1, 1, 1, 'minecraft:command_block', { facing: 'east', command: 'say x' })).state);
  const seed = [
    { id: '1', name: 'Good 3D', script: 's', settings, savedAt: 1, structure: good },
    { id: '2', name: 'Bad 3D', script: 'keep me', settings, savedAt: 2, structure: { v: 1, dims: { width: 0 } } },
    { id: '3', name: 'Broken', script: 5, settings, savedAt: 3 },
  ];
  const { store } = await fresh({ [KEY]: JSON.stringify(seed) });
  assert.equal(store.all().length, 2);
  assert.deepEqual(store.get('1')?.structure, good);
  assert.equal(store.get('2')?.structure, undefined);
  assert.equal(store.get('2')?.script, 'keep me');
  assert.equal(store.issues.length, 1);
  assert.match(store.issues[0], /Bad 3D/);
});

test('storage failure is reported and the list is not changed', async () => {
  const { store, ls } = await fresh({});
  ls.setItem = () => { throw new Error('quota'); };
  const r = store.save({ name: 'X', script: 's', settings });
  assert.equal(r.ok, false);
  assert.equal(store.all().length, 0);
});

test('creation limit', async () => {
  const { store } = await fresh({});
  for (let i = 0; i < 100; i++) assert.ok(store.save({ name: `n${i}`, script: 's', settings }).ok);
  assert.equal(store.save({ name: 'one more', script: 's', settings }).ok, false);
  assert.equal(store.save({ name: 'n5', script: 'updated', settings }).ok, true);
});
