import { NextRequest, NextResponse } from 'next/server';
import { requireBearerSession } from '@/lib/auth/bearer';
import { prisma } from '@/lib/db';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireBearerSession(req);
    const { id } = await params;
    const { content } = await req.json();

    if (!content?.trim()) {
      return NextResponse.json(
        { success: false, error: 'Note content is required' },
        { status: 400, headers: corsHeaders }
      );
    }

    // Verify candidate exists
    const candidate = await prisma.candidate.findUnique({ where: { id } });
    if (!candidate) {
      return NextResponse.json(
        { success: false, error: 'Candidate not found' },
        { status: 404, headers: corsHeaders }
      );
    }

    const note = await prisma.candidateNote.create({
      data: {
        content: content.trim(),
        candidateId: id,
        userId: session.userId,
      },
    });

    return NextResponse.json(
      { success: true, data: { id: note.id } },
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
