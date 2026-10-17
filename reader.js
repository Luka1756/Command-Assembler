// @ts-check
import { MAX_COMMAND_CHARS } from './limits.js';
import { KNOWN_CLEANUP_COMMANDS } from './profiles.js';

/** @typedef {import('./types').ReadResult} ReadResult */
/** @typedef {import('./types').ReadCommand} ReadCommand */
/** @typedef {import('./types').ReadIssue} ReadIssue */

/**
 * Command Reader: pull `Command` field values out of pasted Minecraft data.
 *
 * Supported: SNBT / JSON-style text where a field is written Command:"..." (or 'Command':'...').
 * The text is tokenised, not matched with a regular expression, so a quoted string is always
 * read as one unit. That is what keeps a Command:"..." that sits inside another command's
 * string from being read as a second command.
 *
 * Not supported: binary NBT, text that is itself inside a quoted string (escaped copies),
 * and fields other than the exact, case-sensitive key "Command".
 */

export const MAX_SOURCE_CHARS = 1_000_000;

const WORD_CHAR = /[A-Za-z0-9_.+-]/;
// Same rule as the script parser: control characters other than tab cannot be part of a command.
const CONTROL_CHARS = /[\u0000-\u0008\u000b-\u001f\u007f]/;

/**
 * @typedef {object} Token
 * @property {'{'|'}'|'['|']'|':'|','|'word'|'string'|'other'|'unterminated'} type
 * @property {number} pos  offset of the first character
 * @property {string} [text]  word text
 * @property {string} [raw]  string contents between the quotes, escapes not yet decoded
 */

/**
 * @param {string} source
 * @returns {Token[]}
 */
function tokenize(source) {
  /** @type {Token[]} */
  const tokens = [];
  const n = source.length;
  let i = 0;

  while (i < n) {
    const ch = source[i];

    if (/\s/.test(ch)) {
      i++;
    } else if (ch === '{' || ch === '}' || ch === '[' || ch === ']' || ch === ':' || ch === ',') {
      tokens.push({ type: ch, pos: i });
      i++;
    } else if (ch === '"' || ch === "'") {
      // An apostrophe right after a word character is prose ("don't"), not a string start.
      if (ch === "'" && i > 0 && WORD_CHAR.test(source[i - 1])) {
        tokens.push({ type: 'other', pos: i });
        i++;
        continue;
      }
      let j = i + 1;
      let closed = false;
      while (j < n) {
        const c = source[j];
        if (c === '\\') {
          j += 2;
          continue;
        }
        if (c === ch) {
          closed = true;
          break;
        }
        j++;
      }
      if (!closed) {
        tokens.push({ type: 'unterminated', pos: i });
        break;
      }
      tokens.push({ type: 'string', pos: i, raw: source.slice(i + 1, j) });
      i = j + 1;
    } else if (WORD_CHAR.test(ch)) {
      let j = i + 1;
      while (j < n && WORD_CHAR.test(source[j])) j++;
      tokens.push({ type: 'word', pos: i, text: source.slice(i, j) });
      i = j;
    } else {
      tokens.push({ type: 'other', pos: i });
      i++;
    }
  }
  return tokens;
}

/**
 * Decode the escapes of an SNBT / JSON string body. Unknown or malformed escapes are kept
 * exactly as written and reported, never dropped.
 * @param {string} raw
 * @returns {{ value: string, warnings: string[] }}
 */
export function decodeString(raw) {
  let value = '';
  /** @type {string[]} */
  const warnings = [];

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch !== '\\') {
      value += ch;
      continue;
    }
    const next = raw[i + 1];
    if (next === undefined) {
      value += '\\';
      continue;
    }
    i++;
    switch (next) {
      case '\\':
      case '"':
      case "'":
      case '/':
        value += next;
        break;
      case 'n':
        value += '\n';
        break;
      case 'r':
        value += '\r';
        break;
      case 't':
        value += '\t';
        break;
      case 'b':
        value += '\b';
        break;
      case 'f':
        value += '\f';
        break;
      case 's':
        value += ' ';
        break;
      case 'x':
      case 'u':
      case 'U': {
        const length = next === 'x' ? 2 : next === 'u' ? 4 : 8;
        const hex = raw.slice(i + 1, i + 1 + length);
        const codePoint = /^[0-9a-fA-F]+$/.test(hex) && hex.length === length ? parseInt(hex, 16) : -1;
        if (codePoint >= 0 && codePoint <= 0x10ffff) {
          value += String.fromCodePoint(codePoint);
          i += length;
        } else {
          warnings.push(`The escape \\${next}${hex} is not valid and was kept as written.`);
          value += `\\${next}`;
        }
        break;
      }
      default:
        warnings.push(`The escape \\${next} is not recognised and was kept as written.`);
        value += `\\${next}`;
    }
  }
  return { value, warnings };
}

/**
 * @param {string} source
 * @param {Token} value
 */
