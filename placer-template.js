// @ts-check

/** Block placer page skeleton. Static markup only; dynamic text is set with textContent. */
export const PLACER_TEMPLATE = /* html */ `
<section class="placer" id="view-placer" aria-labelledby="placer-title" hidden>
  <div class="pl-top">
    <a class="back-link" href="#/">← Back to assembler</a>
    <h1 class="pl-title" id="placer-title">Block placer</h1>
  </div>

  <div class="pl-pane" id="pl-pane-3d" role="tabpanel" aria-labelledby="pl-tab-3d">
    <div class="pl-bar">
      <label class="e3-field pl-grow"><span class="label">Place</span>
        <select id="pl-tool">
          <optgroup label="Command blocks">
            <option value="impulse">Impulse command block</option>
            <option value="repeat">Repeating command block</option>
            <option value="chain">Chain command block</option>
          </optgroup>
          <optgroup label="Boundary blocks">
            <option value="floor">Floor block</option>
            <option value="wall">Wall block</option>
            <option value="ceiling">Ceiling block</option>
          </optgroup>
          <optgroup label="Other">
            <option value="custom">Other block…</option>
            <option value="select">Select and inspect</option>
            <option value="erase">Eraser</option>
            <option value="restore">Restore default</option>
          </optgroup>
        </select>
      </label>
      <label class="e3-field pl-grow"><span class="label">Default facing</span><select id="pl-facing"></select></label>
      <label class="e3-field pl-grow" id="pl-custom-wrap" hidden><span class="label">Block id</span><input type="text" id="pl-custom" list="pl-blocks" autocomplete="off" spellcheck="false" /></label>
    </div>
    <datalist id="pl-blocks"></datalist>

    <div class="pl-actions">
      <button type="button" class="btn" id="pl-controls-btn" aria-expanded="false" aria-controls="pl-controls">Controls</button>
      <button type="button" class="btn" id="pl-creations-btn" aria-expanded="false" aria-controls="pl-creations">My creations</button>
      <button type="button" class="btn" id="pl-clear">Clear all</button>
      <button type="button" class="btn btn-primary" id="pl-generate">Generate command</button>
    </div>

    <div class="pl-drawer" id="pl-controls" hidden>
      <ul>
        <li><strong>Mouse:</strong> drag to rotate, right-drag or Shift-drag to pan, wheel to zoom, click to use the Place tool.</li>
        <li><strong>Touch:</strong> one finger rotates, pinch zooms, two fingers pan, tap uses the Place tool.</li>
        <li><strong>Keyboard</strong> (view focused): arrows rotate, Shift + arrows pan, + and − zoom, 0 resets the view, Delete erases the selected block, Ctrl+Z undo, Ctrl+Y redo.</li>
        <li><strong>Place</strong> adds the chosen block next to the face you click, or on the ground. <strong>Select and inspect</strong> changes nothing. <strong>Eraser</strong> removes a block. <strong>Restore default</strong> puts a boundary block back.</li>
        <li><strong>Colours:</strong> F floor, W wall, C ceiling, M edited block; I impulse, CH chain, R repeating command block, with an arrow for its facing. The selected block is outlined in yellow.</li>
      </ul>
    </div>

    <div class="pl-drawer" id="pl-creations" hidden>
      <p class="hint">Saved in this browser only. A creation keeps the blocks, size, boundary blocks, placement and build settings.</p>
      <div class="save-row">
        <input type="text" id="pl-save-name" maxlength="60" placeholder="Name this creation" aria-label="Creation name" autocomplete="off" />
        <button type="button" class="btn" id="pl-save">Save current</button>
      </div>
      <label class="e3-check"><input type="checkbox" id="pl-open-script" /> <span>When opening, also restore the script saved with it (replaces the current script)</span></label>
      <ul class="pl-creation-list" id="pl-creation-list"></ul>
      <p class="status" id="pl-creations-status" role="status"></p>
    </div>

    <p class="e3-tool-hint" id="pl-tool-hint" aria-live="polite"></p>
    <div class="e3-canvas-wrap">
      <canvas id="pl-canvas" class="e3-canvas" tabindex="0" role="application" aria-label="3D block placer. Arrow keys rotate, plus and minus zoom, zero resets the view."></canvas>
    </div>
    <p class="pl-statusbar" id="pl-statusbar" aria-live="polite"></p>

    <div class="e3-history" role="group" aria-label="History and view">
      <button type="button" class="btn" id="pl-undo" disabled>Undo</button>
      <button type="button" class="btn" id="pl-redo" disabled>Redo</button>
      <button type="button" class="btn" id="pl-camera">Reset view</button>
    </div>
    <label class="e3-layer"><span>Show layers up to <strong id="pl-layer-value"></strong> <span class="e3-muted">(view only)</span></span><input type="range" id="pl-layer" min="0" max="0" step="1" /></label>
    <p class="status" id="pl-status" role="status"></p>

    <fieldset class="e3-group pl-inspector">
      <legend class="label">Selected block</legend>
      <div class="e3-cell">
        <label class="e3-field"><span>x</span><input type="text" id="pl-sel-x" inputmode="numeric" autocomplete="off" /></label>
        <label class="e3-field"><span>y</span><input type="text" id="pl-sel-y" inputmode="numeric" autocomplete="off" /></label>
        <label class="e3-field"><span>z</span><input type="text" id="pl-sel-z" inputmode="numeric" autocomplete="off" /></label>
        <button type="button" class="btn" id="pl-sel-go">Select</button>
      </div>
      <p class="e3-info" id="pl-sel-info"></p>
      <div class="pl-cmd" id="pl-cmd" hidden>
        <div class="pl-cmd-row">
          <label class="e3-field"><span>Facing</span><select id="pl-sel-facing"></select></label>
          <label class="e3-check"><input type="checkbox" id="pl-sel-auto" /> <span>Always active</span></label>
        </div>
        <label class="e3-field"><span>Command</span><input type="text" id="pl-sel-command" autocomplete="off" spellcheck="false" placeholder="say hello" /></label>
        <p class="field-error" id="pl-sel-error" role="alert" hidden></p>
      </div>
      <div class="e3-actions">
        <button type="button" class="btn" id="pl-replace">Replace with chosen block</button>
        <button type="button" class="btn" id="pl-erase-sel">Erase</button>
        <button type="button" class="btn" id="pl-restore-sel">Restore default</button>
      </div>
    </fieldset>
  </div>

  <div class="pl-pane" id="pl-pane-script" role="tabpanel" aria-labelledby="pl-tab-script" hidden>
    <h2 class="pl-h2">Script</h2>
    <fieldset class="e3-group" id="pl-read-group">
      <legend class="label">Read the script into 3D</legend>
      <p class="hint">Draws the <code>setblock</code> and <code>fill</code> commands in your script. The script is not changed. Other commands stay in the script and are listed below, not drawn.</p>
      <div class="reader-actions"><button type="button" class="btn" id="pl-read">Read script</button></div>
      <div class="pl-read-result" id="pl-read-result" hidden>
        <p class="e3-summary" id="pl-read-summary"></p>
        <ol class="pl-read-list" id="pl-read-list"></ol>
        <div class="reader-actions">
          <button type="button" class="btn btn-primary" id="pl-read-load">Load into 3D</button>
          <button type="button" class="btn" id="pl-read-cancel">Cancel</button>
        </div>
      </div>
      <p class="status" id="pl-read-status" role="status"></p>
    </fieldset>
    <p class="e3-summary" id="pl-summary" aria-live="polite"></p>
    <ul class="e3-notes" id="pl-warnings" hidden></ul>
    <details class="formats" id="pl-cmds-wrap">
      <summary id="pl-cmds-title">Show commands</summary>
      <pre class="e3-cmds" id="pl-cmds" tabindex="0"></pre>
    </details>
    <fieldset class="reader-mode" id="pl-import-mode">
      <legend class="label">Add to script</legend>
      <label><input type="radio" name="pl-import" value="append" /> <span id="pl-import-append"></span></label>
      <label><input type="radio" name="pl-import" value="replace" /> <span id="pl-import-replace"></span></label>
      <label id="pl-import-update-wrap"><input type="radio" name="pl-import" value="update" /> <span id="pl-import-update"></span></label>
    </fieldset>
    <div class="reader-actions">
      <button type="button" class="btn btn-primary" id="pl-add">Add to script</button>
    </div>
    <p class="status" id="pl-result" role="status"></p>
    <div class="pl-output" id="pl-output" hidden>
      <p class="e3-summary" id="pl-output-stats"></p>
      <div class="reader-actions">
        <button type="button" class="btn btn-primary" id="pl-copy">Copy command</button>
        <a class="btn" href="#/" id="pl-open-assembler">Open in assembler</a>
      </div>
    </div>
  </div>

  <div class="pl-pane" id="pl-pane-settings" role="tabpanel" aria-labelledby="pl-tab-settings" hidden>
    <h2 class="pl-h2">Generate settings</h2>
    <div class="field-grid">
      <div class="field">
        <label for="pl-version">Minecraft version</label>
        <select id="pl-version" aria-describedby="pl-version-hint"></select>
        <p class="hint" id="pl-version-hint"></p>
      </div>
      <div class="field">
        <label for="pl-spawn">Spawn height</label>
        <div class="input-suffix">
          <input type="text" id="pl-spawn" inputmode="numeric" autocomplete="off" aria-describedby="pl-spawn-error" />
          <span>blocks above you</span>
        </div>
        <p class="field-error" id="pl-spawn-error" role="alert" hidden></p>
      </div>
    </div>
    <div class="toggle-row">
      <div><div class="toggle-title" id="pl-selfclean-label">Self-cleaning</div><p class="hint" id="pl-selfclean-desc">Remove the temporary rail and minecarts</p></div>
      <button type="button" class="switch" id="pl-selfclean" role="switch" aria-checked="true" aria-labelledby="pl-selfclean-label" aria-describedby="pl-selfclean-desc"><span class="switch-thumb"></span></button>
    </div>
    <div class="toggle-row">
      <div><div class="toggle-title" id="pl-shell-label">Encased command blocks</div><p class="hint" id="pl-shell-desc">Include floor, wall, and ceiling block IDs in the script and 3D build</p></div>
      <button type="button" class="switch" id="pl-shell" role="switch" aria-checked="true" aria-labelledby="pl-shell-label" aria-describedby="pl-shell-desc"><span class="switch-thumb"></span></button>
    </div>
    <div class="toggle-row">
      <div><div class="toggle-title" id="pl-copyon-label">Copy on generate</div><p class="hint" id="pl-copyon-desc">Copy the finished command automatically</p></div>
      <button type="button" class="switch" id="pl-copyon" role="switch" aria-checked="false" aria-labelledby="pl-copyon-label" aria-describedby="pl-copyon-desc"><span class="switch-thumb"></span></button>
    </div>

    <fieldset class="e3-group">
      <legend class="label">Size</legend>
      <div class="e3-size">
        <label class="e3-field"><span>Width (x)</span><input type="text" id="pl-width" inputmode="numeric" autocomplete="off" aria-describedby="pl-size-error" /></label>
        <label class="e3-field"><span>Height (y)</span><input type="text" id="pl-height" inputmode="numeric" autocomplete="off" aria-describedby="pl-size-error" /></label>
        <label class="e3-field"><span>Length (z)</span><input type="text" id="pl-length" inputmode="numeric" autocomplete="off" aria-describedby="pl-size-error" /></label>
        <button type="button" class="btn" id="pl-apply">Apply size</button>
      </div>
      <p class="field-error" id="pl-size-error" role="alert" hidden></p>
      <p class="hint" id="pl-size-hint"></p>
      <details class="formats">
        <summary>Coordinates and rules</summary>
        <ul>
          <li><strong>Size</strong> is the outer size in blocks, boundary included. <strong>Width</strong> runs east–west (x), <strong>Height</strong> up (y), <strong>Length</strong> north–south (z).</li>
          <li><strong>Origin</strong> (0, 0, 0) is the west, bottom, north corner. +x is east, +y is up, +z is south, as in Minecraft.</li>
          <li><strong>Floor</strong> is the bottom layer, <strong>Ceiling</strong> the top layer, <strong>Walls</strong> the four sides between them. Where they meet the priority is Floor, then Ceiling, then Wall. Height 1 is a floor only; height 2 has no walls; width or length 1 gives a single wall column.</li>
          <li>A block you edit stays edited (M) when you change the boundary blocks or the size, as long as its cell is still inside the grid.</li>
        </ul>
      </details>
    </fieldset>

    <fieldset class="e3-group">
      <legend class="label">Boundary blocks</legend>
      <div class="e3-roles">
        <label class="e3-role"><span class="e3-badge" data-role="floor" aria-hidden="true">F</span><span class="e3-role-name">Floor</span><input type="text" id="pl-floor" list="pl-blocks" autocomplete="off" spellcheck="false" /></label>
        <label class="e3-role"><span class="e3-badge" data-role="wall" aria-hidden="true">W</span><span class="e3-role-name">Wall</span><input type="text" id="pl-wall" list="pl-blocks" autocomplete="off" spellcheck="false" /></label>
        <label class="e3-role"><span class="e3-badge" data-role="ceiling" aria-hidden="true">C</span><span class="e3-role-name">Ceiling</span><input type="text" id="pl-ceiling" list="pl-blocks" autocomplete="off" spellcheck="false" /></label>
      </div>
      <p class="field-error" id="pl-role-error" role="alert" hidden></p>
      <p class="hint">Type to search common blocks, or enter any valid id. Ids are checked for form only, not against the game.</p>
    </fieldset>

    <fieldset class="e3-group">
      <legend class="label">Placement</legend>
      <div class="e3-origin">
        <label class="e3-field e3-wide"><span>Coordinates</span>
          <select id="pl-mode">
            <option value="relative">Relative to the machine (~)</option>
            <option value="absolute">Absolute world coordinates</option>
          </select>
        </label>
        <label class="e3-field"><span>Origin x</span><input type="text" id="pl-ox" inputmode="numeric" autocomplete="off" /></label>
        <label class="e3-field"><span>Origin y</span><input type="text" id="pl-oy" inputmode="numeric" autocomplete="off" /></label>
        <label class="e3-field"><span>Origin z</span><input type="text" id="pl-oz" inputmode="numeric" autocomplete="off" /></label>
      </div>
      <p class="field-error" id="pl-origin-error" role="alert" hidden></p>
      <p class="hint" id="pl-origin-hint"></p>
      <label class="e3-check"><input type="checkbox" id="pl-clearbox" /> <span>Fill the whole area with air first, so empty cells really end up empty</span></label>
    </fieldset>

    <div class="panel-foot end"><button type="button" class="link-btn" id="pl-reset-settings">Reset settings</button></div>
  </div>

  <nav class="pl-tabs" role="tablist" aria-label="Block placer sections">
    <button type="button" class="pl-tab" role="tab" id="pl-tab-3d" data-pane="3d" aria-selected="true" aria-controls="pl-pane-3d">3D</button>
    <button type="button" class="pl-tab" role="tab" id="pl-tab-script" data-pane="script" aria-selected="false" aria-controls="pl-pane-script">Script</button>
    <button type="button" class="pl-tab" role="tab" id="pl-tab-settings" data-pane="settings" aria-selected="false" aria-controls="pl-pane-settings">Settings</button>
  </nav>
</section>
`;
