import { z } from 'zod';
import { callClaude } from './client';
import type { ParsedJD, ScrapedProfile, CandidateScore, ScoringTier, AlgorithmicScoreBreakdown } from '@recruitment/shared';

const CandidateScoreSchema = z.object({
  matchScore: z.number().min(0).max(100),
  scoreBreakdown: z.object({
    skillMatch: z.number().min(0).max(100),
    experienceMatch: z.number().min(0).max(100),
    locationMatch: z.number().min(0).max(100),
    overallFit: z.number().min(0).max(100),
  }),
  reasoning: z.string(),
  redFlags: z.array(z.string()),
  highlights: z.array(z.string()),
  hiddenGem: z.boolean().optional(),
});

const BatchScoreSchema = z.array(
  z.object({
    profileIndex: z.number(),
    score: CandidateScoreSchema,
  })
);

const SYSTEM_PROMPT = `You are an expert recruitment screener. You score candidate profiles against a job description.

You MUST respond with ONLY valid JSON — no markdown, no code fences, no extra text.

Scoring weights:
- skillMatch (45%): How well the candidate's skills match must-have and nice-to-have skills
- experienceMatch (30%): Years of experience vs required range, relevance of past roles
- locationMatch (10%): Candidate location vs job locations (100 if match or remote-friendly, 50 if same state/region, 20 if different)
- overallFit (15%): Title alignment, industry relevance, career trajectory

Each dimension is scored 0-100. The final matchScore is the weighted average:
matchScore = (skillMatch * 0.45) + (experienceMatch * 0.30) + (locationMatch * 0.10) + (overallFit * 0.15)

Rules:
- Score strictly — a 90+ should be an exceptional match, not just "has some skills"
- Must-have skills missing = significant penalty to skillMatch
- Red flags: overqualified, job-hopping (3+ companies in 2 years), skills mismatch, very old last-active
- Highlights: exact skill matches, relevant industry, ideal experience range
- Keep reasoning to 1-2 sentences
- Keep each red flag and highlight to 1 short sentence
- Maximum 3 red flags and 3 highlights per candidate`;

// Tier-specific prompts for hybrid scoring
const TIER_PROMPTS: Record<ScoringTier, string> = {
  confirm: `These candidates scored 85+ algorithmically (strong skill match). Your job is to CONFIRM or flag issues.
For each candidate, briefly note any red flags the algorithm couldn't catch (job-hopping, stale profile, misleading titles).
Keep reasoning to 1 sentence. Only adjust the score if you find a real issue (lower by 5-15 points).
If everything looks good, keep the algorithmic score.`,

  evaluate: `These candidates scored 50-84 algorithmically (partial match). Your job is to EVALUATE deeply.
Assess: role relevance, career trajectory, transferable skills, culture fit signals.
The algorithm may have missed context — weigh experience quality, not just keyword matches.
Give a full assessment in 1-2 sentences. Adjust score up or down as warranted.`,

  rescue: `These candidates scored below 50 algorithmically (weak skill match). Your job is to RESCUE hidden gems.
Look for: transferable skills from adjacent domains, rapid career growth, strong companies, relevant project experience that keywords missed.
If you find hidden strengths, set "hiddenGem": true and explain why in reasoning.
Keep reasoning to 1 sentence. Only adjust score UP if you find genuine hidden value.`,
};

function buildPrompt(profiles: ScrapedProfile[], parsedJD: ParsedJD): string {
  const jdSummary = `JOB DESCRIPTION:
Title: ${parsedJD.jobTitle}
Must-Have Skills: ${parsedJD.mustHaveSkills.join(', ')}
Nice-to-Have Skills: ${parsedJD.niceToHaveSkills.join(', ')}
Experience: ${parsedJD.experienceRange.min}-${parsedJD.experienceRange.max} years
Locations: ${parsedJD.locations.join(', ')}
Education: ${parsedJD.education.join(', ')}
Industry: ${parsedJD.industry || 'Any'}
Key Responsibilities: ${parsedJD.keyResponsibilities.join('; ')}`;

  const profilesList = profiles
    .map(
      (p, i) => `[${i}] ${p.name}
  Title: ${p.currentTitle || 'N/A'}
  Company: ${p.currentCompany || 'N/A'}
  Experience: ${p.totalExperience || 'N/A'}
  Location: ${p.location || 'N/A'}
  Skills: ${p.skills.join(', ') || 'N/A'}
  Education: ${p.education || 'N/A'}
  Last Active: ${p.lastActive || 'N/A'}
  Summary: ${p.profileSummary || 'N/A'}`
    )
    .join('\n\n');

  return `${jdSummary}

CANDIDATES TO SCORE:
${profilesList}

Return a JSON array where each element has:
- "profileIndex": the [index] number from above
- "score": { "matchScore", "scoreBreakdown": { "skillMatch", "experienceMatch", "locationMatch", "overallFit" }, "reasoning", "redFlags", "highlights" }`;
}

