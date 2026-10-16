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

The `*.test.js` files cover escaping, parsing, validation, limits, share-link encoding and every bundled example. One test pins the generator to the output in the reference screenshot (`say Hello, world!` → exactly the screenshot's command, 382 characters).

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

generator.test.js, share.test.js, examples.test.js   tests
```

### Script format

One command per line. Blank lines and lines starting with `#` are ignored (so `.mcfunction` files import cleanly). A single leading `/` is removed. Nothing is generated while any line has an error, and the Copy button stays disabled.

### Limits

- Output is limited to **32,500** characters, the most a command block accepts. Over that, the app shows an error and disables Copy.
- The chain-block counter shows `N / 65,536` (the default `maxCommandChainLength`). `N` is counted from the generated structure; this machine uses none, so it is `0`.
- Spawn height accepts whole numbers from 0 to 255 (my choice of bounds; the reference does not state any).

### Sharing and storage

- **Share setup** copies a link with the script and build settings encoded in the URL fragment (`#setup=…`). The fragment is never sent to a server. Anyone with the link can read the script, so do not put secrets in scripts you share.
- Links are validated on open; damaged or unsupported links show an error and are ignored.
- Your working script, settings and **My creations** are stored in this browser's `localStorage` only.

## Verified vs assumed

| Item | Status |
| --- | --- |
| Output structure and exact text for `26.3+`, spawn height 1, self-cleaning on | **Verified** against the reference screenshot (including its 382-character count) |
| Character limit 32,500 and chain-block budget 65,536 | Labels **verified** from the screenshot; their meaning (command-block text limit, default `maxCommandChainLength`) is my reading |
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

- **3D tab and 3D block placer** (out of scope for the first release).
- **Other Minecraft versions.** Only `26.3+` is listed because it is the only profile with a verified sample. Older versions use different falling-block syntax that was not provided. To add one: add a profile in `profiles.js` and a fixture test with a verified sample output.
- **The second toggle in Build settings.** It is hidden behind the tab strip in the screenshots, so its name and behaviour are unknown.
- **Community submissions, accounts, any backend.**

## Adding examples

Append an object to `examples.js` (`id`, `category`, `title`, `description`, `script`). `examples.test.js` checks it generates cleanly.

## Fonts

The interface uses system font stacks. The reference's typefaces could not be confirmed, so none are bundled. To use a specific font, add it with an `@font-face` rule and update `--font-sans` / `--font-mono` in `tokens.css`.

## Notes

Not affiliated with Mojang Studios or Microsoft. No licence file is included; add one before publishing if you want others to reuse the code.
