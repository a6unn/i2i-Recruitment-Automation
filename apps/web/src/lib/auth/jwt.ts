import { SignJWT, jwtVerify } from 'jose';

function getSecret() {
  const jwt = process.env.JWT_SECRET;
  if (!jwt && process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET environment variable is required in production');
  }
  return new TextEncoder().encode(jwt || 'dev-secret');
}

const secret = getSecret();

export interface JWTPayload {
  userId: string;
  email: string;
  role: string;
}

export async function signToken(payload: JWTPayload): Promise<string> {
  return new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(secret);
}

export async function verifyToken(token: string): Promise<JWTPayload> {
  const { payload } = await jwtVerify(token, secret);
  return payload as unknown as JWTPayload;
}
