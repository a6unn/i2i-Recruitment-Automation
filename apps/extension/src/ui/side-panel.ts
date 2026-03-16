import type { ScoredCandidate } from '@recruitment/shared';

let panelEl: HTMLElement | null = null;
let allCandidates: Map<string, ScoredCandidate> = new Map();
// Reverse lookup: candidate name → profileUrl key, used to dedup across sessions
let nameToUrl: Map<string, string> = new Map();
let minScoreFilter = 0;
let searchFilter = '';
let persistTimer: ReturnType<typeof setTimeout> | null = null;

function getPanel(): HTMLElement {
  if (panelEl) return panelEl;

  panelEl = document.createElement('div');
  panelEl.id = 'rai-side-panel';
  panelEl.className = 'rai-panel';
  panelEl.innerHTML = `
    <div class="rai-panel__header">
      <span class="rai-panel__title">Ranked Candidates</span>
      <button class="rai-panel__toggle" id="rai-panel-toggle">\u25C0</button>
    </div>
    <div class="rai-panel__all-shown" id="rai-panel-all-shown">
      Showing all candidates \u2014 sorted by match, none hidden
    </div>
    <div class="rai-panel__filters">
      <input type="number" id="rai-panel-min-score" class="rai-panel__input" placeholder="Min score" min="0" max="100" />
      <input type="text" id="rai-panel-search" class="rai-panel__input" placeholder="Search name/skill..." />
    </div>
    <div class="rai-panel__filter-disclaimer" id="rai-panel-filter-disclaimer" style="display:none">
      Filter view only \u2014 all candidates remain in database
    </div>
    <div class="rai-panel__list" id="rai-panel-list"></div>
    <div class="rai-panel__count" id="rai-panel-count">0 candidates</div>
  `;

  // Expand tab (visible only when collapsed)
  const expandTab = document.createElement('button');
  expandTab.id = 'rai-panel-expand';
  expandTab.className = 'rai-panel__expand-tab';
  expandTab.textContent = '\u25C0';
  expandTab.title = 'Show Ranked Candidates';
  panelEl.appendChild(expandTab);

  document.body.appendChild(panelEl);

  function togglePanel() {
    panelEl!.classList.toggle('rai-panel--collapsed');
    document.body.classList.toggle('rai-panel-active-collapsed', panelEl!.classList.contains('rai-panel--collapsed'));
  }

  // Toggle collapse
  document.getElementById('rai-panel-toggle')!.addEventListener('click', togglePanel);
  expandTab.addEventListener('click', togglePanel);

  // Filters
  document.getElementById('rai-panel-min-score')!.addEventListener('input', (e) => {
    minScoreFilter = parseInt((e.target as HTMLInputElement).value) || 0;
    renderList();
  });

  document.getElementById('rai-panel-search')!.addEventListener('input', (e) => {
    searchFilter = (e.target as HTMLInputElement).value.toLowerCase();
    renderList();
  });

  return panelEl;
}

// --- Persistence ---

function persistToStorage(): void {
  // Debounce: batch rapid updates into one write
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    const candidates = Array.from(allCandidates.values());
    chrome.runtime.sendMessage({
      type: 'SET_PANEL_CANDIDATES',
      candidates,
    }).catch(() => {});
  }, 500);
}

// --- Rendering ---

