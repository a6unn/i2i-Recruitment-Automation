import type { ScoredCandidate, AlgorithmicScoreBreakdown } from '@recruitment/shared';

function getColorClass(score: number): string {
  if (score >= 80) return 'rai-badge--green';
  if (score >= 50) return 'rai-badge--yellow';
  return 'rai-badge--red';
}

export function createBadge(candidate: ScoredCandidate): HTMLElement {
  const badge = document.createElement('div');
  badge.className = `rai-badge ${getColorClass(candidate.matchScore)}`;
  if (candidate.aiReviewed) badge.classList.add('rai-badge--ai-reviewed');
  if (candidate.hiddenGem) badge.classList.add('rai-badge--hidden-gem');
  badge.dataset.profileUrl = candidate.profileUrl;
  badge.dataset.candidateId = candidate.id;
  badge.textContent = `${Math.round(candidate.matchScore)}%`;
  badge.title = candidate.aiReviewed ? 'AI reviewed — click for details' : 'Click for details';
  return badge;
}

export function createProvisionalBadge(
  profileUrl: string,
  algoScore: AlgorithmicScoreBreakdown
): HTMLElement {
  const badge = document.createElement('div');
  badge.className = `rai-badge rai-badge--provisional ${getColorClass(algoScore.totalScore)}`;
  badge.dataset.profileUrl = profileUrl;
  badge.textContent = `${Math.round(algoScore.totalScore)}%`;
  badge.title = 'Instant score — AI review pending';

  // Add pending indicator
  const pending = document.createElement('span');
  pending.className = 'rai-badge__pending';
  pending.textContent = '...';
  badge.appendChild(pending);

  return badge;
}

export function updateBadge(card: Element, candidate: ScoredCandidate): void {
  let badge = card.querySelector('.rai-badge') as HTMLElement | null;
  if (badge) {
    badge.className = `rai-badge ${getColorClass(candidate.matchScore)}`;
    if (candidate.aiReviewed) badge.classList.add('rai-badge--ai-reviewed');
    if (candidate.hiddenGem) badge.classList.add('rai-badge--hidden-gem');
    badge.classList.remove('rai-badge--provisional');
    badge.textContent = `${Math.round(candidate.matchScore)}%`;
    badge.dataset.candidateId = candidate.id;
    // Remove pending indicator
    const pending = badge.querySelector('.rai-badge__pending');
    if (pending) pending.remove();
    // Add AI indicator
    if (candidate.aiReviewed) {
      let aiDot = badge.querySelector('.rai-badge__ai-dot') as HTMLElement | null;
      if (!aiDot) {
        aiDot = document.createElement('span');
        aiDot.className = 'rai-badge__ai-dot';
        aiDot.title = 'AI reviewed';
        badge.appendChild(aiDot);
      }
    }
  } else {
    badge = createBadge(candidate);
    (card as HTMLElement).style.position = 'relative';
    card.appendChild(badge);
  }
}

export function injectProvisionalBadge(
  card: Element,
  profileUrl: string,
  algoScore: AlgorithmicScoreBreakdown
): void {
  let badge = card.querySelector('.rai-badge') as HTMLElement | null;
  if (badge) return; // Already has a badge (either provisional or final)

  badge = createProvisionalBadge(profileUrl, algoScore);
  const htmlCard = card as HTMLElement;
  htmlCard.style.position = 'relative';
  htmlCard.appendChild(badge);
}

export function injectBadge(card: Element, candidate: ScoredCandidate): void {
  updateBadge(card, candidate);
}
