import { NextResponse } from 'next/server';

export async function POST() {
  const response = NextResponse.redirect(new URL('/login', process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3002'));
  response.cookies.set('token', '', { maxAge: 0, path: '/' });
  return response;
}
