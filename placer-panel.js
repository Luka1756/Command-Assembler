// @ts-check
import { COMMON_BLOCK_IDS, COMMAND_BLOCK_TYPES, FACINGS, MAX_BLOCK_COMMAND_CHARS, commandBlockType, isCommandBlock, isFacing, normalizeBlockId } from './blocks.js';
import { generate } from './build.js';
import { copyText } from './clipboard.js';
import { button, createStatus, el, formatNumber, input, select } from './dom.js';
import { createHistory } from './history.js';
import { MAX_COMMAND_CHARS, MAX_SCRIPT_CHARS, SPAWN_HEIGHT_MAX, SPAWN_HEIGHT_MIN, isValidSpawnHeight } from './limits.js';
import { parseScript } from './parse.js';
import { CHANNELS, PROFILES, PROFILE_LIST } from './profiles.js';
import { defaultImportMode } from './reader.js';
import { DEFAULT_SCRIPT, DEFAULT_SETTINGS } from './settings.js';
import { loadPlacer, savePlacer } from './storage.js';
import { interpretScript, removeDrawn } from './script-to-structure.js';
import { DEFAULT_PLACEMENT, assessTransfer, generateStructureCommands } from './structure-commands.js';
import { parseStructure, serializeStructure } from './structure-io.js';
import {
  MAX_BLOCKS,
  MAX_DIMENSION,
  cellInfo,
  changeDimensions,
  clearAll,
  countBlocks,
  countEdits,
  createState,
  defaultProps,
  editsOutside,
  parseDimension,
  resetEdits,
  resolveCells,
  restoreCell,
  setCell,
  setProps,
  setRoleBlock,
  setShell,
  validateDimensions,
} from './structure.js';
import { createViewport } from './viewport.js';

/** @typedef {import('./structure.js').StructureState} StructureState */
/** @typedef {import('./structure.js').RoleId} RoleId */
/** @typedef {import('./structure-commands.js').PlacementOptions} PlacementOptions */
/** @typedef {{ x: number, y: number, z: number }} Cell */

const COMMAND_PREVIEW_LINES = 200;

const TOOL_HINTS = /** @type {Record<string, string>} */ ({
  select: 'Select: click a block to inspect it. Nothing is changed.',
  erase: 'Eraser: click a block to remove it.',
  restore: 'Restore default: click an edited block to put its boundary block back.',
  place: 'Place: click a face, or the ground, to add the chosen block there (the dashed outline shows where).',
});

const NON_PLACE_TOOLS = new Set(['select', 'erase', 'restore']);

/** @param {string} text @returns {number} NaN when not a whole number (a leading minus is allowed) */
const parseSigned = (text) => (/^-?\d{1,9}$/.test(text.trim()) ? Number(text.trim()) : NaN);
/** @param {number} n @param {string} noun */
const plural = (n, noun) => `${formatNumber(n)} ${noun}${n === 1 ? '' : 's'}`;

/**
 * The block placer: 3D grid, script preview and generate settings. The structure lives here (with its own
 * undo history and a saved working copy). It reaches the script only when "Add to script" is pressed, which uses
 * the same script, generator and output panel as the rest of the app.
 * @param {HTMLElement} root
 * @param {ReturnType<typeof import('./store.js').createStore>} store
 * @param {{ confirmReplace: () => boolean, confirmAction: (message: string) => boolean, onAdded: () => void }} options
 */
