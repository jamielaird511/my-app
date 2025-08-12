// src/app/api/hs/search/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic'; // avoid static caching

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!, // server-only
);

export async function GET(req: NextRequest) {
  const q = (new URL(req.url).searchParams.get('q') || '').trim();
  if (!q) return NextResponse.json({ items: [] });

  const digits = q.replace(/\D/g, '');

  try {
    // 1) If looks like a code, try exact code6 first
    if (digits.length >= 6) {
      const code6 = digits.slice(0, 6);
      const { data, error } = await supabase
        .from('hs_public')
        .select('*')
        .eq('code6', code6)
        .limit(20);

      if (error) throw error;
      if (data?.length) return NextResponse.json({ items: data });
    }

    // 2) Fuzzy text search via RPC (trigram similarity)
    const { data: rpcData, error: rpcError } = await supabase.rpc('hs_search', {
      q,
      limit_n: 25,
    });
    if (rpcError) throw rpcError;

    return NextResponse.json({ items: rpcData ?? [] });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Server error' }, { status: 500 });
  }
}
