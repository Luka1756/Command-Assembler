// @ts-check

/** @typedef {import('./types').Diagnostic} Diagnostic */
/** @typedef {import('./types').ParsedScript} ParsedScript */
/** @typedef {import('./types').ScriptCommand} ScriptCommand */

// Control characters other than tab cannot be carried inside a command string.
const CONTROL_CHARS = /[\u0000-\u0008\u000b-\u001f\u007f]/;

/**
 * Turn script text into commands.
 * - one command per line, surrounding whitespace trimmed
 * - blank lines and lines starting with "#" are ignored (mcfunction comments)
 * - a single leading "/" is removed
 * @param {string} script
 * @returns {ParsedScript}
 */
export function parseScript(script) {
  /** @type {ScriptCommand[]} */
  const commands = [];
  /** @type {Diagnostic[]} */
  const diagnostics = [];
  const lines = script.split(/\r\n|\r|\n/);

  lines.forEach((raw, index) => {
    const line = index + 1;
    let text = raw.trim();
    if (text === '' || text.startsWith('#')) return;

    if (text.startsWith('/')) {
      text = text.slice(1).trimStart();
      if (text === '') {
        diagnostics.push({ severity: 'error', line, message: 'The line contains only "/". Add a command after it.' });
        return;
      }
    }

    if (CONTROL_CHARS.test(text)) {
      diagnostics.push({
        severity: 'error',
        line,
        message: 'The line contains a control character that cannot be used in a command.',
      });
      return;
    }

    if (text.endsWith('\\')) {
      diagnostics.push({
        severity: 'warning',
        line,
        message: 'The line ends with a backslash. Line continuation is not supported; the command is used as written.',
      });
    }

    commands.push({ line, text });
  });

  return { commands, diagnostics };
}
