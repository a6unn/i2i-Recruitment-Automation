import type { ScoredCandidate, ExtensionUser, ActiveJD, ScoringStats } from '@recruitment/shared';

const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

function scoreKey(profileUrl: string, jdId: string): string {
  return `score:${profileUrl}:${jdId}`;
}

// --- Score Cache ---

export async function getCachedScore(
  profileUrl: string,
  jdId: string
): Promise<ScoredCandidate | null> {
  const key = scoreKey(profileUrl, jdId);
  const result = await chrome.storage.local.get(key);
  const entry = result[key];
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL) {
    await chrome.storage.local.remove(key);
    return null;
  }
  return entry.data;
}

export async function getCachedScores(
  profileUrls: string[],
  jdId: string
): Promise<Map<string, ScoredCandidate>> {
  const keys = profileUrls.map((url) => scoreKey(url, jdId));
  const result = await chrome.storage.local.get(keys);
  const map = new Map<string, ScoredCandidate>();

  for (const url of profileUrls) {
    const entry = result[scoreKey(url, jdId)];
    if (entry && Date.now() - entry.timestamp <= CACHE_TTL) {
      map.set(url, entry.data);
    }
  }
  return map;
}

export async function setCachedScores(
  scores: ScoredCandidate[],
  jdId: string
): Promise<void> {
  const entries: Record<string, { data: ScoredCandidate; timestamp: number }> = {};
  const now = Date.now();
  for (const score of scores) {
    if (score.profileUrl) {
      entries[scoreKey(score.profileUrl, jdId)] = { data: score, timestamp: now };
    }
  }
  await chrome.storage.local.set(entries);
}

// --- Auth State ---

export async function getAuth(): Promise<{
  token: string;
  user: ExtensionUser;
} | null> {
  const result = await chrome.storage.local.get('auth');
  return result.auth ?? null;
}

export async function setAuth(token: string, user: ExtensionUser): Promise<void> {
  await chrome.storage.local.set({ auth: { token, user } });
}

export async function clearAuth(): Promise<void> {
  await chrome.storage.local.remove('auth');
}

// --- Active JD State ---

export async function getActiveJD(): Promise<ActiveJD | null> {
  const result = await chrome.storage.local.get('activeJD');
  return result.activeJD ?? null;
}

export async function setActiveJD(jd: ActiveJD): Promise<void> {
  await chrome.storage.local.set({ activeJD: jd });
}

// --- Scoring Stats ---

export async function getStats(jdId: string): Promise<ScoringStats> {
  const result = await chrome.storage.local.get(`stats:${jdId}`);
  return (
    result[`stats:${jdId}`] ?? {
      total: 0,
      green: 0,
      yellow: 0,
      red: 0,
      bestScore: 0,
      bestName: '',
      inProgress: false,
      algoScoredCount: 0,
      aiReviewedCount: 0,
      aiInProgressCount: 0,
    }
  );
}

export async function updateStats(
  jdId: string,
  scores: ScoredCandidate[]
): Promise<ScoringStats> {
  const current = await getStats(jdId);

  // Track seen profileUrls to avoid double-counting
  const seenKey = `seen:${jdId}`;
  const seenResult = await chrome.storage.local.get(seenKey);
  const seen = new Set<string>(seenResult[seenKey] ?? []);

  for (const s of scores) {
    const key = s.profileUrl || s.name;
    if (seen.has(key)) continue; // Already counted
    seen.add(key);

    current.total++;
    if (s.matchScore >= 80) current.green++;
    else if (s.matchScore >= 50) current.yellow++;
    else current.red++;
    if (s.matchScore > current.bestScore) {
      current.bestScore = s.matchScore;
      current.bestName = s.name;
    }
    if (s.aiReviewed) {
      current.aiReviewedCount = (current.aiReviewedCount ?? 0) + 1;
    }
  }

  await chrome.storage.local.set({
    [`stats:${jdId}`]: current,
    [seenKey]: Array.from(seen),
  });
  return current;
}

export async function updateAlgoScoredCount(
  jdId: string,
  count: number
): Promise<void> {
  const stats = await getStats(jdId);
  stats.algoScoredCount = (stats.algoScoredCount ?? 0) + count;
  await chrome.storage.local.set({ [`stats:${jdId}`]: stats });
}

export async function setAIInProgressCount(
  jdId: string,
  count: number
): Promise<void> {
  const stats = await getStats(jdId);
  stats.aiInProgressCount = count;
  await chrome.storage.local.set({ [`stats:${jdId}`]: stats });
}

export async function setStatsInProgress(
  jdId: string,
  inProgress: boolean
): Promise<void> {
  const stats = await getStats(jdId);
  stats.inProgress = inProgress;
  if (!inProgress) {
    stats.aiInProgressCount = 0;
  }
  await chrome.storage.local.set({ [`stats:${jdId}`]: stats });
}

// --- Side Panel Candidates ---

function panelKey(jdId: string): string {
  return `panel:${jdId}`;
}

export async function getPanelCandidates(jdId: string): Promise<ScoredCandidate[]> {
  const key = panelKey(jdId);
  const result = await chrome.storage.local.get(key);
  const entry = result[key];
  if (!entry) return [];
  if (Date.now() - entry.timestamp > CACHE_TTL) {
    await chrome.storage.local.remove(key);
    return [];
  }
  return entry.data;
}

export async function setPanelCandidates(jdId: string, candidates: ScoredCandidate[]): Promise<void> {
  const key = panelKey(jdId);
  await chrome.storage.local.set({ [key]: { data: candidates, timestamp: Date.now() } });
}

// --- Clear All ---

export async function clearCache(): Promise<void> {
  const all = await chrome.storage.local.get(null);
  const scoreKeys = Object.keys(all).filter((k) =>
    k.startsWith('score:') || k.startsWith('stats:') || k.startsWith('panel:') || k.startsWith('seen:')
  );
  await chrome.storage.local.remove(scoreKeys);
}
