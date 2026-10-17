// @ts-check

/** Static page skeleton. It contains no user data; dynamic text is set with textContent. */
export const TEMPLATE = /* html */ `
<div class="shell">
  <header class="topbar">
    <div class="brand">
      <span class="brand-mark" aria-hidden="true">CB</span>
      <span class="brand-name">Command<br /><span>Assembler</span></span>
    </div>
    <span class="status-tag"><span class="dot" aria-hidden="true"></span>One-command tool</span>
  </header>

  <nav class="tabs" aria-label="Sections">
    <div class="tabs-inner">
      <button type="button" class="tab" data-target="script">Script</button>
      <button type="button" class="tab" data-target="reader">Reader</button>
      <button type="button" class="tab" data-target="editor3d">3D</button>
      <button type="button" class="tab" data-target="settings">Settings</button>
    </div>
  </nav>

  <div id="notice-slot"></div>

  <section class="hero">
    <p class="eyebrow">Minecraft Java <span aria-hidden="true">/</span> Command construction</p>
    <h1>Build a command <span class="accent">block machine.</span></h1>
    <p class="lede">Write the commands. Tune the build. Generate a summon command.</p>
  </section>

  <div class="layout">
    <aside class="sidebar" aria-label="Example library">
      <section class="panel" id="library">
        <div class="library-head">
          <span class="icon-box" aria-hidden="true">
            <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2.5" y="2.5" width="11" height="11"/><path d="M5 6h6M5 8h6M5 10h4"/></svg>
          </span>
          <div>
            <h2>Example library</h2>
            <p class="subtle">Start with a working pattern</p>
          </div>
        </div>
        <div class="library-body">
          <div class="source-list" role="group" aria-label="Library source">
            <button type="button" class="source-row" data-source="mine" aria-pressed="false">
              <span>My creations</span><span class="count" id="count-mine">0</span>
            </button>
            <button type="button" class="source-row" data-source="community" aria-pressed="true">
              <span>Community library</span><span class="count" id="count-community">0</span>
            </button>
          </div>
          <div class="load-row">
            <select id="example-select" aria-label="Example"></select>
            <button type="button" class="btn" id="load-example">Load example</button>
          </div>
          <p class="hint" id="example-desc"></p>
          <div id="mine-tools" hidden>
            <div class="save-row">
              <input type="text" id="creation-name" maxlength="60" placeholder="Name this creation" aria-label="Creation name" autocomplete="off" />
              <button type="button" class="btn" id="save-creation">Save current</button>
            </div>
            <button type="button" class="link-btn" id="delete-creation">Delete selected</button>
          </div>
          <p class="status" id="library-status" role="status"></p>
        </div>
      </section>
    </aside>

    <main class="workspace">
      <section class="panel" id="script" aria-labelledby="script-title">
        <div class="panel-head">
          <span class="panel-num" aria-hidden="true">01</span>
          <h2 id="script-title">Command script</h2>
          <span class="live"><span class="dot" aria-hidden="true"></span>Live</span>
          <button type="button" class="collapse" aria-expanded="true" aria-controls="script-body" aria-label="Collapse Command script">−</button>
        </div>
        <div class="panel-body" id="script-body">
          <div class="toolbar">
            <span class="label">One command per line</span>
            <label class="inline-field">
              <span class="label">Wrap</span>
              <select id="wrap" class="compact"><option value="off">Off</option><option value="on">On</option></select>
            </label>
            <span class="keys"><kbd>Ctrl</kbd> <span aria-hidden="true">+</span> <kbd>Enter</kbd> to generate</span>
          </div>
          <div class="editor">
            <div class="gutter" id="gutter" aria-hidden="true"></div>
            <textarea id="code" class="code code-metrics" spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off" wrap="off" aria-label="Command script, one command per line"></textarea>
            <div class="mirror code-metrics" id="mirror" aria-hidden="true"></div>
          </div>
          <div class="panel-foot">
            <span class="stats" id="script-stats"></span>
            <button type="button" class="link-btn" id="import-btn">Import .mcfunction <span aria-hidden="true">↑</span></button>
            <input type="file" id="import-file" accept=".mcfunction,.txt,text/plain" hidden />
          </div>
          <p class="status pad-x" id="script-status" role="status"></p>
        </div>
      </section>

      <section class="panel" id="reader" aria-labelledby="reader-title">
        <div class="panel-head">
          <span class="panel-num" aria-hidden="true">Tool</span>
          <h2 id="reader-title">Command reader</h2>
          <button type="button" class="collapse" aria-expanded="true" aria-controls="reader-body" aria-label="Collapse Command reader">−</button>
        </div>
        <div class="panel-body" id="reader-body">
          <div class="pad reader-form">
            <p class="reader-intro">Paste text that contains <code>Command:"…"</code> fields. The commands are read in order and previewed, and only added to your script when you confirm.</p>
            <details class="formats">
              <summary>Supported input</summary>
              <ul>
                <li>Minecraft NBT text (SNBT), such as <code>{id:command_block_minecart,Command:"say hi"}</code>, including the summon commands this tool generates.</li>
                <li>Output of <code>/data get</code> on command blocks and command block minecarts, where the field is written <code>Command: "say hi"</code>.</li>
                <li>JSON-style <code>{"Command":"say hi"}</code>, with double or single quotes.</li>
                <li><code>Command</code> fields at any depth, with other data around them. The field name is case-sensitive.</li>
              </ul>
              <p>Not supported: binary files (.nbt, .dat, .mcstructure), text that sits inside another quoted string, lowercase <code>command</code> fields such as click events, and commands without a <code>Command</code> field (use Import .mcfunction for those).</p>
            </details>
            <label class="label" for="reader-input">Source text</label>
            <textarea id="reader-input" class="reader-input" rows="7" spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off" placeholder='{id:command_block_minecart,Command:"say hello"}'></textarea>
            <div class="reader-actions">
              <button type="button" class="btn btn-primary" id="reader-read">Read commands</button>
              <button type="button" class="btn" id="reader-clear">Clear</button>
            </div>
            <p class="status" id="reader-status" role="status"></p>
          </div>
          <div class="reader-preview" id="reader-preview" hidden>
            <div class="pad">
              <p class="reader-summary" id="reader-summary"></p>
              <ol class="reader-list" id="reader-list"></ol>
              <details class="reader-notes" id="reader-skipped-wrap" hidden>
                <summary id="reader-skipped-title"></summary>
                <ul id="reader-skipped"></ul>
              </details>
              <details class="reader-notes" id="reader-warnings-wrap" hidden>
                <summary id="reader-warnings-title"></summary>
                <ul id="reader-warnings"></ul>
              </details>
              <fieldset class="reader-mode" id="reader-mode">
                <legend class="label">Add to script</legend>
                <label><input type="radio" name="reader-mode" value="append" /> <span id="reader-mode-append"></span></label>
                <label><input type="radio" name="reader-mode" value="replace" /> <span id="reader-mode-replace"></span></label>
              </fieldset>
              <div class="reader-actions">
                <button type="button" class="btn btn-primary" id="reader-import">Import</button>
                <button type="button" class="btn" id="reader-cancel">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="panel" id="editor3d" aria-labelledby="editor3d-title">
        <div class="panel-head">
          <span class="panel-num" aria-hidden="true">Tool</span>
          <h2 id="editor3d-title">3D structure editor</h2>
          <button type="button" class="collapse" aria-expanded="true" aria-controls="editor3d-body" aria-label="Collapse 3D structure editor">−</button>
        </div>
        <div class="panel-body" id="editor3d-body">
          <div class="pad e3">
            <p class="reader-intro">Set a size, choose the floor, wall and ceiling blocks, edit single blocks, then add the placement commands to your script. The structure is not saved on its own; the commands you add to the script are.</p>
            <details class="formats">
              <summary>Coordinates and rules</summary>
              <ul>
                <li><strong>Size</strong> is the outer size in blocks, boundary included. <strong>Width</strong> runs east–west (x), <strong>Height</strong> up (y), <strong>Length</strong> north–south (z).</li>
                <li><strong>Origin</strong> (0, 0, 0) is the west, bottom, north corner. +x is east, +y is up, +z is south, as in Minecraft.</li>
                <li><strong>Floor</strong> is the bottom layer, <strong>Ceiling</strong> the top layer, <strong>Walls</strong> the four sides between them. The inside is empty.</li>
                <li>Where they meet, the priority is <strong>Floor, then Ceiling, then Wall</strong>. Height 1 is a floor only; height 2 has no walls; width or length 1 gives a single wall column.</li>
                <li>A block you edit stays custom (marked <strong>M</strong>) when you change the floor, wall or ceiling blocks or the size, as long as its cell is still inside the structure. Restore returns it to its generated block.</li>
              </ul>
              <p>Block ids are checked for form only (for example <code>minecraft:glass</code>), not against the game, so a misspelt id passes here and fails in game. Block states such as <code>[facing=north]</code> are not supported.</p>
            </details>

            <fieldset class="e3-group">
              <legend class="label">Size</legend>
              <div class="e3-size">
                <label class="e3-field"><span>Width (x)</span><input type="text" id="e3-width" inputmode="numeric" autocomplete="off" aria-describedby="e3-size-error" /></label>
                <label class="e3-field"><span>Height (y)</span><input type="text" id="e3-height" inputmode="numeric" autocomplete="off" aria-describedby="e3-size-error" /></label>
                <label class="e3-field"><span>Length (z)</span><input type="text" id="e3-length" inputmode="numeric" autocomplete="off" aria-describedby="e3-size-error" /></label>
                <button type="button" class="btn" id="e3-apply">Apply size</button>
              </div>
              <p class="field-error" id="e3-size-error" role="alert" hidden></p>
              <p class="hint" id="e3-size-hint"></p>
            </fieldset>

            <fieldset class="e3-group">
              <legend class="label">Boundary blocks</legend>
              <div class="e3-roles">
                <label class="e3-role"><span class="e3-badge" data-role="floor" aria-hidden="true">F</span><span class="e3-role-name">Floor</span><input type="text" id="e3-floor" list="e3-blocks" autocomplete="off" spellcheck="false" /></label>
                <label class="e3-role"><span class="e3-badge" data-role="wall" aria-hidden="true">W</span><span class="e3-role-name">Wall</span><input type="text" id="e3-wall" list="e3-blocks" autocomplete="off" spellcheck="false" /></label>
                <label class="e3-role"><span class="e3-badge" data-role="ceiling" aria-hidden="true">C</span><span class="e3-role-name">Ceiling</span><input type="text" id="e3-ceiling" list="e3-blocks" autocomplete="off" spellcheck="false" /></label>
              </div>
              <datalist id="e3-blocks"></datalist>
              <p class="field-error" id="e3-role-error" role="alert" hidden></p>
              <p class="hint">Type to search common blocks, or enter any valid id. The list is not complete.</p>
            </fieldset>

            <div class="e3-stage">
              <div class="e3-toolbar" role="toolbar" aria-label="Editor tools">
                <div class="e3-tools" role="group" aria-label="Tool">
                  <button type="button" class="btn e3-tool" data-tool="select" aria-pressed="true">Select</button>
                  <button type="button" class="btn e3-tool" data-tool="place" aria-pressed="false">Place</button>
                  <button type="button" class="btn e3-tool" data-tool="erase" aria-pressed="false">Erase</button>
                  <button type="button" class="btn e3-tool" data-tool="restore" aria-pressed="false">Restore</button>
                </div>
                <div class="e3-history" role="group" aria-label="History and view">
                  <button type="button" class="btn" id="e3-undo" disabled>Undo</button>
                  <button type="button" class="btn" id="e3-redo" disabled>Redo</button>
                  <button type="button" class="btn" id="e3-camera">Reset view</button>
                </div>
              </div>
              <p class="e3-tool-hint" id="e3-tool-hint" aria-live="polite"></p>
              <div class="e3-canvas-wrap">
                <canvas id="e3-canvas" class="e3-canvas" tabindex="0" role="application" aria-label="3D structure viewport. Arrow keys rotate, plus and minus zoom, zero resets the view."></canvas>
              </div>
              <ul class="e3-legend" aria-label="Legend">
                <li><span class="e3-badge" data-role="floor" aria-hidden="true">F</span>Floor</li>
                <li><span class="e3-badge" data-role="wall" aria-hidden="true">W</span>Wall</li>
                <li><span class="e3-badge" data-role="ceiling" aria-hidden="true">C</span>Ceiling</li>
                <li><span class="e3-badge" data-role="custom" aria-hidden="true">M</span>Edited</li>
              </ul>
              <label class="e3-layer"><span>Show layers up to <strong id="e3-layer-value"></strong> <span class="e3-muted">(view only)</span></span><input type="range" id="e3-layer" min="0" max="0" step="1" /></label>
              <details class="formats">
                <summary>Controls</summary>
                <ul>
                  <li><strong>Mouse:</strong> drag to rotate, right-drag or Shift-drag to pan, wheel to zoom, click to use the tool.</li>
                  <li><strong>Touch:</strong> drag with one finger to rotate, pinch to zoom, drag with two fingers to pan, tap to use the tool.</li>
                  <li><strong>Keyboard</strong> (viewport focused): arrow keys rotate, Shift + arrows pan, + and − zoom, 0 resets the view, Ctrl+Z undo, Ctrl+Y redo. Use the cell fields below to select any cell without the mouse.</li>
                </ul>
              </details>
              <p class="e3-stats" id="e3-stats"></p>
              <p class="status" id="e3-status" role="status"></p>
            </div>

            <fieldset class="e3-group">
              <legend class="label">Selected cell</legend>
              <div class="e3-cell">
                <label class="e3-field"><span>x</span><input type="text" id="e3-sel-x" inputmode="numeric" autocomplete="off" /></label>
                <label class="e3-field"><span>y</span><input type="text" id="e3-sel-y" inputmode="numeric" autocomplete="off" /></label>
                <label class="e3-field"><span>z</span><input type="text" id="e3-sel-z" inputmode="numeric" autocomplete="off" /></label>
                <button type="button" class="btn" id="e3-sel-go">Select cell</button>
              </div>
              <p class="e3-info" id="e3-sel-info"></p>
              <label class="e3-place"><span class="label">Block to place or use for Replace</span><input type="text" id="e3-place-block" list="e3-blocks" autocomplete="off" spellcheck="false" /></label>
              <div class="e3-actions">
                <button type="button" class="btn" id="e3-replace">Replace with this block</button>
                <button type="button" class="btn" id="e3-erase-sel">Erase</button>
                <button type="button" class="btn" id="e3-restore-sel">Restore default</button>
                <button type="button" class="link-btn" id="e3-reset-edits">Reset structure</button>
              </div>
            </fieldset>

            <fieldset class="e3-group">
              <legend class="label">Commands</legend>
              <div class="e3-origin">
                <label class="e3-field e3-wide"><span>Coordinates</span>
                  <select id="e3-mode">
                    <option value="relative">Relative to the machine (~)</option>
                    <option value="absolute">Absolute world coordinates</option>
                  </select>
                </label>
                <label class="e3-field"><span>Origin x</span><input type="text" id="e3-ox" inputmode="numeric" autocomplete="off" /></label>
                <label class="e3-field"><span>Origin y</span><input type="text" id="e3-oy" inputmode="numeric" autocomplete="off" /></label>
                <label class="e3-field"><span>Origin z</span><input type="text" id="e3-oz" inputmode="numeric" autocomplete="off" /></label>
              </div>
              <p class="field-error" id="e3-origin-error" role="alert" hidden></p>
              <p class="hint" id="e3-origin-hint"></p>
              <label class="e3-check"><input type="checkbox" id="e3-clear" /> <span>Clear the whole area with air first, so empty cells really end up empty</span></label>
              <p class="e3-summary" id="e3-summary" aria-live="polite"></p>
              <ul class="e3-notes" id="e3-warnings" hidden></ul>
              <details class="formats" id="e3-cmds-wrap">
                <summary id="e3-cmds-title">Show commands</summary>
                <pre class="e3-cmds" id="e3-cmds" tabindex="0"></pre>
              </details>
              <fieldset class="reader-mode" id="e3-import-mode">
                <legend class="label">Add to script</legend>
                <label><input type="radio" name="e3-import" value="append" /> <span id="e3-import-append"></span></label>
                <label><input type="radio" name="e3-import" value="replace" /> <span id="e3-import-replace"></span></label>
              </fieldset>
              <div class="reader-actions">
                <button type="button" class="btn btn-primary" id="e3-add">Add to script</button>
              </div>
              <p class="status" id="e3-result" role="status"></p>
            </fieldset>
          </div>
        </div>
      </section>

      <section class="panel" id="settings" aria-labelledby="settings-title">
        <div class="panel-head">
          <span class="panel-num" aria-hidden="true">02</span>
          <h2 id="settings-title">Build settings</h2>
          <button type="button" class="collapse" aria-expanded="true" aria-controls="settings-body" aria-label="Collapse Build settings">−</button>
        </div>
        <div class="panel-body" id="settings-body">
          <div class="pad">
            <div class="field-grid">
              <div class="field">
                <label for="version">Minecraft version</label>
                <select id="version" aria-describedby="version-hint"></select>
                <p class="hint" id="version-hint"></p>
              </div>
              <div class="field">
                <label for="spawn-height">Spawn height</label>
                <div class="input-suffix">
                  <input type="text" id="spawn-height" inputmode="numeric" autocomplete="off" aria-describedby="height-hint height-error" />
                  <span>blocks above you</span>
                </div>
                <p class="hint" id="height-hint">Relative to the player running the command</p>
                <p class="field-error" id="height-error" role="alert" hidden></p>
              </div>
            </div>
            <p class="hint version-note">Only verified versions are listed. More will be added once their syntax is confirmed.</p>
            <div class="toggle-row">
              <div>
                <div class="toggle-title" id="self-cleaning-label">Self-cleaning</div>
                <p class="hint" id="self-cleaning-desc">Remove the temporary rail and minecarts</p>
              </div>
              <button type="button" class="switch" id="self-cleaning" role="switch" aria-checked="true" aria-labelledby="self-cleaning-label" aria-describedby="self-cleaning-desc"><span class="switch-thumb"></span></button>
            </div>
          </div>
          <div class="panel-foot end">
            <button type="button" class="link-btn" id="reset-settings">Reset settings</button>
          </div>
        </div>
      </section>

      <section class="panel" id="output" aria-labelledby="output-title">
        <div class="panel-head">
          <span class="panel-num" aria-hidden="true">03</span>
          <h2 id="output-title">One command</h2>
          <button type="button" class="collapse" aria-expanded="true" aria-controls="output-body" aria-label="Collapse One command">−</button>
          <div class="panel-meta">
            <span id="stat-chars"></span>
            <span id="stat-max"></span>
            <span id="stat-chain"></span>
          </div>
        </div>
        <div class="panel-body" id="output-body">
          <div class="pad">
            <div class="output-grid">
              <pre class="output" id="output-text" tabindex="0" aria-label="Generated command"></pre>
              <aside class="limits" aria-label="Command length limits">
                <p class="limit" title="The longest command the command block text field accepts, counted in characters.">
                  <span class="limit-label">Max Command Block Length:</span> <strong id="limit-block"></strong>
                </p>
                <p class="limit" title="The largest string NBT can store, counted in bytes rather than characters. It applies to commands set through NBT or data editing, not typed into the block.">
                  <span class="limit-label">Max Edited Command Block Length:</span> <strong id="limit-edited"></strong>
                </p>
                <details class="limits-help">
                  <summary>What these mean</summary>
                  <p><strong>Max Command Block Length</strong> is the longest command the command block text field accepts, in characters. Command Assembler applies it to the generated command.</p>
                  <p><strong>Max Edited Command Block Length</strong> is the largest string NBT can store, in bytes rather than characters. It matters when a command is set through NBT or data editing instead of being typed into the block. Command Assembler never produces commands that long, and whether the game runs commands over 32,500 characters is not verified.</p>
                </details>
              </aside>
            </div>
            <ul class="diagnostics" id="diagnostics" hidden></ul>
          </div>
          <div class="caution">
            <span class="icon-circle" aria-hidden="true">!</span>
            <p>Check the target version and test in a backup world before running.</p>
          </div>
          <div class="pad actions-wrap">
            <div class="actions">
              <button type="button" class="btn" id="share-btn">Share setup <span aria-hidden="true">↗</span></button>
              <button type="button" class="btn btn-primary" id="copy-btn">Copy command</button>
            </div>
            <p class="status" id="output-status" role="status"></p>
            <div id="share-fallback" hidden>
              <label class="label" for="share-link">Share link</label>
              <input type="text" id="share-link" readonly />
            </div>
          </div>
        </div>
      </section>

      <p class="format-note">
        <span class="label">Format note</span>
        Commands ride command-block minecarts on an activator rail. Version ranges change falling-block syntax; long builds may exceed command-length limits.
      </p>
    </main>
  </div>

  <footer class="footer">
    <p>Command Assembler is an independent tool for Minecraft Java Edition. Not affiliated with Mojang Studios or Microsoft.</p>
  </footer>
</div>
`;
