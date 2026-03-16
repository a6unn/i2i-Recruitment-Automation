import './content-script.css';
import type { ExtensionMessage, ScoredCandidate, ActiveJD, AlgorithmicScoreBreakdown, ScrapedProfile } from '@recruitment/shared';
import { SELECTORS } from './selectors.config';
import { scrapeProfileCards, getProfileCards } from './scraper';
import { injectBadge, injectProvisionalBadge } from './ui/badge';
import { showTooltip, showProvisionalTooltip, hideTooltip } from './ui/tooltip';
import { addToSidePanel, hydrateFromStorage } from './ui/side-panel';
import { updateSummaryBar, showScoringProgress, showAlgoScoringComplete, showAIReviewProgress } from './ui/summary-bar';
import { injectCheckbox } from './ui/bulk-actions';
import { injectNoteIcon } from './ui/notes';
import { scoreProfilesBatch } from './algorithmic-scorer';

// State
let activeJD: ActiveJD | null = null;
let isAuthenticated = false;
const profileUrlToScore = new Map<string, ScoredCandidate>();
const profileUrlToAlgoScore = new Map<string, { profile: ScrapedProfile; breakdown: AlgorithmicScoreBreakdown }>();

// --- Initialization ---

async function init(): Promise<void> {
  console.log('RecruitAI Screener content script loaded');

  // Check auth
  const authResponse = await chrome.runtime.sendMessage({ type: 'GET_AUTH' } satisfies ExtensionMessage);
  if (!authResponse.success || !authResponse.data) {
    console.log('RecruitAI: Not authenticated. Open popup to login.');
    return;
  }
  isAuthenticated = true;

  // Check active JD
  const jdResponse = await chrome.runtime.sendMessage({ type: 'GET_ACTIVE_JD' } satisfies ExtensionMessage);
  if (!jdResponse.success || !jdResponse.data) {
    console.log('RecruitAI: No active JD selected. Open popup to select one.');
    return;
  }
  activeJD = jdResponse.data;

  // Load stats
  const statsResponse = await chrome.runtime.sendMessage({ type: 'GET_STATS' } satisfies ExtensionMessage);
  if (statsResponse.success && statsResponse.data) {
    updateSummaryBar(statsResponse.data);
  }

  console.log('RecruitAI: Authenticated with JD:', activeJD!.title);

  // Add panel class to body
  document.body.classList.add('rai-panel-active');

  // Restore side panel from previous session (before scraping new profiles)
  await hydrateFromStorage();

  // Wait for profile cards to appear (RESDEX may load them async)
  await waitForCards();

  // Initial scrape + score
  scoreVisibleProfiles();

  // Watch for new cards (pagination, lazy loading)
  setupMutationObserver();

  // Watch for SPA navigation
  setupNavigationListeners();
}

// --- Wait for cards to appear ---

function waitForCards(timeout = 15000): Promise<void> {
  return new Promise((resolve) => {
    // Diagnostic: log what selectors match
    const diagnostics = [
      '.tuple-card', '.tuple[data-tuple-id]', '.tuple.on',
      '.tuple-list > div', '[class*="tuple"]', '[data-tuple-id]',
      '.tuple-list', '.tuples-wrap',
    ];
    console.log('RecruitAI: Selector diagnostics:');
    diagnostics.forEach(s => {
      const n = document.querySelectorAll(s).length;
      if (n > 0) console.log(`  ${s} \u2192 ${n} matches`);
    });

    const cards = getProfileCards();
    if (cards.length > 0) {
      console.log(`RecruitAI: ${cards.length} cards already present`);
      resolve();
      return;
    }

    console.log('RecruitAI: Waiting for profile cards to appear...');
    const start = Date.now();
    const interval = setInterval(() => {
      const found = getProfileCards();
      if (found.length > 0) {
        clearInterval(interval);
        console.log(`RecruitAI: ${found.length} cards found after ${Date.now() - start}ms`);
        resolve();
        return;
      }
      if (Date.now() - start > timeout) {
        clearInterval(interval);
        // Final diagnostic dump
        console.log('RecruitAI: Timeout \u2014 final selector check:');
        diagnostics.forEach(s => {
          const n = document.querySelectorAll(s).length;
          if (n > 0) console.log(`  ${s} \u2192 ${n} matches`);
        });
        // Try to find any large container with children
        const body = document.body.innerHTML.length;
        console.log(`RecruitAI: Body HTML length: ${body}`);
        const divs = document.querySelectorAll('div[class]');
        const classCounts = new Map<string, number>();
        divs.forEach(d => {
          d.classList.forEach(c => {
            classCounts.set(c, (classCounts.get(c) || 0) + 1);
          });
        });
        // Log classes that appear 20-60 times (likely profile cards)
        classCounts.forEach((count, cls) => {
          if (count >= 20 && count <= 100) {
            console.log(`  class "${cls}" appears ${count} times`);
          }
        });
        resolve();
      }
    }, 1000);
  });
}

