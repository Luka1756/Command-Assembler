import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FACES, buildFaces, facing, fitScale, pickFace, pointInPolygon, polygonArea, project } from './projection.js';
import { createState, resolveCells, setCell } from './structure.js';

/** @param {Partial<import('./projection.js').View>} [o] @returns {import('./projection.js').View} */
const view = (o = {}) => ({ yaw: 0, pitch: 0, scale: 20, cx: 200, cy: 200, center: [0.5, 0.5, 0.5], ...o });
const cube = [{ x: 0, y: 0, z: 0 }];

test('projection: the centre maps to the screen centre and +x runs right, +y up on screen', () => {
  const v = view();
  const [cx, cy] = project(v, 0.5, 0.5, 0.5);
  assert.deepEqual([cx, cy], [200, 200]);
  assert.ok(project(v, 1.5, 0.5, 0.5)[0] > 200, '+x (east) is right at yaw 0');
  assert.ok(project(v, 0.5, 1.5, 0.5)[1] < 200, '+y (up) is up the screen');
});

test('projection: at yaw 0 the viewer is south, so +z is nearer; looking down makes +y nearer', () => {
  assert.ok(project(view(), 0.5, 0.5, 1.5)[2] > project(view(), 0.5, 0.5, 0.5)[2]);
  const down = view({ pitch: Math.PI / 2 - 0.01 });
  assert.ok(project(down, 0.5, 1.5, 0.5)[2] > project(down, 0.5, 0.5, 0.5)[2]);
});

test('projection: a single cube shows the faces toward the viewer only', () => {
  // Front view: only the south (+z) face.
  assert.deepEqual(buildFaces(view(), cube, 99).map((f) => FACES[f.face].normal), [[0, 0, 1]]);
  // From above and to the south-west (negative yaw): top, south and west faces.
  const iso = buildFaces(view({ yaw: -0.6, pitch: 0.5 }), cube, 99).map((f) => FACES[f.face].normal.join());
  assert.deepEqual(iso.sort(), ['0,0,1', '0,1,0', '-1,0,0'].sort());
  // Straight down: only the top.
  assert.deepEqual(buildFaces(view({ pitch: 1.45 }), cube, 99).map((f) => FACES[f.face].normal).filter((n) => n[1] !== 0), [[0, 1, 0]]);
  assert.equal(facing(view(), [0, 0, -1]) < 0, true);
});

test('projection: faces hidden by a neighbouring block are not drawn', () => {
  const two = [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }];
  const faces = buildFaces(view({ yaw: -0.6, pitch: 0.5 }), two, 99);
  const shared = buildFaces(view({ yaw: 0.6, pitch: 0.5 }), two, 99).filter((f) => f.cell === 0 && FACES[f.face].normal[0] === 1);
  assert.equal(shared.length, 0, 'the east face of the west cube touches its neighbour and is skipped');
  assert.ok(faces.length > 0);
});

test('projection: the layer cut hides cells above it and exposes the layer below', () => {
  const stack = [{ x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: 2, z: 0 }];
  const v = view({ pitch: 1.2 });
  const all = buildFaces(v, stack, 2);
  const cut = buildFaces(v, stack, 1);
  assert.equal(new Set(cut.map((f) => f.cell)).size, 2);
  assert.ok(!cut.some((f) => f.cell === 2));
  const topFaceOf = (/** @type {any[]} */ list, /** @type {number} */ cell) => list.some((f) => f.cell === cell && FACES[f.face].normal[1] === 1);
  assert.equal(topFaceOf(all, 1), false, 'covered while the cell above is shown');
  assert.equal(topFaceOf(cut, 1), true, 'its top is exposed once the cell above is hidden');
});

test('projection: each cell gets one label, on its largest visible face', () => {
  const faces = buildFaces(view({ yaw: -0.6, pitch: 0.5 }), cube, 99);
  assert.equal(faces.filter((f) => f.label).length, 1);
  const labelled = faces.find((f) => f.label);
  assert.equal(labelled?.area, Math.max(...faces.map((f) => f.area)));
});

