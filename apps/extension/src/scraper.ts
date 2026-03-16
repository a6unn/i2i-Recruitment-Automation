import { SELECTORS } from './selectors.config';
import type { ScrapedProfile } from '@recruitment/shared';

function getText(el: Element, selector: string): string | undefined {
  const selectors = selector.split(', ');
  for (const sel of selectors) {
    const node = el.querySelector(sel);
    if (node?.textContent?.trim()) {
      return node.textContent.trim();
    }
  }
  return undefined;
}

function getHref(el: Element, selector: string): string | undefined {
  const selectors = selector.split(', ');
  for (const sel of selectors) {
    const node = el.querySelector(sel) as HTMLAnchorElement | null;
    if (node?.href) return node.href;
  }
  return undefined;
}

/**
 * Normalize RESDEX profile URLs by keeping identifying params and stripping session-specific ones.
 * RESDEX URLs look like: /v3/preview?tabKey=profile&id=12345&paramStr_701518c=...
 * The `id` is the candidate identifier. `paramStr_*` and other params are session-specific.
 */
export function normalizeProfileUrl(url: string): string {
  try {
    const parsed = new URL(url);
    // Keep only identifying params (id, tabKey), strip session params (paramStr_*, etc.)
    const keepParams = ['id', 'tabkey', 'tabKey'];
    const normalized = new URL(parsed.origin + parsed.pathname);
    for (const key of keepParams) {
      const val = parsed.searchParams.get(key);
      if (val) normalized.searchParams.set(key, val);
    }
    return normalized.toString();
  } catch {
    return url;
  }
}

/**
 * RESDEX uses a grid layout for candidate details.
 * Each row has a label (Current, Previous, Education, Key skills, etc.)
 * and a value. This function extracts value by matching the label text.
 */
function getDetailByLabel(card: Element, label: string): string | undefined {
  // Try candidate-details grid rows
  const rows = card.querySelectorAll('.candidate-details > div, .candidate-details tr, .candidate-details [class*="detail"]');
  for (const row of rows) {
    const text = row.textContent?.trim() || '';
    if (text.toLowerCase().startsWith(label.toLowerCase())) {
      // Remove the label prefix and return the value
      const value = text.slice(label.length).trim();
      if (value) return value;
    }
  }

  // Also try looking for cells/spans that contain the label
  const allCells = card.querySelectorAll('td, th, span, div, p');
  for (let i = 0; i < allCells.length; i++) {
    const cell = allCells[i];
    const cellText = cell.textContent?.trim() || '';
    if (cellText.toLowerCase() === label.toLowerCase() || cellText.toLowerCase() === label.toLowerCase() + ':') {
      // Get the next sibling or the value in the same parent
      const next = allCells[i + 1];
      if (next?.textContent?.trim()) {
        return next.textContent.trim();
      }
    }
  }

  return undefined;
}

function getSkills(card: Element): string[] {
  // First try direct selector
  const selectors = SELECTORS.skills.split(', ');
  for (const sel of selectors) {
    const nodes = card.querySelectorAll(sel);
    if (nodes.length > 0) {
      return Array.from(nodes)
        .map((n) => n.textContent?.trim())
        .filter((s): s is string => !!s && s.length > 1);
    }
  }

  // Fallback: find "Key skills" row and parse pipe-separated text
  const skillsText = getDetailByLabel(card, 'Key skills');
  if (skillsText) {
    return skillsText
      .split(/[|,]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 1);
  }

  // Last resort: find any element with multiple pipe-separated items
  const allText = card.querySelectorAll('div, span, p');
  for (const el of allText) {
    const t = el.textContent?.trim() || '';
    if (t.includes('|') && t.split('|').length >= 3) {
      const parent = el.parentElement;
      const parentText = parent?.textContent?.trim() || '';
      if (parentText.toLowerCase().includes('skill') || parentText.toLowerCase().includes('key')) {
        return t.split('|').map(s => s.trim()).filter(s => s.length > 1);
      }
    }
  }

  return [];
}

