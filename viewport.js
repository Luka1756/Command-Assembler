// @ts-check
import { FACES, PITCH_MAX, PITCH_MIN, buildFaces, clamp, fitScale, pickFace, project } from './projection.js';
import { ROLES } from './structure.js';

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
 * What a pointer is over: the block and the direction of the face under it.
 * @typedef {{ cell: ResolvedCell, normal: [number, number, number] }} Hit
 */

/**
 * @typedef {object} ViewportHandlers
 * @property {(hit: Hit | null) => void} onClick  a tap or click (not a drag)
 * @property {(hit: Hit | null) => void} onHover
 */

// Neutral light blocks. The three roles differ in tone and by their letter, never by green or cyan.
const ROLE_FILL = /** @type {Record<string, [number, number, number]>} */ ({
  floor: [214, 214, 214],
  wall: [246, 243, 234],
  ceiling: [172, 172, 172],
  custom: [236, 220, 150],
});
// Brightness of each face, by index into FACES: +x, -x, +y, -y, +z, -z.
const SHADE = [0.82, 0.66, 1, 0.45, 0.92, 0.74];
const ACCENT = '#ffd21f';
const ROLE_LETTER = /** @type {Record<string, string>} */ (Object.fromEntries(ROLES.map((r) => [r.id, r.label])));

