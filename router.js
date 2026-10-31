// @ts-check

/**
 * Hash routes for the three pages. The hash is used (not the path) so the site works on any static host
 * and under a sub-path such as /Command-Assembler/, with no server rules.
 *
 *   #/ or empty        assembler
 *   #/placer           block placer
 *   #/community        community library
 *   #/community/<id>   one community entry
 *   #setup=…           a share link: handled by the assembler, then removed from the address bar
 *
 * @typedef {'assembler' | 'placer' | 'community'} Page
 * @typedef {{ page: Page, param: string }} Route
 */

const TITLES = /** @type {Record<Page, string>} */ ({
  assembler: 'Command Assembler',
  placer: 'Block placer · Command Assembler',
  community: 'Community library · Command Assembler',
});

/**
 * @param {string} hash  window.location.hash
 * @returns {Route}
 */
export function parseRoute(hash) {
  const match = /^#\/(placer|community)(?:\/([A-Za-z0-9._~-]{1,80}))?\/?$/.exec(hash);
  if (!match) return { page: 'assembler', param: '' };
  return { page: /** @type {Page} */ (match[1]), param: match[2] ?? '' };
}

/**
 * Show one page and hide the others. Keeps the nav in step and moves focus to the page heading.
 * @param {HTMLElement} root
 * @param {(route: Route, previous: Route | null) => void} onChange
 */
export function createRouter(root, onChange) {
  /** @type {Route | null} */
  let current = null;
  const views = /** @type {Record<Page, HTMLElement>} */ ({
    assembler: /** @type {HTMLElement} */ (root.querySelector('#view-assembler')),
    placer: /** @type {HTMLElement} */ (root.querySelector('#view-placer')),
    community: /** @type {HTMLElement} */ (root.querySelector('#view-community')),
  });
  const links = Array.from(root.querySelectorAll('.topnav a'), (a) => /** @type {HTMLAnchorElement} */ (a));

  function apply() {
    const route = parseRoute(window.location.hash);
    const previous = current;
    current = route;
    for (const [page, view] of Object.entries(views)) view.hidden = page !== route.page;
    for (const link of links) {
      if (link.dataset.route === route.page) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }
    document.title = TITLES[route.page];
    onChange(route, previous);
    if (!previous || previous.page !== route.page) {
      window.scrollTo(0, 0);
      const heading = views[route.page].querySelector('h1');
      if (heading) {
        heading.setAttribute('tabindex', '-1');
        /** @type {HTMLElement} */ (heading).focus({ preventScroll: true });
      }
    }
  }

  window.addEventListener('hashchange', apply);
  apply();
  return { current: () => /** @type {Route} */ (current), refresh: apply };
}
