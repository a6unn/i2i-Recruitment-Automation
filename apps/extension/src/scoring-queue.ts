import type { ScrapedProfile, ScoredCandidate } from '@recruitment/shared';
import { scoreProfiles } from './api-client';
import { getCachedScores, setCachedScores, updateStats, setStatsInProgress } from './cache';

const BATCH_SIZE = 25;

interface QueueState {
  pending: { profile: ScrapedProfile; jdId: string }[];
  processing: boolean;
}

type ResultCallback = (scores: ScoredCandidate[], jdId: string) => void;
type ErrorCallback = (error: string, jdId: string) => void;

export class ScoringQueue {
  private state: QueueState = { pending: [], processing: false };
  private onResult: ResultCallback;
  private onError: ErrorCallback;

  constructor(onResult: ResultCallback, onError: ErrorCallback) {
    this.onResult = onResult;
    this.onError = onError;
    this.restoreState();
  }

  private async restoreState(): Promise<void> {
    try {
      const result = await chrome.storage.session.get('queueState');
      if (result.queueState) {
        this.state.pending = result.queueState.pending || [];
        if (this.state.pending.length > 0) {
          this.processNext();
        }
      }
    } catch {
      // session storage may not be available
    }
  }

  private async saveState(): Promise<void> {
    try {
      await chrome.storage.session.set({
        queueState: { pending: this.state.pending },
      });
    } catch {
      // ignore
    }
  }

  async enqueue(profiles: ScrapedProfile[], jdId: string): Promise<void> {
    // Check cache — skip already-scored profiles
    const urlsToCheck = profiles
      .map((p) => p.profileUrl)
      .filter((url): url is string => !!url);

    const cached = await getCachedScores(urlsToCheck, jdId);

    // Emit cached results immediately
    if (cached.size > 0) {
      console.log(`ScoringQueue: ${cached.size} cached scores found`);
      this.onResult(Array.from(cached.values()), jdId);
    }

    // Filter out cached profiles
    const uncached = profiles.filter(
      (p) => !p.profileUrl || !cached.has(p.profileUrl)
    );

    if (uncached.length === 0) {
      console.log('ScoringQueue: All profiles already cached');
      return;
    }

    console.log(`ScoringQueue: Enqueuing ${uncached.length} uncached profiles`);

    // Add to pending queue
    for (const profile of uncached) {
      this.state.pending.push({ profile, jdId });
    }
    await this.saveState();

    if (!this.state.processing) {
      this.processNext();
    }
  }

  private async processNext(): Promise<void> {
    if (this.state.pending.length === 0) {
      this.state.processing = false;
      return;
    }

    this.state.processing = true;

    // Take one batch (same jdId)
    const jdId = this.state.pending[0].jdId;
    const batch: ScrapedProfile[] = [];
    const remaining: QueueState['pending'] = [];

    for (const item of this.state.pending) {
      if (item.jdId === jdId && batch.length < BATCH_SIZE) {
        batch.push(item.profile);
      } else {
        remaining.push(item);
      }
    }
    this.state.pending = remaining;
    await this.saveState();

    await setStatsInProgress(jdId, true);

    console.log(`ScoringQueue: Sending batch of ${batch.length} profiles to API...`);

    try {
      const response = await scoreProfiles({ profiles: batch, jdId });

      console.log('ScoringQueue: API response:', JSON.stringify(response).slice(0, 200));

      if (response.success && response.data) {
        const scores = response.data.scores;
        console.log(`ScoringQueue: Got ${scores.length} scores back`);
        // Cache results
        await setCachedScores(scores, jdId);
        // Update stats
        await updateStats(jdId, scores);
        // Notify content script
        this.onResult(scores, jdId);
      } else {
        const errMsg = response.error || 'API returned unsuccessful response';
        console.error('ScoringQueue: API error:', errMsg);
        this.onError(errMsg, jdId);
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error('ScoringQueue: Fetch failed:', errMsg);
      this.onError(`Scoring failed: ${errMsg}`, jdId);
    }

    await setStatsInProgress(jdId, this.state.pending.length > 0);

    // Process next batch (sequential to avoid rate limits)
    if (this.state.pending.length > 0) {
      this.processNext();
    } else {
      this.state.processing = false;
    }
  }

  get pendingCount(): number {
    return this.state.pending.length;
  }

  get isProcessing(): boolean {
    return this.state.processing;
  }
}
