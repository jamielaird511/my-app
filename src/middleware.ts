import { NextResponse, NextRequest } from 'next/server';

const ADMIN_COOKIE = 'imp_admin';
const ADMIN_PATH = '/admin';
const COOKIE_MAX_DAYS = 30;

export function middleware(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;

  // Only guard /admin (and subpaths)
  if (!pathname.startsWith(ADMIN_PATH)) return NextResponse.next();

  // Already authed via cookie?
  const hasCookie = req.cookies.get(ADMIN_COOKIE)?.value === '1';
  if (hasCookie) return NextResponse.next();

  // Allow ?key=... once, then set cookie
  const keyParam = searchParams.get('key');
  const expected = process.env.NEXT_PUBLIC_ADMIN_KEY || process.env.ADMIN_KEY;
  if (expected && keyParam && keyParam === expected) {
    const res = NextResponse.next();
    res.cookies.set({
      name: ADMIN_COOKIE,
      value: '1',
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
      maxAge: COOKIE_MAX_DAYS * 24 * 60 * 60,
      path: '/',
    });
    return res;
  }

  // Not authed → simple 401 page
  return new NextResponse('Unauthorized. Append ?key=YOUR_KEY once to grant access.', {
    status: 401,
    headers: { 'content-type': 'text/plain' },
  });
}

export const config = {
  matcher: ['/admin/:path*'],
};
