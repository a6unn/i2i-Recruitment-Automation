import type { ScoredCandidate, ScrapedProfile, HybridScoreRequest } from '@recruitment/shared';
import {
  getAuth,
  setAuth,
  clearAuth,
  getActiveJD,
  setActiveJD,
  getStats,
  clearCache,
  getCachedScores,
  setCachedScores,
  updateStats,
  setStatsInProgress,
  updateAlgoScoredCount,
  setAIInProgressCount,
  getPanelCandidates,
  setPanelCandidates,
} from './cache';
import { shortlistCandidates, addNote, exportCsv, getJDs, scoreProfiles, scoreProfilesHybrid } from './api-client';

const BATCH_SIZE = 25;

// Broadcast scored results to all RESDEX tabs
async function broadcastToResdexTabs(type: string, data: Record<string, unknown>) {
  const tabs = await chrome.tabs.query({ url: 'https://resdex.naukri.com/*' });
  for (const tab of tabs) {
    if (tab.id) {
      chrome.tabs.sendMessage(tab.id, { type, ...data }).catch(() => {});
    }
  }
}

chrome.runtime.onInstalled.addListener(() => {
  console.log('RecruitAI Screener extension installed');
});

// Single message router
chrome.runtime.onMessage.addListener(
  (message: { type: string; [key: string]: unknown }, _sender, sendResponse) => {
    handleMessage(message, sendResponse);
    return true;
  }
);

