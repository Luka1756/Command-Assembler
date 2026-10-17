import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_PAYLOAD_CHARS,
  buildShareUrl,
  decodeSetup,
  encodeSetup,
  extractPayload,
} from './share.js';

/** @type {import('./types').AppState} */
const STATE = {
  script: 'say "héllo" \\ 日本語 🙂\ntellraw @a {"text":"x"}\n# comment',
  settings: { version: '26.3+', spawnHeight: 7, selfCleaning: false },
};

/** @param {unknown} value */
const encodeRaw = (value) => Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');

test('share: round trip preserves script and settings exactly', () => {
  const encoded = encodeSetup(STATE);
  assert.equal(encoded.ok, true);
  if (!encoded.ok) return;
  assert.match(encoded.payload, /^[A-Za-z0-9_-]+$/);
  const decoded = decodeSetup(encoded.payload);
  assert.equal(decoded.ok, true);
  if (decoded.ok) assert.deepEqual(decoded.state, STATE);
});

test('share: the payload carries only the script, settings and format version', () => {
  const encoded = encodeSetup(STATE);
  assert.ok(encoded.ok);
  if (!encoded.ok) return;
  const json = JSON.parse(Buffer.from(encoded.payload, 'base64url').toString('utf8'));
  assert.deepEqual(Object.keys(json).sort(), ['script', 'settings', 'v']);
  assert.deepEqual(Object.keys(json.settings).sort(), ['selfCleaning', 'spawnHeight', 'version']);
});

test('share: malformed payloads are rejected with a message, never thrown', () => {
  const cases = ['', '!!!', 'abc', 'a', 'not base64 at all', encodeRaw('just a string'), Buffer.from('{oops').toString('base64url')];
  for (const payload of cases) {
    const result = decodeSetup(payload);
    assert.equal(result.ok, false, JSON.stringify(payload));
    if (!result.ok) assert.ok(result.error.length > 0);
  }
});

test('share: invalid UTF-8 is rejected', () => {
  const result = decodeSetup(Buffer.from([0xff, 0xfe, 0xfd]).toString('base64url'));
  assert.equal(result.ok, false);
});

test('share: wrong format version, missing script and bad settings are rejected', () => {
  const good = { v: 1, script: 'say hi', settings: { version: '26.3+', spawnHeight: 1, selfCleaning: true } };
  assert.equal(decodeSetup(encodeRaw(good)).ok, true);
  assert.equal(decodeSetup(encodeRaw({ ...good, v: 2 })).ok, false);
  assert.equal(decodeSetup(encodeRaw({ ...good, script: 5 })).ok, false);
  assert.equal(decodeSetup(encodeRaw({ ...good, settings: null })).ok, false);
  for (const settings of [
    { ...good.settings, version: '1.12' },
    { ...good.settings, spawnHeight: 999 },
    { ...good.settings, spawnHeight: 1.5 },
    { ...good.settings, spawnHeight: '1' },
    { ...good.settings, selfCleaning: 'yes' },
  ]) {
    assert.equal(decodeSetup(encodeRaw({ ...good, settings })).ok, false, JSON.stringify(settings));
  }
});

test('share: extra fields in the payload are ignored, not copied into state', () => {
  const payload = encodeRaw({
    v: 1,
    script: 'say hi',
    settings: { version: '26.3+', spawnHeight: 1, selfCleaning: true, extra: 'x' },
    token: 'secret',
  });
  const result = decodeSetup(payload);
  assert.ok(result.ok);
  if (result.ok) assert.deepEqual(Object.keys(result.state.settings).sort(), ['selfCleaning', 'spawnHeight', 'version']);
});

test('share: oversized payloads are rejected on decode and encode', () => {
  assert.equal(decodeSetup('A'.repeat(MAX_PAYLOAD_CHARS + 1)).ok, false);
  const huge = encodeSetup({ script: 'say x\n'.repeat(20_000), settings: STATE.settings });
  assert.equal(huge.ok, false);
});

test('share: refuses to encode invalid settings', () => {
  const result = encodeSetup({ script: 'say x', settings: { ...STATE.settings, spawnHeight: Number.NaN } });
  assert.equal(result.ok, false);
});

test('share: url helpers', () => {
  assert.equal(buildShareUrl('https://x.test/app/?a=1#old', 'PAYLOAD'), 'https://x.test/app/?a=1#setup=PAYLOAD');
  assert.equal(extractPayload('#setup=PAYLOAD'), 'PAYLOAD');
  assert.equal(extractPayload('#other=1'), null);
  assert.equal(extractPayload(''), null);
});

test('share: a setup using the 26.4 snapshot profile round-trips', () => {
  const state = { script: 'say snap', settings: { version: '26.4-snapshot-4', spawnHeight: 3, selfCleaning: true } };
  const encoded = encodeSetup(state);
  assert.equal(encoded.ok, true);
  if (!encoded.ok) return;
  const decoded = decodeSetup(encoded.payload);
  assert.equal(decoded.ok, true);
  if (decoded.ok) assert.deepEqual(decoded.state, state);
});
