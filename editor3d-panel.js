// @ts-check
import { COMMON_BLOCK_IDS, normalizeBlockId } from './blocks.js';
import { button, createStatus, el, formatNumber, input, select } from './dom.js';
import { createHistory } from './history.js';
import { MAX_COMMAND_CHARS, MAX_SCRIPT_CHARS } from './limits.js';
import { parseScript } from './parse.js';
import { defaultImportMode } from './reader.js';
import { DEFAULT_SCRIPT } from './settings.js';
import { DEFAULT_PLACEMENT, assessTransfer, generateStructureCommands } from './structure-commands.js';
import {
  MAX_BLOCKS,
  MAX_DIMENSION,
  cellInfo,
  changeDimensions,
  countBlocks,
  createState,
  editsOutside,
  parseDimension,
  resetEdits,
  resolveCells,
  restoreCell,
  setCell,
  setRoleBlock,
  validateDimensions,
} from './structure.js';
import { createViewport } from './viewport.js';

/** @typedef {import('./structure.js').StructureState} StructureState */
/** @typedef {import('./structure.js').RoleId} RoleId */
/** @typedef {{ x: number, y: number, z: number }} Cell */

const COMMAND_PREVIEW_LINES = 200;

const TOOL_HINTS = /** @type {Record<string, string>} */ ({
  select: 'Select: click a block to inspect it. Nothing is changed.',
  place: 'Place: click a face of a block to add the chosen block next to it (dashed outline shows where).',
  erase: 'Erase: click a block to remove it.',
  restore: 'Restore: click an edited block to return it to its generated block.',
});

/** @param {string} text @returns {number} NaN when not a whole number (a leading minus is allowed) */
const parseSigned = (text) => (/^-?\d{1,9}$/.test(text.trim()) ? Number(text.trim()) : NaN);

/**
 * @param {number} n
 * @param {string} noun
 */
const plural = (n, noun) => `${formatNumber(n)} ${noun}${n === 1 ? '' : 's'}`;

/**
 * The 3D structure editor panel. The structure lives only in this panel (with its own undo history);
 * it reaches the rest of the app only when "Add to script" is pressed, which uses the same script,
 * generator and output panel as everything else.
 * @param {HTMLElement} root
 * @param {ReturnType<typeof import('./store.js').createStore>} store
 * @param {{ confirmReplace: () => boolean, confirmAction: (message: string) => boolean, onAdded: () => void }} options
 */