// --- Scraping & Scoring (Two-Phase) ---

async function scoreVisibleProfiles(): Promise<void> {
  if (!activeJD) return;

  const allProfiles = scrapeProfileCards();
  if (allProfiles.length === 0) return;

  // Skip profiles already scored on this page (prevents duplicates on MutationObserver re-triggers)
  const profiles = allProfiles.filter(p => {
    if (!p.profileUrl) return true;
    return !profileUrlToAlgoScore.has(p.profileUrl);
  });

  if (profiles.length === 0) {
    console.log(`RecruitAI: All ${allProfiles.length} profiles already scored, skipping`);
    return;
  }

  console.log(`RecruitAI: Found ${profiles.length} new profiles (${allProfiles.length - profiles.length} already scored)`);

  // === PHASE 1: Instant Algorithmic Scoring (< 500ms, no network) ===
  const startAlgo = performance.now();
  const algoResults = scoreProfilesBatch(profiles, activeJD.parsedData, activeJD.scoringConfig);
  const algoTime = Math.round(performance.now() - startAlgo);
  console.log(`RecruitAI: Phase 1 algorithmic scoring complete in ${algoTime}ms`);

  // Build card-to-URL map
  const cards = getProfileCards();
  const cardByUrl = new Map<string, Element>();
  for (const card of cards) {
    const urlSelectors = SELECTORS.profileUrl.split(', ');
    for (const sel of urlSelectors) {
      const link = card.querySelector(sel) as HTMLAnchorElement | null;
      if (link?.href) {
        cardByUrl.set(link.href, card);
        break;
      }
    }
  }

  // Inject provisional badges immediately
  for (const result of algoResults) {
    const profile = profiles[result.profileIndex];
    const profileUrl = profile.profileUrl;
    if (!profileUrl) continue;

    profileUrlToAlgoScore.set(profileUrl, { profile, breakdown: result.algoScore });

    const card = cardByUrl.get(profileUrl);
    if (card) {
      injectProvisionalBadge(card, profileUrl, result.algoScore);

      // Wire provisional badge click to show tooltip
      const badge = card.querySelector('.rai-badge');
      if (badge) {
        badge.addEventListener('click', (e) => {
          e.stopPropagation();
          const existing = profileUrlToScore.get(profileUrl);
          if (existing) {
            showTooltip(
              badge as HTMLElement,
              existing,
              activeJD?.parsedData.mustHaveSkills || [],
              activeJD?.parsedData.niceToHaveSkills || []
            );
          } else {
            showProvisionalTooltip(
              badge as HTMLElement,
              profile,
              result.algoScore,
              activeJD?.parsedData.mustHaveSkills || [],
              activeJD?.parsedData.niceToHaveSkills || []
            );
          }
        });
      }
    }
  }

  // Show instant scoring complete in summary bar
  showAlgoScoringComplete(profiles.length);

  // Build provisional side panel entries
  const provisionalCandidates: ScoredCandidate[] = algoResults.map(r => {
    const p = profiles[r.profileIndex];
    return {
      id: '',
      name: p.name,
      profileUrl: p.profileUrl || '',
      matchScore: r.algoScore.totalScore,
      scoreBreakdown: {
        skillMatch: r.algoScore.skillScore,
        experienceMatch: r.algoScore.experienceScore,
        locationMatch: r.algoScore.locationScore,
        overallFit: r.algoScore.educationScore,
      },
      reasoning: '',
      redFlags: [],
      highlights: [],
      currentTitle: p.currentTitle,
      currentCompany: p.currentCompany,
      totalExperience: p.totalExperience,
      location: p.location,
      skills: p.skills,
      pipelineStatus: 'SCREENED',
      noteCount: 0,
      scoreSource: 'algorithmic' as const,
      algorithmicBreakdown: r.algoScore,
      aiReviewed: false,
      tier: r.tier,
    };
  });
  addToSidePanel(provisionalCandidates);

  // === PHASE 2: LLM Scoring (send to service worker with algorithmic pre-scores) ===
  const evaluateCount = algoResults.filter(r => r.tier === 'evaluate').length;
  const rescueCount = algoResults.filter(r => r.tier === 'rescue').length;
  const edgeCaseCount = evaluateCount + rescueCount;

  console.log(`RecruitAI: Phase 2 sending to LLM — ${algoResults.filter(r => r.tier === 'confirm').length} confirm, ${evaluateCount} evaluate, ${rescueCount} rescue`);

  showAIReviewProgress(edgeCaseCount, 0);
  showScoringProgress(0, profiles.length);

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'SCORE_PROFILES',
      profiles,
      jdId: activeJD.id,
      algorithmicScores: algoResults,
    } satisfies ExtensionMessage);

    console.log('RecruitAI: Phase 2 scoring complete:', JSON.stringify(response).slice(0, 300));

    if (response.success && response.scores) {
      injectScoresOnCards(response.scores);
      showAIReviewProgress(0, response.scores.length);
    } else if (response.error) {
      console.error('RecruitAI: Scoring error:', response.error);
      const progressEl = document.getElementById('rai-stat-progress');
      if (progressEl) {
        progressEl.textContent = `Error: ${response.error}`;
        progressEl.style.color = '#f87171';
      }
    }
  } catch (err) {
    console.error('RecruitAI: Failed to send SCORE_PROFILES:', err);
  }
}

