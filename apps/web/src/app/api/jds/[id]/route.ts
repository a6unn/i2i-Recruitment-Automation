import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth/session';

export async function GET(
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

    return NextResponse.json({ success: true, data: jd });
  } catch (error) {
    console.error('GET /api/jds/[id] error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();

    // Verify ownership
    const existing = await prisma.jD.findFirst({
      where: { id, userId: session.userId },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: 'JD not found' }, { status: 404 });
    }

    const jd = await prisma.jD.update({
      where: { id },
      data: {
        title: body.title ?? existing.title,
        clientName: body.clientName ?? existing.clientName,
        rawText: body.rawText ?? existing.rawText,
        parsedData: body.parsedData ?? existing.parsedData,
        searchQueries: body.searchQueries ?? existing.searchQueries,
        status: body.status ?? existing.status,
      },
    });

    return NextResponse.json({ success: true, data: jd });
  } catch (error) {
    console.error('PUT /api/jds/[id] error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
