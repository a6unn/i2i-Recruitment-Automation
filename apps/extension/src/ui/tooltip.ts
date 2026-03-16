import type { ScoredCandidate, AlgorithmicScoreBreakdown } from '@recruitment/shared';

let activeTooltip: HTMLElement | null = null;

function createBar(label: string, value: number): string {
  const width = Math.min(100, Math.max(0, value));
  const color = value >= 80 ? '#22c55e' : value >= 50 ? '#eab308' : '#ef4444';
  return `
    <div class="rai-tooltip__bar">
      <span class="rai-tooltip__bar-label">${label}</span>
      <div class="rai-tooltip__bar-track">
        <div class="rai-tooltip__bar-fill" style="width:${width}%;background:${color}"></div>
      </div>
      <span class="rai-tooltip__bar-value">${Math.round(value)}</span>
    </div>`;
}

function createSkillChecklist(
  mustHave: string[],
  breakdown: AlgorithmicScoreBreakdown | undefined,
  candidateSkills: string[]
): string {
  if (!mustHave.length) return '';

  const hits = new Set(breakdown?.skillHits.map(s => s.toLowerCase()) || []);
  const misses = new Set(breakdown?.skillMisses.map(s => s.toLowerCase()) || []);

  return mustHave
    .map((skill) => {
      let has: boolean;
      if (breakdown) {
        has = hits.has(skill.toLowerCase());
      } else {
        const lower = candidateSkills.map(s => s.toLowerCase());
        has = lower.some(s => s.includes(skill.toLowerCase()) || skill.toLowerCase().includes(s));
      }
      return `<span class="rai-tooltip__skill ${has ? 'rai-tooltip__skill--has' : 'rai-tooltip__skill--missing'}">${has ? '\u2713' : '\u2717'} ${skill}</span>`;
    })
    .join('');
}

function createNiceToHaveSection(
  niceToHave: string[],
  breakdown: AlgorithmicScoreBreakdown | undefined
): string {
  if (!niceToHave.length) return '';

  const niceHits = new Set(breakdown?.niceToHaveHits.map(s => s.toLowerCase()) || []);

  return `
    <div class="rai-tooltip__section-title">Nice-to-Have Skills</div>
    <div class="rai-tooltip__skills">
      ${niceToHave.map(skill => {
        const has = niceHits.has(skill.toLowerCase());
        return `<span class="rai-tooltip__skill ${has ? 'rai-tooltip__skill--has' : 'rai-tooltip__skill--missing-nice'}">${has ? '\u2713' : '\u2717'} ${skill}</span>`;
      }).join('')}
    </div>`;
}

function createExperienceBar(breakdown: AlgorithmicScoreBreakdown | undefined, totalExp: string | undefined): string {
  if (!breakdown?.experienceRange) {
    return `<div class="rai-tooltip__exp-line">Experience: ${totalExp || 'N/A'}</div>`;
  }

  const { min, max } = breakdown.experienceRange;
  const parsed = breakdown.experienceParsed;

  if (parsed === null) {
    return `<div class="rai-tooltip__exp-line">Experience: ${totalExp || 'N/A'} (range: ${min}-${max}y)</div>`;
  }

  // Visual range bar
  const rangeMax = Math.max(max + 5, parsed + 2);
  const rangeStart = (min / rangeMax) * 100;
  const rangeEnd = (max / rangeMax) * 100;
  const candidatePos = Math.min((parsed / rangeMax) * 100, 100);
  const inRange = parsed >= min && parsed <= max;

  return `
    <div class="rai-tooltip__exp">
      <span class="rai-tooltip__exp-label">Experience: ${parsed}y</span>
      <div class="rai-tooltip__exp-bar">
        <div class="rai-tooltip__exp-range" style="left:${rangeStart}%;width:${rangeEnd - rangeStart}%"></div>
        <div class="rai-tooltip__exp-marker ${inRange ? 'rai-tooltip__exp-marker--in' : 'rai-tooltip__exp-marker--out'}" style="left:${candidatePos}%"></div>
      </div>
      <span class="rai-tooltip__exp-range-label">${min}-${max}y</span>
      <span class="rai-tooltip__exp-status">${inRange ? '\u2713' : parsed < min ? 'Below range' : 'Above range'}</span>
    </div>`;
}

