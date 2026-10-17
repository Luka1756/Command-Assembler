# 3D structure editor: specification

The editor is implemented (the **3D** tab). This file records the rules it follows, the choices made where the brief left a gap, and what is and is not verified. The code that owns each rule is named so the two can be compared.

## Purpose

Lay out a room, edit single blocks, and add the placement commands to the script. The commands go through the same script, generator and output panel as everything else; the editor never writes to the output panel directly.

## Coordinate system (`structure.js`)

- A structure is **Width × Height × Length** blocks. These are **outer** sizes: they include the boundary layers.
- Cells are `(x, y, z)`, each counted from 0. **Origin (0, 0, 0)** is the **west, bottom, north** corner.
- **+x is east** (Width, east–west), **+y is up** (Height), **+z is south** (Length, north–south), as in Minecraft.
- A block at `(x, y, z)` is placed at the chosen origin plus `(x, y, z)`.

## Boundary roles

| Role | Label | Default block | Where |
| --- | --- | --- | --- |
| Floor | F | `minecraft:bedrock` | `y = 0`, every x and z |
| Ceiling | C | `minecraft:bedrock` | `y = Height-1`, every x and z |
| Wall | W | `minecraft:glass` | `x = 0`, `x = Width-1`, `z = 0`, `z = Length-1`, for the layers between floor and ceiling |

The inside is empty. Each role has one block, chosen from a searchable list of common ids or typed as any validly formed id.

**Corner and edge priority: Floor > Ceiling > Wall.** The floor and ceiling layers are always complete; walls fill the space between them. The displayed structure and the generated commands both come from the same resolved cell list (`resolveCells`), so they cannot disagree.

**Small sizes** follow from those rules:

| Size | Result |
| --- | --- |
| 1 × 1 × 1 | one floor block |
| Height 1 | floor only (the ceiling would be the same layer, and the floor wins) |
| Height 2 | floor and ceiling, no wall layers |
| Width or Length 1 | the two opposite walls are the same column: one wall column |

## Limits

| Limit | Value | Why |
| --- | --- | --- |
| Each dimension | 1 to 48 | keeps drawing and command size usable |
| Blocks in a structure (generated plus hand-placed) | 16,000 | bounds memory, drawing cost and command length; the largest 48 × 48 × 48 shell has 13,256 |
| Fill volume | 32,768 | the default `commandModificationBlockLimit` per the Minecraft Wiki; **not tested in game**. Every generated box is far below it, and the optional clear-area fill is split to stay under it |
| Origin | whole numbers within ±30,000,000 | |

Invalid sizes and over-limit placements produce a message, never a silent clamp.

## Editing (`structure.js`, `history.js`, `editor3d-panel.js`)

- Edits are overrides on top of the generated structure, keyed by cell: a block id, or `null` for erased.
- **Tools:** Select (inspect only), Place (adds the chosen block against the clicked face), Erase, Restore. **Replace** and **Erase** are also buttons for the selected cell, so everything works without a pointer. Select-by-coordinates reaches any cell, including empty ones.
- An edit is **custom** (shown as **M**) and **stays custom** when the F/W/C blocks change, and when the size changes while its cell is still inside. An edit that returns a cell to its generated block is removed.
- **Resizing** keeps in-range edits at the same coordinates (the origin corner is fixed). If edits would fall outside, the user is asked first, and the count is shown.
- **Reset structure** discards every edit after confirmation.
- **Undo/redo** covers every change, including size, role blocks and resets, because each history entry is a complete state. Limited to 100 steps. Not persisted.
- Block ids are checked for **form** only (lowercase `namespace:path`, no block states, NBT or tags; air is refused, use Erase). They are **not** checked against the game's block list.

## Appearance

Blocks are neutral and light: floor light grey, wall warm white, ceiling mid grey, edited blocks pale yellow. Each block carries its letter (F, W, C, or M for edited) when it is large enough to read. Roles differ by tone and by letter, never by green or cyan. Hover and selection use the yellow accent. A grid at `y = 0` and an X/Y/Z indicator give spatial reference. A view-only **layer slider** hides upper layers so the inside can be reached; it never changes the structure or the commands.

## Rendering (`projection.js`, `viewport.js`)

Plain canvas 2D with an orthographic projection written for this project. No library. Faces are drawn back to front; only faces toward the viewer and not covered by a neighbour are drawn. Picking uses the drawn faces, and a test checks it against an exact ray cast.

Controls: mouse drag rotates, right-drag or Shift-drag pans, wheel zooms; touch uses one finger to rotate, a pinch to zoom, two fingers to pan; keyboard (viewport focused) uses arrows to rotate, Shift+arrows to pan, + and − to zoom, 0 to reset, Ctrl+Z / Ctrl+Y for history.

## Commands (`structure-commands.js`)

- Blocks are cut into boxes of one block id, greedily, in a fixed scan order (y, then z, then x; each box grows along x, then z, then y). A filled floor is one `fill`; a lone block is a `setblock`. Each cell belongs to exactly one box, so nothing is placed twice, and the result does not depend on the order edits were made.
- **Empty cells and erased blocks are not placed.** The optional **Clear the area first** writes `fill … air` over the whole bounding box before placing, so empty cells really end up empty; it is off by default because it removes whatever was already there.
- **Coordinates:** *relative* writes `~` offsets from the command block minecart that runs the commands; *absolute* writes world coordinates. Relative placement depends on where the minecart sits relative to the player, which is **not verified in game**; test a small structure first. A warning is shown if the structure overlaps the machine's own column (relative x 0, z 0, y −3 to 1), which self-cleaning clears.
- **Version profiles:** the `setblock`/`fill` text comes from the selected profile (`profile.placement`). Both listed profiles use the same syntax; a profile that differs supplies its own functions.
- **Length:** the commands are merged into the script exactly as a user would type them, and the existing generator reports the result. If the generated machine would exceed 32,500 characters the user is warned and the commands are **not truncated**; Copy stays disabled by the existing rule until the script is shorter. A script over 200,000 characters (the app's existing cap) cannot be added.
- **Transfer:** explicit **Append** or **Replace**. Append keeps every existing command first, in order. Replace asks for confirmation when the script holds unsaved work. Nothing changes until **Add to script** is pressed.

## Storage and sharing

The structure is **not** saved and is **not** in share links. Large structures would overload `localStorage` and the URL, and the existing limits were not designed for them. The commands added to the script are saved and shared like any other script. A structure cannot be re-opened from those commands.

## Not verified / not done

- Nothing generated here was run in Minecraft. Placement syntax (`setblock`, `fill`) is the same as in every release since 1.13 but was not tested in the listed versions.
- Where the machine's minecart lands relative to the player, and so what relative coordinates mean in practice.
- The fill limit of 32,768, taken from the Wiki.
- Block ids are not checked against the game; the picker list is a set of common blocks, not a registry.
- Not built: block states, copy/paste of regions, importing existing structures, multiple rooms, doors or windows, a saved structure format.
