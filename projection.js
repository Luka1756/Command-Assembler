// @ts-check

/**
 * Perspective camera and the drawing order for a grid of unit cubes. Pure math, no DOM, so it can be tested.
 *
 * World axes match Minecraft and the structure model: +x east, +y up, +z south. A cell (x, y, z) fills the
 * cube [x, x+1] × [y, y+1] × [z, z+1].
 *
 * The camera orbits a target point. At yaw 0 and pitch 0 it stands south of the target looking north,
 * with east on the right; a positive yaw moves it east, a positive pitch raises it. Camera space has
 * x to the right, y up and z forward (the depth).
 *
 * @typedef {object} View
 * @property {[number, number, number]} eye
 * @property {[number, number, number]} right
 * @property {[number, number, number]} up
 * @property {[number, number, number]} fwd
 * @property {number} focal  pixels from the eye to the image plane
 * @property {number} cx  screen x of the optical centre
 * @property {number} cy
 * @property {number} near  depths below this are clipped
 *
 * @typedef {object} CameraSpec
 * @property {number} yaw  radians
 * @property {number} pitch  radians
 * @property {number} distance  eye to target, in blocks
 * @property {[number, number, number]} target
 * @property {number} width  canvas CSS pixels
 * @property {number} height
 */

export const PITCH_MIN = -1.45;
export const PITCH_MAX = 1.45;
/** Vertical field of view. */
export const FOV = (50 * Math.PI) / 180;
export const NEAR = 0.05;

/** @param {[number, number, number]} a @param {[number, number, number]} b */
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
/** @param {[number, number, number]} a @param {[number, number, number]} b @returns {[number, number, number]} */
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
/** @param {[number, number, number]} a @returns {[number, number, number]} */
const unit = (a) => {
  const n = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / n, a[1] / n, a[2] / n];
};

/**
 * @param {CameraSpec} spec
 * @returns {View}
 */
export function makeView({ yaw, pitch, distance, target, width, height }) {
  const cp = Math.cos(pitch);
  /** @type {[number, number, number]} */
  const eye = [target[0] + distance * Math.sin(yaw) * cp, target[1] + distance * Math.sin(pitch), target[2] + distance * Math.cos(yaw) * cp];
  const fwd = unit([target[0] - eye[0], target[1] - eye[1], target[2] - eye[2]]);
  const right = unit(cross(fwd, [0, 1, 0]));
  const up = cross(right, fwd);
  return { eye, right, up, fwd, focal: height / 2 / Math.tan(FOV / 2), cx: width / 2, cy: height / 2, near: NEAR };
}

/**
 * World point to camera space.
 * @param {View} view
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @returns {[number, number, number]}
 */
export function toCamera(view, x, y, z) {
  /** @type {[number, number, number]} */
  const v = [x - view.eye[0], y - view.eye[1], z - view.eye[2]];
  return [dot(v, view.right), dot(v, view.up), dot(v, view.fwd)];
}

/**
 * Camera space to screen pixels. The point must be in front of the near plane.
 * @param {View} view
 * @param {[number, number, number]} c
 * @returns {[number, number]}
 */
export const toScreen = (view, c) => [view.cx + (view.focal * c[0]) / c[2], view.cy - (view.focal * c[1]) / c[2]];

/**
 * World point to screen pixels and depth, or null when it is behind the near plane.
 * @param {View} view
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @returns {[number, number, number] | null}
 */
export function project(view, x, y, z) {
  const c = toCamera(view, x, y, z);
  if (c[2] < view.near) return null;
  const [sx, sy] = toScreen(view, c);
  return [sx, sy, c[2]];
}

/**
 * Clip a camera-space polygon to the near plane (Sutherland–Hodgman) and project it.
 * Returns x0,y0,x1,y1… in screen pixels, or an empty array when nothing is in front of the camera.
 * @param {View} view
 * @param {[number, number, number][]} pts
 * @returns {number[]}
 */