function getExperience(card: Element): string | undefined {
  // Try selector first
  const exp = getText(card, SELECTORS.totalExperience);
  if (exp) return exp;

  // Look for pattern like "8y 0m" or "7y 5m" in tuple-top area
  const tupleTop = card.querySelector('.tuple-top, .flex-row.tuple-top');
  if (tupleTop) {
    const text = tupleTop.textContent || '';
    const match = text.match(/(\d+y\s*\d*m?)/);
    if (match) return match[1];
  }

  return undefined;
}

function getLocation(card: Element): string | undefined {
  const loc = getText(card, SELECTORS.location);
  if (loc) return loc;

  // Look in tuple-top for a city name (after the location icon)
  const tupleTop = card.querySelector('.tuple-top, .flex-row.tuple-top');
  if (tupleTop) {
    const spans = tupleTop.querySelectorAll('span, div');
    for (const span of spans) {
      const text = span.textContent?.trim() || '';
      // Location typically doesn't contain numbers/currency/years
      if (text && !text.includes('₹') && !text.match(/^\d+y/) && !text.includes('Lac') && text.length > 2 && text.length < 50) {
        // Check if it looks like a city
        const cities = ['chennai', 'bangalore', 'bengaluru', 'mumbai', 'delhi', 'hyderabad', 'pune', 'kolkata', 'noida', 'gurgaon', 'gurugram'];
        if (cities.some(c => text.toLowerCase().includes(c))) {
          return text;
        }
      }
    }
  }

  // Try preferred locations from details
  return getDetailByLabel(card, 'Pref. locations');
}

function getSalary(card: Element): string | undefined {
  const sal = getText(card, SELECTORS.salary);
  if (sal) return sal;

  // Look for ₹ pattern in tuple-top
  const tupleTop = card.querySelector('.tuple-top, .flex-row.tuple-top');
  if (tupleTop) {
    const text = tupleTop.textContent || '';
    const match = text.match(/₹\s*[\d,.]+\s*(?:Lacs?|Lakhs?|LPA|Cr)?/i);
    if (match) return match[0];
  }

  return undefined;
}

export function scrapeProfileCard(card: Element): ScrapedProfile | null {
  // Get name from link
  const name = getText(card, SELECTORS.candidateName);
  if (!name) {
    console.log('RecruitAI: Skipping card — no name found', card.className);
    return null;
  }

  const profile: ScrapedProfile = {
    name,
    currentTitle: getDetailByLabel(card, 'Current') || getText(card, SELECTORS.currentTitle),
    totalExperience: getExperience(card),
    location: getLocation(card),
    skills: getSkills(card),
    salary: getSalary(card),
    education: getDetailByLabel(card, 'Education'),
    lastActive: getText(card, SELECTORS.lastActive),
    profileSummary: getText(card, SELECTORS.profileSummary),
    profileUrl: getHref(card, SELECTORS.profileUrl),
  };

  // Extract company from current title if it contains "at"
  if (profile.currentTitle?.includes(' at ')) {
    const parts = profile.currentTitle.split(' at ');
    profile.currentCompany = parts.pop()?.trim();
    profile.currentTitle = parts.join(' at ').trim();
  }

  console.log(`RecruitAI: Scraped "${name}" — ${profile.skills.length} skills, exp: ${profile.totalExperience || 'N/A'}`);
  return profile;
}

export function scrapeProfileCards(): ScrapedProfile[] {
  const cards = getProfileCards();
  console.log(`RecruitAI: Found ${cards.length} profile cards on page`);

  return cards
    .map(scrapeProfileCard)
    .filter((p): p is ScrapedProfile => p !== null);
}

export function getProfileCards(): Element[] {
  const selectors = SELECTORS.profileCard.split(', ');
  for (const sel of selectors) {
    const cards = Array.from(document.querySelectorAll(sel));
    if (cards.length > 0) {
      console.log(`RecruitAI: Matched ${cards.length} cards with selector "${sel}"`);
      return cards;
    }
  }
  console.log('RecruitAI: No profile cards found with any selector');
  return [];
}
