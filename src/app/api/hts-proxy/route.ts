// src/app/api/hts-proxy/route.ts
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs'; // ensure Node runtime (we need Set-Cookie headers)

const BASE = 'https://hts.usitc.gov';

function joinCookies(setCookie: string[] | null): string | null {
  if (!setCookie || setCookie.length === 0) return null;
  // keep only "name=value" part
  const parts = setCookie.map((c) => c.split(';')[0]).filter(Boolean);
  return parts.length ? parts.join('; ') : null;
}

async function bootstrapCookies(): Promise<string | null> {
  // Fetch the landing page to get session cookies the API expects
  const res = await fetch(`${BASE}/`, {
    cache: 'no-store',
    headers: {
      // look like a real browser request for a document
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
    },
    redirect: 'follow',
  });

  // Some stacks send multiple Set-Cookie headers
  const setCookieHeaders =
    (res.headers.getSetCookie ? res.headers.getSetCookie() : null) ||
    (res.headers.get('set-cookie') ? [res.headers.get('set-cookie') as string] : null);

  return joinCookies(setCookieHeaders);
}

async function callApi(path: string, cookie: string | null) {
  const url = `${BASE}/api${path.startsWith('/') ? '' : '/'}${path}`;
  const res = await fetch(url, {
    cache: 'no-store',
    headers: {
      // Be strict: ask for JSON only; some stacks content-negotiate on this.
      Accept: 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      Referer: `${BASE}/`,
      Origin: BASE,
      'Accept-Language': 'en-US,en;q=0.9',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
      ...(cookie ? { Cookie: cookie } : {}),
    },
    redirect: 'follow',
  });

  const ct = res.headers.get('content-type') || '';
  const buf = await res.arrayBuffer();

  // Pass through JSON as-is
  if (res.ok && /json/i.test(ct)) {
    return new NextResponse(buf, {
      status: res.status,
      headers: { 'content-type': ct },
    });
  }

  // Sometimes JSON arrives as text/plain; attempt to parse
  const text = new TextDecoder().decode(buf);
  try {
    const parsed = JSON.parse(text);
    return NextResponse.json(parsed, { status: res.status });
  } catch {
    // Not JSON; return a debuggable error
    return NextResponse.json(
      {
        error: 'Upstream not JSON',
        status: res.status,
        contentType: ct,
        target: url,
        preview: text.slice(0, 1500),
      },
      { status: 502 },
    );
  }
}

export async function GET(req: NextRequest) {
  const path = req.nextUrl.searchParams.get('path');
  const debug = req.nextUrl.searchParams.get('debug');
  if (!path) {
    return NextResponse.json({ error: 'Missing or invalid path' }, { status: 400 });
  }

  // 1) Try once without cookies (cheap)
  let first = await callApi(path, null);
  if (first.status !== 502) {
    return first;
  }

  // 2) Bootstrap cookies from the site, then retry
  const cookie = await bootstrapCookies();
  const second = await callApi(path, cookie);

  if (debug && second.status === 502) {
    // Add a one-line hint to aid local diagnostics
    return NextResponse.json(
      {
        warned: true,
        cookiePresent: !!cookie,
        ...(await second.json()),
      },
      { status: 502 },
    );
  }

  return second;
}
