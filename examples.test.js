import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EXAMPLES } from './examples.js';
import { generate } from './build.js';

test('examples: ids are unique and every field is filled in', () => {
  const ids = new Set(EXAMPLES.map((example) => example.id));
  assert.equal(ids.size, EXAMPLES.length);
  for (const example of EXAMPLES) {
    assert.ok(example.title && example.category && example.description && example.script.trim(), example.id);
  }
});

test('examples: each one generates cleanly with and without self-cleaning', () => {
  for (const example of EXAMPLES) {
    for (const selfCleaning of [true, false]) {
      const result = generate(example.script, { version: '26.3+', spawnHeight: 1, selfCleaning });
      assert.equal(result.ok, true, `${example.id} (selfCleaning=${selfCleaning})`);
      assert.equal(result.diagnostics.length, 0, example.id);
      assert.ok(result.commandCount > 0, example.id);
    }
  }
});
