import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth/session';
import { generateSearchQueries } from '@/lib/claude/search-builder';
import type { ParsedJD } from '@recruitment/shared';

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

    if (!jd.parsedData) {
      return NextResponse.json(
        { success: false, error: 'JD must be parsed before generating search queries' },
        { status: 400 }
      );
    }

    const searchQueries = await generateSearchQueries(jd.parsedData as unknown as ParsedJD);

    const updated = await prisma.jD.update({
      where: { id },
      data: {
        searchQueries: JSON.parse(JSON.stringify(searchQueries)),
        status: 'ACTIVE',
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error('POST /api/jds/[id]/search-query error:', error);
    const message = error instanceof Error ? error.message : 'Failed to generate queries';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
