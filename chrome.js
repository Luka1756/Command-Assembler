// @ts-check

/**
 * Collapsible panels: every .panel with a .collapse button.
 * @param {HTMLElement} root
 * @returns {{ expand: (id: string) => void }}
 */
export function initCollapsibles(root) {
  /** @type {Map<string, (collapsed: boolean) => void>} */
  const setters = new Map();

  root.querySelectorAll('.panel').forEach((panel) => {
    const toggle = panel.querySelector('.collapse');
    const body = panel.querySelector('.panel-body');
    if (!toggle || !body) return;
    const title = panel.querySelector('h2')?.textContent ?? 'section';

    /** @param {boolean} collapsed */
    const set = (collapsed) => {
      /** @type {HTMLElement} */ (body).hidden = collapsed;
      panel.classList.toggle('is-collapsed', collapsed);
      toggle.setAttribute('aria-expanded', String(!collapsed));
      toggle.setAttribute('aria-label', `${collapsed ? 'Expand' : 'Collapse'} ${title}`);
      toggle.textContent = collapsed ? '+' : '−';
    };
    toggle.addEventListener('click', () => set(toggle.getAttribute('aria-expanded') === 'true'));
    if (panel.id) setters.set(panel.id, set);
  });

  return { expand: (id) => setters.get(id)?.(false) };
}

/**
 * Section tabs (Script, Settings): scroll to a section and mark the one in view.
 * @param {HTMLElement} root
 * @param {(id: string) => void} expand
 */
export function initTabs(root, expand) {
  const tabs = Array.from(root.querySelectorAll('.tab'), (tab) => /** @type {HTMLButtonElement} */ (tab));
  const ids = tabs.map((tab) => tab.dataset.target ?? '');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const id = tab.dataset.target;
      if (!id) return;
      expand(id);
      document.getElementById(id)?.scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'start' });
    });
  });

  function markActive() {
    let active = ids[0];
    for (const id of ids) {
      const top = document.getElementById(id)?.getBoundingClientRect().top;
      if (top !== undefined && top <= 140) active = id;
    }
    tabs.forEach((tab) => tab.setAttribute('aria-current', String(tab.dataset.target === active)));
  }

  let queued = false;
  window.addEventListener(
    'scroll',
    () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        markActive();
      });
    },
    { passive: true },
  );
  markActive();
}

/**
 * Page-level notice (shared link loaded or rejected).
 * @param {HTMLElement} slot
 */
export function createNotifier(slot) {
  /**
   * @param {string} message
   * @param {'info' | 'error'} kind
   */
  return (message, kind) => {
    const notice = document.createElement('div');
    notice.className = `notice is-${kind}`;
    notice.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    const text = document.createElement('p');
    text.textContent = message;
    const dismiss = document.createElement('button');
    dismiss.type = 'button';
    dismiss.className = 'link-btn';
    dismiss.textContent = 'Dismiss';
    dismiss.addEventListener('click', () => notice.remove());
    notice.append(text, dismiss);
    slot.replaceChildren(notice);
  };
}