export function initPlacerPanel(root, store, { confirmReplace, confirmAction, onAdded }) {
  const canvas = /** @type {HTMLCanvasElement} */ (el(root, '#pl-canvas'));
  const toolSelect = select(root, '#pl-tool');
  const facingSelect = select(root, '#pl-facing');
  const customWrap = el(root, '#pl-custom-wrap');
  const customInput = input(root, '#pl-custom');
  const toolHint = el(root, '#pl-tool-hint');
  const statusBar = el(root, '#pl-statusbar');
  const undoButton = button(root, '#pl-undo');
  const redoButton = button(root, '#pl-redo');
  const layerInput = input(root, '#pl-layer');
  const layerValue = el(root, '#pl-layer-value');
  const setStatus = createStatus(el(root, '#pl-status'));
  const selX = input(root, '#pl-sel-x');
  const selY = input(root, '#pl-sel-y');
  const selZ = input(root, '#pl-sel-z');
  const selInfo = el(root, '#pl-sel-info');
  const cmdBox = el(root, '#pl-cmd');
  const selFacing = select(root, '#pl-sel-facing');
  const selAuto = input(root, '#pl-sel-auto');
  const selCommand = input(root, '#pl-sel-command');
  const selError = el(root, '#pl-sel-error');
  const replaceButton = button(root, '#pl-replace');
  const eraseButton = button(root, '#pl-erase-sel');
  const restoreButton = button(root, '#pl-restore-sel');
  // settings
  const versionSelect = select(root, '#pl-version');
  const versionHint = el(root, '#pl-version-hint');
  const spawnInput = input(root, '#pl-spawn');
  const spawnError = el(root, '#pl-spawn-error');
  const selfCleanSwitch = button(root, '#pl-selfclean');
  const shellSwitch = button(root, '#pl-shell');
  const copyOnSwitch = button(root, '#pl-copyon');
  const widthInput = input(root, '#pl-width');
  const heightInput = input(root, '#pl-height');
  const lengthInput = input(root, '#pl-length');
  const sizeError = el(root, '#pl-size-error');
  const sizeHint = el(root, '#pl-size-hint');
  const roleInputs = /** @type {Record<RoleId, HTMLInputElement>} */ ({ floor: input(root, '#pl-floor'), wall: input(root, '#pl-wall'), ceiling: input(root, '#pl-ceiling') });
  const roleError = el(root, '#pl-role-error');
  const modeSelect = select(root, '#pl-mode');
  const originInputs = [input(root, '#pl-ox'), input(root, '#pl-oy'), input(root, '#pl-oz')];
  const originError = el(root, '#pl-origin-error');
  const originHint = el(root, '#pl-origin-hint');
  const clearBox = input(root, '#pl-clearbox');
  // script pane
  const summary = el(root, '#pl-summary');
  const warningsList = el(root, '#pl-warnings');
  const commandsTitle = el(root, '#pl-cmds-title');
  const commandsPre = el(root, '#pl-cmds');
  const importSet = el(root, '#pl-import-mode');
  const importAppend = el(root, '#pl-import-append');
  const importReplace = el(root, '#pl-import-replace');
  const importRadios = Array.from(root.querySelectorAll('input[name="pl-import"]'), (r) => /** @type {HTMLInputElement} */ (r));
  const importUpdate = el(root, '#pl-import-update');
  const importUpdateWrap = el(root, '#pl-import-update-wrap');
  const readButton = button(root, '#pl-read');
  const readResult = el(root, '#pl-read-result');
  const readSummary = el(root, '#pl-read-summary');
  const readList = el(root, '#pl-read-list');
  const readLoad = button(root, '#pl-read-load');
  const setReadStatus = createStatus(el(root, '#pl-read-status'));
  const addButton = button(root, '#pl-add');
  const setResult = createStatus(el(root, '#pl-result'));
  const outputBox = el(root, '#pl-output');
  const outputStats = el(root, '#pl-output-stats');
  const copyButton = button(root, '#pl-copy');
  const tabs = Array.from(root.querySelectorAll('.pl-tab'), (t) => /** @type {HTMLButtonElement} */ (t));

  // ---------- state ----------
  const stored = loadPlacer();
  const parsed = stored ? parseStructure(stored.structure) : null;
  const history = createHistory(parsed?.ok ? parsed.state : createState());
  /** @type {PlacementOptions} */
  let gen = parsed?.ok ? parsed.gen : { ...DEFAULT_PLACEMENT, origin: { ...DEFAULT_PLACEMENT.origin } };
  const prefs = {
    copyOnGenerate: stored?.prefs.copyOnGenerate === true,
    tool: typeof stored?.prefs.tool === 'string' ? stored.prefs.tool : 'impulse',
    facing: isFacing(stored?.prefs.facing) ? stored.prefs.facing : 'north',
  };
  /** @type {Cell | null} */
  let selected = null;
  let layerFull = true;
  let layerMax = history.present.dims.height - 1;
  /** @type {string[]} */
  let pendingCommands = [];
  /** @type {import('./types').GenerateResult | null} */
  let lastOutput = null;
  /** Commands read from the script into 3D: lets "Update" replace just those and keep the rest. */
  /** @type {{ drawn: string[], kept: number } | null} */
  let source = null;
  /** @type {import('./script-to-structure.js').Interpretation | null} */
  let reading = null;

  const state = () => history.present;

  const viewport = createViewport(canvas, {
    onClick: (hit) => applyTool(hit),
    onHover: () => {},
  });

  // ---------- helpers ----------
  /** @param {HTMLElement} target @param {string} message */
  function showError(target, message) {
    target.textContent = message;
    target.hidden = message === '';
  }

  const tool = () => toolSelect.value;

  /** The block id and props the current tool places, or null for tools that do not place. */
  function chosenBlock() {
    const t = tool();
    const s = state();
    const type = COMMAND_BLOCK_TYPES.find((c) => c.id === t);
    if (type) return { block: type.block, props: { facing: currentFacing() } };
    if (t === 'floor' || t === 'wall' || t === 'ceiling') return { block: s.roles[t], props: undefined };
    if (t === 'custom') {
      const normalized = normalizeBlockId(customInput.value);
      if (!normalized.ok) {
        setStatus(`Block id: ${normalized.error}`, 'error');
        return null;
      }
      customInput.value = normalized.id;
      return { block: normalized.id, props: isCommandBlock(normalized.id) ? { facing: currentFacing() } : undefined };
    }
    return null;
  }
  const currentFacing = () => (isFacing(facingSelect.value) ? facingSelect.value : 'north');

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
    const s = state();
    widthInput.value = String(s.dims.width);
    heightInput.value = String(s.dims.height);
    lengthInput.value = String(s.dims.length);
    for (const id of /** @type {RoleId[]} */ (['floor', 'wall', 'ceiling'])) roleInputs[id].value = s.roles[id];
    shellSwitch.setAttribute('aria-checked', String(s.shell));
    modeSelect.value = gen.mode;
    originInputs[0].value = String(gen.origin.x);
    originInputs[1].value = String(gen.origin.y);
    originInputs[2].value = String(gen.origin.z);
    clearBox.checked = gen.clearArea;
    showError(sizeError, '');
    showError(roleError, '');
  }

  function describeCell() {
    if (!selected) return 'No block selected. Click a block, or enter coordinates and press Select.';
    const info = cellInfo(state(), selected.x, selected.y, selected.z);
    const where = `(${selected.x}, ${selected.y}, ${selected.z})`;
    const role = info.role ? ` · ${info.role[0].toUpperCase()}${info.role.slice(1)} position` : '';
    if (info.block === null) return `${where} · empty${info.custom ? ` (erased; generated ${info.generated})` : ''}${role}`;
    const type = commandBlockType(info.block);
    const kind = type ? `${type.label}, facing ${info.props?.facing}` : info.block;
    const origin = info.custom ? ` · edited${info.generated ? ` (generated ${info.generated})` : ''}` : ' · generated';
    return `${where} · ${kind}${origin}${role}`;
  }

  function updateStatusBar() {
    const s = state();
    const groundY = gen.mode === 'absolute' ? String(gen.origin.y) : gen.origin.y === 0 ? '~' : `~${gen.origin.y}`;
    statusBar.textContent = [
      plural(countBlocks(s), 'block').toUpperCase(),
      `${s.dims.width}×${s.dims.length} SQUARES`,
      `${s.dims.height} HIGH`,
      'ORIGIN WEST-NORTH CORNER (0,0,0)',
      `GROUND Y ${groundY}`,
    ].join(' · ');
  }

  function updateChrome() {
    const s = state();
    undoButton.disabled = !history.canUndo;
    redoButton.disabled = !history.canRedo;
    const t = tool();
    toolHint.textContent = TOOL_HINTS[NON_PLACE_TOOLS.has(t) ? t : 'place'] ?? '';
    customWrap.hidden = t !== 'custom';
    viewport.setTool(NON_PLACE_TOOLS.has(t) ? t : 'place');
    updateStatusBar();
    sizeHint.textContent = `Each size is 1 to ${MAX_DIMENSION}; at most ${formatNumber(MAX_BLOCKS)} blocks. Changing the size keeps edits that are still inside it and asks before removing any that are not. ${plural(countEdits(s), 'edited block')} now.`;

    selInfo.textContent = describeCell();
    const info = selected ? cellInfo(s, selected.x, selected.y, selected.z) : null;
    if (selected) {
      selX.value = String(selected.x);
      selY.value = String(selected.y);
      selZ.value = String(selected.z);
    }
    const props = info?.props ?? null;
    cmdBox.hidden = props === null;
    if (props) {
      selFacing.value = props.facing;
      selAuto.checked = props.auto;
      if (document.activeElement !== selCommand) selCommand.value = props.command;
    }
    replaceButton.disabled = !selected;
    eraseButton.disabled = !selected;
    restoreButton.disabled = !selected;
    shellSwitch.setAttribute('aria-checked', String(s.shell));
  }

  function refreshScene() {
    viewport.setScene({ dims: state().dims, cells: resolveCells(state()), selected, layerMax });
  }

  let saveTimer = 0;
  let dirty = false;
  const saveNow = () => {
    window.clearTimeout(saveTimer);
    if (!dirty) return;
    dirty = false;
    savePlacer(serializeStructure(state(), gen), { copyOnGenerate: prefs.copyOnGenerate, tool: prefs.tool, facing: prefs.facing });
  };
  function persist() {
    dirty = true;
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(saveNow, 250);
  }
  // A tab closed or hidden right after an edit still keeps it.
  window.addEventListener('pagehide', saveNow);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && saveNow());

  /** The structure changed (or was swapped by undo/redo): redraw everything that depends on it. */
  function stateChanged() {
    normalizeView();
    updateChrome();
    refreshScene();
    scheduleOutput();
    persist();
  }

  /** @param {StructureState} next */
  function commit(next) {
    if (!history.commit(next)) return false;
    stateChanged();
    return true;
  }

  /**
   * @param {{ ok: true, state: StructureState } | { ok: false, error: string }} result
   * @param {string} done
   */
  function commitResult(result, done) {
    if (!result.ok) {
      setStatus(result.error, 'error');
      return false;
    }
    if (commit(result.state)) setStatus(done, 'ok');
    else setStatus('No change: that block already looks like this.', 'info');
    return true;
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
    const t = tool();
    const cell = hit.cell;
    if (t === 'select') {
      if (cell) select_(cell);
      else select_({ x: hit.place.x, y: hit.place.y, z: hit.place.z });
      setStatus('', 'info');
    } else if (t === 'erase') {
      if (!cell) return;
      commitResult(setCell(state(), cell.x, cell.y, cell.z, null), `Erased (${cell.x}, ${cell.y}, ${cell.z}).`);
      select_(cell);
    } else if (t === 'restore') {
      if (!cell) return;
      commitResult(restoreCell(state(), cell.x, cell.y, cell.z), `Restored (${cell.x}, ${cell.y}, ${cell.z}).`);
      select_(cell);
    } else {
      const choice = chosenBlock();
      if (!choice) return;
      const target = hit.place;
      if (!cellInfo(state(), target.x, target.y, target.z).inBounds) {
        const { dims } = state();
        setStatus(`(${target.x}, ${target.y}, ${target.z}) is outside the grid (x 0–${dims.width - 1}, y 0–${dims.height - 1}, z 0–${dims.length - 1}). Increase the size in Settings.`, 'error');
        return;
      }
      if (commitResult(setCell(state(), target.x, target.y, target.z, choice.block, choice.props), `Placed ${commandBlockType(choice.block)?.label ?? choice.block} at (${target.x}, ${target.y}, ${target.z}).`)) {
        select_(target);
      }
    }
  }

  toolSelect.addEventListener('change', () => {
    prefs.tool = toolSelect.value;
    setStatus('', 'info');
    updateChrome();
    persist();
  });
  facingSelect.addEventListener('change', () => {
    prefs.facing = currentFacing();
    persist();
  });
  customInput.addEventListener('change', () => {
    if (tool() === 'custom') chosenBlock();
  });

  replaceButton.addEventListener('click', () => {
    if (!selected) return;
    const choice = chosenBlock();
    if (!choice) {
      if (NON_PLACE_TOOLS.has(tool())) setStatus('Choose a block in the Place list first.', 'info');
      return;
    }
    // Keep facing and command when one command block type is swapped for another.
    const keep = cellInfo(state(), selected.x, selected.y, selected.z).props;
    const props = isCommandBlock(choice.block) ? { ...(keep ?? {}), ...(keep ? {} : choice.props) } : undefined;
    commitResult(setCell(state(), selected.x, selected.y, selected.z, choice.block, props), `Set (${selected.x}, ${selected.y}, ${selected.z}) to ${choice.block}.`);
  });
  eraseButton.addEventListener('click', () => {
    if (!selected) return;
    commitResult(setCell(state(), selected.x, selected.y, selected.z, null), `Erased (${selected.x}, ${selected.y}, ${selected.z}).`);
  });
  restoreButton.addEventListener('click', () => {
    if (!selected) return;
    commitResult(restoreCell(state(), selected.x, selected.y, selected.z), `Restored (${selected.x}, ${selected.y}, ${selected.z}).`);
  });

  button(root, '#pl-clear').addEventListener('click', () => {
    const blocks = countBlocks(state());
    if (blocks === 0) return setStatus('The grid is already empty.', 'info');
    if (!confirmAction(`Clear all? ${plural(blocks, 'block')} will be removed, including the generated boundary. You can undo this.`)) return;
    commit(clearAll(state()));
    setStatus('Cleared. Undo brings the blocks back.', 'ok');
  });

  // Selected command block: facing, flag and command.
  /** @param {Partial<import('./structure.js').CellProps>} change @param {boolean} [quiet] */
  function changeProps(change, quiet = false) {
    if (!selected) return;
    const result = setProps(state(), selected.x, selected.y, selected.z, change);
    if (!result.ok) {
      showError(selError, result.error);
      return;
    }
    showError(selError, '');
    if (commit(result.state) && !quiet) setStatus('Command block updated.', 'ok');
  }
  selFacing.addEventListener('change', () => isFacing(selFacing.value) && changeProps({ facing: selFacing.value }));
  selAuto.addEventListener('change', () => changeProps({ auto: selAuto.checked }));
  selCommand.addEventListener('change', () => changeProps({ command: selCommand.value }));
  selCommand.addEventListener('input', () => {
    selCommand.maxLength = MAX_BLOCK_COMMAND_CHARS;
  });

  button(root, '#pl-sel-go').addEventListener('click', () => {
    const [x, y, z] = [selX, selY, selZ].map((f) => parseSigned(f.value));
    if (![x, y, z].every(Number.isInteger) || !cellInfo(state(), x, y, z).inBounds) {
      const { dims } = state();
      setStatus(`Enter whole numbers inside the grid: x 0–${dims.width - 1}, y 0–${dims.height - 1}, z 0–${dims.length - 1}.`, 'error');
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
    if (event.key === 'Delete' || event.key === 'Backspace') {
      if (selected) eraseButton.click();
      event.preventDefault();
      return;
    }
    if (!(event.ctrlKey || event.metaKey)) return;
    const key = event.key.toLowerCase();
    if (key === 'z' && !event.shiftKey) step('undo');
    else if (key === 'y' || (key === 'z' && event.shiftKey)) step('redo');
    else return;
    event.preventDefault();
  });
  button(root, '#pl-camera').addEventListener('click', () => viewport.resetCamera());

  // ---------- size, roles, shell, layers ----------
  button(root, '#pl-apply').addEventListener('click', () => {
    const dims = { width: parseDimension(widthInput.value), height: parseDimension(heightInput.value), length: parseDimension(lengthInput.value) };
    const valid = validateDimensions(dims);
    if (!valid.ok) return showError(sizeError, valid.error);
    const dropped = editsOutside(state(), dims);
    if (dropped > 0 && !confirmAction(`This size removes ${plural(dropped, 'edited block')} that fall outside it. Continue? You can undo this.`)) return;
    const result = changeDimensions(state(), dims);
    if (!result.ok) return showError(sizeError, result.error);
    showError(sizeError, '');
    const changed = commit(result.state);
    syncInputs();
    if (changed) setStatus(dropped > 0 ? `Size changed. ${plural(dropped, 'edit')} outside the new size removed (Undo brings them back).` : 'Size changed.', 'ok');
  });
  for (const field of [widthInput, heightInput, lengthInput]) {
    field.addEventListener('keydown', (event) => event.key === 'Enter' && button(root, '#pl-apply').click());
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
  shellSwitch.addEventListener('click', () => {
    const next = !state().shell;
    commit(setShell(state(), next));
    setStatus(next ? 'Boundary blocks are included.' : 'Boundary blocks are off: only blocks you place are built.', 'info');
  });
  layerInput.addEventListener('input', () => {
    layerMax = Number(layerInput.value);
    layerFull = layerMax === state().dims.height - 1;
    layerValue.textContent = layerFull ? 'all layers' : `y = ${layerMax}`;
    refreshScene();
  });

  // ---------- generate settings (shared with the assembler) ----------
  for (const channel of CHANNELS) {
    const group = document.createElement('optgroup');
    group.label = channel.label;
    for (const profile of PROFILE_LIST.filter((p) => p.channel === channel.id)) group.append(new Option(profile.label, profile.id));
    if (group.children.length > 0) versionSelect.append(group);
  }
  versionSelect.addEventListener('change', () => store.set({ settings: { ...store.get().settings, version: /** @type {import('./types').VersionId} */ (versionSelect.value) } }));
  spawnInput.addEventListener('input', () => {
    const raw = spawnInput.value.trim();
    store.set({ settings: { ...store.get().settings, spawnHeight: /^\d+$/.test(raw) ? Number(raw) : Number.NaN } });
  });
  selfCleanSwitch.addEventListener('click', () => {
    const settings = store.get().settings;
    store.set({ settings: { ...settings, selfCleaning: !settings.selfCleaning } });
  });
  copyOnSwitch.addEventListener('click', () => {
    prefs.copyOnGenerate = !prefs.copyOnGenerate;
    copyOnSwitch.setAttribute('aria-checked', String(prefs.copyOnGenerate));
    persist();
  });
  button(root, '#pl-reset-settings').addEventListener('click', () => {
    store.set({ settings: { ...DEFAULT_SETTINGS } });
    prefs.copyOnGenerate = false;
    gen = { ...DEFAULT_PLACEMENT, origin: { ...DEFAULT_PLACEMENT.origin } };
    history.commit(setShell(state(), true));
    syncInputs();
    stateChanged();
    setStatus('Settings reset. Your blocks were kept.', 'ok');
  });
  spawnError.textContent = `Enter a whole number from ${SPAWN_HEIGHT_MIN} to ${SPAWN_HEIGHT_MAX}.`;

  function syncSettings() {
    const { settings } = store.get();
    versionSelect.value = settings.version;
    versionHint.textContent = PROFILES[settings.version]?.hint ?? '';
    selfCleanSwitch.setAttribute('aria-checked', String(settings.selfCleaning));
    copyOnSwitch.setAttribute('aria-checked', String(prefs.copyOnGenerate));
    const valid = isValidSpawnHeight(settings.spawnHeight);
    if (valid && spawnInput.value.trim() !== String(settings.spawnHeight)) spawnInput.value = String(settings.spawnHeight);
    spawnInput.setAttribute('aria-invalid', String(!valid));
    spawnError.hidden = valid;
  }

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
  /** @returns {'append' | 'replace' | 'update'} */
  const chosenMode = () => {
    const value = importRadios.find((r) => r.checked)?.value;
    return value === 'append' ? 'append' : value === 'update' && updateAvailable() ? 'update' : 'replace';
  };
  /** How many of the commands read into 3D are still in the script, unchanged. */
  const updatableCount = () => (source ? removeDrawn(store.get().script, source.drawn).removed : 0);
  const updateAvailable = () => updatableCount() > 0;

  /**
   * What adding the pending commands would do to the script, for any of the three modes.
   * @param {'append' | 'replace' | 'update'} mode
   */
  function transfer(mode) {
    const { script, settings } = store.get();
    if (mode === 'update' && source) {
      const base = removeDrawn(script, source.drawn).script;
      return assessTransfer(base, pendingCommands, 'append', settings);
    }
    return assessTransfer(script, pendingCommands, mode === 'append' ? 'append' : 'replace', settings);
  }

  function syncImportMode() {
    const { script } = store.get();
    const existing = existingCommands();
    const canUpdate = updateAvailable();
    importSet.hidden = existing === 0;
    importUpdateWrap.hidden = !canUpdate;
    importAppend.textContent = `Append after the ${plural(existing, 'command')} already in the script`;
    importReplace.textContent = `Replace the current script (${plural(existing, 'command')} will be removed)`;
    importUpdate.textContent = `Update: replace the ${plural(updatableCount(), 'command')} read into 3D and keep the other ${plural(Math.max(0, existing - updatableCount()), 'command')}`;
    const checked = importRadios.find((r) => r.checked);
    if (!checked || existing === 0 || (checked.value === 'update' && !canUpdate)) {
      const wanted = existing === 0 ? 'replace' : canUpdate ? 'update' : defaultImportMode(script, DEFAULT_SCRIPT, existing);
      for (const r of importRadios) r.checked = r.value === wanted;
    }
  }

  function readGen() {
    const values = originInputs.map((f) => parseSigned(f.value));
    return /** @type {PlacementOptions} */ ({ mode: modeSelect.value === 'absolute' ? 'absolute' : 'relative', origin: { x: values[0], y: values[1], z: values[2] }, clearArea: clearBox.checked });
  }

  function refreshOutput() {
    const { settings } = store.get();
    const options = readGen();
    originHint.textContent =
      options.mode === 'relative'
        ? "The structure's west, bottom, north corner is placed this many blocks from the command block minecart that runs the commands. Where that minecart ends up relative to you is not verified in game: build a small structure first. Keep it off the machine's own column (x 0, z 0)."
        : "World coordinates of the structure's west, bottom, north corner. These do not depend on where the machine runs.";
    syncImportMode();

    const result = generateStructureCommands(state(), settings.version, options);
    const originProblem = result.errors.find((e) => e.startsWith('Origin')) ?? null;
    showError(originError, originProblem ?? '');
    for (const f of originInputs) f.toggleAttribute('aria-invalid', originProblem !== null);
    if (!originProblem) {
      gen = options;
      persist();
    }

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

    const assessed = transfer(chosenMode());
    /** @type {string[]} */
    const notes = [...result.warnings];
    let line = `${plural(stats.blocks, 'block')} in ${plural(stats.commands, 'command')} (${formatNumber(stats.chars)} characters).`;
    summary.dataset.kind = 'info';
    if (assessed.tooLongForScript) {
      notes.push(`Adding these would make the script over ${formatNumber(MAX_SCRIPT_CHARS)} characters, which is more than the app accepts. Make the structure simpler.`);
    } else if (assessed.generated.outputLength > MAX_COMMAND_CHARS) {
      notes.push(`With this choice the generated command would be ${formatNumber(assessed.generated.outputLength)} characters, ${formatNumber(assessed.overLimitBy)} over the ${formatNumber(MAX_COMMAND_CHARS)} a command block accepts. You can still add the commands, but Copy stays disabled until the script is shorter. Nothing is cut.`);
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

  addButton.addEventListener('click', async () => {
    if (pendingCommands.length === 0) return;
    const mode = chosenMode();
    const before = existingCommands();
    if (mode === 'replace' && before > 0 && !confirmReplace()) return;
    const { settings } = store.get();
    const assessed = transfer(mode);
    if (assessed.tooLongForScript) return setResult('The script would be too long. Nothing was added.', 'error');
    store.set({ script: assessed.script });
    const added = plural(pendingCommands.length, 'command');
    let message =
      mode === 'append' && before > 0
        ? `Added ${added} after the existing ${plural(before, 'command')}.`
        : mode === 'update'
          ? `Updated the script: ${added} replaced the commands read into 3D. Other commands were kept.`
          : `Added ${added}${before > 0 ? ', replacing the previous script' : ''}.`;
    lastOutput = generate(assessed.script, settings);
    outputBox.hidden = false;
    outputStats.textContent = lastOutput.ok
      ? `Generated command: ${formatNumber(lastOutput.outputLength)} of ${formatNumber(MAX_COMMAND_CHARS)} characters.`
      : `The generated command is not ready: ${lastOutput.diagnostics.find((d) => d.severity === 'error')?.message ?? 'see the output panel in the assembler.'}`;
    copyButton.disabled = !lastOutput.ok;
    if (prefs.copyOnGenerate && lastOutput.ok) {
      message += (await copyText(lastOutput.output)) ? ' The command was copied.' : ' Copying was blocked by the browser; use Copy command.';
    }
    setResult(message, 'ok');
    onAdded();
  });
  copyButton.addEventListener('click', async () => {
    const result = generate(store.get().script, store.get().settings);
    if (!result.ok) return setResult('The command is not ready to copy. Open the assembler to see why.', 'error');
    setResult((await copyText(result.output)) ? 'Command copied to clipboard.' : 'Copying was blocked by the browser. Open the assembler and copy it there.', 'ok');
  });

  // ---------- read the script into 3D ----------
  const STATUS_LABEL = { drawn: 'Drawn', unsupported: 'Not drawn', other: 'Other' };
  readButton.addEventListener('click', () => {
    reading = interpretScript(store.get().script);
    const { counts } = reading;
    readResult.hidden = false;
    readSummary.textContent = reading.error
      ? reading.error
      : `${plural(counts.drawn, 'command')} can be drawn. ${plural(counts.unsupported, 'command')} not drawn (unsupported), ${plural(counts.other, 'other command')} not a block placement. Those stay in the script.`;
    readSummary.dataset.kind = reading.error ? 'error' : 'info';
    readList.replaceChildren(
      ...reading.items.map((item) => {
        const li = document.createElement('li');
        li.dataset.status = item.status;
        const tag = document.createElement('span');
        tag.className = 'pl-read-tag';
        tag.textContent = `Line ${item.line} · ${STATUS_LABEL[item.status]}`;
        const code = document.createElement('code');
        code.textContent = item.text.length > 140 ? `${item.text.slice(0, 140)}…` : item.text;
        li.append(tag, code);
        if (item.reason) {
          const why = document.createElement('span');
          why.className = 'pl-read-why';
          why.textContent = item.reason;
          li.append(why);
        }
        return li;
      }),
    );
    readLoad.disabled = reading.result === null;
  });
  button(root, '#pl-read-cancel').addEventListener('click', () => {
    reading = null;
    readResult.hidden = true;
  });
  readLoad.addEventListener('click', () => {
    if (!reading?.result) return;
    if (countEdits(state()) > 0 && !confirmAction('Load the script into 3D? The current blocks will be replaced. You can undo this.')) return;
    const { result, items, counts } = reading;
    source = { drawn: items.filter((i) => i.status === 'drawn').map((i) => i.text), kept: counts.unsupported + counts.other };
    gen = result.gen;
    selected = null;
    layerFull = true;
    history.commit(result.state);
    // The script now holds the commands that were just read, so updating them in place is the sensible default.
    for (const r of importRadios) r.checked = r.value === 'update';
    syncInputs();
    stateChanged();
    readResult.hidden = true;
    reading = null;
    setReadStatus(`Loaded ${plural(countBlocks(result.state), 'block')} from ${plural(counts.drawn, 'command')}. ${counts.unsupported + counts.other > 0 ? `${plural(counts.unsupported + counts.other, 'command')} were not drawn and stay in the script.` : ''}`, 'ok');
    showPane('3d');
    setStatus('Script loaded into 3D. The script itself was not changed.', 'ok');
  });

  button(root, '#pl-generate').addEventListener('click', () => {
    showPane('script');
    scheduleOutput();
    setResult('Review the commands, choose Append or Replace, then press Add to script.', 'info');
  });

  // ---------- tabs and drawers ----------
  /** @param {string} pane */
  function showPane(pane) {
    for (const tab of tabs) {
      const on = tab.dataset.pane === pane;
      tab.setAttribute('aria-selected', String(on));
      el(root, `#pl-pane-${tab.dataset.pane}`).hidden = !on;
    }
    if (pane === '3d') viewport.redraw();
  }
  for (const tab of tabs) tab.addEventListener('click', () => showPane(tab.dataset.pane ?? '3d'));
  tabs.forEach((tab, i) =>
    tab.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
      const next = tabs[(i + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
      next.focus();
      next.click();
    }),
  );
  /** @param {string} buttonId @param {string} drawerId */
  function drawer(buttonId, drawerId) {
    const b = button(root, buttonId);
    const d = el(root, drawerId);
    b.addEventListener('click', () => {
      d.hidden = !d.hidden;
      b.setAttribute('aria-expanded', String(!d.hidden));
    });
  }
  drawer('#pl-controls-btn', '#pl-controls');
  drawer('#pl-creations-btn', '#pl-creations');

  // ---------- start ----------
  for (const id of COMMON_BLOCK_IDS) {
    const option = document.createElement('option');
    option.value = id;
    el(root, '#pl-blocks').append(option);
  }
  for (const f of FACINGS) {
    facingSelect.add(new Option(f.label, f.id));
    selFacing.add(new Option(f.label, f.id));
  }
  facingSelect.value = prefs.facing;
  toolSelect.value = [...toolSelect.options].some((o) => o.value === prefs.tool) ? prefs.tool : 'impulse';
  customInput.value = 'minecraft:stone';
  syncInputs();
  syncSettings();
  stateChanged();

  return {
    /** Re-evaluate when the script or settings change elsewhere. */
    refresh() {
      syncSettings();
      scheduleOutput();
    },
    /** The structure and placement options, for saving. */
    getDoc: () => ({ state: state(), gen: readGen() }),
    /**
     * Replace the whole structure (opening a saved creation or an import). Recorded in history so it can be undone.
     * @param {StructureState} next
     * @param {PlacementOptions} [options]
     */
    loadDoc(next, options) {
      if (options) gen = { mode: options.mode, origin: { ...options.origin }, clearArea: options.clearArea };
      selected = null;
      layerFull = true;
      history.commit(next);
      syncInputs();
      stateChanged();
    },
    hasWork: () => countEdits(state()) > 0,
    showPane,
    viewport,
    selected: () => selected,
    state,
    setStatus,
  };
}
