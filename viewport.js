// @ts-check
import { FACINGS } from './blocks.js';
import { SHADE, baseColor, letterOf, rgb } from './palette.js';
import { FACES, PITCH_MAX, PITCH_MIN, buildFaces, clamp, fitDistance, groundCell, makeView, pickFace, project, projectSegment } from './projection.js';

/** @typedef {import('./structure.js').ResolvedCell} ResolvedCell */
/** @typedef {import('./projection.js').View} View */
/** @typedef {import('./projection.js').Face} Face */
/** @typedef {{ x: number, y: number, z: number }} Cell */

/**
 * @typedef {object} Scene
 * @property {{ width: number, height: number, length: number }} dims
 * @property {ResolvedCell[]} cells
 * @property {Cell | null} selected
 * @property {number} layerMax  highest layer shown (view only)
 */

/**
 * What a pointer is over. `cell` is the block under it (null on empty ground); `place` is the empty cell
 * the Place tool would fill (the cell next to the face, or the ground cell).
 * @typedef {{ cell: ResolvedCell | null, normal: [number, number, number], place: Cell }} Hit
 */

/**
 * @typedef {object} ViewportHandlers
 * @property {(hit: Hit | null) => void} onClick  a tap or click (not a drag)
 * @property {(hit: Hit | null) => void} onHover
 */

const FACING_VECTOR = /** @type {Record<string, readonly number[]>} */ (Object.fromEntries(FACINGS.map((f) => [f.id, f.vector])));
const ACCENT = '#ffd21f';

const ZOOM_MIN = 0.25;
const ZOOM_MAX = 12;
const CLICK_SLOP = 6;
const GRID_MARGIN = 2;

/**
 * @param {HTMLCanvasElement} canvas
 * @param {ViewportHandlers} handlers
 */
