import type { ExtensionMessage } from '@recruitment/shared';

let barEl: HTMLElement | null = null;
const selectedIds = new Set<string>();

function getActionBar(): HTMLElement {
  if (barEl) return barEl;

  barEl = document.createElement('div');
  barEl.id = 'rai-action-bar';
  barEl.className = 'rai-action-bar rai-action-bar--hidden';
  barEl.innerHTML = `
    <span class="rai-action-bar__count" id="rai-action-count">0 selected</span>
    <button class="rai-action-bar__btn rai-action-bar__btn--primary" id="rai-action-shortlist">Shortlist Selected</button>
    <button class="rai-action-bar__btn" id="rai-action-export">Export CSV</button>
    <button class="rai-action-bar__btn rai-action-bar__btn--green" id="rai-action-select-green">Select All Green</button>
    <button class="rai-action-bar__btn rai-action-bar__btn--clear" id="rai-action-clear">Clear</button>
  `;

  document.body.appendChild(barEl);

  document.getElementById('rai-action-shortlist')!.addEventListener('click', async () => {
    if (selectedIds.size === 0) return;
    const response = await chrome.runtime.sendMessage({
      type: 'SHORTLIST_CANDIDATES',
      candidateIds: Array.from(selectedIds),
    } satisfies ExtensionMessage);
    if (response.success) {
      clearSelection();
      showToast(`${response.data?.updated || selectedIds.size} candidates shortlisted`);
    }
  });

  document.getElementById('rai-action-export')!.addEventListener('click', async () => {
    const response = await chrome.runtime.sendMessage({ type: 'GET_ACTIVE_JD' } satisfies ExtensionMessage);
    if (response.success && response.data) {
      chrome.runtime.sendMessage({ type: 'EXPORT_CSV', jdId: response.data.id } satisfies ExtensionMessage);
    }
  });

  document.getElementById('rai-action-select-green')!.addEventListener('click', () => {
    document.querySelectorAll('.rai-badge--green').forEach((badge) => {
      const candidateId = (badge as HTMLElement).dataset.candidateId;
      if (candidateId) {
        selectedIds.add(candidateId);
        const card = badge.closest('.tuple-card, .srp-tuple, [data-type="tuple"]');
        const checkbox = card?.querySelector('.rai-checkbox') as HTMLInputElement;
        if (checkbox) checkbox.checked = true;
      }
    });
    updateActionBar();
  });

  document.getElementById('rai-action-clear')!.addEventListener('click', clearSelection);

  return barEl;
}

function updateActionBar(): void {
  const bar = getActionBar();
  const countEl = document.getElementById('rai-action-count')!;
  countEl.textContent = `${selectedIds.size} selected`;

  if (selectedIds.size > 0) {
    bar.classList.remove('rai-action-bar--hidden');
  } else {
    bar.classList.add('rai-action-bar--hidden');
  }
}

function clearSelection(): void {
  selectedIds.clear();
  document.querySelectorAll('.rai-checkbox').forEach((cb) => {
    (cb as HTMLInputElement).checked = false;
  });
  updateActionBar();
}

function showToast(msg: string): void {
  const toast = document.createElement('div');
  toast.className = 'rai-toast';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

export function injectCheckbox(card: Element, candidateId: string): void {
  if (card.querySelector('.rai-checkbox')) return;

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'rai-checkbox';
  checkbox.dataset.candidateId = candidateId;

  checkbox.addEventListener('change', () => {
    if (checkbox.checked) {
      selectedIds.add(candidateId);
    } else {
      selectedIds.delete(candidateId);
    }
    updateActionBar();
  });

  // Prepend to card
  (card as HTMLElement).style.position = 'relative';
  card.insertBefore(checkbox, card.firstChild);
  getActionBar(); // ensure bar exists
}
