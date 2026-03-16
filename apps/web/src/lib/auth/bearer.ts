import { NextRequest } from 'next/server';
import { verifyToken, type JWTPayload } from './jwt';

/**
 * Extract session from Authorization: Bearer header.
 * Used by extension API routes (extension can't read httpOnly cookies).
 */
export async function getBearerSession(req: NextRequest): Promise<JWTPayload | null> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.slice(7);
  try {
    return await verifyToken(token);
  } catch {
    return null;
  }
}

export async function requireBearerSession(req: NextRequest): Promise<JWTPayload> {
  const session = await getBearerSession(req);
  if (!session) {
    throw new Error('Unauthorized');
  }
  return session;
}
