// @ts-check
import { MAX_COMMAND_CHARS, SPAWN_HEIGHT_MAX, SPAWN_HEIGHT_MIN, isValidSpawnHeight } from './limits.js';
import { parseScript } from './parse.js';
import { PROFILES } from './profiles.js';

/** @typedef {import('./types').BuildSettings} BuildSettings */
/** @typedef {import('./types').Diagnostic} Diagnostic */
/** @typedef {import('./types').GenerateResult} GenerateResult */
/** @typedef {import('./types').MachinePart} MachinePart */

/**
 * Chain blocks are counted from the generated structure. The minecart machine
 * uses none, so this is 0 unless a profile emits chain_block parts.
 * @param {MachinePart[]} parts
 */
export function countChainBlocks(parts) {
  return parts.filter((part) => part.kind === 'chain_block').length;
}

/**
 * Validate the script and settings and produce the one-command output.
 * Nothing is generated while any error is present.
 * @param {string} script
 * @param {BuildSettings} settings
 * @returns {GenerateResult}
 */
export function generate(script, settings) {
  /** @type {Diagnostic[]} */
  const diagnostics = [];

  const profile = Object.hasOwn(PROFILES, settings.version) ? PROFILES[settings.version] : undefined;
  if (!profile) {
    diagnostics.push({ severity: 'error', message: `Unsupported Minecraft version "${settings.version}".` });
  }
  if (!isValidSpawnHeight(settings.spawnHeight)) {
    diagnostics.push({
      severity: 'error',
      message: `Spawn height must be a whole number from ${SPAWN_HEIGHT_MIN} to ${SPAWN_HEIGHT_MAX}.`,
    });
  }

  const parsed = parseScript(script);
  diagnostics.push(...parsed.diagnostics);

  const commandCount = parsed.commands.length;
  const commandChars = parsed.commands.reduce((total, command) => total + command.text.length, 0);

  if (commandCount === 0 && !diagnostics.some((d) => d.severity === 'error')) {
    diagnostics.push({
      severity: 'error',
      message: 'Add at least one command. Blank lines and lines starting with # are ignored.',
    });
  }

  /** @type {GenerateResult} */
  const failed = {
    output: '',
    ok: false,
    diagnostics,
    commandCount,
    commandChars,
    outputLength: 0,
    chainBlocks: 0,
    profileId: profile ? profile.id : null,
  };
  if (!profile || diagnostics.some((d) => d.severity === 'error')) return failed;

  const parts = profile.buildParts(
    parsed.commands.map((command) => command.text),
    settings,
  );
  const output = profile.render(parts, settings);
  const chainBlocks = countChainBlocks(parts);

  if (output.length > MAX_COMMAND_CHARS) {
    diagnostics.push({
      severity: 'error',
      message:
        `The generated command is ${output.length.toLocaleString('en-US')} characters, over the ` +
        `${MAX_COMMAND_CHARS.toLocaleString('en-US')} a command block accepts. ` +
        `Shorten the script by at least ${(output.length - MAX_COMMAND_CHARS).toLocaleString('en-US')} characters.`,
    });
    return { ...failed, output, outputLength: output.length, chainBlocks };
  }

  return {
    output,
    ok: true,
    diagnostics,
    commandCount,
    commandChars,
    outputLength: output.length,
    chainBlocks,
    profileId: profile.id,
  };
}