export function createViewport(canvas, handlers) {
  const maybeCtx = canvas.getContext('2d');
  if (!maybeCtx) throw new Error('Canvas 2D is not available.');
  const ctx = maybeCtx;

  /** @type {Scene} */
  let scene = { dims: { width: 1, height: 1, length: 1 }, cells: [], selected: null, layerMax: 0 };
  /** @type {Face[]} */
  let faces = [];
  /** @type {View | null} */
  let lastView = null;
  /** @type {Hit | null} */
  let hover = null;
  let tool = 'select';
  let yaw = -0.6;
  let pitch = 0.55;
  let zoom = 1;
  /** Pan, as an offset of the orbit target in world units along the camera's right and up. */
  let panRight = 0;
  let panUp = 0;
  let queued = false;

  const dpr = () => window.devicePixelRatio || 1;

  const resetCamera = () => {
    yaw = -0.6;
    pitch = 0.55;
    zoom = 1;
    panRight = 0;
    panUp = 0;
    schedule();
  };

  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      draw();
    });
  }

  /** Distance of one pixel at the target, in blocks (for panning). */
  const pixelsToWorld = () => {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    const { width, height, length } = scene.dims;
    return (fitDistance(width, height, length, w, h) / zoom) / (h / 2 / Math.tan((50 * Math.PI) / 360));
  };

  /** @returns {View} */
  function currentView() {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    const { width, height, length } = scene.dims;
    const base = makeView({ yaw, pitch, distance: 10, target: [0, 0, 0], width: w, height: h });
    const target = /** @type {[number, number, number]} */ ([
      width / 2 + base.right[0] * panRight + base.up[0] * panUp,
      height / 2 + base.right[1] * panRight + base.up[1] * panUp,
      length / 2 + base.right[2] * panRight + base.up[2] * panUp,
    ]);
    return makeView({ yaw, pitch, distance: fitDistance(width, height, length, w, h) / zoom, target, width: w, height: h });
  }

  function sizeCanvas() {
    const ratio = dpr();
    const w = Math.max(1, Math.round(canvas.clientWidth * ratio));
    const h = Math.max(1, Math.round(canvas.clientHeight * ratio));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }

  /** @param {number[]} poly */
  function tracePoly(poly) {
    ctx.beginPath();
    ctx.moveTo(poly[0], poly[1]);
    for (let i = 2; i < poly.length; i += 2) ctx.lineTo(poly[i], poly[i + 1]);
    ctx.closePath();
  }

  /** @param {View} view @param {[number, number, number]} a @param {[number, number, number]} b */
  function line(view, a, b) {
    const s = projectSegment(view, a, b);
    if (!s) return;
    ctx.moveTo(s[0], s[1]);
    ctx.lineTo(s[2], s[3]);
  }

  /** @param {View} view @param {Cell} cell @param {string} style @param {number} width @param {number[]} dash */
  function wireCube(view, cell, style, width, dash) {
    const p = (/** @type {number} */ i) => /** @type {[number, number, number]} */ ([cell.x + (i & 1), cell.y + ((i >> 1) & 1), cell.z + ((i >> 2) & 1)]);
    ctx.strokeStyle = style;
    ctx.lineWidth = width;
    ctx.setLineDash(dash);
    ctx.beginPath();
    for (const [a, b] of [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]]) line(view, p(a), p(b));
    ctx.stroke();
    ctx.setLineDash([]);
  }

  /** Ground plane (y = 0): a grid a little larger than the footprint, the footprint outlined, coordinate ticks and the origin. */
  function drawGround(/** @type {View} */ view) {
    const { width, length } = scene.dims;
    const m = GRID_MARGIN;
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(236, 230, 214, 0.1)';
    ctx.beginPath();
    for (let x = -m; x <= width + m; x++) line(view, [x, 0, -m], [x, 0, length + m]);
    for (let z = -m; z <= length + m; z++) line(view, [-m, 0, z], [width + m, 0, z]);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(236, 230, 214, 0.34)';
    ctx.beginPath();
    line(view, [0, 0, 0], [width, 0, 0]);
    line(view, [width, 0, 0], [width, 0, length]);
    line(view, [width, 0, length], [0, 0, length]);
    line(view, [0, 0, length], [0, 0, 0]);
    ctx.stroke();

    // Coordinate ticks along the north and west edges, outside the footprint.
    const step = (/** @type {number} */ n) => (n > 24 ? 5 : n > 12 ? 2 : 1);
    ctx.font = '600 10px ui-monospace, Menlo, Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(236, 230, 214, 0.55)';
    for (let x = 0; x < width; x += step(width)) {
      const p = project(view, x + 0.5, 0, -0.7);
      if (p) ctx.fillText(String(x), p[0], p[1]);
    }
    for (let z = 0; z < length; z += step(length)) {
      const p = project(view, -0.7, 0, z + 0.5);
      if (p) ctx.fillText(String(z), p[0], p[1]);
    }

    // Origin marker: the structure's (0, 0, 0) corner.
    const o = project(view, 0, 0, 0);
    if (o) {
      ctx.fillStyle = ACCENT;
      ctx.beginPath();
      ctx.arc(o[0], o[1], 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** X / Y / Z indicator in the corner, rotating with the camera. */
  function drawAxes(/** @type {View} */ view, /** @type {number} */ h) {
    const origin = { x: 34, y: h - 30 };
    const unit = 20;
    /** @type {[string, [number, number, number], string][]} */
    const axes = [['X', [1, 0, 0], '#ff8a7a'], ['Y', [0, 1, 0], ACCENT], ['Z', [0, 0, 1], '#d8d4c8']];
    ctx.font = '600 10px ui-monospace, Menlo, Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 1.5;
    for (const [name, v, color] of axes) {
      const dx = (v[0] * view.right[0] + v[1] * view.right[1] + v[2] * view.right[2]) * unit;
      const dy = -(v[0] * view.up[0] + v[1] * view.up[1] + v[2] * view.up[2]) * unit;
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.moveTo(origin.x, origin.y);
      ctx.lineTo(origin.x + dx, origin.y + dy);
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.fillText(name, origin.x + dx * 1.4, origin.y + dy * 1.4);
    }
  }

  /** Arrow along a command block's facing, drawn through the block so type and direction both show. */
  function drawFacing(/** @type {View} */ view, /** @type {ResolvedCell} */ cell) {
    const v = FACING_VECTOR[cell.props?.facing ?? 'north'];
    const cx = cell.x + 0.5;
    const cy = cell.y + 0.5;
    const cz = cell.z + 0.5;
    const tail = projectSegment(view, [cx - v[0] * 0.3, cy - v[1] * 0.3, cz - v[2] * 0.3], [cx + v[0] * 0.5, cy + v[1] * 0.5, cz + v[2] * 0.5]);
    if (!tail) return;
    const [x0, y0, x1, y1] = tail;
    const len = Math.hypot(x1 - x0, y1 - y0);
    if (len < 6) return;
    const ux = (x1 - x0) / len;
    const uy = (y1 - y0) / len;
    const head = Math.min(9, len * 0.45);
    for (const [style, width] of /** @type {const} */ ([['rgba(255,255,255,0.9)', 4], ['rgba(24,24,26,0.95)', 2]])) {
      ctx.strokeStyle = style;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.moveTo(x1 - ux * head - uy * head * 0.55, y1 - uy * head + ux * head * 0.55);
      ctx.lineTo(x1, y1);
      ctx.lineTo(x1 - ux * head + uy * head * 0.55, y1 - uy * head - ux * head * 0.55);
      ctx.stroke();
    }
  }

  function draw() {
    sizeCanvas();
    const ratio = dpr();
    const w = canvas.width / ratio;
    const h = canvas.height / ratio;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.fillStyle = '#0d0d0e';
    ctx.fillRect(0, 0, w, h);
    ctx.lineJoin = 'round';

    const view = currentView();
    lastView = view;
    faces = buildFaces(view, scene.cells, scene.layerMax);
    drawGround(view);

    const hoverCell = hover?.cell ?? null;
    const selected = scene.selected;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.lineWidth = 1;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (const face of faces) {
      const cell = scene.cells[face.cell];
      const base = baseColor(cell);
      const shade = SHADE[face.face] + (cell === hoverCell ? 0.12 : 0);
      ctx.fillStyle = rgb(base, shade);
      tracePoly(face.poly);
      ctx.fill();
      if (Math.sqrt(face.area) > 9) ctx.stroke();

      if (face.label) {
        const size = Math.sqrt(face.area);
        if (size >= 18) {
          let tx = 0;
          let ty = 0;
          const n = face.poly.length / 2;
          for (let i = 0; i < face.poly.length; i += 2) {
            tx += face.poly[i] / n;
            ty += face.poly[i + 1] / n;
          }
          ctx.fillStyle = 'rgba(20, 20, 20, 0.82)';
          ctx.font = `700 ${Math.round(clamp(size * 0.42, 9, 20))}px ui-monospace, Menlo, Consolas, monospace`;
          // The arrow sits over the letter on command blocks, so shift the letter off-centre.
          ctx.fillText(letterOf(cell), tx, cell.props ? ty - size * 0.22 : ty);
        }
      }
      if (face.last && cell.props) drawFacing(view, cell);
    }

    // Hover and selection use the accent colour; selection is thicker and also drawn as a wire cube.
    const isSelected = (/** @type {ResolvedCell | null} */ c) => !!c && !!selected && c.x === selected.x && c.y === selected.y && c.z === selected.z;
    if (hoverCell && !isSelected(hoverCell)) {
      ctx.strokeStyle = 'rgba(255, 210, 31, 0.6)';
      ctx.lineWidth = 2;
      for (const face of faces) {
        if (scene.cells[face.cell] === hoverCell) {
          tracePoly(face.poly);
          ctx.stroke();
        }
      }
    }
    if (hover && tool === 'place') wireCube(view, hover.place, 'rgba(255, 210, 31, 0.85)', 1.5, [4, 3]);
    if (hover && !hover.cell && tool !== 'place') wireCube(view, hover.place, 'rgba(255, 210, 31, 0.35)', 1, [2, 3]);
    if (selected && selected.y <= scene.layerMax) {
      ctx.strokeStyle = ACCENT;
      ctx.lineWidth = 2.5;
      for (const face of faces) {
        if (isSelected(scene.cells[face.cell])) {
          tracePoly(face.poly);
          ctx.stroke();
        }
      }
      wireCube(view, selected, ACCENT, 1.5, [3, 3]);
    }

    drawAxes(view, h);
    canvas.dataset.camera = [yaw.toFixed(2), pitch.toFixed(2), zoom.toFixed(2), panRight.toFixed(1), panUp.toFixed(1)].join(',');
  }

  /**
   * @param {number} x  canvas-relative pixels
   * @param {number} y
   * @returns {Hit | null}
   */
  function hitAt(x, y) {
    const face = pickFace(faces, x, y);
    if (face) {
      const cell = scene.cells[face.cell];
      const normal = FACES[face.face].normal;
      return { cell, normal, place: { x: cell.x + normal[0], y: cell.y + normal[1], z: cell.z + normal[2] } };
    }
    if (!lastView) return null;
    const ground = groundCell(lastView, x, y, scene.dims);
    return ground ? { cell: null, normal: [0, 1, 0], place: { x: ground.x, y: 0, z: ground.z } } : null;
  }

  const sameHit = (/** @type {Hit | null} */ a, /** @type {Hit | null} */ b) =>
    a === b || (!!a && !!b && a.cell === b.cell && a.place.x === b.place.x && a.place.y === b.place.y && a.place.z === b.place.z);

  /** @param {PointerEvent} event */
  function local(event) {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  // ---------- pointer input: one pointer rotates (or pans with right button / Shift), two pointers pinch ----------

  /** @type {Map<number, { x: number, y: number }>} */
  const pointers = new Map();
  let mode = /** @type {'rotate' | 'pan'} */ ('rotate');
  let travelled = 0;
  let multi = false;

  const pinchGeometry = () => {
    const [a, b] = Array.from(pointers.values());
    return { distance: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  };

  /** @param {number} dx @param {number} dy */
  function panBy(dx, dy) {
    const k = pixelsToWorld();
    panRight -= dx * k;
    panUp += dy * k;
  }

  canvas.addEventListener('pointerdown', (event) => {
    canvas.focus({ preventScroll: true });
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch {
      // Capture is a convenience; dragging still works while the pointer stays over the canvas.
    }
    pointers.set(event.pointerId, local(event));
    if (pointers.size === 1) {
      mode = event.button === 2 || event.button === 1 || event.shiftKey ? 'pan' : 'rotate';
      travelled = 0;
      multi = false;
    } else if (pointers.size === 2) {
      multi = true;
    }
  });

  canvas.addEventListener('pointermove', (event) => {
    const p = local(event);
    const previous = pointers.get(event.pointerId);
    if (!previous) {
      if (event.pointerType === 'mouse') {
        const next = hitAt(p.x, p.y);
        if (!sameHit(next, hover)) {
          hover = next;
          handlers.onHover(next);
          schedule();
        }
      }
      return;
    }
    const dx = p.x - previous.x;
    const dy = p.y - previous.y;
    if (pointers.size >= 2) {
      const before = pinchGeometry();
      pointers.set(event.pointerId, p);
      const after = pinchGeometry();
      zoom = clamp(zoom * (after.distance / (before.distance || 1)), ZOOM_MIN, ZOOM_MAX);
      panBy(after.mx - before.mx, after.my - before.my);
      travelled = Infinity;
    } else {
      pointers.set(event.pointerId, p);
      travelled += Math.abs(dx) + Math.abs(dy);
      if (travelled > CLICK_SLOP) {
        if (mode === 'pan') panBy(dx, dy);
        else {
          yaw -= dx * 0.01;
          pitch = clamp(pitch + dy * 0.01, PITCH_MIN, PITCH_MAX);
        }
        if (hover) {
          hover = null;
          handlers.onHover(null);
        }
      }
    }
    schedule();
  });

  /** @param {PointerEvent} event */
  function release(event) {
    if (!pointers.delete(event.pointerId)) return;
    if (event.type === 'pointerup' && !multi && pointers.size === 0 && mode === 'rotate' && travelled <= CLICK_SLOP) {
      const p = local(event);
      handlers.onClick(hitAt(p.x, p.y));
    }
    if (pointers.size === 0) multi = false;
  }
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('pointerleave', (event) => {
    if (event.pointerType === 'mouse' && hover && !pointers.size) {
      hover = null;
      handlers.onHover(null);
      schedule();
    }
  });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  canvas.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      zoom = clamp(zoom * Math.exp(-event.deltaY * 0.0015), ZOOM_MIN, ZOOM_MAX);
      schedule();
    },
    { passive: false },
  );

  // ---------- keyboard ----------
  canvas.addEventListener('keydown', (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const step = 0.12;
    let handled = true;
    switch (event.key) {
      case 'ArrowLeft':
        if (event.shiftKey) panBy(30, 0);
        else yaw += step;
        break;
      case 'ArrowRight':
        if (event.shiftKey) panBy(-30, 0);
        else yaw -= step;
        break;
      case 'ArrowUp':
        if (event.shiftKey) panBy(0, 30);
        else pitch = clamp(pitch - step, PITCH_MIN, PITCH_MAX);
        break;
      case 'ArrowDown':
        if (event.shiftKey) panBy(0, -30);
        else pitch = clamp(pitch + step, PITCH_MIN, PITCH_MAX);
        break;
      case '+':
      case '=':
        zoom = clamp(zoom * 1.2, ZOOM_MIN, ZOOM_MAX);
        break;
      case '-':
      case '_':
        zoom = clamp(zoom / 1.2, ZOOM_MIN, ZOOM_MAX);
        break;
      case '0':
        resetCamera();
        break;
      default:
        handled = false;
    }
    if (handled) {
      event.preventDefault();
      schedule();
    }
  });

  const observer = new ResizeObserver(schedule);
  observer.observe(canvas);

  /** Where a cell's centre is on screen (canvas pixels), or null before the first draw or when behind the camera. */
  const screenOf = (/** @type {Cell} */ cell) => {
    if (!lastView) return null;
    const p = project(lastView, cell.x + 0.5, cell.y + 0.5, cell.z + 0.5);
    return p ? { x: p[0], y: p[1] } : null;
  };
  // Read-only helper so browser tests can aim at a cell; the page itself does not use it.
  /** @type {any} */ (canvas).screenOf = screenOf;

  return {
    /** @param {Scene} next */
    setScene(next) {
      scene = next;
      hover = null;
      schedule();
    },
    /** @param {string} next */
    setTool(next) {
      tool = next;
      schedule();
    },
    resetCamera,
    redraw: schedule,
    /** Camera state, for tests and diagnostics. */
    camera: () => ({ yaw, pitch, zoom, panRight, panUp }),
    screenOf,
    destroy() {
      observer.disconnect();
    },
  };
}