function createLocationLine(breakdown: AlgorithmicScoreBreakdown | undefined, location: string | undefined): string {
  if (!location) return '<div class="rai-tooltip__loc-line">Location: N/A</div>';

  const matchLabel = breakdown
    ? breakdown.locationMatch === 'exact'
      ? '\u2713 (exact match)'
      : breakdown.locationMatch === 'region'
        ? '~ (same region)'
        : breakdown.locationMatch === 'not_required'
          ? '\u2713 (no restriction)'
          : '\u2717 (different)'
    : '';

  return `<div class="rai-tooltip__loc-line">Location: ${location} ${matchLabel}</div>`;
}

function createEducationLine(breakdown: AlgorithmicScoreBreakdown | undefined, education: string | undefined): string {
  if (!education && !breakdown) return '';

  const matchLabel = breakdown
    ? breakdown.educationMatch === 'meets'
      ? '\u2713'
      : breakdown.educationMatch === 'above'
        ? '\u2713 (exceeds)'
        : breakdown.educationMatch === 'below'
          ? '\u2717 (below requirement)'
          : '?'
    : '';

  return `<div class="rai-tooltip__edu-line">Education: ${education || 'N/A'} ${matchLabel}</div>`;
}

export function showTooltip(
  badge: HTMLElement,
  candidate: ScoredCandidate,
  mustHaveSkills: string[],
  niceToHaveSkills: string[] = []
): void {
  hideTooltip();

  const breakdown = candidate.algorithmicBreakdown;
  const isAIReviewed = candidate.aiReviewed;
  const isProvisional = badge.classList.contains('rai-badge--provisional');

  const tooltip = document.createElement('div');
  tooltip.className = 'rai-tooltip';
  tooltip.innerHTML = `
    <div class="rai-tooltip__header">
      <strong>${candidate.name}</strong>
      <span class="rai-tooltip__score">${Math.round(candidate.matchScore)}%</span>
    </div>
    ${candidate.hiddenGem ? '<div class="rai-tooltip__hidden-gem">Hidden Gem — AI found unlisted strengths</div>' : ''}
    <div class="rai-tooltip__source">
      ${isProvisional
        ? '<span class="rai-tooltip__source-tag rai-tooltip__source-tag--algo">Instant Score</span> <span class="rai-tooltip__source-pending">AI review pending...</span>'
        : isAIReviewed
          ? '<span class="rai-tooltip__source-tag rai-tooltip__source-tag--ai">AI Reviewed</span>'
          : '<span class="rai-tooltip__source-tag rai-tooltip__source-tag--algo">Algorithmic</span>'
      }
    </div>
    <div class="rai-tooltip__section-title">Must-Have Skills (${breakdown ? `${breakdown.skillHits.length}/${breakdown.skillHits.length + breakdown.skillMisses.length}` : '?'} matched)</div>
    <div class="rai-tooltip__skills">
      ${createSkillChecklist(mustHaveSkills, breakdown, candidate.skills)}
    </div>
    ${createNiceToHaveSection(niceToHaveSkills, breakdown)}
    <div class="rai-tooltip__bars">
      ${createBar('Skills (45%)', breakdown?.skillScore ?? candidate.scoreBreakdown.skillMatch)}
      ${createBar('Experience (30%)', breakdown?.experienceScore ?? candidate.scoreBreakdown.experienceMatch)}
      ${createBar('Location (10%)', breakdown?.locationScore ?? candidate.scoreBreakdown.locationMatch)}
      ${createBar('Education (15%)', breakdown?.educationScore ?? candidate.scoreBreakdown.overallFit)}
    </div>
    ${createExperienceBar(breakdown, candidate.totalExperience)}
    ${createLocationLine(breakdown, candidate.location)}
    ${createEducationLine(breakdown, candidate.totalExperience ? undefined : undefined)}
    ${candidate.reasoning ? `
      <div class="rai-tooltip__ai-section">
        <div class="rai-tooltip__section-title">AI Review</div>
        <div class="rai-tooltip__reasoning">${candidate.reasoning}</div>
      </div>
    ` : ''}
    ${candidate.highlights.length ? `<div class="rai-tooltip__highlights">${candidate.highlights.map((h) => `<div class="rai-tooltip__highlight">\u2726 ${h}</div>`).join('')}</div>` : ''}
    ${candidate.redFlags.length ? `<div class="rai-tooltip__red-flags">${candidate.redFlags.map((f) => `<div class="rai-tooltip__red-flag">\u26A0 ${f}</div>`).join('')}</div>` : ''}
    <div class="rai-tooltip__actions">
      <button class="rai-tooltip__disagree-btn" data-candidate-id="${candidate.id}" data-profile-url="${candidate.profileUrl}" data-score="${candidate.matchScore}">
        Disagree with score?
      </button>
    </div>
  `;

  // Wire up disagree button
  const disagreeBtn = tooltip.querySelector('.rai-tooltip__disagree-btn') as HTMLButtonElement;
  if (disagreeBtn) {
    disagreeBtn.addEventListener('click', () => {
      const candidateId = disagreeBtn.dataset.candidateId || '';
      const profileUrl = disagreeBtn.dataset.profileUrl || '';
      const currentScore = parseFloat(disagreeBtn.dataset.score || '0');

      // Store in chrome.storage
      chrome.storage.local.get('rai_disagreements', (result) => {
        const disagreements = result.rai_disagreements || [];
        disagreements.push({
          candidateId,
          profileUrl,
          currentScore,
          timestamp: Date.now(),
        });
        chrome.storage.local.set({ rai_disagreements: disagreements });
      });

      // Send to service worker for potential backend sync
      chrome.runtime.sendMessage({
        type: 'SCORE_DISAGREE',
        candidateId,
        profileUrl,
        currentScore,
      }).catch(() => {});

      disagreeBtn.textContent = 'Feedback recorded';
      disagreeBtn.disabled = true;
      disagreeBtn.classList.add('rai-tooltip__disagree-btn--done');
    });
  }

  // Position near badge
  const rect = badge.getBoundingClientRect();
  tooltip.style.top = `${rect.bottom + window.scrollY + 8}px`;
  tooltip.style.left = `${rect.left + window.scrollX}px`;

  document.body.appendChild(tooltip);
  activeTooltip = tooltip;

  // Close on click outside
  const closeHandler = (e: MouseEvent) => {
    if (!tooltip.contains(e.target as Node) && e.target !== badge) {
      hideTooltip();
      document.removeEventListener('click', closeHandler);
    }
  };
  setTimeout(() => document.addEventListener('click', closeHandler), 0);
}

