import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth/session';
import { getBearerSession } from '@/lib/auth/bearer';
import { fetchGoogleDocText } from '@/lib/google/docs-fetcher';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

async function getAnySession(req: NextRequest) {
  // Try Bearer auth first (extension), then cookie auth (web app)
  return (await getBearerSession(req)) || (await getSession());
}

export async function GET(req: NextRequest) {
  try {
    const session = await getAnySession(req);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
    }

    const jds = await prisma.jD.findMany({
      where: { userId: session.userId },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        title: true,
        clientName: true,
        status: true,
        parsedData: true,
        scoringConfig: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { candidates: true } },
      },
    });

    return NextResponse.json({ success: true, data: jds }, { headers: corsHeaders });
  } catch (error) {
    console.error('GET /api/jds error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500, headers: corsHeaders });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { title, clientName, rawText, googleDocsUrl } = await req.json();

    if (!title) {
      return NextResponse.json({ success: false, error: 'Title is required' }, { status: 400 });
    }

    let text = rawText || '';

    // If Google Docs URL provided, fetch the text
    if (googleDocsUrl && !text) {
      try {
        text = await fetchGoogleDocText(googleDocsUrl);
      } catch (error) {
        return NextResponse.json(
          { success: false, error: `Failed to fetch Google Doc: ${(error as Error).message}` },
          { status: 400 }
        );
      }
    }

    if (!text.trim()) {
      return NextResponse.json(
        { success: false, error: 'JD text is required (paste or provide Google Docs URL)' },
        { status: 400 }
      );
    }

    const jd = await prisma.jD.create({
      data: {
        title,
        clientName: clientName || null,
        rawText: text,
        googleDocsUrl: googleDocsUrl || null,
        userId: session.userId,
      },
    });

    return NextResponse.json({ success: true, data: jd }, { status: 201 });
  } catch (error) {
    console.error('POST /api/jds error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
