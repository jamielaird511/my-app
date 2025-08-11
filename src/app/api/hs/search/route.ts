import { NextRequest } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';

function normalizeDigits(q: string) {
  const only = q.replace(/\D+/g, '');
  if (!only) return null;
  if (only.length >= 10) return only.slice(0, 10);
  if (only.length >= 8) return only.padEnd(10, '0');
  if (only.length >= 6) return only.padEnd(10, '0');
  return null;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get('q') || '').trim();
  if (!q) return Response.json({ items: [] });

  const supabase = supabaseServer();
  const digits = normalizeDigits(q);

  if (digits) {
    let { data, error } = await supabase.from('hs_public').select('*').eq('code', digits).limit(1);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    if (data && data.length) return Response.json({ items: data });

    const code8 = digits.slice(0, 8);
    ({ data, error } = await supabase.from('hs_public').select('*').eq('code8', code8).limit(10));
    if (error) return Response.json({ error: error.message }, { status: 500 });
    if (data && data.length) return Response.json({ items: data });

    const code6 = digits.slice(0, 6);
    ({ data, error } = await supabase.from('hs_public').select('*').eq('code6', code6).limit(20));
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ items: data ?? [] });
  }

  const { data, error } = await supabase
    .from('hs_public')
    .select('*')
    .ilike('description', `%${q}%`)
    .limit(25);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ items: data ?? [] });
}
