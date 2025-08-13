// src/middleware.ts
import { NextRequest, NextResponse } from 'next/server';

const ADMIN_PATH = '/admin';
const ADMIN_COOKIE = 'is_admin';
const COOKIE_MAX_DAYS = 30;

const EXPECTED_KEY = process.env.ADMIN_KEY;

export function middleware(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;

  if (!pathname.startsWith(ADMIN_PATH)) return NextResponse.next();

  if (!EXPECTED_KEY) {
    return new NextResponse('Admin disabled: ADMIN_KEY is not configured on this environment.', {
      status: 503,
      headers: { 'content-type': 'text/plain' },
    });
  }

  const hasCookie = req.cookies.get(ADMIN_COOKIE)?.value === '1';
  if (hasCookie) return NextResponse.next();

  const keyParam = searchParams.get('key');
  if (keyParam && keyParam === EXPECTED_KEY) {
    const res = NextResponse.next();
    res.cookies.set({
      name: ADMIN_COOKIE,
      value: '1',
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production', // ✅ only secure in prod
      path: '/',
      maxAge: COOKIE_MAX_DAYS * 24 * 60 * 60,
    });
    return res;
  }

  return new NextResponse('Unauthorized. Append ?key=YOUR_KEY once to grant access.', {
    status: 401,
    headers: { 'content-type': 'text/plain' },
  });
}

export const config = {
  matcher: ['/admin/:path*'],
};
