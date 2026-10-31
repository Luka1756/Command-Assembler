// @ts-check
import { CATEGORIES, LIMITS } from './community.js';

const CATEGORY_OPTIONS = CATEGORIES.map((c) => `<option value="${c}">${c}</option>`).join('');

/** Community library page and the publish dialog. Static markup only; entries are rendered with textContent. */
export const COMMUNITY_TEMPLATE = /* html */ `
<section class="community" id="view-community" aria-labelledby="community-title" hidden>
  <div class="cm-head">
    <h1 id="community-title" class="cm-title">Community library</h1>
    <p class="cm-lede">Creations shared by other people. Each one is reviewed before it is added here.</p>
  </div>

  <div id="cm-list-view">
    <div class="cm-tools">
      <label class="e3-field cm-search"><span class="label">Search</span><input type="search" id="cm-search" placeholder="Name, description or author" autocomplete="off" /></label>
      <label class="e3-field"><span class="label">Category</span><select id="cm-category"><option value="">All categories</option></select></label>
      <label class="e3-field"><span class="label">Sort</span><select id="cm-sort"><option value="newest">Newest</option><option value="name">Name</option></select></label>
    </div>
    <p class="cm-count" id="cm-count" aria-live="polite"></p>
    <p class="status" id="cm-status" role="status"></p>
    <ul class="cm-grid" id="cm-grid"></ul>
    <div class="cm-empty" id="cm-empty" hidden>
      <h2 id="cm-empty-title"></h2>
      <p id="cm-empty-text"></p>
      <div class="reader-actions"><button type="button" class="btn" id="cm-retry" hidden>Try again</button></div>
    </div>
    <details class="formats cm-how">
      <summary>How sharing works</summary>
      <ul>
        <li>This site has no server or accounts, so nothing you make is public by default. <strong>My creations</strong> stay in your browser.</li>
        <li><strong>Publish</strong> (in My creations) prepares a submission file. You send it as a GitHub issue, and the library maintainer reviews it. If it is accepted it appears here for everyone after the next site update.</li>
        <li>There are no accounts, so the name on an entry is not verified. To change or remove an entry, open an issue in the same repository; the maintainer decides.</li>
        <li>Imported creations are copied to My creations. Nothing is added to your script or run until you choose to.</li>
      </ul>
    </details>
  </div>

  <div id="cm-detail-view" hidden>
    <a class="back-link" href="#/community">← All creations</a>
    <article class="cm-detail" id="cm-detail" aria-live="polite"></article>
  </div>
</section>

<dialog class="pub" id="pub-dialog" aria-labelledby="pub-title">
  <form method="dialog" class="pub-form" id="pub-form">
    <h2 id="pub-title">Publish to the community library</h2>
    <div class="pub-preview" id="pub-preview"></div>
    <p class="hint" id="pub-destination">Publishing sends nothing by itself. It prepares a submission file that you send to the library maintainer as a GitHub issue. After review it can appear in the community library, visible to everyone. Until then your creation stays private in this browser.</p>
    <label class="e3-field"><span class="label">Name</span><input type="text" id="pub-name" maxlength="${LIMITS.name}" autocomplete="off" /></label>
    <label class="e3-field"><span class="label">Description</span><textarea id="pub-desc" rows="3" maxlength="${LIMITS.description}"></textarea></label>
    <label class="e3-field"><span class="label">Author name (optional, shown publicly)</span><input type="text" id="pub-author" maxlength="${LIMITS.author}" autocomplete="off" placeholder="Anonymous" /></label>
    <label class="e3-field"><span class="label">Category</span><select id="pub-category">${CATEGORY_OPTIONS}</select></label>
    <p class="field-error" id="pub-error" role="alert" hidden></p>
    <p class="status" id="pub-note" role="status"></p>
    <details class="formats" id="pub-text-wrap">
      <summary>Submission text</summary>
      <textarea id="pub-text" class="reader-input" rows="6" readonly spellcheck="false"></textarea>
    </details>
    <div class="pub-actions">
      <a class="btn btn-primary" id="pub-issue" target="_blank" rel="noopener noreferrer" href="#" aria-disabled="true">Open GitHub issue</a>
      <button type="button" class="btn" id="pub-download">Download file</button>
      <button type="button" class="btn" id="pub-copy">Copy text</button>
      <button type="button" class="btn" id="pub-cancel">Cancel</button>
    </div>
  </form>
</dialog>
`;