function renderList(): void {
  const list = document.getElementById('rai-panel-list');
  if (!list) return;

  const totalCount = allCandidates.size;

  // Track which profileUrls are currently in the DOM (current page)
  const onPageUrls = new Set<string>();
  document.querySelectorAll('.rai-badge[data-profile-url]').forEach(el => {
    const url = (el as HTMLElement).dataset.profileUrl;
    if (url) onPageUrls.add(url);
  });

  const sorted = Array.from(allCandidates.values())
    .filter((c) => c.matchScore >= minScoreFilter)
    .filter((c) => {
      if (!searchFilter) return true;
      return (
        c.name.toLowerCase().includes(searchFilter) ||
        c.skills.some((s) => s.toLowerCase().includes(searchFilter))
      );
    })
    .sort((a, b) => b.matchScore - a.matchScore);

  // Show/hide filter disclaimer
  const disclaimer = document.getElementById('rai-panel-filter-disclaimer');
  const allShown = document.getElementById('rai-panel-all-shown');
  const isFiltered = minScoreFilter > 0 || searchFilter.length > 0;

  if (disclaimer) {
    disclaimer.style.display = isFiltered && sorted.length < totalCount ? 'block' : 'none';
  }
  if (allShown) {
    allShown.style.display = isFiltered ? 'none' : 'block';
  }

  list.innerHTML = sorted
    .map((c) => {
      const isOnPage = onPageUrls.has(c.profileUrl);
      return `
    <div class="rai-panel__item ${isOnPage ? '' : 'rai-panel__item--offpage'}" data-profile-url="${c.profileUrl}" title="${isOnPage ? 'Click to scroll to candidate' : 'Opens profile (candidate is on another page)'}">
      <span class="rai-panel__item-score rai-badge--${c.matchScore >= 80 ? 'green' : c.matchScore >= 50 ? 'yellow' : 'red'}">${Math.round(c.matchScore)}%</span>
      <div class="rai-panel__item-info">
        <div class="rai-panel__item-name">
          ${c.hiddenGem ? '<span class="rai-panel__gem" title="Hidden gem">\uD83D\uDC8E</span> ' : ''}
          ${c.name}
          ${c.aiReviewed ? '<span class="rai-panel__ai-badge" title="AI reviewed">\uD83E\uDD16</span>' : ''}
          ${!isOnPage ? '<span class="rai-panel__offpage-icon" title="On another page">\u2197</span>' : ''}
        </div>
        <div class="rai-panel__item-detail">${c.currentTitle || ''} ${c.currentCompany ? '@ ' + c.currentCompany : ''}</div>
      </div>
    </div>`;
    })
    .join('');

  const count = document.getElementById('rai-panel-count');
  if (count) {
    if (isFiltered) {
      count.textContent = `${sorted.length} of ${totalCount} candidates (filtered)`;
    } else {
      count.textContent = `${totalCount} candidates \u2014 all saved`;
    }
  }

  // Click handler: scroll on current page, or open profile in new tab
  list.querySelectorAll('.rai-panel__item').forEach((item) => {
    item.addEventListener('click', () => {
      const url = (item as HTMLElement).dataset.profileUrl;
      if (!url) return;

      const badge = document.querySelector(`.rai-badge[data-profile-url="${url}"]`);
      if (badge) {
        // Candidate is on current page — scroll to them
        badge.scrollIntoView({ behavior: 'smooth', block: 'center' });
        (badge as HTMLElement).classList.add('rai-badge--pulse');
        setTimeout(() => (badge as HTMLElement).classList.remove('rai-badge--pulse'), 1500);
      } else {
        // Candidate is on a different page — open their profile
        window.open(url, '_blank');
      }
    });
  });
}

// --- Public API ---

export function addToSidePanel(candidates: ScoredCandidate[]): void {
  getPanel();
  for (const c of candidates) {
    if (!c.profileUrl) continue;
    // If same candidate name exists under a different URL (stale session), remove the old entry
    const existingUrl = nameToUrl.get(c.name);
    if (existingUrl && existingUrl !== c.profileUrl) {
      allCandidates.delete(existingUrl);
    }
    nameToUrl.set(c.name, c.profileUrl);
    allCandidates.set(c.profileUrl, c);
  }
  renderList();
  persistToStorage();
}

export async function hydrateFromStorage(): Promise<void> {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_PANEL_CANDIDATES' });
    if (response.success && response.data && response.data.length > 0) {
      getPanel();
      for (const c of response.data as ScoredCandidate[]) {
        if (!c.profileUrl) continue;
        allCandidates.set(c.profileUrl, c);
        nameToUrl.set(c.name, c.profileUrl);
      }
      renderList();
      console.log(`RecruitAI: Restored ${response.data.length} candidates to side panel from storage`);
    }
  } catch (e) {
    console.error('RecruitAI: Failed to hydrate side panel:', e);
  }
}

export function clearSidePanel(): void {
  allCandidates.clear();
  nameToUrl.clear();
  renderList();
  persistToStorage();
}
