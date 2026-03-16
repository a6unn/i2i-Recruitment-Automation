import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth/session';
import { parseJD } from '@/lib/claude/jd-parser';
import { generateScoringConfig } from '@/lib/claude/scoring-config-generator';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const jd = await prisma.jD.findFirst({
      where: { id, userId: session.userId },
    });

    if (!jd) {
      return NextResponse.json({ success: false, error: 'JD not found' }, { status: 404 });
    }

    const parsedData = await parseJD(jd.rawText);

    let scoringConfig = null;
    try {
      scoringConfig = await generateScoringConfig(parsedData);
    } catch (e) {
      console.error('Scoring config generation failed, using fallback:', e);
    }

    const updated = await prisma.jD.update({
      where: { id },
      data: {
        parsedData: JSON.parse(JSON.stringify(parsedData)),
        ...(scoringConfig && { scoringConfig: JSON.parse(JSON.stringify(scoringConfig)) }),
        status: 'PARSED',
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error('POST /api/jds/[id]/parse error:', error);
    const message = error instanceof Error ? error.message : 'Failed to parse JD';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