// --- UI Injection ---

function injectScoresOnCards(scores: ScoredCandidate[]): void {
  if (!activeJD) return;

  const cards = getProfileCards();
  const cardByUrl = new Map<string, Element>();

  for (const card of cards) {
    const urlSelectors = SELECTORS.profileUrl.split(', ');
    for (const sel of urlSelectors) {
      const link = card.querySelector(sel) as HTMLAnchorElement | null;
      if (link?.href) {
        cardByUrl.set(link.href, card);
        break;
      }
    }
  }

  // Merge algorithmic breakdown into scores
  for (const score of scores) {
    const algoData = profileUrlToAlgoScore.get(score.profileUrl);
    if (algoData && !score.algorithmicBreakdown) {
      score.algorithmicBreakdown = algoData.breakdown;
    }
    score.aiReviewed = true;
    score.scoreSource = 'hybrid';

    profileUrlToScore.set(score.profileUrl, score);

    const card = cardByUrl.get(score.profileUrl);
    if (!card) continue;

    // Update badge (replaces provisional)
    injectBadge(card, score);

    // Checkbox for bulk actions
    injectCheckbox(card, score.id);

    // Note icon
    injectNoteIcon(card, score.id, score.noteCount > 0);

    // Freshness highlighting
    injectFreshness(card);

    // Re-wire badge click with full data
    const badge = card.querySelector('.rai-badge');
    if (badge) {
      // Remove old listeners by cloning
      const newBadge = badge.cloneNode(true) as HTMLElement;
      badge.parentNode?.replaceChild(newBadge, badge);

      newBadge.addEventListener('click', (e) => {
        e.stopPropagation();
        showTooltip(
          newBadge,
          score,
          activeJD?.parsedData.mustHaveSkills || [],
          activeJD?.parsedData.niceToHaveSkills || []
        );
      });
    }
  }

  // Update side panel with final scores
  addToSidePanel(scores);

  // Update summary bar
  chrome.runtime.sendMessage({ type: 'GET_STATS' } satisfies ExtensionMessage).then((res) => {
    if (res.success && res.data) {
      updateSummaryBar(res.data);
    }
  });
}

