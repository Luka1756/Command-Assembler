// @ts-check

/**
 * Orthographic 3D projection for the structure viewport. Pure math, no DOM, so it can be tested.
 *
 * World axes match the editor: +x east, +y up, +z south. A cell (x, y, z) fills the unit cube
 * [x, x+1] × [y, y+1] × [z, z+1].
 *
 * View: rotate about the vertical axis by `yaw`, tip forward by `pitch` (positive looks down from above),
 * then project straight onto the screen. At yaw 0 and pitch 0 the viewer stands south of the structure
 * looking north, with east on the right. After rotation, a larger depth means nearer to the viewer.
 *
 * @typedef {object} View
 * @property {number} yaw  radians
 * @property {number} pitch  radians
 * @property {number} scale  pixels per block
 * @property {number} cx  screen x of the structure's centre
 * @property {number} cy  screen y of the structure's centre
 * @property {[number, number, number]} center  world point that maps to (cx, cy)
 */

export const PITCH_MIN = -1.45;
export const PITCH_MAX = 1.45;

/**
 * @param {View} view
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @returns {[number, number, number]} screen x, screen y, depth
 */
export function project(view, x, y, z) {
  const px = x - view.center[0];
  const py = y - view.center[1];
  const pz = z - view.center[2];
  const cosY = Math.cos(view.yaw);
  const sinY = Math.sin(view.yaw);
  const x1 = px * cosY - pz * sinY;
  const z1 = px * sinY + pz * cosY;
  const cosP = Math.cos(view.pitch);
  const sinP = Math.sin(view.pitch);
  const y2 = py * cosP - z1 * sinP;
  const z2 = py * sinP + z1 * cosP;
  return [view.cx + x1 * view.scale, view.cy - y2 * view.scale, z2];
}

/**
 * Depth component of a direction after rotation (positive faces the viewer).
 * @param {View} view
 * @param {[number, number, number]} n
 */
export function facing(view, n) {
  const z1 = n[0] * Math.sin(view.yaw) + n[2] * Math.cos(view.yaw);
  return n[1] * Math.sin(view.pitch) + z1 * Math.cos(view.pitch);
}

/**
 * Faces of a unit cube: outward normal and the four corners (offsets from the cell's minimum corner).
 * @type {{ normal: [number, number, number], corners: [number, number, number][] }[]}
 */
export const FACES = [
  { normal: [1, 0, 0], corners: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]] },
  { normal: [-1, 0, 0], corners: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
  { normal: [0, 1, 0], corners: [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]] },
  { normal: [0, -1, 0], corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { normal: [0, 0, 1], corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
  { normal: [0, 0, -1], corners: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]] },
];

/**
 * @typedef {object} Face
 * @property {number} cell  index into the cells array
 * @property {number} face  index into FACES
 * @property {number[]} poly  x0,y0,x1,y1,x2,y2,x3,y3 in screen pixels
 * @property {number} area  screen area in pixels²
 * @property {boolean} label  the largest visible face of its cell, where a label is drawn
 */

/**
 * The faces to draw, back to front. A face is drawn only when it faces the viewer and no visible block
 * sits against it. Cells above `layerMax` are hidden (a view-only cut that never changes the structure).
 * Cells are sorted by the depth of their centre, which is exact for equal axis-aligned cubes under
 * orthographic projection.
 * @param {View} view
 * @param {{ x: number, y: number, z: number }[]} cells
 * @param {number} layerMax  highest layer (y) shown
 * @returns {Face[]}
 */
export function buildFaces(view, cells, layerMax) {
  /** @type {Set<string>} */
  const present = new Set();
  /** @type {number[]} */
  const shown = [];
  cells.forEach((c, index) => {
    if (c.y > layerMax) return;
    present.add(`${c.x},${c.y},${c.z}`);
    shown.push(index);
  });

  const visibleFaces = FACES.map((f, i) => ({ f, i, front: facing(view, f.normal) > 1e-6 })).filter((entry) => entry.front);

  const order = shown
    .map((index) => {
      const c = cells[index];
      return { index, depth: project(view, c.x + 0.5, c.y + 0.5, c.z + 0.5)[2] };
    })
    .sort((a, b) => a.depth - b.depth);

  /** @type {Face[]} */
  const out = [];
  for (const { index } of order) {
    const c = cells[index];
    const start = out.length;
    for (const { f, i } of visibleFaces) {
      const [nx, ny, nz] = f.normal;
      if (present.has(`${c.x + nx},${c.y + ny},${c.z + nz}`)) continue;
      /** @type {number[]} */
      const poly = [];
      for (const [dx, dy, dz] of f.corners) {
        const [sx, sy] = project(view, c.x + dx, c.y + dy, c.z + dz);
        poly.push(sx, sy);
      }
      out.push({ cell: index, face: i, poly, area: polygonArea(poly), label: false });
    }
    let best = -1;
    for (let k = start; k < out.length; k++) if (best === -1 || out[k].area > out[best].area) best = k;
    if (best !== -1) out[best].label = true;
  }
  return out;
}

/** @param {number[]} poly */
export function polygonArea(poly) {
  let sum = 0;
  const n = poly.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    sum += poly[2 * i] * poly[2 * j + 1] - poly[2 * j] * poly[2 * i + 1];
  }
  return Math.abs(sum) / 2;
}

/**
 * @param {number[]} poly
 * @param {number} px
 * @param {number} py
 */
export function pointInPolygon(poly, px, py) {
  let inside = false;
  const n = poly.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = poly[2 * i];
    const yi = poly[2 * i + 1];
    const xj = poly[2 * j];
    const yj = poly[2 * j + 1];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * The front-most face under a screen point (faces are in back-to-front order).
 * @param {Face[]} faces
 * @param {number} px
 * @param {number} py
 * @returns {Face | null}
 */
export function pickFace(faces, px, py) {
  for (let i = faces.length - 1; i >= 0; i--) {
    if (pointInPolygon(faces[i].poly, px, py)) return faces[i];
  }
  return null;
}

/**
 * Pixels per block so a structure of the given size fits a canvas, with a margin.
 * @param {number} width
 * @param {number} height
 * @param {number} length
 * @param {number} canvasW
 * @param {number} canvasH
 */
export function fitScale(width, height, length, canvasW, canvasH) {
  const diagonal = Math.hypot(width, height, length);
  return Math.max(2, Math.min(canvasW, canvasH) / (diagonal * 1.08));
}

/**
 * @param {number} value
 * @param {number} min
 * @param {number} max
 */
export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