const ZOOM_MIN = 0.25;
const ZOOM_MAX = 12;
const CLICK_SLOP = 6;

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
  let pitch = 0.5;
  let zoom = 1;
  let panX = 0;
  let panY = 0;
  let queued = false;

  const resetCamera = () => {
    yaw = -0.6;
    pitch = 0.5;
    zoom = 1;
    panX = 0;
    panY = 0;
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

  /** @returns {View} */
  function currentView() {
    const w = canvas.width / dpr();
    const h = canvas.height / dpr();
    const { width, height, length } = scene.dims;
    return {
      yaw,
      pitch,
      scale: fitScale(width, height, length, w, h) * zoom,
      cx: w / 2 + panX,
      cy: h / 2 + panY,
      center: [width / 2, height / 2, length / 2],
    };
  }

  const dpr = () => window.devicePixelRatio || 1;

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

  /**
   * @param {View} view
   * @param {Cell} cell
   * @param {string} style
   * @param {number} width
   * @param {number[]} dash
   */
  function wireCube(view, cell, style, width, dash) {
    /** @type {[number, number][]} */
    const p = [];
    for (let i = 0; i < 8; i++) {
      const [sx, sy] = project(view, cell.x + (i & 1), cell.y + ((i >> 1) & 1), cell.z + ((i >> 2) & 1));
      p.push([sx, sy]);
    }
    ctx.strokeStyle = style;
    ctx.lineWidth = width;
    ctx.setLineDash(dash);
    ctx.beginPath();
    for (const [a, b] of [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]]) {
      ctx.moveTo(p[a][0], p[a][1]);
      ctx.lineTo(p[b][0], p[b][1]);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawGrid(/** @type {View} */ view) {
    const { width, length } = scene.dims;
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(236, 230, 214, 0.1)';
    ctx.beginPath();
    for (let x = 0; x <= width; x++) {
      const a = project(view, x, 0, 0);
      const b = project(view, x, 0, length);
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
    }
    for (let z = 0; z <= length; z++) {
      const a = project(view, 0, 0, z);
      const b = project(view, width, 0, z);
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
    }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(236, 230, 214, 0.28)';
    ctx.beginPath();
    const corners = [project(view, 0, 0, 0), project(view, width, 0, 0), project(view, width, 0, length), project(view, 0, 0, length)];
    ctx.moveTo(corners[0][0], corners[0][1]);
    for (const c of corners.slice(1)) ctx.lineTo(c[0], c[1]);
    ctx.closePath();
    ctx.stroke();
  }

  function drawAxes(/** @type {View} */ view, /** @type {number} */ h) {
    const origin = { x: 34, y: h - 30 };
    const unit = 22;
    /** @type {[string, [number, number, number], string][]} */
    const axes = [['X', [1, 0, 0], '#ff8a7a'], ['Y', [0, 1, 0], ACCENT], ['Z', [0, 0, 1], '#d8d4c8']];
    const base = { ...view, scale: unit, cx: origin.x, cy: origin.y, center: /** @type {[number, number, number]} */ ([0, 0, 0]) };
    ctx.font = '600 10px ui-monospace, Menlo, Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 1.5;
    for (const [name, v, color] of axes) {
      const end = project(base, v[0], v[1], v[2]);
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.moveTo(origin.x, origin.y);
      ctx.lineTo(end[0], end[1]);
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.fillText(name, origin.x + (end[0] - origin.x) * 1.35, origin.y + (end[1] - origin.y) * 1.35);
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
    drawGrid(view);

    const outline = view.scale > 7;
    const hoverCell = hover?.cell;
    const selected = scene.selected;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.lineWidth = 1;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (const face of faces) {
      const cell = scene.cells[face.cell];
      const base = ROLE_FILL[cell.custom ? 'custom' : (cell.role ?? 'wall')];
      const shade = SHADE[face.face] + (cell === hoverCell ? 0.12 : 0);
      ctx.fillStyle = `rgb(${Math.min(255, base[0] * shade)}, ${Math.min(255, base[1] * shade)}, ${Math.min(255, base[2] * shade)})`;
      tracePoly(face.poly);
      ctx.fill();
      if (outline) ctx.stroke();
    }

    // Letters: one per block, on its largest visible face, only when the face is big enough to read.
    for (const face of faces) {
      if (!face.label) continue;
      const size = Math.sqrt(face.area);
      if (size < 20) continue;
      const cell = scene.cells[face.cell];
      let cx = 0;
      let cy = 0;
      for (let i = 0; i < 8; i += 2) {
        cx += face.poly[i] / 4;
        cy += face.poly[i + 1] / 4;
      }
      ctx.fillStyle = 'rgba(20, 20, 20, 0.82)';
      ctx.font = `700 ${Math.round(clamp(size * 0.45, 9, 20))}px ui-monospace, Menlo, Consolas, monospace`;
      ctx.fillText(cell.custom ? 'M' : ROLE_LETTER[cell.role ?? 'wall'], cx, cy);
    }

    // Hover and selection use the accent colour; selection is thicker and also drawn as a wire cube.
    if (hoverCell && hoverCell !== (selected && scene.cells.find((c) => c.x === selected.x && c.y === selected.y && c.z === selected.z))) {
      ctx.strokeStyle = 'rgba(255, 210, 31, 0.6)';
      ctx.lineWidth = 2;
      for (const face of faces) {
        if (scene.cells[face.cell] === hoverCell) {
          tracePoly(face.poly);
          ctx.stroke();
        }
      }
    }
    if (hover && tool === 'place') {
      wireCube(view, { x: hover.cell.x + hover.normal[0], y: hover.cell.y + hover.normal[1], z: hover.cell.z + hover.normal[2] }, 'rgba(255, 210, 31, 0.85)', 1.5, [4, 3]);
    }
    if (selected && selected.y <= scene.layerMax) {
      ctx.strokeStyle = ACCENT;
      ctx.lineWidth = 2.5;
      for (const face of faces) {
        const cell = scene.cells[face.cell];
        if (cell.x === selected.x && cell.y === selected.y && cell.z === selected.z) {
          tracePoly(face.poly);
          ctx.stroke();
        }
      }
      wireCube(view, selected, ACCENT, 1.5, [3, 3]);
    }

    drawAxes(view, h);
    canvas.dataset.camera = [yaw.toFixed(2), pitch.toFixed(2), zoom.toFixed(2), Math.round(panX), Math.round(panY)].join(',');
  }

  /**
   * @param {number} x  canvas-relative pixels
   * @param {number} y
   * @returns {Hit | null}
   */
  function hitAt(x, y) {
    const face = pickFace(faces, x, y);
    if (!face) return null;
    return { cell: scene.cells[face.cell], normal: FACES[face.face].normal };
  }

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
  let pinchDistance = 0;

  const pinchGeometry = () => {
    const [a, b] = Array.from(pointers.values());
    return { distance: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  };

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
      pinchDistance = pinchGeometry().distance;
    }
  });

  canvas.addEventListener('pointermove', (event) => {
    const p = local(event);
    const previous = pointers.get(event.pointerId);
    if (!previous) {
      if (event.pointerType === 'mouse') {
        const next = hitAt(p.x, p.y);
        if (next?.cell !== hover?.cell || next?.normal !== hover?.normal) {
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
      panX += after.mx - before.mx;
      panY += after.my - before.my;
      travelled = Infinity;
    } else {
      pointers.set(event.pointerId, p);
      travelled += Math.abs(dx) + Math.abs(dy);
      if (travelled > CLICK_SLOP) {
        if (mode === 'pan') {
          panX += dx;
          panY += dy;
        } else {
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
    const wasTracked = pointers.delete(event.pointerId);
    if (!wasTracked) return;
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
        if (event.shiftKey) panX += 30;
        else yaw += step;
        break;
      case 'ArrowRight':
        if (event.shiftKey) panX -= 30;
        else yaw -= step;
        break;
      case 'ArrowUp':
        if (event.shiftKey) panY += 30;
        else pitch = clamp(pitch - step, PITCH_MIN, PITCH_MAX);
        break;
      case 'ArrowDown':
        if (event.shiftKey) panY -= 30;
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

  return {
    /** @param {Scene} next */
    setScene(next) {
      scene = next;
      if (hover && !next.cells.includes(hover.cell)) hover = null;
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
    camera: () => ({ yaw, pitch, zoom, panX, panY }),
    /** Where a cell's centre is on screen (canvas pixels), or null before the first draw. */
    screenOf(/** @type {Cell} */ cell) {
      if (!lastView) return null;
      const [x, y] = project(lastView, cell.x + 0.5, cell.y + 0.5, cell.z + 0.5);
      return { x, y };
    },
    destroy() {
      observer.disconnect();
    },
  };
}
