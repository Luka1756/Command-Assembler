// @ts-check

/**
 * Escape text for use inside a double-quoted SNBT string:
 * backslashes first, then double quotes.
 * @param {string} text
 * @returns {string}
 */
export function escapeSnbtString(text) {
  return text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