test('projection: faces come out back to front', () => {
  const row = [0, 1, 2, 3].map((z) => ({ x: 0, y: 0, z }));
  const v = view({ yaw: 0.3, pitch: 0.6 });
  const depths = buildFaces(v, row, 99).map((f) => project(v, row[f.cell].x + 0.5, row[f.cell].y + 0.5, row[f.cell].z + 0.5)[2]);
  assert.deepEqual(depths, [...depths].sort((a, b) => a - b));
});

test('picking: the front-most face wins where cubes overlap on screen', () => {
  const v = view();
  const column = [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }]; // the second cube is nearer to a viewer at yaw 0
  const faces = buildFaces(v, column, 99);
  const centre = project(v, 0.5, 0.5, 1);
  const hit = pickFace(faces, centre[0], centre[1]);
  assert.equal(hit?.cell, 1);
  assert.equal(pickFace(faces, 5, 5), null, 'empty space picks nothing');
});

test('picking: agrees with an exact ray cast through a real structure', () => {
  let state = createState({ width: 7, height: 5, length: 7 });
  for (const [x, y, z] of [[3, 2, 3], [3, 3, 3], [2, 1, 4], [5, 2, 1], [1, 2, 5]]) {
    const r = setCell(state, x, y, z, 'minecraft:stone');
    if (r.ok) state = r.state;
  }
  const cells = resolveCells(state);
  const present = new Map(cells.map((c, i) => [`${c.x},${c.y},${c.z}`, i]));
  for (const [yaw, pitch] of [[-0.6, 0.5], [0.9, 0.3], [2.4, 0.8], [3.5, 0.2], [0.2, 1.2]]) {
    const v = view({ yaw, pitch, scale: 30, cx: 300, cy: 300, center: [3.5, 2.5, 3.5] });
    const faces = buildFaces(v, cells, 99);
    let agree = 0;
    let total = 0;
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let n = 0; n < 400; n++) {
      const px = 300 + (rand() - 0.5) * 300;
      const py = 300 + (rand() - 0.5) * 300;
      // Exact ray: undo the screen mapping and the two rotations, then walk from near to far.
      const x1 = (px - 300) / 30;
      const y2 = (300 - py) / 30;
      let expected = -1;
      for (let z2 = 20; z2 > -20; z2 -= 0.004) {
        const py0 = y2 * Math.cos(pitch) + z2 * Math.sin(pitch);
        const z1 = -y2 * Math.sin(pitch) + z2 * Math.cos(pitch);
        const wx = x1 * Math.cos(yaw) + z1 * Math.sin(yaw) + 3.5;
        const wz = -x1 * Math.sin(yaw) + z1 * Math.cos(yaw) + 3.5;
        const wy = py0 + 2.5;
        const idx = present.get(`${Math.floor(wx)},${Math.floor(wy)},${Math.floor(wz)}`);
        if (idx !== undefined) { expected = idx; break; }
      }
      const got = pickFace(faces, px, py)?.cell ?? -1;
      total++;
      if (got === expected) agree++;
    }
    assert.ok(agree / total > 0.99, `yaw ${yaw} pitch ${pitch}: ${agree}/${total}`);
  }
});

test('geometry helpers: area, containment and fit', () => {
  const square = [0, 0, 10, 0, 10, 10, 0, 10];
  assert.equal(polygonArea(square), 100);
  assert.equal(pointInPolygon(square, 5, 5), true);
  assert.equal(pointInPolygon(square, 11, 5), false);
  assert.ok(fitScale(48, 48, 48, 400, 300) < fitScale(3, 3, 3, 400, 300));
  assert.ok(fitScale(1000, 1000, 1000, 10, 10) >= 2, 'never collapses to nothing');
});