export function clipAndProject(view, pts) {
  /** @type {[number, number, number][]} */
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const aIn = a[2] >= view.near;
    const bIn = b[2] >= view.near;
    if (aIn) out.push(a);
    if (aIn !== bIn) {
      const t = (view.near - a[2]) / (b[2] - a[2]);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, view.near]);
    }
  }
  /** @type {number[]} */
  const poly = [];
  for (const c of out) poly.push(...toScreen(view, c));
  return poly;
}

/**
 * A segment between two world points, clipped to the near plane. Null when it is entirely behind the camera.
 * @param {View} view
 * @param {[number, number, number]} a
 * @param {[number, number, number]} b
 * @returns {[number, number, number, number] | null}
 */
export function projectSegment(view, a, b) {
  let ca = toCamera(view, ...a);
  let cb = toCamera(view, ...b);
  if (ca[2] < view.near && cb[2] < view.near) return null;
  if (ca[2] < view.near) ca = lerpToNear(view, ca, cb);
  else if (cb[2] < view.near) cb = lerpToNear(view, cb, ca);
  const [x0, y0] = toScreen(view, ca);
  const [x1, y1] = toScreen(view, cb);
  return [x0, y0, x1, y1];
}

/** @param {View} view @param {[number, number, number]} behind @param {[number, number, number]} front @returns {[number, number, number]} */
function lerpToNear(view, behind, front) {
  const t = (view.near - behind[2]) / (front[2] - behind[2]);
  return [behind[0] + (front[0] - behind[0]) * t, behind[1] + (front[1] - behind[1]) * t, view.near];
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
 * @property {number[]} poly  x0,y0,x1,y1,… in screen pixels
 * @property {number} area  screen area in pixels²
 * @property {boolean} label  the largest visible face of its cell, where a label is drawn
 * @property {boolean} last  the last face drawn for its cell (decorations go after it)
 */

/**
 * A face is toward the viewer when the eye is on its outward side of the face's plane.
 * @param {View} view
 * @param {{ x: number, y: number, z: number }} c
 * @param {[number, number, number]} n
 */
function faceFront(view, c, n) {
  if (n[0] !== 0) return n[0] > 0 ? view.eye[0] > c.x + 1 : view.eye[0] < c.x;
  if (n[1] !== 0) return n[1] > 0 ? view.eye[1] > c.y + 1 : view.eye[1] < c.y;
  return n[2] > 0 ? view.eye[2] > c.z + 1 : view.eye[2] < c.z;
}

/**
 * The faces to draw, back to front. A face is drawn only when it faces the viewer and no visible block
 * sits against it. Cells above `layerMax` are hidden (a view-only cut that never changes the structure).
 *
 * Order: for each axis, cells are ranked by how far their index is from the eye's cell index, farthest first,
 * and the three ranks are compared in x, y, z order. If one cube can hide another from the eye, it is at least as
 * close on every axis, so it is drawn later. That makes the painter's order exact for a grid of unit cubes
 * under perspective, including when the eye is inside the grid.
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

  const ex = Math.floor(view.eye[0]);
  const ey = Math.floor(view.eye[1]);
  const ez = Math.floor(view.eye[2]);
  shown.sort((ia, ib) => {
    const a = cells[ia];
    const b = cells[ib];
    return Math.abs(b.x - ex) - Math.abs(a.x - ex) || Math.abs(b.y - ey) - Math.abs(a.y - ey) || Math.abs(b.z - ez) - Math.abs(a.z - ez);
  });

  /** @type {Face[]} */
  const out = [];
  for (const index of shown) {
    const c = cells[index];
    const start = out.length;
    FACES.forEach((f, i) => {
      if (!faceFront(view, c, f.normal)) return;
      const [nx, ny, nz] = f.normal;
      if (present.has(`${c.x + nx},${c.y + ny},${c.z + nz}`)) return;
      const poly = clipAndProject(view, f.corners.map(([dx, dy, dz]) => toCamera(view, c.x + dx, c.y + dy, c.z + dz)));
      if (poly.length < 6) return;
      out.push({ cell: index, face: i, poly, area: polygonArea(poly), label: false, last: false });
    });
    let best = -1;
    for (let k = start; k < out.length; k++) if (best === -1 || out[k].area > out[best].area) best = k;
    if (best !== -1) out[best].label = true;
    if (out.length > start) out[out.length - 1].last = true;
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
 * Direction of the ray through a screen pixel (not normalised).
 * @param {View} view
 * @param {number} sx
 * @param {number} sy
 * @returns {[number, number, number]}
 */
export function rayDirection(view, sx, sy) {
  const a = (sx - view.cx) / view.focal;
  const b = -(sy - view.cy) / view.focal;
  return [
    view.fwd[0] + view.right[0] * a + view.up[0] * b,
    view.fwd[1] + view.right[1] * a + view.up[1] * b,
    view.fwd[2] + view.right[2] * a + view.up[2] * b,
  ];
}

/**
 * Exact ray cast against a list of cells (slab method). O(n); used by tests to check picking, not by the page.
 * @param {View} view
 * @param {{ x: number, y: number, z: number }[]} cells
 * @param {number} sx
 * @param {number} sy
 * @param {number} layerMax
 * @returns {{ index: number, normal: [number, number, number] } | null}
 */
export function castRay(view, cells, sx, sy, layerMax) {
  const d = rayDirection(view, sx, sy);
  let best = Infinity;
  /** @type {{ index: number, normal: [number, number, number] } | null} */
  let hit = null;
  cells.forEach((c, index) => {
    if (c.y > layerMax) return;
    let t0 = 0;
    let t1 = Infinity;
    /** @type {[number, number, number]} */
    let enter = [0, 0, 0];
    const min = [c.x, c.y, c.z];
    for (let k = 0; k < 3; k++) {
      if (Math.abs(d[k]) < 1e-12) {
        if (view.eye[k] < min[k] || view.eye[k] > min[k] + 1) return;
        continue;
      }
      let ta = (min[k] - view.eye[k]) / d[k];
      let tb = (min[k] + 1 - view.eye[k]) / d[k];
      const dir = d[k] > 0 ? -1 : 1;
      if (ta > tb) [ta, tb] = [tb, ta];
      if (ta > t0) {
        t0 = ta;
        enter = [0, 0, 0];
        enter[k] = dir;
      }
      t1 = Math.min(t1, tb);
      if (t0 > t1) return;
    }
    if (t0 > 0 && t0 < best && (enter[0] || enter[1] || enter[2])) {
      best = t0;
      hit = { index, normal: enter };
    }
  });
  return hit;
}

/**
 * Where the ray through a pixel meets the ground plane (y = 0), as a cell of a width × length grid, or null.
 * Only when the eye is above the ground and the point lies inside the grid.
 * @param {View} view
 * @param {number} sx
 * @param {number} sy
 * @param {{ width: number, length: number }} dims
 * @returns {{ x: number, z: number } | null}
 */
export function groundCell(view, sx, sy, dims) {
  const d = rayDirection(view, sx, sy);
  if (view.eye[1] <= 0 || d[1] >= -1e-9) return null;
  const t = -view.eye[1] / d[1];
  const x = Math.floor(view.eye[0] + d[0] * t);
  const z = Math.floor(view.eye[2] + d[2] * t);
  return x >= 0 && z >= 0 && x < dims.width && z < dims.length ? { x, z } : null;
}

/**
 * Eye distance so a structure of the given size fits the canvas, with a margin.
 * @param {number} width
 * @param {number} height
 * @param {number} length
 * @param {number} canvasW
 * @param {number} canvasH
 */
export function fitDistance(width, height, length, canvasW, canvasH) {
  const radius = Math.hypot(width, height, length) / 2;
  const tanV = Math.tan(FOV / 2);
  const tanH = tanV * (canvasW / Math.max(1, canvasH));
  const half = Math.atan(Math.min(tanV, tanH));
  return Math.max(3, (radius * 1.15) / Math.sin(half));
}

/**
 * @param {number} value
 * @param {number} min
 * @param {number} max
 */
export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
