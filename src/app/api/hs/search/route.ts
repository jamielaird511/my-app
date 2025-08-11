import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic'; // avoid static caching of results

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!; // server-only
const supabase = createClient(supabaseUrl, serviceKey);

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get('q') || '').trim();

  if (!q) return NextResponse.json({ items: [] });

  const digits = q.replace(/\D/g, '');

  try {
    // If the query looks numeric, try exact/starts-with on codes first
    if (digits.length >= 6) {
      const code6 = digits.slice(0, 6);

      const { data, error } = await supabase
        .from('hs_public') // your table name
        .select('*')
        .eq('code6', code6)
        .limit(20);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      if (data && data.length) {
        return NextResponse.json({ items: data });
      }
    }

    // Fallback: text search on description
    const { data, error } = await supabase
      .from('hs_public')
      .select('*')
      .ilike('description', `%${q}%`)
      .limit(25);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ items: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Server error' }, { status: 500 });
  }
}