// Provisional tooltip (before LLM scores arrive)
export function showProvisionalTooltip(
  badge: HTMLElement,
  profile: { name: string; profileUrl?: string; skills: string[]; totalExperience?: string; location?: string; education?: string },
  algoBreakdown: AlgorithmicScoreBreakdown,
  mustHaveSkills: string[],
  niceToHaveSkills: string[] = []
): void {
  // Build a pseudo ScoredCandidate for the tooltip
  const pseudoCandidate: ScoredCandidate = {
    id: '',
    name: profile.name,
    profileUrl: profile.profileUrl || '',
    matchScore: algoBreakdown.totalScore,
    scoreBreakdown: {
      skillMatch: algoBreakdown.skillScore,
      experienceMatch: algoBreakdown.experienceScore,
      locationMatch: algoBreakdown.locationScore,
      overallFit: algoBreakdown.educationScore,
    },
    reasoning: '',
    redFlags: [],
    highlights: [],
    skills: profile.skills,
    totalExperience: profile.totalExperience,
    location: profile.location,
    pipelineStatus: 'SCREENED',
    noteCount: 0,
    scoreSource: 'algorithmic',
    algorithmicBreakdown: algoBreakdown,
    aiReviewed: false,
  };

  showTooltip(badge, pseudoCandidate, mustHaveSkills, niceToHaveSkills);
}

export function hideTooltip(): void {
  if (activeTooltip) {
    activeTooltip.remove();
    activeTooltip = null;
  }
}