export function initEditor3dPanel(root, store, { confirmReplace, confirmAction, onAdded }) {
  const canvas = /** @type {HTMLCanvasElement} */ (el(root, '#e3-canvas'));
  const widthInput = input(root, '#e3-width');
  const heightInput = input(root, '#e3-height');
  const lengthInput = input(root, '#e3-length');
  const sizeError = el(root, '#e3-size-error');
  const sizeHint = el(root, '#e3-size-hint');
  const roleInputs = /** @type {Record<RoleId, HTMLInputElement>} */ ({
    floor: input(root, '#e3-floor'),
    wall: input(root, '#e3-wall'),
    ceiling: input(root, '#e3-ceiling'),
  });
  const roleError = el(root, '#e3-role-error');
  const toolButtons = Array.from(root.querySelectorAll('.e3-tool'), (b) => /** @type {HTMLButtonElement} */ (b));
  const undoButton = button(root, '#e3-undo');
  const redoButton = button(root, '#e3-redo');
  const toolHint = el(root, '#e3-tool-hint');
  const layerInput = input(root, '#e3-layer');
  const layerValue = el(root, '#e3-layer-value');
  const statsLine = el(root, '#e3-stats');
  const selX = input(root, '#e3-sel-x');
  const selY = input(root, '#e3-sel-y');
  const selZ = input(root, '#e3-sel-z');
  const selInfo = el(root, '#e3-sel-info');
  const placeInput = input(root, '#e3-place-block');
  const replaceButton = button(root, '#e3-replace');
  const eraseButton = button(root, '#e3-erase-sel');
  const restoreButton = button(root, '#e3-restore-sel');
  const modeSelect = select(root, '#e3-mode');
  const originInputs = [input(root, '#e3-ox'), input(root, '#e3-oy'), input(root, '#e3-oz')];
  const originError = el(root, '#e3-origin-error');
  const originHint = el(root, '#e3-origin-hint');
  const clearBox = input(root, '#e3-clear');
  const summary = el(root, '#e3-summary');
  const warningsList = el(root, '#e3-warnings');
  const commandsTitle = el(root, '#e3-cmds-title');
  const commandsPre = el(root, '#e3-cmds');
  const importSet = el(root, '#e3-import-mode');
  const importAppend = el(root, '#e3-import-append');
  const importReplace = el(root, '#e3-import-replace');
  const importRadios = Array.from(root.querySelectorAll('input[name="e3-import"]'), (r) => /** @type {HTMLInputElement} */ (r));
  const addButton = button(root, '#e3-add');
  const setStatus = createStatus(el(root, '#e3-status'));
  const setResult = createStatus(el(root, '#e3-result'));

  // ---------- state ----------
  const history = createHistory(createState());
  let tool = 'select';
  /** @type {Cell | null} */
  let selected = null;
  let layerFull = true;
  let layerMax = history.present.dims.height - 1;
  /** @type {string[]} */
  let pendingCommands = [];

  const state = () => history.present;

  const viewport = createViewport(canvas, {
    onClick: (hit) => applyTool(hit),
    onHover: () => {},
  });

  // ---------- helpers ----------
  /**
   * @param {HTMLElement} target
   * @param {string} message
   */
  function showError(target, message) {
    target.textContent = message;
    target.hidden = message === '';
  }

  const sameCell = (/** @type {Cell | null} */ a, /** @type {Cell | null} */ b) => !!a && !!b && a.x === b.x && a.y === b.y && a.z === b.z;

  function normalizeView() {
    const { dims } = state();
    layerInput.max = String(dims.height - 1);
    layerMax = layerFull ? dims.height - 1 : Math.min(layerMax, dims.height - 1);
    layerFull = layerMax === dims.height - 1;
    layerInput.value = String(layerMax);
    layerValue.textContent = layerFull ? 'all layers' : `y = ${layerMax}`;
    if (selected && !cellInfo(state(), selected.x, selected.y, selected.z).inBounds) selected = null;
  }

  function syncInputs() {
    const { dims, roles } = state();
    widthInput.value = String(dims.width);
    heightInput.value = String(dims.height);
    lengthInput.value = String(dims.length);
    for (const id of /** @type {RoleId[]} */ (['floor', 'wall', 'ceiling'])) roleInputs[id].value = roles[id];
    showError(sizeError, '');
    showError(roleError, '');
  }

  function describeCell() {
    if (!selected) return 'No cell selected. Click a block, or enter coordinates and press Select cell.';
    const info = cellInfo(state(), selected.x, selected.y, selected.z);
    const where = `Cell (${selected.x}, ${selected.y}, ${selected.z})`;
    const role = info.role ? ` · ${info.role[0].toUpperCase()}${info.role.slice(1)} position` : ' · inside';
    if (info.block === null) {
      return info.custom ? `${where} · empty (erased; generated ${info.generated})${role}` : `${where} · empty${role}`;
    }
    if (info.custom) return `${where} · ${info.block} · edited${info.generated ? ` (generated ${info.generated})` : ' (placed by hand)'}${role}`;
    return `${where} · ${info.block} · generated${role}`;
  }

  function updateChrome() {
    const s = state();
    undoButton.disabled = !history.canUndo;
    redoButton.disabled = !history.canRedo;
    for (const b of toolButtons) b.setAttribute('aria-pressed', String(b.dataset.tool === tool));
    toolHint.textContent = TOOL_HINTS[tool] ?? '';
    viewport.setTool(tool);

    const blocks = countBlocks(s);
    statsLine.textContent =
      `${s.dims.width} × ${s.dims.height} × ${s.dims.length} · ${plural(blocks, 'block')} (limit ${formatNumber(MAX_BLOCKS)}) · ${plural(s.edits.size, 'edited cell')}`;
    sizeHint.textContent = `Each size is 1 to ${MAX_DIMENSION}. Changing the size keeps edits that are still inside it and asks before removing any that are not.`;

    selInfo.textContent = describeCell();
    if (selected) {
      selX.value = String(selected.x);
      selY.value = String(selected.y);
      selZ.value = String(selected.z);
    }
    replaceButton.disabled = !selected;
    eraseButton.disabled = !selected;
    restoreButton.disabled = !selected;
  }

  function refreshScene() {
    viewport.setScene({ dims: state().dims, cells: resolveCells(state()), selected, layerMax });
  }

  /** The structure changed (or was swapped by undo/redo): redraw everything that depends on it. */
  function stateChanged() {
    normalizeView();
    updateChrome();
    refreshScene();
    scheduleOutput();
  }

  /**
   * @param {StructureState} next
   * @returns {boolean}
   */
  function commit(next) {
    if (!history.commit(next)) return false;
    stateChanged();
    return true;
  }

  /**
   * @param {{ ok: true, state: StructureState } | { ok: false, error: string }} result
   * @param {string} done  status shown on success
   */
  function commitResult(result, done) {
    if (!result.ok) {
      setStatus(result.error, 'error');
      return false;
    }
    if (commit(result.state)) setStatus(done, 'ok');
    else setStatus('No change: that cell already looks like this.', 'info');
    return true;
  }

  /** @returns {string | null} */
  function readPlaceBlock() {
    const normalized = normalizeBlockId(placeInput.value);
    if (!normalized.ok) {
      setStatus(`Block to place: ${normalized.error}`, 'error');
      return null;
    }
    placeInput.value = normalized.id;
    return normalized.id;
  }

  /** @param {Cell} cell */
  function select_(cell) {
    selected = { x: cell.x, y: cell.y, z: cell.z };
    if (cell.y > layerMax) {
      layerMax = cell.y;
      layerFull = layerMax === state().dims.height - 1;
      normalizeView();
    }
    updateChrome();
    refreshScene();
  }

  // ---------- tools ----------
  /** @param {import('./viewport.js').Hit | null} hit */
  function applyTool(hit) {
    if (!hit) return;
    const cell = hit.cell;
    if (tool === 'select') {
      select_(cell);
      setStatus('', 'info');
    } else if (tool === 'place') {
      const block = readPlaceBlock();
      if (!block) return;
      const target = { x: cell.x + hit.normal[0], y: cell.y + hit.normal[1], z: cell.z + hit.normal[2] };
      if (commitResult(setCell(state(), target.x, target.y, target.z, block), `Placed ${block} at (${target.x}, ${target.y}, ${target.z}).`)) {
        if (cellInfo(state(), target.x, target.y, target.z).inBounds) select_(target);
      }
    } else if (tool === 'erase') {
      commitResult(setCell(state(), cell.x, cell.y, cell.z, null), `Erased (${cell.x}, ${cell.y}, ${cell.z}).`);
      select_(cell);
    } else if (tool === 'restore') {
      commitResult(restoreCell(state(), cell.x, cell.y, cell.z), `Restored (${cell.x}, ${cell.y}, ${cell.z}) to its generated block.`);
      select_(cell);
    }
  }

  for (const b of toolButtons) {
    b.addEventListener('click', () => {
      tool = b.dataset.tool ?? 'select';
      setStatus('', 'info');
      updateChrome();
    });
  }

  replaceButton.addEventListener('click', () => {
    if (!selected) return;
    const block = readPlaceBlock();
    if (!block) return;
    commitResult(setCell(state(), selected.x, selected.y, selected.z, block), `Set (${selected.x}, ${selected.y}, ${selected.z}) to ${block}.`);
    updateChrome();
  });
  eraseButton.addEventListener('click', () => {
    if (!selected) return;
    commitResult(setCell(state(), selected.x, selected.y, selected.z, null), `Erased (${selected.x}, ${selected.y}, ${selected.z}).`);
  });
  restoreButton.addEventListener('click', () => {
    if (!selected) return;
    commitResult(restoreCell(state(), selected.x, selected.y, selected.z), `Restored (${selected.x}, ${selected.y}, ${selected.z}) to its generated block.`);
  });

  button(root, '#e3-reset-edits').addEventListener('click', () => {
    const count = state().edits.size;
    if (count === 0) {
      setStatus('There are no edits to reset.', 'info');
      return;
    }
    if (!confirmAction(`Reset the structure? ${plural(count, 'edited cell')} will be discarded. You can undo this.`)) return;
    commit(resetEdits(state()));
    setStatus(`Structure reset. ${plural(count, 'edit')} discarded (Undo brings them back).`, 'ok');
  });

  button(root, '#e3-sel-go').addEventListener('click', () => {
    const [x, y, z] = [selX, selY, selZ].map((f) => parseSigned(f.value));
    if (![x, y, z].every(Number.isInteger) || !cellInfo(state(), x, y, z).inBounds) {
      const { dims } = state();
      setStatus(`Enter whole numbers inside the structure: x 0–${dims.width - 1}, y 0–${dims.height - 1}, z 0–${dims.length - 1}.`, 'error');
      return;
    }
    setStatus('', 'info');
    select_({ x, y, z });
  });

  // ---------- history ----------
  /** @param {'undo' | 'redo'} which */
  function step(which) {
    if (which === 'undo' ? !history.canUndo : !history.canRedo) return;
    if (which === 'undo') history.undo();
    else history.redo();
    syncInputs();
    stateChanged();
    setStatus(which === 'undo' ? 'Undone.' : 'Redone.', 'info');
  }
  undoButton.addEventListener('click', () => step('undo'));
  redoButton.addEventListener('click', () => step('redo'));
  canvas.addEventListener('keydown', (event) => {
    if (!(event.ctrlKey || event.metaKey)) return;
    const key = event.key.toLowerCase();
    if (key === 'z' && !event.shiftKey) step('undo');
    else if (key === 'y' || (key === 'z' && event.shiftKey)) step('redo');
    else return;
    event.preventDefault();
  });
  button(root, '#e3-camera').addEventListener('click', () => viewport.resetCamera());

  // ---------- size, roles, layers ----------
  button(root, '#e3-apply').addEventListener('click', () => {
    const dims = { width: parseDimension(widthInput.value), height: parseDimension(heightInput.value), length: parseDimension(lengthInput.value) };
    const valid = validateDimensions(dims);
    if (!valid.ok) {
      showError(sizeError, valid.error);
      return;
    }
    const dropped = editsOutside(state(), dims);
    if (dropped > 0 && !confirmAction(`This size removes ${plural(dropped, 'edited cell')} that fall outside it. Continue? You can undo this.`)) return;
    const result = changeDimensions(state(), dims);
    if (!result.ok) {
      showError(sizeError, result.error);
      return;
    }
    showError(sizeError, '');
    const changed = commit(result.state);
    syncInputs();
    if (changed) {
      setStatus(
        dropped > 0
          ? `Size changed. ${plural(dropped, 'edit')} outside the new size removed (Undo brings them back).`
          : state().edits.size > 0
            ? 'Size changed. Your edits were kept.'
            : 'Size changed.',
        'ok',
      );
    }
  });
  for (const field of [widthInput, heightInput, lengthInput]) {
    field.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') button(root, '#e3-apply').click();
    });
  }

  for (const id of /** @type {RoleId[]} */ (['floor', 'wall', 'ceiling'])) {
    roleInputs[id].addEventListener('change', () => {
      const result = setRoleBlock(state(), id, roleInputs[id].value);
      if (!result.ok) {
        showError(roleError, `${id[0].toUpperCase()}${id.slice(1)}: ${result.error}`);
        roleInputs[id].setAttribute('aria-invalid', 'true');
        return;
      }
      roleInputs[id].removeAttribute('aria-invalid');
      showError(roleError, '');
      roleInputs[id].value = result.state.roles[id];
      commit(result.state);
    });
  }

  layerInput.addEventListener('input', () => {
    layerMax = Number(layerInput.value);
    layerFull = layerMax === state().dims.height - 1;
    layerValue.textContent = layerFull ? 'all layers' : `y = ${layerMax}`;
    refreshScene();
  });

  // ---------- commands and transfer ----------
  let outputQueued = false;
  function scheduleOutput() {
    if (outputQueued) return;
    outputQueued = true;
    requestAnimationFrame(() => {
      outputQueued = false;
      refreshOutput();
    });
  }

  const existingCommands = () => parseScript(store.get().script).commands.length;
  /** @returns {'append' | 'replace'} */
  const chosenMode = () => (importRadios.find((r) => r.checked)?.value === 'append' ? 'append' : 'replace');

  function syncImportMode() {
    const { script } = store.get();
    const existing = existingCommands();
    importSet.hidden = existing === 0;
    importAppend.textContent = `Append after the ${plural(existing, 'command')} already in the script`;
    importReplace.textContent = `Replace the current script (${plural(existing, 'command')} will be removed)`;
    if (!importRadios.some((r) => r.checked) || existing === 0) {
      const wanted = existing === 0 ? 'replace' : defaultImportMode(script, DEFAULT_SCRIPT, existing);
      for (const r of importRadios) r.checked = r.value === wanted;
    }
  }

  function readOrigin() {
    const values = originInputs.map((f) => parseSigned(f.value));
    return { x: values[0], y: values[1], z: values[2] };
  }

  function refreshOutput() {
    const { script, settings } = store.get();
    const relative = modeSelect.value === 'relative';
    originHint.textContent = relative
      ? 'The corner of the structure (west, bottom, north) is placed this many blocks from the command block minecart that runs the commands. Where that minecart ends up relative to you is not verified in game: build a small structure first. Keep it off the machine\'s own column (x 0, z 0).'
      : 'World coordinates of the structure\'s west, bottom, north corner. These do not depend on where the machine runs.';
    syncImportMode();

    /** @type {import('./structure-commands.js').PlacementOptions} */
    const options = { mode: relative ? 'relative' : 'absolute', origin: readOrigin(), clearArea: clearBox.checked };
    const result = generateStructureCommands(state(), settings.version, options);
    const originProblem = result.errors.find((e) => e.startsWith('Origin')) ?? null;
    showError(originError, originProblem ?? '');
    for (const f of originInputs) f.toggleAttribute('aria-invalid', originProblem !== null);

    pendingCommands = result.ok ? result.commands : [];
    warningsList.replaceChildren();
    commandsPre.textContent = '';

    if (!result.ok) {
      summary.textContent = result.errors.filter((e) => !e.startsWith('Origin')).join(' ');
      summary.dataset.kind = 'error';
      commandsTitle.textContent = 'Show commands';
      warningsList.hidden = true;
      addButton.disabled = true;
      return;
    }

    const { stats } = result;
    const lines = result.commands.slice(0, COMMAND_PREVIEW_LINES);
    commandsPre.textContent = lines.join('\n') + (result.commands.length > lines.length ? `\n… and ${formatNumber(result.commands.length - lines.length)} more` : '');
    commandsTitle.textContent = `Show commands (${formatNumber(stats.commands)})`;

    const assessed = assessTransfer(script, result.commands, chosenMode(), settings);
    /** @type {string[]} */
    const notes = [...result.warnings];
    let line = `${plural(stats.blocks, 'block')} in ${plural(stats.commands, 'command')} (${formatNumber(stats.chars)} characters).`;
    summary.dataset.kind = 'info';
    if (assessed.tooLongForScript) {
      notes.push(`Adding these would make the script over ${formatNumber(MAX_SCRIPT_CHARS)} characters, which is more than the app accepts. Make the structure simpler, for example fewer scattered edits.`);
    } else if (assessed.generated.outputLength > MAX_COMMAND_CHARS) {
      notes.push(
        `With this choice the generated command would be ${formatNumber(assessed.generated.outputLength)} characters, ${formatNumber(assessed.overLimitBy)} over the ${formatNumber(MAX_COMMAND_CHARS)} a command block accepts. You can still add the commands, but Copy stays disabled until the script is shorter. Nothing is cut.`,
      );
    } else if (assessed.generated.ok) {
      line += ` The generated command would be ${formatNumber(assessed.generated.outputLength)} of ${formatNumber(MAX_COMMAND_CHARS)} characters.`;
    }
    summary.textContent = line;
    warningsList.replaceChildren(
      ...notes.map((note) => {
        const li = document.createElement('li');
        li.textContent = note;
        return li;
      }),
    );
    warningsList.hidden = notes.length === 0;
    addButton.disabled = assessed.tooLongForScript || originProblem !== null;
  }

  for (const f of [...originInputs, clearBox, modeSelect, ...importRadios]) f.addEventListener('change', scheduleOutput);
  for (const f of originInputs) f.addEventListener('input', scheduleOutput);

  addButton.addEventListener('click', () => {
    if (pendingCommands.length === 0) return;
    const mode = chosenMode();
    const before = existingCommands();
    if (mode === 'replace' && before > 0 && !confirmReplace()) return;
    const { script, settings } = store.get();
    const assessed = assessTransfer(script, pendingCommands, mode, settings);
    if (assessed.tooLongForScript) {
      setResult('The script would be too long. Nothing was added.', 'error');
      return;
    }
    store.set({ script: assessed.script });
    const added = plural(pendingCommands.length, 'command');
    setResult(
      mode === 'append' && before > 0
        ? `Added ${added} after the existing ${plural(before, 'command')}.`
        : `Added ${added}${before > 0 ? ', replacing the previous script' : ''}.`,
      'ok',
    );
    onAdded();
  });

  // ---------- start ----------
  for (const id of COMMON_BLOCK_IDS) {
    const option = document.createElement('option');
    option.value = id;
    el(root, '#e3-blocks').append(option);
  }
  placeInput.value = 'minecraft:stone';
  modeSelect.value = DEFAULT_PLACEMENT.mode;
  originInputs[0].value = String(DEFAULT_PLACEMENT.origin.x);
  originInputs[1].value = String(DEFAULT_PLACEMENT.origin.y);
  originInputs[2].value = String(DEFAULT_PLACEMENT.origin.z);
  clearBox.checked = DEFAULT_PLACEMENT.clearArea;
  syncInputs();
  stateChanged();

  return {
    /** Re-evaluate the output when the script or settings change elsewhere. */
    refresh: scheduleOutput,
    /** Test and diagnostic access; the page does not use these. */
    viewport,
    selected: () => selected,
    sameCell,
  };
}
