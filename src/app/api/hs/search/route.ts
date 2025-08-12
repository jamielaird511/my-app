// src/app/api/hs/search/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic'; // avoid static caching

// ---- Supabase (server-only) ----
const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
if (!url || !key) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
}
const sb = createClient(url, key, { auth: { persistSession: false } });

// ---- Helpers ----
function norm(s: string) {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

type FullRow = {
  code: string;
  code_len: number | null;
  description: string | null;
  mfn_advalorem: number | null;
  mfn_specific: string | null;
  rev_number: string | null;
  rev_date: string | null;
  hts10?: string | null;
};

function shapeHit(row: Partial<FullRow>, confidence: number, reason: string) {
  return {
    code: row.code || '',
    code_len: row.code_len ?? null,
    description: row.description ?? '',
    mfn_advalorem: row.mfn_advalorem ?? null,
    mfn_specific: row.mfn_specific ?? null,
    rev_number: row.rev_number ?? null,
    rev_date: row.rev_date ?? null,
    confidence,
    reason,
  };
}

export async function GET(req: NextRequest) {
  const urlObj = new URL(req.url);
  const qRaw = (urlObj.searchParams.get('q') || '').trim();
  const limit = Math.min(parseInt(urlObj.searchParams.get('limit') || '20', 10), 50);

  if (!qRaw) {
    return NextResponse.json({ hits: [], q: qRaw, meta: { reason: 'empty query' } });
  }

  try {
    // 1) PRIMARY: RPC (aliases first, numeric fallbacks) -> enrich from hts_lines
    let rpcHits: Array<{ hs_code: string; description: string; source?: string; rank?: number }> =
      [];
    try {
      const { data: rpcData, error: rpcErr } = await sb.rpc('search_hs_aliases', {
        query_text: qRaw, // <-- correct arg name
        limit_n: limit,
      });
      if (rpcErr) {
        // Log but don't crash; we'll fall back
        console.error('search_hs_aliases RPC error:', rpcErr);
      } else if (rpcData && rpcData.length > 0) {
        rpcHits = rpcData as any[];
      }
    } catch (e) {
      console.error('RPC call threw:', e);
    }

    if (rpcHits.length > 0) {
      // Keep order from RPC; dedupe hs_code
      const seen = new Set<string>();
      const codes = rpcHits
        .map((r) => r.hs_code)
        .filter((c) => {
          if (!c || seen.has(c)) return false;
          seen.add(c);
          return true;
        });

      // Enrich from hts_lines by code to keep your existing hit shape
      const { data: fullRows, error: fullErr } = await sb
        .from('hts_lines')
        .select('code,code_len,description,mfn_advalorem,mfn_specific,rev_number,rev_date,hts10')
        .in('code', codes);

      if (fullErr) {
        console.error('enrich hts_lines error:', fullErr);
      }

      const byCode = new Map<string, FullRow>();
      (fullRows || []).forEach((r) => byCode.set(r.code, r as FullRow));

      const hits = codes.map((code) => {
        const base =
          byCode.get(code) ||
          ({
            code,
            description: rpcHits.find((h) => h.hs_code === code)?.description ?? '',
          } as Partial<FullRow>);
        const r = rpcHits.find((h) => h.hs_code === code);
        const conf = typeof r?.rank === 'number' ? Math.max(0, Math.min(1, Number(r!.rank))) : 0.8;
        const reason = r?.source ? `RPC:${r.source}` : 'RPC';
        return shapeHit(base, conf, reason);
      });

      return NextResponse.json({ hits, q: qRaw });
    }

    // 2) FALLBACK: keyword scan via standardized view -> enrich from hts_lines
    //    (std view guarantees hs_code column)
    const { data: kwStd, error: kwStdErr } = await sb
      .from('hts_lines_std')
      .select('hs_code, description')
      .ilike('description', `%${qRaw}%`)
      .limit(limit);

    if (kwStdErr) {
      console.error('hts_lines_std fallback error:', kwStdErr);
    }

    if (kwStd && kwStd.length > 0) {
      const codes = Array.from(new Set(kwStd.map((r: any) => r.hs_code)));
      const { data: fullRows, error: fullErr } = await sb
        .from('hts_lines')
        .select('code,code_len,description,mfn_advalorem,mfn_specific,rev_number,rev_date,hts10')
        .in('code', codes);

      if (fullErr) {
        console.error('enrich (fallback) hts_lines error:', fullErr);
      }

      const byCode = new Map<string, FullRow>();
      (fullRows || []).forEach((r) => byCode.set(r.code, r as FullRow));

      const qLower = qRaw.toLowerCase();
      const hits = codes.map((code) => {
        const row =
          byCode.get(code) ||
          ({
            code,
            description: kwStd.find((k: any) => k.hs_code === code)?.description ?? '',
          } as Partial<FullRow>);
        const contains = (row.description || '').toLowerCase().includes(qLower);
        const confidence = contains ? Math.min(0.6 + qLower.length / 40, 0.9) : 0.5;
        const reason = contains ? 'Keyword contained in description' : 'Keyword partial match';
        return shapeHit(row, confidence, reason);
      });

      return NextResponse.json({ hits, q: qRaw });
    }

    // 3) Nothing found
    return NextResponse.json({ hits: [], q: qRaw });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e?.message || 'search failed' }, { status: 500 });
  }
}
