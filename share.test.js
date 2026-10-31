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

// ---------- compact (z1) links ----------
import { COMPACT_PREFIX, MAX_DECOMPRESSED_BYTES, decodeAnySetup, encodeSetupCompact } from './share.js';

const BIG = {
  script: Array.from({ length: 300 }, (_, i) => `setblock ~${i % 20} ~${i % 7} ~${i % 11} minecraft:stone`).join('\n'),
  settings: { version: '26.3+', spawnHeight: 4, selfCleaning: true },
};

test('compact: a large script gives a shorter link that restores exactly', async () => {
  const plain = encodeSetup(BIG);
  const compact = await encodeSetupCompact(BIG);
  assert.ok(plain.ok && compact.ok);
  assert.equal(compact.format, 'compact');
  assert.ok(compact.payload.startsWith(COMPACT_PREFIX));
  assert.match(compact.payload, /^z1\.[A-Za-z0-9_-]+$/);
  assert.ok(compact.payload.length < plain.payload.length / 2, `${compact.payload.length} vs ${plain.payload.length}`);
  const back = await decodeAnySetup(compact.payload);
  assert.ok(back.ok);
  assert.deepEqual(back.state, BIG);
});

test('compact: unusual text survives (unicode, quotes, backslashes, CRLF, trailing spaces)', async () => {
  const state = { script: 'say "héllo" \\ 日本語 🙂\r\ntellraw @a {"text":"x"}  \n\n# end ', settings: { version: '26.4-snapshot-4', spawnHeight: 0, selfCleaning: false } };
  const encoded = await encodeSetupCompact({ ...state, script: state.script.repeat(20) });
  assert.ok(encoded.ok);
  const back = await decodeAnySetup(encoded.payload);
  assert.ok(back.ok);
  assert.deepEqual(back.state, { ...state, script: state.script.repeat(20) });
});

test('compact: a tiny script round-trips and the link is never longer than the plain one', async () => {
  const state = { script: 'say hi', settings: BIG.settings };
  const encoded = await encodeSetupCompact(state);
  const plain = encodeSetup(state);
  assert.ok(encoded.ok && plain.ok);
  assert.ok(encoded.payload.length <= plain.payload.length);
  const back = await decodeAnySetup(encoded.payload);
  assert.ok(back.ok);
  assert.deepEqual(back.state, state);
});

test('compact: links made before compression existed still open', async () => {
  const old = encodeSetup(STATE);
  assert.ok(old.ok);
  const back = await decodeAnySetup(old.payload);
  assert.ok(back.ok);
  assert.deepEqual(back.state, STATE);
  // A fixed link produced by the original encoder (v1), kept as a regression fixture.
  const fixture = Buffer.from(JSON.stringify({ v: 1, script: 'say Hello, world!', settings: { version: '26.3+', spawnHeight: 1, selfCleaning: true } })).toString('base64url');
  const fromFixture = await decodeAnySetup(fixture);
  assert.ok(fromFixture.ok && fromFixture.state.script === 'say Hello, world!');
});

test('compact: corrupt, truncated, wrong or hostile links fail safely with a message', async () => {
  const good = await encodeSetupCompact(BIG);
  assert.ok(good.ok);
  const { deflateRawSync } = await import('node:zlib');
  const make = (/** @type {unknown} */ value) => COMPACT_PREFIX + deflateRawSync(Buffer.from(JSON.stringify(value))).toString('base64url');
  const cases = [
    COMPACT_PREFIX,
    `${COMPACT_PREFIX}!!!`,
    `${COMPACT_PREFIX}AAAA`,
    good.payload.slice(0, good.payload.length - 10),
    good.payload.slice(0, 20),
    COMPACT_PREFIX + Buffer.from('not deflate data').toString('base64url'),
    make('string'), make({}), make([]), make([2, 'x']), make([3, 'x', '26.3+', 1, 1]), make([2, 5, '26.3+', 1, 1]),
    make([2, 'x', '9.9', 1, 1]), make([2, 'x', '26.3+', -1, 1]), make([2, 'x', '26.3+', 1, 2]), make([2, 'x', '26.3+', 1.5, 1]),
    make([2, 'x'.repeat(300000), '26.3+', 1, 1]),
  ];
  for (const payload of cases) {
    const r = await decodeAnySetup(payload);
    assert.equal(r.ok, false, payload.slice(0, 40));
    assert.ok(/** @type {any} */ (r).error.length > 5);
  }
});

test('compact: a decompression bomb is refused', async () => {
  const { deflateRawSync } = await import('node:zlib');
  const bomb = COMPACT_PREFIX + deflateRawSync(Buffer.from(JSON.stringify([2, 'a'.repeat(MAX_DECOMPRESSED_BYTES * 3), '26.3+', 1, 1]))).toString('base64url');
  assert.ok(bomb.length < 10_000);
  const r = await decodeAnySetup(bomb);
  assert.equal(r.ok, false);
});

test('compact: oversize scripts are refused when encoding', async () => {
  const r = await encodeSetupCompact({ script: 'x'.repeat(200_001), settings: BIG.settings });
  assert.equal(r.ok, false);
});
