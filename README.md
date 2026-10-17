# Command Assembler

An independent remake of Command Assembler, a Minecraft Java Edition tool. You write a list of commands, tune a few build settings, and it generates **one command** that, when pasted into a command block, builds a machine that runs your commands.

Static site, no build step, no runtime dependencies, no network requests. Everything runs in the browser.

## Run it

The page uses ES modules, so it must be served over HTTP (opening `index.html` by double-click will not work).

```sh
npm start            # python3 -m http.server 8080, then open http://localhost:8080
# or any static server, e.g.  npx serve .
```

## Deploy

There is nothing to build. Upload the repository as-is to any static host.

- **GitHub Pages:** Settings → Pages → *Deploy from a branch* → `main` / `(root)`.
- **Netlify, Vercel, Cloudflare Pages:** import the repo, leave the build command empty, publish directory `.`.

All asset paths are relative, so it also works from a sub-path such as `https://user.github.io/command-assembler/`.

## Test

```sh
npm test             # Node's built-in test runner (Node 20+), no install needed
npm install && npm run check   # optional: type-checks the JSDoc types with TypeScript
```

The `*.test.js` files cover escaping, parsing, validation, limits, share-link encoding, the version profiles, the Command Reader, the 3D editor's geometry, editing, history and command generation, the viewport's projection and picking, and every bundled example. One test pins the generator to the output in the reference screenshot (`say Hello, world!` → exactly the screenshot's command, 382 characters).

**Not tested automatically:** the generated command running inside Minecraft. See *Verified vs assumed*.

## How it works

The output is a single `summon falling_block` command. The falling block carries an activator rail and one `command_block_minecart` per script line as passengers, so the commands run in order from one pasted command. With **self-cleaning** on, two final minecarts remove the machine.

All files live in one directory (the repository root). Every path in `index.html` and every `import` is `./name`.

```
index.html, main.js       page and entry point
tokens.css, base.css, components.css   styles (colours are in tokens.css)

parse.js, escape.js, profiles.js (per-version syntax), build.js, limits.js   generator: pure logic, no DOM
settings.js (defaults + validation), store.js, storage.js (localStorage), share.js (link encoding)   state
examples.js              bundled example library
app.js, template.js, editor.js, library.js, settings-panel.js, output-panel.js, chrome.js, dom.js, clipboard.js   UI
types.d.ts               shared types (checked via JSDoc)

reader.js (Command Reader parser), reader-panel.js (its UI)   Command Reader
blocks.js, structure.js (model), history.js, structure-commands.js, projection.js (3D maths), viewport.js (canvas), editor3d-panel.js   3D structure editor

generator.test.js, share.test.js, examples.test.js, reader.test.js, structure.test.js, structure-commands.test.js, projection.test.js   tests
3D-EDITOR-REQUIREMENTS.md   specification of the 3D editor (rules, choices, what is unverified)
```

### Script format

One command per line. Blank lines and lines starting with `#` are ignored (so `.mcfunction` files import cleanly). A single leading `/` is removed. Nothing is generated while any line has an error, and the Copy button stays disabled.

### Version profiles

| Profile | Channel | Notes |
| --- | --- | --- |
| `26.3+` | Release | Verified against the reference screenshot. |
| `26.4 Snapshot 4` (`26.4-snapshot-4`) | Snapshot | Reuses the `26.3+` syntax. The official snapshot notes and the wiki list no change to the falling-block, `summon`, `setblock` or `fill` syntax used here. **Not tested in game.** Snapshots can change before release, and I did not find Mojang or the wiki calling Snapshot 4 the final snapshot, so the app does not say that. |

The version picker groups profiles by channel, and the selected profile is the one the generator uses. Adding another profile means one entry in `profiles.js` plus a test.

### Limits

- Output is limited to **32,500** characters, the most a command block accepts. Over that, the app shows an error and disables Copy.
- Beside the output, two labels show **Max Command Block Length: 32,500** and **Max Edited Command Block Length: 65,535**. 32,500 is the limit the app enforces. 65,535 is the largest string NBT can store (counted in bytes); it is **not documented as a command-block limit**, so the app does not enforce it. The "What these mean" note beside the labels says the same.
- The chain-block counter shows `N / 65,536` (the default `maxCommandChainLength`). `N` is counted from the generated structure; this machine uses none, so it is `0`.
- Spawn height accepts whole numbers from 0 to 255 (my choice of bounds; the reference does not state any).

### Command Reader

The **Reader** tab pulls `Command` fields out of pasted text and imports them into the script.

1. Paste text and press **Read commands** (or Ctrl+Enter).
2. The preview shows how many commands were found, how many entries were skipped (with the line and reason) and any warnings.
3. Choose **Append** (after the existing commands) or **Replace** (the script is replaced, with a confirmation if it holds unsaved work), then **Import**, or **Cancel**. Nothing changes until Import.

**Supported input** (pasted text only):

- SNBT such as `Command:"say hi"` and `Command:'say hi'`, including the output of `/data get`.
- JSON-style keys: `"Command":"say hi"`.
- Item or block-entity data that contains a `Command` field, and lines pasted one per line.
- The summon command this tool generates (the nested `Command:\"…\"` inside the setblock cleanup minecart is not read as an extra command).

**How it reads:** the text is tokenised, so a quoted string is one unit and a `Command:"…"` written inside another string is never mistaken for a field. Only the exact, case-sensitive key `Command` is read; `CustomName`, `LastOutput`, `command`, `Command2` and similar are ignored. Escapes `\\ \" \' \/ \n \r \t \b \f \s \xHH \uHHHH \UHHHHHHHH` are decoded; an unknown escape is kept as written and reported.

**Skipped, with a reason:** an empty value, a command containing a line break or control character (a script holds one command per line), a command starting with `#` (the script treats it as a comment), a value that is not a quoted string, and an unterminated string. Commands over 32,500 characters import with a warning. Commands matching the cleanup commands that Self-cleaning adds also give a warning, so you can avoid duplicates.

**Known limitations:** it does not read binary NBT, `.nbt` or `.mcstructure` files, world files or uploads; it does not claim to support every Minecraft data format; text that is itself inside a quoted string (an escaped copy) is explained and skipped; input over 1,000,000 characters is refused; the preview lists the first 300 commands but imports all of them.

### 3D structure editor

The **3D** tab builds a room and generates its placement commands. Full rules are in `3D-EDITOR-REQUIREMENTS.md`; in short:

- **Size:** Width (x, east–west) × Height (y, up) × Length (z, north–south), 1 to 48 each, outer size including the boundary. Origin (0, 0, 0) is the west, bottom, north corner; +x east, +y up, +z south.
- **Boundary blocks:** Floor (F, default `minecraft:bedrock`), Wall (W, `minecraft:glass`), Ceiling (C, `minecraft:bedrock`), each changeable. Where they meet the priority is **Floor, then Ceiling, then Wall**.
- **Editing:** Select, Place, Erase and Restore tools, a cell inspector with coordinates, per-cell restore, reset, and undo/redo. Edited blocks stay custom when the size or the F/W/C blocks change.
- **Viewport:** plain canvas, no library. Drag to rotate, wheel or pinch to zoom, right-drag, Shift-drag or two fingers to pan, keyboard controls, a reset button, a grid and an axis indicator.
- **Commands:** the edited structure (not just the size) becomes `fill` and `setblock` commands in a fixed order, merged so a floor is one command. Choose relative (`~`) or absolute coordinates. **Add to script** appends to or replaces the script, explicitly; the existing generator and output panel then show the machine and its length. Over-length results are warned about, never truncated.
- **Limits:** 16,000 blocks per structure, 48 per dimension.
- **Not saved:** the structure is not stored and not in share links; the commands you add to the script are.

Known limitations: nothing was run in Minecraft; relative coordinates depend on where the machine's minecart ends up, which is unverified, so test a small structure (or use absolute coordinates); block ids are checked for form, not against the game; block states are not supported; the picker list is not a full registry.

### Sharing and storage

- **Share setup** copies a link with the script and build settings encoded in the URL fragment (`#setup=…`). The fragment is never sent to a server. Anyone with the link can read the script, so do not put secrets in scripts you share.
- Links are validated on open; damaged or unsupported links show an error and are ignored.
- Your working script, settings and **My creations** are stored in this browser's `localStorage` only.

## Verified vs assumed

| Item | Status |
| --- | --- |
| Output structure and exact text for `26.3+`, spawn height 1, self-cleaning on | **Verified** against the reference screenshot (including its 382-character count) |
| Character limit 32,500 and chain-block budget 65,536 | Labels **verified** from the screenshot; their meaning (command-block text limit, default `maxCommandChainLength`) is my reading |
| "Max Edited Command Block Length: 65,535" | Shown as requested. 65,535 matches the NBT string limit in bytes; **not documented** as a command-block limit and not enforced |
| `26.4-snapshot-4` profile id and syntax | Id and the absence of relevant syntax changes **checked against official notes**; **not tested in game**; not confirmed as the final snapshot |
| Command Reader | Behaviour covered by automated tests on pasted text; **not tested** against a real `/data get` in game |
| 3D editor geometry, priority rule, edits, history, command generation | Covered by automated tests, including a simulator that applies the generated commands to a block grid and compares it with the structure |
| 3D editor picking and projection | Tested against an exact ray cast; mouse, touch, pinch and keyboard exercised in a real browser |
| Generated structure commands working in game | **Not tested** (no Minecraft available here) |
| Relative `~` coordinates meaning "this far from the player" | **Not verified**: they are relative to the command block minecart, whose position relative to the player was not confirmed |
| Fill limit 32,768 | From the Minecraft Wiki (default `commandModificationBlockLimit`); **not tested** in game |
| Cleanup depth `fill … ~-3 …` | Copied from one sample; **not known** whether the original varies it |
| Spawn height maps to the `~N` in the summon | Inferred from one sample (height 1 → `~1`) |
| Self-cleaning off = omit the two cleanup minecarts | **Assumed** from the setting's description |
| Output working in-game | **Not tested** (no Minecraft available here); test in a backup world |
| Tabs (Script, Settings) scroll to their section | **Assumed**; the reference shows only the tab strip |
| "Live" means the output updates as you type; Ctrl+Enter jumps to the output | **Assumed** |
| Example library: "My creations" and "Community library" as two sources feeding one dropdown | **Assumed** from the layout |
| The **Save current** / **Delete selected** controls for My creations | **Added**; the reference does not show how creations are made |
| Example scripts | Written for this project; they generate cleanly, but are **not run in-game** |

## Deliberately left out

- **3D editor extras:** block states, copy/paste, importing structures, saved structures or share links for structures.
- **Other Minecraft versions.** Only `26.3+` and the `26.4 Snapshot 4` profile are listed; `26.3+` is the only one with a verified sample. Older versions use different falling-block syntax that was not provided. To add one: add a profile in `profiles.js` and a fixture test with a verified sample output.
- **The second toggle in Build settings.** It is hidden behind the tab strip in the screenshots, so its name and behaviour are unknown.
- **Community submissions, accounts, any backend.**

## Adding examples

Append an object to `examples.js` (`id`, `category`, `title`, `description`, `script`). `examples.test.js` checks it generates cleanly.

## Fonts

The interface uses system font stacks. The reference's typefaces could not be confirmed, so none are bundled. To use a specific font, add it with an `@font-face` rule and update `--font-sans` / `--font-mono` in `tokens.css`.

## Notes

Not affiliated with Mojang Studios or Microsoft. No licence file is included; add one before publishing if you want others to reuse the code.
