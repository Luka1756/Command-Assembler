// @ts-check
import { SHADE, baseColor, rgb } from './palette.js';
import { buildFaces, fitDistance, makeView } from './projection.js';
import { resolveCells } from './structure.js';

/**
 * Draw a still preview of a structure (no interaction). Used by the community library and the publish dialog.
 * @param {HTMLCanvasElement} canvas  its CSS size decides the resolution
 * @param {import('./structure.js').StructureState} state
 */
export function drawStructurePreview(canvas, state) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const ratio = window.devicePixelRatio || 1;
  const w = Math.max(1, canvas.clientWidth || 240);
  const h = Math.max(1, canvas.clientHeight || 160);
  canvas.width = Math.round(w * ratio);
  canvas.height = Math.round(h * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.fillStyle = '#0d0d0e';
  ctx.fillRect(0, 0, w, h);

  const { width, height, length } = state.dims;
  const cells = resolveCells(state);
  if (cells.length === 0) return;
  const view = makeView({
    yaw: -0.6,
    pitch: 0.55,
    distance: fitDistance(width, height, length, w, h),
    target: [width / 2, height / 2, length / 2],
    width: w,
    height: h,
  });
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
  const faces = buildFaces(view, cells, height);
  for (const face of faces) {
    ctx.fillStyle = rgb(baseColor(cells[face.cell]), SHADE[face.face]);
    ctx.beginPath();
    ctx.moveTo(face.poly[0], face.poly[1]);
    for (let i = 2; i < face.poly.length; i += 2) ctx.lineTo(face.poly[i], face.poly[i + 1]);
    ctx.closePath();
    ctx.fill();
    if (faces.length < 2500) ctx.stroke();
  }
}
