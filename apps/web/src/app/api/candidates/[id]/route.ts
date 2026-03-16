import { NextRequest, NextResponse } from 'next/server';
import { requireBearerSession } from '@/lib/auth/bearer';
import { prisma } from '@/lib/db';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireBearerSession(req);
    const { id } = await params;

    const candidate = await prisma.candidate.findUnique({
      where: { id },
      include: { notes: { orderBy: { createdAt: 'desc' } }, jd: { select: { title: true, userId: true } } },
    });

    if (!candidate) {
      return NextResponse.json(
        { success: false, error: 'Candidate not found' },
        { status: 404, headers: corsHeaders }
      );
    }

    return NextResponse.json(
      { success: true, data: candidate },
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

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireBearerSession(req);
    const { id } = await params;
    const body = await req.json();

    const allowedFields = ['pipelineStatus', 'interestLevel', 'callStatus'];
    const data: Record<string, string> = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        data[field] = body[field];
      }
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { success: false, error: 'No valid fields to update' },
        { status: 400, headers: corsHeaders }
      );
    }

    const candidate = await prisma.candidate.update({
      where: { id },
      data,
    });

    return NextResponse.json(
      { success: true, data: candidate },
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
