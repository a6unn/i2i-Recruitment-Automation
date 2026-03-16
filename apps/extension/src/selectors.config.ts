/**
 * Naukri RESDEX DOM Selector Configuration
 *
 * All CSS selectors for scraping RESDEX profile data are centralized here.
 * When Naukri changes their DOM structure, only this file needs updating.
 *
 * Mapped from live RESDEX session (March 2026).
 */
export const SELECTORS = {
  // Profile card container (each search result)
  profileCard: '.tuple-card, .tuple[data-tuple-id], .tuple.on, .tuple-list > div[class*="tuple"]',

  // Candidate name — the link inside the header area
  candidateName: '.candidate-header a, .title-case a, .tuple-title a',

  // Current role — from the "Current" row in candidate-details grid
  currentTitle: '.candidate-details .current-detail, .candidate-overview',

  // Experience — shown as "8y 0m" in the tuple-top row
  totalExperience: '.tuple-top .exp, .tuple-top [class*="exp"]',

  // Location — shown in tuple-top row
  location: '.tuple-top .loc, .tuple-top [class*="loc"]',

  // Skills — "Key skills" row in candidate-details grid
  skills: '.candidate-details .key-skills span, .candidate-details [class*="skill"] span',

  // Salary — shown in tuple-top row as "₹ 24 Lacs"
  salary: '.tuple-top .sal, .tuple-top [class*="sal"]',

  // Education row in candidate-details
  education: '.candidate-details .education-detail, .candidate-details [class*="edu"]',

  // Last active / freshness
  lastActive: '.tuple-footer [class*="active"], .tuple-bottom [class*="modified"], .tuple-footer',

  // Profile summary text (right section)
  profileSummary: '.right-section .candidate-overview, .right-section [class*="overview"]',

  // Profile URL — the name link's href
  profileUrl: '.candidate-header a, .title-case a, .tuple-title a',

  // Pagination / scroll
  searchResultsList: '.tuple-list',
  nextPageButton: '.pagination .next, [class*="pagination"] a[title="Next"]',
  resultCount: '.search-count, .result-count, [class*="search-count"]',
} as const;

/** Where to inject extension UI elements on the page */
export const INJECTION_TARGETS = {
  summaryBarBefore: '.tuple-list',
  badgeContainer: '.tuple[data-tuple-id], .tuple.on',
  checkboxBefore: '.candidate-header, .title-case',
  sidePanelParent: 'body',
  noteIconAfter: '.rai-badge',
} as const;