function describeBadValue(source, value) {
  if (value.type === ',' || value.type === '}' || value.type === ']') return 'The Command field has no value.';
  if (value.type === '{' || value.type === '[') return 'The Command value is a compound or list, not a string.';
  if (source[value.pos] === '\\') {
    return 'The value starts with a backslash, so the text looks like it sits inside another quoted string. Paste the unescaped source instead.';
  }
  const found = source.slice(value.pos, value.pos + 24).replace(/\s+/g, ' ');
  return `The Command value is not a quoted string (found "${found}").`;
}

/**
 * Read every `Command` field from pasted text, in the order they appear.
 * @param {string} source
 * @returns {ReadResult}
 */
export function readCommands(source) {
  /** @type {ReadResult} */
  const result = { commands: [], skipped: [], warnings: [], error: null };

  if (typeof source !== 'string' || source.trim() === '') {
    result.error = 'Nothing to read. Paste text that contains Command:"…" fields.';
    return result;
  }
  if (source.length > MAX_SOURCE_CHARS) {
    result.error = `The text is too long to read (over ${MAX_SOURCE_CHARS.toLocaleString('en-US')} characters).`;
    return result;
  }

  /** @type {number[]} */
  const newlines = [];
  for (let i = source.indexOf('\n'); i !== -1; i = source.indexOf('\n', i + 1)) newlines.push(i);
  /** @param {number} pos */
  const lineAt = (pos) => {
    let low = 0;
    let high = newlines.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (newlines[mid] < pos) low = mid + 1;
      else high = mid;
    }
    return low + 1;
  };

  const tokens = tokenize(source);
  /** @type {number[]} */
  const cleanupLines = [];

  for (let t = 0; t < tokens.length; t++) {
    const token = tokens[t];
    const isKey = (token.type === 'word' && token.text === 'Command') || (token.type === 'string' && token.raw === 'Command');
    if (!isKey || tokens[t + 1]?.type !== ':') continue;

    const line = lineAt(token.pos);
    const value = tokens[t + 2];

    if (!value) {
      result.skipped.push({ line, message: 'The Command field has no value.' });
      continue;
    }
    if (value.type === 'unterminated') {
      result.skipped.push({ line, message: 'The string is never closed (a closing quote is missing).' });
      break;
    }
    if (value.type !== 'string') {
      result.skipped.push({ line, message: describeBadValue(source, value) });
      continue;
    }

    t += 2; // the string belongs to this field; do not look inside it
    const decoded = decodeString(value.raw ?? '');
    for (const message of decoded.warnings) result.warnings.push({ line, message });
    const text = decoded.value;

    if (text.trim() === '') {
      result.skipped.push({ line, message: 'The Command field is empty.' });
    } else if (/[\r\n]/.test(text)) {
      result.skipped.push({ line, message: 'The command contains a line break, which a one-command-per-line script cannot hold.' });
    } else if (CONTROL_CHARS.test(text)) {
      result.skipped.push({ line, message: 'The command contains a control character that cannot be used in a script.' });
    } else if (text.trim().startsWith('#')) {
      result.skipped.push({ line, message: 'The command starts with #, which the script treats as a comment, so it would be lost.' });
    } else {
      result.commands.push({ text, line });
      if (text.length > MAX_COMMAND_CHARS) {
        result.warnings.push({
          line,
          message: `The command is ${text.length.toLocaleString('en-US')} characters, over the ${MAX_COMMAND_CHARS.toLocaleString('en-US')} a command block accepts.`,
        });
      }
      if (KNOWN_CLEANUP_COMMANDS.has(text)) cleanupLines.push(line);
    }
  }

  if (cleanupLines.length > 0) {
    result.warnings.push({
      line: cleanupLines[0],
      message:
        `${cleanupLines.length} command${cleanupLines.length === 1 ? ' matches' : 's match'} the cleanup commands that Self-cleaning adds. ` +
        'If Self-cleaning is on they will be added again, so remove them from the script if you do not want duplicates.',
    });
  }

  return result;
}

/**
 * Combine read commands with the current script. Order is preserved; nothing is rewritten.
 * @param {string} script
 * @param {ReadCommand[]} commands
 * @param {'append' | 'replace'} mode
 * @returns {string}
 */
export function mergeIntoScript(script, commands, mode) {
  const block = commands.map((command) => command.text).join('\n');
  if (mode === 'replace' || script.trim() === '') return block;
  return `${script.replace(/\n+$/, '')}\n${block}`;
}

/**
 * Append when the script already holds work of its own; replace when it is empty or untouched.
 * @param {string} script
 * @param {string} defaultScript
 * @param {number} existingCommands
 * @returns {'append' | 'replace'}
 */
export function defaultImportMode(script, defaultScript, existingCommands) {
  if (existingCommands === 0 || script.trim() === defaultScript.trim()) return 'replace';
  return 'append';
}