// --- Freshness ---

function injectFreshness(card: Element): void {
  if (card.querySelector('.rai-freshness')) return;

  const lastActiveSelectors = SELECTORS.lastActive.split(', ');
  let lastActiveText = '';
  for (const sel of lastActiveSelectors) {
    const el = card.querySelector(sel);
    if (el?.textContent) {
      lastActiveText = el.textContent.trim().toLowerCase();
      break;
    }
  }

  if (!lastActiveText) return;

  let freshClass = 'rai-freshness--stale';
  if (
    lastActiveText.includes('today') ||
    lastActiveText.includes('1 day') ||
    lastActiveText.includes('2 day') ||
    lastActiveText.includes('3 day') ||
    lastActiveText.includes('this week')
  ) {
    freshClass = 'rai-freshness--recent';
  } else if (
    lastActiveText.includes('week') ||
    lastActiveText.includes('1 month') ||
    lastActiveText.includes('2 week')
  ) {
    freshClass = 'rai-freshness--moderate';
  }

  const dot = document.createElement('span');
  dot.className = `rai-freshness ${freshClass}`;
  dot.title = `Last active: ${lastActiveText}`;

  const nameSelectors = SELECTORS.candidateName.split(', ');
  for (const sel of nameSelectors) {
    const nameEl = card.querySelector(sel);
    if (nameEl) {
      nameEl.insertBefore(dot, nameEl.firstChild);
      break;
    }
  }
}

// --- MutationObserver ---

function setupMutationObserver(): void {
  const targetSelectors = SELECTORS.searchResultsList.split(', ');
  let target: Element | null = null;

  for (const sel of targetSelectors) {
    target = document.querySelector(sel);
    if (target) break;
  }

  const observeTarget = target || document.body;

  const observer = new MutationObserver((mutations) => {
    let hasNewCards = false;
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node instanceof HTMLElement) {
          const cardSelectors = SELECTORS.profileCard.split(', ');
          for (const sel of cardSelectors) {
            if (node.matches(sel) || node.querySelector(sel)) {
              hasNewCards = true;
              break;
            }
          }
        }
        if (hasNewCards) break;
      }
      if (hasNewCards) break;
    }

    if (hasNewCards) {
      // Debounce: wait for batch of cards to finish loading
      clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => scoreVisibleProfiles(), 500);
    }
  });

  observer.observe(observeTarget, { childList: true, subtree: true });
}

let debounceTimer: number;

// --- SPA Navigation ---

function setupNavigationListeners(): void {
  // RESDEX may use pushState / hash changes for pagination
  const originalPushState = history.pushState;
  history.pushState = function (...args) {
    originalPushState.apply(this, args);
    onNavigate();
  };

  window.addEventListener('popstate', onNavigate);
  window.addEventListener('hashchange', onNavigate);
}

function onNavigate(): void {
  // Wait for new content to render
  setTimeout(() => scoreVisibleProfiles(), 1000);
}

// --- Message Listener (from service worker) ---

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'SCORE_RESULT') {
    console.log(`RecruitAI: Received ${message.scores?.length || 0} scores`);
    injectScoresOnCards(message.scores as ScoredCandidate[]);
  }
  if (message.type === 'SCORING_PROGRESS') {
    showScoringProgress(message.scored, message.total);
  }
  if (message.type === 'SCORE_ERROR') {
    console.error('RecruitAI: Scoring error:', message.error);
    // Show error in summary bar
    const progressEl = document.getElementById('rai-stat-progress');
    if (progressEl) {
      progressEl.textContent = `Error: ${message.error}`;
      progressEl.style.color = '#f87171';
    }
  }
});

// --- Close tooltip on escape ---
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') hideTooltip();
});

// --- Start ---
init();
