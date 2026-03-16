import { NextRequest, NextResponse } from 'next/server';
import { requireBearerSession } from '@/lib/auth/bearer';
import { prisma } from '@/lib/db';
import { scoreBatch, scoreHybridBatch } from '@/lib/claude/candidate-scorer';
import { Prisma } from '@prisma/client';
import type { ParsedJD, ScrapedProfile, ScoredCandidate, HybridScoreRequest } from '@recruitment/shared';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireBearerSession(req);

    const body = await req.json();
    const { profiles, jdId, algorithmicScores } = body as {
      profiles: ScrapedProfile[];
      jdId: string;
      algorithmicScores?: HybridScoreRequest['algorithmicScores'];
    };

    if (!profiles?.length || !jdId) {
      return NextResponse.json(
        { success: false, error: 'Missing profiles or jdId' },
        { status: 400, headers: corsHeaders }
      );
    }

    const jd = await prisma.jD.findFirst({
      where: { id: jdId, userId: session.userId },
    });

    if (!jd || !jd.parsedData) {
      return NextResponse.json(
        { success: false, error: 'JD not found or not parsed' },
        { status: 404, headers: corsHeaders }
      );
    }

    const parsedJD = jd.parsedData as unknown as ParsedJD;

    // Choose scoring path based on whether algorithmic pre-scores are provided
    let scoreMap: Map<number, { matchScore: number; scoreBreakdown: { skillMatch: number; experienceMatch: number; locationMatch: number; overallFit: number }; reasoning: string; redFlags: string[]; highlights: string[]; hiddenGem?: boolean }>;

    if (algorithmicScores?.length) {
      // Hybrid scoring: tier-based LLM with algorithmic pre-scores
      scoreMap = await scoreHybridBatch(profiles, parsedJD, algorithmicScores);
    } else {
      // Legacy: full LLM scoring for all profiles
      scoreMap = await scoreBatch(profiles, parsedJD);
    }

    // Upsert candidates and build response
    const scoredCandidates: ScoredCandidate[] = [];

    for (let i = 0; i < profiles.length; i++) {
      const profile = profiles[i];
      const score = scoreMap.get(i);
      if (!score) continue;

      const algoData = algorithmicScores?.find(a => a.profileIndex === i);
      const scoreSource = algoData ? 'hybrid' : 'llm';

      const candidate = await prisma.candidate.upsert({
        where: {
          profileUrl_jdId: {
            profileUrl: profile.profileUrl || `unknown-${Date.now()}-${i}`,
            jdId,
          },
        },
        create: {
          name: profile.name,
          currentTitle: profile.currentTitle,
          currentCompany: profile.currentCompany,
          totalExperience: profile.totalExperience,
          location: profile.location,
          skills: profile.skills,
          profileUrl: profile.profileUrl,
          rawProfileData: JSON.parse(JSON.stringify(profile)) as Prisma.InputJsonValue,
          jdId,
          matchScore: score.matchScore,
          scoreBreakdown: JSON.parse(JSON.stringify(score.scoreBreakdown)) as Prisma.InputJsonValue,
          aiSummary: score.reasoning,
          pipelineStatus: 'SCREENED',
          algorithmicScore: algoData?.algoScore.totalScore ?? null,
          scoreSource,
        },
        update: {
          matchScore: score.matchScore,
          scoreBreakdown: JSON.parse(JSON.stringify(score.scoreBreakdown)) as Prisma.InputJsonValue,
          aiSummary: score.reasoning,
          currentTitle: profile.currentTitle,
          currentCompany: profile.currentCompany,
          totalExperience: profile.totalExperience,
          location: profile.location,
          skills: profile.skills,
          rawProfileData: JSON.parse(JSON.stringify(profile)) as Prisma.InputJsonValue,
          algorithmicScore: algoData?.algoScore.totalScore ?? null,
          scoreSource,
        },
      });

      const noteCount = await prisma.candidateNote.count({
        where: { candidateId: candidate.id },
      });

      scoredCandidates.push({
        id: candidate.id,
        name: candidate.name,
        profileUrl: candidate.profileUrl || '',
        matchScore: score.matchScore,
        scoreBreakdown: score.scoreBreakdown,
        reasoning: score.reasoning,
        redFlags: score.redFlags,
        highlights: score.highlights,
        currentTitle: candidate.currentTitle ?? undefined,
        currentCompany: candidate.currentCompany ?? undefined,
        totalExperience: candidate.totalExperience ?? undefined,
        location: candidate.location ?? undefined,
        skills: candidate.skills,
        pipelineStatus: candidate.pipelineStatus,
        noteCount,
        scoreSource: scoreSource as 'hybrid' | 'llm',
        aiReviewed: true,
        tier: algoData?.tier,
        hiddenGem: score.hiddenGem,
        algorithmicBreakdown: algoData?.algoScore,
      });
    }

    return NextResponse.json(
      { success: true, data: { scores: scoredCandidates } },
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error('Score error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    const status = message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json(
      { success: false, error: message },
      { status, headers: corsHeaders }
    );
  }
}
