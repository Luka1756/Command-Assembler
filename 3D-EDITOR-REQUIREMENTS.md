# Block placer — specification

Route `#/placer`. Perspective 3D editor (orbit camera, FOV 50°) that builds a structure and generates placement commands for the script.

## Coordinates
Origin (0,0,0) = west, bottom, north corner. +x east, +y up, +z south. Dimensions 1–48 each (outer size). Max 16,000 blocks.

## Shell
Roles F/W/C default `minecraft:bedrock` / `minecraft:glass` / `minecraft:bedrock`. Priority Floor > Ceiling > Wall. "Encased command blocks" switches the shell off. Edits (custom block or erase) override the shell and persist through resizing; shrinking that would drop edits asks first.

## Command blocks
Impulse `command_block`, Chain `chain_command_block`, Repeat `repeating_command_block`. Fields: facing (up/down/north/south/east/west), command (≤ 32,500 chars, no line breaks), Always active. Defaults: impulse off, chain/repeat on.
Output: `setblock <pos> <id>[facing=<dir>]{Command:"…",auto:1}` (`auto` omitted when off). Command blocks are emitted individually after merged `fill`/`setblock` boxes. Empty commands produce a warning.

## Generation
Relative (`~`) or absolute coordinates; optional clear-area. Over-length output warns; nothing is truncated. Transfer to script: append, replace or update (removes previously generated lines).

## Reading commands into 3D
`setblock` and `fill` (with replace/keep/hollow/outline handled as implemented in `script-to-structure.js`) become blocks; others are listed as unsupported/other. Limits: 48 span, 16,000 blocks, fill 32,768. Existing `Command:"…"` reading (Reader tab) is unchanged.

## Storage and formats
- localStorage: `command-assembler:workspace:v1`, `:creations:v1` (optional `structure`), `:placer:v1`, `:submitted:v1`.
- Structure format v1: see `structure-io.js` (strict validation).
- Share links: plain `#setup=<base64url JSON>` or `#setup=z1.<base64url(deflate-raw)>`; structures are not included.
- Community: static `community.json` `{v:1, entries:[]}`; submissions are `command-assembler-submission` v1 JSON; ids = SHA-256 content hash (first 16 hex).

## Verified vs unverified
Verified by automated tests/browser runs: geometry, ordering, picking vs ray cast, command generation (simulator), round-trips, migration, validation.
**Not verified in Minecraft:** `[facing=…]` state, relative coordinate meaning, fill limit 32,768 (from the Wiki), block ids (checked for form only).
