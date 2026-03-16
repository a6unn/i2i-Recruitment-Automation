import { NextRequest, NextResponse } from 'next/server';
import { requireBearerSession } from '@/lib/auth/bearer';
import { prisma } from '@/lib/db';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

function escapeCsv(val: string): string {
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

export async function GET(req: NextRequest) {
  try {
    const session = await requireBearerSession(req);
    const jdId = new URL(req.url).searchParams.get('jdId');

    if (!jdId) {
      return NextResponse.json(
        { success: false, error: 'jdId is required' },
        { status: 400, headers: corsHeaders }
      );
    }

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
      where: { jdId },
      orderBy: { matchScore: 'desc' },
    });

    const headers = [
      'Name', 'Score', 'Title', 'Company', 'Experience',
      'Location', 'Skills', 'Profile URL', 'Red Flags', 'Highlights', 'Status',
    ];

    const rows = candidates.map((c) => {
      const breakdown = c.scoreBreakdown as Record<string, unknown> | null;
      const redFlags = breakdown ? (breakdown as { redFlags?: string[] }).redFlags || [] : [];
      const highlights = breakdown ? (breakdown as { highlights?: string[] }).highlights || [] : [];

      return [
        c.name,
        String(c.matchScore ?? ''),
        c.currentTitle || '',
        c.currentCompany || '',
        c.totalExperience || '',
        c.location || '',
        c.skills.join('; '),
        c.profileUrl || '',
        Array.isArray(redFlags) ? redFlags.join('; ') : '',
        Array.isArray(highlights) ? highlights.join('; ') : '',
        c.pipelineStatus,
      ].map(escapeCsv);
    });

    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');

    return new NextResponse(csv, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="candidates-${jd.title.replace(/[^a-z0-9]/gi, '_')}.csv"`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    const status = message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json(
      { success: false, error: message },
      { status, headers: corsHeaders }
    );
  }
}
