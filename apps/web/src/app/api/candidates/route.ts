import { NextRequest, NextResponse } from 'next/server';
import { requireBearerSession } from '@/lib/auth/bearer';
import { prisma } from '@/lib/db';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

// GET /api/candidates?jdId=xxx&minScore=80
export async function GET(req: NextRequest) {
  try {
    const session = await requireBearerSession(req);
    const { searchParams } = new URL(req.url);
    const jdId = searchParams.get('jdId');
    const minScore = searchParams.get('minScore');

    if (!jdId) {
      return NextResponse.json(
        { success: false, error: 'jdId is required' },
        { status: 400, headers: corsHeaders }
      );
    }

    // Verify JD belongs to user
    const jd = await prisma.jD.findFirst({
      where: { id: jdId, userId: session.userId },
    });
    if (!jd) {
      return NextResponse.json(
        { success: false, error: 'JD not found' },
        { status: 404, headers: corsHeaders }
      );
    }

    const candidates = await prisma.candidate.findMany({
      where: {
        jdId,
        ...(minScore ? { matchScore: { gte: parseFloat(minScore) } } : {}),
      },
      include: { _count: { select: { notes: true } } },
      orderBy: { matchScore: 'desc' },
    });

    return NextResponse.json(
      { success: true, data: candidates },
      { headers: corsHeaders }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    const status = message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json(
      { success: false, error: message },
      { status, headers: corsHeaders }
    );
  }
}

// POST /api/candidates — bulk update pipeline status
export async function POST(req: NextRequest) {
  try {
    await requireBearerSession(req);
    const { candidateIds, pipelineStatus } = await req.json();

    if (!candidateIds?.length || !pipelineStatus) {
      return NextResponse.json(
        { success: false, error: 'Missing candidateIds or pipelineStatus' },
        { status: 400, headers: corsHeaders }
      );
    }

    const result = await prisma.candidate.updateMany({
      where: { id: { in: candidateIds } },
      data: { pipelineStatus },
    });

    return NextResponse.json(
      { success: true, data: { updated: result.count } },
      { headers: corsHeaders }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    const status = message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json(
      { success: false, error: message },
      { status, headers: corsHeaders }
    );
  }
}
