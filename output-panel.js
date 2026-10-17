// @ts-check
import { CHAIN_BLOCK_LIMIT, MAX_COMMAND_CHARS, MAX_EDITED_COMMAND_LENGTH, isValidSpawnHeight } from './limits.js';
import { buildShareUrl, encodeSetup } from './share.js';
import { button, createStatus, el, formatNumber, input } from './dom.js';
import { copyText } from './clipboard.js';

/** @typedef {import('./types').GenerateResult} GenerateResult */

/**
 * One-command output: stats, command text, diagnostics, copy and share.
 * @param {HTMLElement} root
 * @param {ReturnType<typeof import('./store.js').createStore>} store
 */
export function initOutputPanel(root, store) {
  const text = el(root, '#output-text');
  const diagnostics = el(root, '#diagnostics');
  const copyButton = button(root, '#copy-btn');
  const shareButton = button(root, '#share-btn');
  const fallback = el(root, '#share-fallback');
  const fallbackInput = input(root, '#share-link');
  const statChars = el(root, '#stat-chars');
  const statMax = el(root, '#stat-max');
  const statChain = el(root, '#stat-chain');
  const setStatus = createStatus(el(root, '#output-status'));

  // Length-limit labels beside the output; values come from limits.js so they stay in one place.
  el(root, '#limit-block').textContent = formatNumber(MAX_COMMAND_CHARS);
  el(root, '#limit-edited').textContent = formatNumber(MAX_EDITED_COMMAND_LENGTH);

  /** @type {GenerateResult | null} */
  let current = null;

  copyButton.addEventListener('click', async () => {
    if (!current?.ok) return;
    const copied = await copyText(current.output);
    if (copied) {
      setStatus('Command copied to clipboard.', 'ok');
    } else {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(text);
      selection?.removeAllRanges();
      selection?.addRange(range);
      setStatus('Copying was blocked by the browser. The command is selected; copy it manually.', 'error');
    }
  });

  shareButton.addEventListener('click', async () => {
    const encoded = encodeSetup(store.get());
    if (!encoded.ok) {
      setStatus(encoded.error, 'error');
      return;
    }
    const url = buildShareUrl(window.location.href, encoded.payload);
    if (await copyText(url)) {
      fallback.hidden = true;
      setStatus('Share link copied. It contains your script and build settings, so anyone with the link can read them.', 'ok');
    } else {
      fallbackInput.value = url;
      fallback.hidden = false;
      fallbackInput.focus();
      fallbackInput.select();
      setStatus('Copying was blocked by the browser. Copy the link below.', 'error');
    }
  });

  return {
    /** @param {GenerateResult} result */
    render(result) {
      current = result;
      const { settings, script } = store.get();

      // The command text stays visible when it is over the limit so the problem can be seen.
      text.textContent = result.output || 'No command yet. Fix the issues below.';
      text.classList.toggle('is-empty', !result.output);

      statChars.textContent = `${formatNumber(result.outputLength)} characters`;
      statChars.classList.toggle('is-over', result.outputLength > MAX_COMMAND_CHARS);
      statMax.textContent = `Max ${formatNumber(MAX_COMMAND_CHARS)} cmd chars`;
      statChain.textContent = `${formatNumber(result.chainBlocks)} / ${formatNumber(CHAIN_BLOCK_LIMIT)} chain blocks`;

      diagnostics.replaceChildren(
        ...result.diagnostics.map((d) => {
          const item = document.createElement('li');
          item.className = `diagnostic is-${d.severity}`;
          const tag = document.createElement('span');
          tag.className = 'diagnostic-tag';
          tag.textContent = d.severity === 'error' ? 'Error' : 'Warning';
          const message = document.createElement('span');
          message.textContent = d.line ? `Line ${d.line}: ${d.message}` : d.message;
          item.append(tag, message);
          return item;
        }),
      );
      diagnostics.hidden = result.diagnostics.length === 0;

      copyButton.disabled = !result.ok;
      shareButton.disabled = !isValidSpawnHeight(settings.spawnHeight) || script.trim() === '';
      fallback.hidden = true;
    },

    scrollIntoView() {
      el(root, '#output').scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block: 'start',
      });
    },
  };
}