async function handleMessage(
  message: { type: string; [key: string]: unknown },
  sendResponse: (response: unknown) => void
) {
  try {
    switch (message.type) {
      case 'SCORE_PROFILES': {
        const profiles = message.profiles as ScrapedProfile[];
        const jdId = message.jdId as string;
        const algorithmicScores = message.algorithmicScores as HybridScoreRequest['algorithmicScores'] | undefined;

        console.log(`SW: Received ${profiles.length} profiles for scoring (hybrid: ${!!algorithmicScores})`);

        // Check cache first
        const urls = profiles.map(p => p.profileUrl).filter((u): u is string => !!u);
        const cached = await getCachedScores(urls, jdId);
        const cachedScores = Array.from(cached.values());

        const uncached = profiles.filter(p => !p.profileUrl || !cached.has(p.profileUrl));
        console.log(`SW: ${cached.size} cached, ${uncached.length} to score`);

        if (uncached.length === 0) {
          sendResponse({ success: true, scores: cachedScores });
          break;
        }

        // Score all batches and collect results
        const allScores = [...cachedScores];

        if (algorithmicScores) {
          // Hybrid mode: pass algorithmic pre-scores to backend
          const uncachedAlgoScores = algorithmicScores.filter(a => {
            const profile = profiles[a.profileIndex];
            return profile.profileUrl && !cached.has(profile.profileUrl);
          });
          const result = await processHybridScoring(uncached, jdId, uncachedAlgoScores);
          allScores.push(...result);
        } else {
          // Legacy mode: full LLM scoring
          const result = await processScoring(uncached, jdId);
          allScores.push(...result);
        }

        console.log(`SW: Total ${allScores.length} scores, sending to content script`);
        sendResponse({ success: true, scores: allScores });
        break;
      }

      case 'GET_AUTH': {
        const auth = await getAuth();
        sendResponse({ success: true, data: auth });
        break;
      }

      case 'SET_AUTH': {
        await setAuth(
          message.token as string,
          message.user as Parameters<typeof setAuth>[1]
        );
        sendResponse({ success: true });
        break;
      }

      case 'LOGOUT': {
        await clearAuth();
        await clearCache();
        sendResponse({ success: true });
        break;
      }

      case 'GET_ACTIVE_JD': {
        const jd = await getActiveJD();
        sendResponse({ success: true, data: jd });
        break;
      }

      case 'SET_ACTIVE_JD': {
        await setActiveJD(message.jd as Parameters<typeof setActiveJD>[0]);
        sendResponse({ success: true });
        break;
      }

      case 'GET_STATS': {
        const activeJD = await getActiveJD();
        if (!activeJD) {
          sendResponse({ success: true, data: null });
          break;
        }
        const stats = await getStats(activeJD.id);
        sendResponse({ success: true, data: stats });
        break;
      }

      case 'SHORTLIST_CANDIDATES': {
        const result = await shortlistCandidates(message.candidateIds as string[]);
        sendResponse(result);
        break;
      }

      case 'ADD_NOTE': {
        const result = await addNote(message.candidateId as string, message.content as string);
        sendResponse(result);
        break;
      }

      case 'EXPORT_CSV': {
        const blob = await exportCsv(message.jdId as string);
        const url = URL.createObjectURL(blob);
        await chrome.downloads.download({ url, filename: `candidates-${message.jdId}.csv` });
        sendResponse({ success: true });
        break;
      }

      case 'GET_JDS': {
        const result = await getJDs();
        sendResponse(result);
        break;
      }

      case 'CLEAR_CACHE': {
        await clearCache();
        sendResponse({ success: true });
        break;
      }

      case 'GET_PANEL_CANDIDATES': {
        const jd = await getActiveJD();
        if (!jd) {
          sendResponse({ success: true, data: [] });
          break;
        }
        const candidates = await getPanelCandidates(jd.id);
        sendResponse({ success: true, data: candidates });
        break;
      }

      case 'SET_PANEL_CANDIDATES': {
        const jd = await getActiveJD();
        if (jd) {
          await setPanelCandidates(jd.id, message.candidates as ScoredCandidate[]);
        }
        sendResponse({ success: true });
        break;
      }

      case 'SCORE_DISAGREE': {
        // Store disagreement for future feedback loop
        console.log(`SW: Score disagreement recorded for ${message.profileUrl}`);
        // TODO: sync to backend when feedback endpoint is ready
        sendResponse({ success: true });
        break;
      }

      default:
        sendResponse({ success: false, error: `Unknown message type: ${message.type}` });
    }
  } catch (error) {
    console.error('SW: Message handler error:', error);
    sendResponse({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

// Legacy scoring (full LLM for all profiles)
async function processScoring(profiles: ScrapedProfile[], jdId: string): Promise<ScoredCandidate[]> {
  await setStatsInProgress(jdId, true);
  const allScores: ScoredCandidate[] = [];

  for (let i = 0; i < profiles.length; i += BATCH_SIZE) {
    const batch = profiles.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    console.log(`SW: Scoring batch ${batchNum} (${batch.length} profiles)...`);

    try {
      const response = await scoreProfiles({ profiles: batch, jdId });
      console.log(`SW: Batch ${batchNum} response: success=${response.success}, error=${response.error || 'none'}`);

      if (response.success && response.data) {
        const scores = response.data.scores;
        console.log(`SW: Batch ${batchNum} got ${scores.length} scores`);
        await setCachedScores(scores, jdId);
        await updateStats(jdId, scores);
        allScores.push(...scores);
      } else {
        console.error(`SW: Batch ${batchNum} API error:`, response.error);
      }
    } catch (error) {
      console.error(`SW: Batch ${batchNum} fetch failed:`, error);
    }
  }

  await setStatsInProgress(jdId, false);
  console.log(`SW: All batches complete, ${allScores.length} total scores`);
  return allScores;
}

// Hybrid scoring (algorithmic pre-scores + tier-based LLM)
async function processHybridScoring(
  profiles: ScrapedProfile[],
  jdId: string,
  algorithmicScores: HybridScoreRequest['algorithmicScores']
): Promise<ScoredCandidate[]> {
  await setStatsInProgress(jdId, true);
  await updateAlgoScoredCount(jdId, profiles.length);

  // Count edge cases (evaluate + rescue tiers)
  const edgeCaseCount = algorithmicScores.filter(a => a.tier !== 'confirm').length;
  await setAIInProgressCount(jdId, edgeCaseCount);

  const allScores: ScoredCandidate[] = [];

  for (let i = 0; i < profiles.length; i += BATCH_SIZE) {
    const batch = profiles.slice(i, i + BATCH_SIZE);
    const batchAlgoScores = algorithmicScores.slice(i, i + BATCH_SIZE).map((a, idx) => ({
      ...a,
      profileIndex: idx, // Re-index for the batch
    }));

    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    console.log(`SW: Hybrid scoring batch ${batchNum} (${batch.length} profiles)...`);

    try {
      const response = await scoreProfilesHybrid({
        profiles: batch,
        jdId,
        algorithmicScores: batchAlgoScores,
      });

      if (response.success && response.data) {
        const scores = response.data.scores;
        console.log(`SW: Hybrid batch ${batchNum} got ${scores.length} scores`);
        await setCachedScores(scores, jdId);
        await updateStats(jdId, scores);
        allScores.push(...scores);
      } else {
        console.error(`SW: Hybrid batch ${batchNum} API error:`, response.error);
        // Fallback: try legacy scoring
        const fallback = await scoreProfiles({ profiles: batch, jdId });
        if (fallback.success && fallback.data) {
          await setCachedScores(fallback.data.scores, jdId);
          await updateStats(jdId, fallback.data.scores);
          allScores.push(...fallback.data.scores);
        }
      }
    } catch (error) {
      console.error(`SW: Hybrid batch ${batchNum} fetch failed:`, error);
    }
  }

  await setStatsInProgress(jdId, false);
  console.log(`SW: All hybrid batches complete, ${allScores.length} total scores`);
  return allScores;
}
