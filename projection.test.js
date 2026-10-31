import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FACES, buildFaces, castRay, clipAndProject, fitDistance, groundCell, makeView, pickFace, project, projectSegment, toCamera } from './projection.js';

const W = 800;
const H = 600;
/** @param {Partial<import('./projection.js').CameraSpec>} [o] */
const view = (o = {}) => makeView({ yaw: -0.6, pitch: 0.5, distance: 20, target: [3, 2, 3], width: W, height: H, ...o });

function grid(/** @type {number} */ n, /** @type {number} */ h = n) {
  const cells = [];
  for (let y = 0; y < h; y++) for (let z = 0; z < n; z++) for (let x = 0; x < n; x++) cells.push({ x, y, z });
  return cells;
}

test('camera: the target is at the centre of the screen and in front', () => {
  const v = view();
  const p = project(v, 3, 2, 3);
  assert.ok(p);
  assert.ok(Math.abs(p[0] - W / 2) < 1e-6 && Math.abs(p[1] - H / 2) < 1e-6);
  assert.ok(Math.abs(p[2] - 20) < 1e-6);
});

test('camera: at yaw 0 and pitch 0 east is on the right, up is up, north is away', () => {
  const v = makeView({ yaw: 0, pitch: 0, distance: 10, target: [0, 0, 0], width: W, height: H });
  const east = project(v, 1, 0, 0);
  const up = project(v, 0, 1, 0);
  const north = project(v, 0, 0, -1);
  assert.ok(east && east[0] > W / 2);
  assert.ok(up && up[1] < H / 2);
  assert.ok(north && north[2] > 10);
});

test('perspective: nearer objects look larger', () => {
  const v = makeView({ yaw: 0, pitch: 0, distance: 10, target: [0, 0, 0], width: W, height: H });
  const near = Math.abs(project(v, 1, 0, 3)[0] - project(v, 0, 0, 3)[0]);
  const far = Math.abs(project(v, 1, 0, -3)[0] - project(v, 0, 0, -3)[0]);
  assert.ok(near > far);
});

test('points behind the camera are not projected; polygons and segments are clipped to the near plane', () => {
  const v = makeView({ yaw: 0, pitch: 0, distance: 5, target: [0, 0, 0], width: W, height: H });
  assert.equal(project(v, 0, 0, 20), null);
  const seg = projectSegment(v, [0, 0, 20], [0, 0, -20]);
  assert.ok(seg && seg.every(Number.isFinite));
  assert.equal(projectSegment(v, [0, 0, 20], [1, 0, 30]), null);
  const poly = clipAndProject(v, [toCamera(v, -1, 0, 20), toCamera(v, 1, 0, 20), toCamera(v, 1, 0, -2), toCamera(v, -1, 0, -2)]);
  assert.ok(poly.length >= 6 && poly.every(Number.isFinite));
});

test('faces: a lone cube shows three faces from a corner; covered faces are not drawn', () => {
  const v = view();
  assert.equal(buildFaces(v, [{ x: 3, y: 2, z: 3 }], 9).length, 3);
  const two = buildFaces(v, [{ x: 3, y: 2, z: 3 }, { x: 4, y: 2, z: 3 }], 9);
  assert.equal(two.length < 6, true);
  assert.equal(buildFaces(v, [{ x: 3, y: 2, z: 3 }], -1).length, 0);
});

test('faces: which faces show follows the camera side', () => {
  const south = makeView({ yaw: 0, pitch: 0.3, distance: 10, target: [0.5, 0.5, 0.5], width: W, height: H });
  const normals = buildFaces(south, [{ x: 0, y: 0, z: 0 }], 9).map((f) => FACES[f.face].normal.join(','));
  assert.ok(normals.includes('0,0,1') && normals.includes('0,1,0') && !normals.includes('0,0,-1'));
});

test('picking agrees with an exact ray cast across camera positions, including from inside the grid', () => {
  const cells = grid(5, 4).filter((c) => (c.x + c.y + c.z) % 3 !== 0);
  const cameras = [
    { yaw: -0.6, pitch: 0.5, distance: 14 },
    { yaw: 2.4, pitch: 0.9, distance: 12 },
    { yaw: 0.3, pitch: -0.5, distance: 10 },
    { yaw: 4, pitch: 0.2, distance: 3 },
    { yaw: 1, pitch: 0.1, distance: 0.8 },
  ];
  let compared = 0;
  for (const cam of cameras) {
    const v = makeView({ ...cam, target: [2.5, 2, 2.5], width: W, height: H });
    const faces = buildFaces(v, cells, 99);
    for (let sx = 7; sx < W; sx += 53) {
      for (let sy = 5; sy < H; sy += 47) {
        const picked = pickFace(faces, sx, sy);
        const cast = castRay(v, cells, sx, sy, 99);
        if (!picked && !cast) continue;
        // Skip pixels within a hair of an edge, where float error decides which neighbour wins.
        assert.ok(picked && cast, `pixel ${sx},${sy} camera ${JSON.stringify(cam)}`);
        assert.equal(picked.cell, cast.index, `cell at ${sx},${sy} camera ${JSON.stringify(cam)}`);
        assert.deepEqual(FACES[picked.face].normal, cast.normal);
        compared++;
      }
    }
  }
  assert.ok(compared > 200);
});

test('ground picking: a pixel on the ground maps to its cell; outside the grid or from below gives null', () => {
  const v = makeView({ yaw: 0, pitch: 1.2, distance: 12, target: [2.5, 0, 2.5], width: W, height: H });
  const centre = groundCell(v, W / 2, H / 2, { width: 5, length: 5 });
  assert.deepEqual(centre, { x: 2, z: 2 });
  assert.equal(groundCell(v, 2, 2, { width: 5, length: 5 }), null);
  const below = makeView({ yaw: 0, pitch: -1, distance: 12, target: [2.5, 0, 2.5], width: W, height: H });
  assert.equal(groundCell(below, W / 2, H / 2, { width: 5, length: 5 }), null);
});

test('fit: a bigger structure needs a larger distance; the result is finite', () => {
  assert.ok(fitDistance(48, 48, 48, W, H) > fitDistance(5, 5, 5, W, H));
  assert.ok(Number.isFinite(fitDistance(1, 1, 1, 10, 10)));
});