function buildHybridPrompt(
  profiles: ScrapedProfile[],
  parsedJD: ParsedJD,
  algoScores: { profileIndex: number; algoScore: AlgorithmicScoreBreakdown; tier: ScoringTier }[],
  tier: ScoringTier
): string {
  const jdSummary = `JOB DESCRIPTION:
Title: ${parsedJD.jobTitle}
Must-Have Skills: ${parsedJD.mustHaveSkills.join(', ')}
Nice-to-Have Skills: ${parsedJD.niceToHaveSkills.join(', ')}
Experience: ${parsedJD.experienceRange.min}-${parsedJD.experienceRange.max} years
Locations: ${parsedJD.locations.join(', ')}
Education: ${parsedJD.education.join(', ')}
Industry: ${parsedJD.industry || 'Any'}`;

  const profilesList = algoScores
    .map((a) => {
      const p = profiles[a.profileIndex];
      return `[${a.profileIndex}] ${p.name}
  Title: ${p.currentTitle || 'N/A'}
  Company: ${p.currentCompany || 'N/A'}
  Experience: ${p.totalExperience || 'N/A'}
  Location: ${p.location || 'N/A'}
  Skills: ${p.skills.join(', ') || 'N/A'}
  Education: ${p.education || 'N/A'}
  Last Active: ${p.lastActive || 'N/A'}
  Summary: ${p.profileSummary || 'N/A'}
  Algorithmic Score: ${a.algoScore.totalScore} (Skills: ${a.algoScore.skillScore}, Exp: ${a.algoScore.experienceScore}, Loc: ${a.algoScore.locationScore}, Edu: ${a.algoScore.educationScore})
  Matched Skills: ${a.algoScore.skillHits.join(', ') || 'none'}
  Missing Skills: ${a.algoScore.skillMisses.join(', ') || 'none'}`;
    })
    .join('\n\n');

  return `${jdSummary}

${TIER_PROMPTS[tier]}

CANDIDATES (${tier.toUpperCase()} tier):
${profilesList}

Return a JSON array where each element has:
- "profileIndex": the [index] number from above
- "score": { "matchScore", "scoreBreakdown": { "skillMatch", "experienceMatch", "locationMatch", "overallFit" }, "reasoning", "redFlags", "highlights"${tier === 'rescue' ? ', "hiddenGem"' : ''} }`;
}

// Token limits per tier (approximate via maxTokens)
const TIER_MAX_TOKENS: Record<ScoringTier, number> = {
  confirm: 1024,   // ~50 tokens/profile × 25
  evaluate: 3072,  // ~200 tokens/profile × 15
  rescue: 1024,    // ~30 tokens/profile × 25
};

export async function scoreBatch(
  profiles: ScrapedProfile[],
  parsedJD: ParsedJD
): Promise<Map<number, CandidateScore>> {
  const prompt = buildPrompt(profiles, parsedJD);

  const response = await callClaude({
    system: SYSTEM_PROMPT,
    prompt,
    maxTokens: 4096,
    temperature: 0,
  });

  const cleaned = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  const parsed = JSON.parse(cleaned);
  const validated = BatchScoreSchema.parse(parsed);

  const results = new Map<number, CandidateScore>();
  for (const item of validated) {
    results.set(item.profileIndex, item.score);
  }
  return results;
}

export async function scoreHybridBatch(
  profiles: ScrapedProfile[],
  parsedJD: ParsedJD,
  algorithmicScores: { profileIndex: number; algoScore: AlgorithmicScoreBreakdown; tier: ScoringTier }[]
): Promise<Map<number, CandidateScore & { hiddenGem?: boolean }>> {
  const results = new Map<number, CandidateScore & { hiddenGem?: boolean }>();

  // Group by tier
  const byTier = new Map<ScoringTier, typeof algorithmicScores>();
  for (const a of algorithmicScores) {
    const tier = a.tier;
    if (!byTier.has(tier)) byTier.set(tier, []);
    byTier.get(tier)!.push(a);
  }

  // Process each tier (can be parallelized if needed)
  const tierPromises: Promise<void>[] = [];

  for (const [tier, tierScores] of byTier.entries()) {
    tierPromises.push(
      (async () => {
        const prompt = buildHybridPrompt(profiles, parsedJD, tierScores, tier);

        try {
          const response = await callClaude({
            system: SYSTEM_PROMPT,
            prompt,
            maxTokens: TIER_MAX_TOKENS[tier],
            temperature: 0,
          });

          const cleaned = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
          const parsed = JSON.parse(cleaned);
          const validated = BatchScoreSchema.parse(parsed);

          for (const item of validated) {
            results.set(item.profileIndex, {
              ...item.score,
              hiddenGem: (item.score as { hiddenGem?: boolean }).hiddenGem,
            });
          }
        } catch (error) {
          console.error(`Hybrid scoring error for tier ${tier}:`, error);
          // Fallback: use algorithmic scores directly
          for (const a of tierScores) {
            results.set(a.profileIndex, {
              matchScore: a.algoScore.totalScore,
              scoreBreakdown: {
                skillMatch: a.algoScore.skillScore,
                experienceMatch: a.algoScore.experienceScore,
                locationMatch: a.algoScore.locationScore,
                overallFit: a.algoScore.educationScore,
              },
              reasoning: 'Algorithmic score (AI review failed)',
              redFlags: [],
              highlights: [],
            });
          }
        }
      })()
    );
  }

  // Run all tiers in parallel for speed
  await Promise.all(tierPromises);

  return results;
}
