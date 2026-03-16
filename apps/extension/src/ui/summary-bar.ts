import type { ScoringStats } from '@recruitment/shared';
import { INJECTION_TARGETS } from '../selectors.config';

let barEl: HTMLElement | null = null;

function getBar(): HTMLElement {
  if (barEl) return barEl;

  barEl = document.createElement('div');
  barEl.id = 'rai-summary-bar';
  barEl.className = 'rai-summary-bar';
  barEl.innerHTML = `
    <div class="rai-summary-bar__content">
      <span class="rai-summary-bar__logo">RecruitAI</span>
      <span class="rai-summary-bar__stat" id="rai-stat-total">Scored: 0</span>
      <span class="rai-summary-bar__stat rai-summary-bar__stat--green" id="rai-stat-green">\u25CF 0</span>
      <span class="rai-summary-bar__stat rai-summary-bar__stat--yellow" id="rai-stat-yellow">\u25CF 0</span>
      <span class="rai-summary-bar__stat rai-summary-bar__stat--red" id="rai-stat-red">\u25CF 0</span>
      <span class="rai-summary-bar__divider" id="rai-stat-divider"></span>
      <span class="rai-summary-bar__phase" id="rai-stat-algo-phase"></span>
      <span class="rai-summary-bar__phase" id="rai-stat-ai-phase"></span>
      <span class="rai-summary-bar__stat" id="rai-stat-best"></span>
      <span class="rai-summary-bar__progress" id="rai-stat-progress"></span>
      <span class="rai-summary-bar__suggestion" id="rai-stat-suggestion"></span>
    </div>
  `;

  // Inject before search results
  const selectors = INJECTION_TARGETS.summaryBarBefore.split(', ');
  let target: Element | null = null;
  for (const sel of selectors) {
    target = document.querySelector(sel);
    if (target) break;
  }
  if (target?.parentNode) {
    target.parentNode.insertBefore(barEl, target);
  } else {
    document.body.prepend(barEl);
  }

  return barEl;
}

export function updateSummaryBar(stats: ScoringStats): void {
  getBar();

  document.getElementById('rai-stat-total')!.textContent = `Scored: ${stats.total}`;
  document.getElementById('rai-stat-green')!.textContent = `\u25CF ${stats.green}`;
  document.getElementById('rai-stat-yellow')!.textContent = `\u25CF ${stats.yellow}`;
  document.getElementById('rai-stat-red')!.textContent = `\u25CF ${stats.red}`;

  const bestEl = document.getElementById('rai-stat-best')!;
  if (stats.bestScore > 0) {
    bestEl.textContent = `Best: ${Math.round(stats.bestScore)}% ${stats.bestName}`;
  }

  // Two-phase progress
  const algoPhaseEl = document.getElementById('rai-stat-algo-phase')!;
  const aiPhaseEl = document.getElementById('rai-stat-ai-phase')!;
  const dividerEl = document.getElementById('rai-stat-divider')!;

  if (stats.algoScoredCount !== undefined && stats.algoScoredCount > 0) {
    algoPhaseEl.innerHTML = `<span class="rai-summary-bar__phase-icon">\u26A1</span> ${stats.algoScoredCount} scored instantly`;
    algoPhaseEl.style.display = 'inline-flex';
    dividerEl.style.display = 'inline';
    dividerEl.textContent = '\u2502';
  } else {
    algoPhaseEl.style.display = 'none';
    dividerEl.style.display = 'none';
  }

  if (stats.aiInProgressCount !== undefined && stats.aiInProgressCount > 0) {
    aiPhaseEl.innerHTML = `<span class="rai-summary-bar__phase-icon rai-summary-bar__phase-icon--pulse">\uD83E\uDD16</span> AI reviewing ${stats.aiInProgressCount} edge cases...`;
    aiPhaseEl.style.display = 'inline-flex';
    aiPhaseEl.classList.add('rai-summary-bar__phase--active');
  } else if (stats.aiReviewedCount !== undefined && stats.aiReviewedCount > 0) {
    aiPhaseEl.innerHTML = `<span class="rai-summary-bar__phase-icon">\uD83E\uDD16</span> ${stats.aiReviewedCount} AI reviewed`;
    aiPhaseEl.style.display = 'inline-flex';
    aiPhaseEl.classList.remove('rai-summary-bar__phase--active');
  } else {
    aiPhaseEl.style.display = 'none';
  }

  const progressEl = document.getElementById('rai-stat-progress')!;
  progressEl.textContent = stats.inProgress ? '\u23F3 Scoring...' : '';
  progressEl.className = `rai-summary-bar__progress ${stats.inProgress ? 'rai-summary-bar__progress--active' : ''}`;

  // "Enough candidates" suggestion
  const suggestionEl = document.getElementById('rai-stat-suggestion')!;
  if (stats.total >= 200 && stats.green >= 30) {
    suggestionEl.textContent = `\u2705 ${stats.green} strong candidates found \u2014 enough for shortlisting`;
    suggestionEl.style.display = 'inline';
  } else {
    suggestionEl.style.display = 'none';
  }
}

export function showAlgoScoringComplete(count: number): void {
  getBar();
  const algoPhaseEl = document.getElementById('rai-stat-algo-phase')!;
  algoPhaseEl.innerHTML = `<span class="rai-summary-bar__phase-icon">\u26A1</span> ${count} scored instantly`;
  algoPhaseEl.style.display = 'inline-flex';

  const dividerEl = document.getElementById('rai-stat-divider')!;
  dividerEl.style.display = 'inline';
  dividerEl.textContent = '\u2502';
}

export function showAIReviewProgress(inProgress: number, total: number): void {
  getBar();
  const aiPhaseEl = document.getElementById('rai-stat-ai-phase')!;
  if (inProgress > 0) {
    aiPhaseEl.innerHTML = `<span class="rai-summary-bar__phase-icon rai-summary-bar__phase-icon--pulse">\uD83E\uDD16</span> AI reviewing ${inProgress} edge cases...`;
    aiPhaseEl.style.display = 'inline-flex';
    aiPhaseEl.classList.add('rai-summary-bar__phase--active');
  } else {
    aiPhaseEl.innerHTML = `<span class="rai-summary-bar__phase-icon">\uD83E\uDD16</span> ${total} AI reviewed`;
    aiPhaseEl.style.display = 'inline-flex';
    aiPhaseEl.classList.remove('rai-summary-bar__phase--active');
  }
}

export function showScoringProgress(scored: number, total: number): void {
  getBar();
  const progressEl = document.getElementById('rai-stat-progress')!;
  progressEl.textContent = `\u23F3 Scoring ${scored}/${total}...`;
  progressEl.className = 'rai-summary-bar__progress rai-summary-bar__progress--active';
}
