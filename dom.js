// @ts-check

/**
 * @param {ParentNode} root
 * @param {string} selector
 * @returns {Element}
 */
function query(root, selector) {
  const element = root.querySelector(selector);
  if (!element) throw new Error(`Missing element: ${selector}`);
  return element;
}

/** @param {ParentNode} root @param {string} selector */
export const el = (root, selector) => /** @type {HTMLElement} */ (query(root, selector));
/** @param {ParentNode} root @param {string} selector */
export const button = (root, selector) => /** @type {HTMLButtonElement} */ (query(root, selector));
/** @param {ParentNode} root @param {string} selector */
export const input = (root, selector) => /** @type {HTMLInputElement} */ (query(root, selector));
/** @param {ParentNode} root @param {string} selector */
export const select = (root, selector) => /** @type {HTMLSelectElement} */ (query(root, selector));
/** @param {ParentNode} root @param {string} selector */
export const textarea = (root, selector) => /** @type {HTMLTextAreaElement} */ (query(root, selector));

/** @param {number} n */
export const formatNumber = (n) => n.toLocaleString('en-US');

/**
 * Show a short status message in an aria-live element.
 * Success messages clear themselves; errors stay until replaced.
 * @param {HTMLElement} element
 */
export function createStatus(element) {
  /** @type {number | undefined} */
  let timer;
  /**
   * @param {string} text
   * @param {'ok' | 'error' | 'info'} [kind]
   */
  return (text, kind = 'info') => {
    window.clearTimeout(timer);
    element.textContent = text;
    element.dataset.kind = text ? kind : '';
    if (text && kind !== 'error') {
      timer = window.setTimeout(() => {
        element.textContent = '';
        element.dataset.kind = '';
      }, 6000);
    }
  };
}
