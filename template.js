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
