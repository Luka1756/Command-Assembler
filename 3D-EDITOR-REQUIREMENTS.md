# 3D editor: requirements (not implemented)

This document records what a future 3D editor must do. **Nothing here is built.** There is no 3D tab, placeholder, or control in the app. Items marked **Proposal** are my suggested rules where the request left a gap; they need a decision before implementation.

## Purpose

Let the user lay out a room (or similar structure) in 3D and generate the placement commands for it, instead of writing `setblock`/`fill` lines by hand. The generated commands feed the existing script, so the current generator is unchanged.

## Block roles

| Role | Label | Default block |
| --- | --- | --- |
| Floor | `F` | `minecraft:bedrock` |
| Wall | `W` | `minecraft:glass` |
| Ceiling | `C` | `minecraft:bedrock` |

- Each role has exactly one selectable block. Defaults apply on first open and after a reset.
- The block choice is a block id (`minecraft:…`). Invalid or unknown ids must be rejected with a message, not silently replaced. Block-state properties are out of scope for the first version.

## Appearance

- Blocks are drawn simple and white or light neutral. No textures.
- Every block shows its role letter (`F`, `W`, `C`) as a label.
- Roles must be distinguishable **without relying on green or cyan** (and not by colour alone). Use the letter label, plus a neutral/yellow-family tint or outline difference between roles (for example: floor = solid light grey, wall = lighter with a yellow edge, ceiling = mid grey). The project's no-green, no-cyan rule applies.
- Selected role and selected block must be visible at a glance.

## Generated commands must match the layout

- The commands come from the same data the 3D view draws. There must be one layout model, and both the view and the generator read it. The view must never be a separate copy.
- **Test idea (required when built):** for a set of layouts, apply the generated commands to a simple in-memory voxel grid and assert the grid equals the layout block for block. Include the small and overlapping cases below.
- Output is one command per line, ready for the script editor, subject to the existing limits (32,500 characters per command, the chain budget).

## Overlapping boundaries (**Proposal**)

Where the floor, wall and ceiling share a coordinate (corners and edges), one block can only have one role. Proposed precedence, highest first:

1. Floor
2. Ceiling
3. Wall

So the bottom and top layers are always complete, and walls fill the space between them. The 3D view and the generated commands must both use this order. The rule must be stated in the interface where the user can see it.

## Small dimensions (**Proposal**)

Let the interior be `width × height × depth` in blocks, where height counts the layers between floor and ceiling.

| Case | Behaviour |
| --- | --- |
| Any dimension below 1 | Rejected with a message. Nothing is generated. |
| Height 0 | Floor and ceiling touch; the ceiling layer is dropped and the floor wins (see precedence). The user is told. |
| Width or depth 1 | Walls on both sides coincide; one wall column is generated. |
| Very large totals | The existing length limits apply; the user is told when output is too long, as the generator does today. |

## Non-goals for the first version

- Importing existing builds, copy/paste of regions, undo history beyond one step, multiple rooms, doors or windows, block-state properties.

## Open questions

- Whether the editor should expose the layout origin (relative `~ ~ ~` versus absolute coordinates).
- Whether roles beyond F, W and C are wanted.
- Whether the precedence proposal matches what the author of the original tool expects.
