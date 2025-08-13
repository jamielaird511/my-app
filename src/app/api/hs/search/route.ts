// src/app/api/hs/search/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

// ---- Supabase (server-only) ----
const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
if (!url || !key) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
}
const sb = createClient(url, key, { auth: { persistSession: false } });

// ---- Types / helpers ----
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
    confidence, // 0..1
    reason,
  };
}

function isNumericHS(q: string) {
  const digits = q.replace(/\D/g, '');
  // accept 4/6/8/10 so dotted inputs resolve (e.g., 6404.00, 6404.00.0000)
  return [4, 6, 8, 10].includes(digits.length);
}

export async function GET(req: NextRequest) {
  const urlObj = new URL(req.url);
  const qRaw = (urlObj.searchParams.get('q') || '').trim();
  const limitReq = parseInt(urlObj.searchParams.get('limit') || '4', 10);
  const LIMIT = Math.max(1, Math.min(limitReq || 4, 10));

  if (!qRaw) {
    return NextResponse.json({ hits: [], q: qRaw, meta: { reason: 'empty query' } });
  }

  const userDigits = qRaw.replace(/\D/g, '');
  const numeric = isNumericHS(qRaw);

  try {
    // 1) PRIMARY: RPC (unified fuzzy + numeric)
    try {
      const { data: rpcData, error: rpcErr } = await sb.rpc('hs_search_unified', {
        p_query: qRaw,
        p_digits: userDigits,
        p_is_numeric: numeric,
        p_limit: LIMIT,
      });

      if (!rpcErr && rpcData && rpcData.length > 0) {
        const seen = new Set<string>();
        const ordered = (rpcData as any[]).filter((r) => {
          const code = String(r.hs_code || '');
          if (!code || seen.has(code)) return false;
          seen.add(code);
          return true;
        });

        const codes = ordered.map((r) => String(r.hs_code));
        const { data: fullRows } = await sb
          .from('hts_lines')
          .select('code,code_len,description,mfn_advalorem,mfn_specific,rev_number,rev_date,hts10')
          .in('code', codes);

        const byCode = new Map<string, FullRow>();
        (fullRows || []).forEach((r) => byCode.set(r.code, r as FullRow));

        const hits = ordered.map((r: any) => {
          const code = String(r.hs_code);
          const base: Partial<FullRow> = byCode.get(code) || {
            code,
            description: r.description ?? '',
          };
          const conf = Math.max(0, Math.min(1, Number(r.score ?? 0)));
          const reason = r.reason ? String(r.reason) : numeric ? 'numeric match' : 'fuzzy match';
          return shapeHit(base, conf, reason);
        });

        return NextResponse.json({ hits, q: qRaw });
      }
    } catch (e) {
      console.error('hs_search_unified RPC error:', e);
    }

    // 2) NUMERIC FALLBACK (robust to dotted inputs)
    //    We match in both directions:
    //    - normalized_code LIKE 'userDigits%' (user typed shorter prefix)
    //    - normalized_code IN (first 4/6/8/10 digits of userDigits) (user typed longer dotted code)
    if (numeric && userDigits) {
      const prefixParts = [4, 6, 8, 10]
        .filter((k) => userDigits.length >= k)
        .map((k) => userDigits.slice(0, k));
      const uniqParts = Array.from(new Set(prefixParts));

      // Build PostgREST .or() clause
      const inList = uniqParts.length
        ? `,normalized_code.in.(${uniqParts.map((p) => `"${p}"`).join(',')})`
        : '';
      const orFilter = `normalized_code.like.${userDigits}%${inList}`;

      const { data: numAliases, error: numErr } = await sb
        .from('hs_aliases_data')
        .select('hs_code, description')
        .or(orFilter)
        .limit(200);

      if (!numErr && numAliases && numAliases.length > 0) {
        // score deeper matches higher
        const best = new Map<string, { desc: string; score: number }>();
        for (const r of numAliases) {
          const code = String((r as any).hs_code || '');
          const storedDigits = code.replace(/\D/g, '');

          let score = 0.5;
          if (userDigits.startsWith(storedDigits)) {
            // user typed more specific code than we store
            if (storedDigits.length >= 10) score = 1.0;
            else if (storedDigits.length >= 8) score = 0.9;
            else if (storedDigits.length >= 6) score = 0.8;
            else score = 0.7; // 4-digit
          } else if (storedDigits.startsWith(userDigits)) {
            // user typed a shorter prefix
            score = 0.85;
          }

          const prev = best.get(code);
          if (!prev || score > prev.score) {
            best.set(code, { desc: (r as any).description || '', score });
          }
        }

        const ordered = [...best.entries()].sort((a, b) => b[1].score - a[1].score).slice(0, LIMIT);

        const hits = ordered.map(([code, v]) =>
          shapeHit({ code, description: v.desc || '' }, v.score, 'alias:code-prefix'),
        );

        return NextResponse.json({ hits, q: qRaw });
      }
    }

    // 3) KEYWORD FALLBACK (std view)
    const { data: kwStd, error: kwErr } = await sb
      .from('hts_lines_std')
      .select('hs_code, description')
      .ilike('description', `%${qRaw}%`)
      .limit(LIMIT);

    if (!kwErr && kwStd && kwStd.length > 0) {
      const codes = Array.from(new Set((kwStd as any[]).map((r) => r.hs_code)));
      const { data: fullRows } = await sb
        .from('hts_lines')
        .select('code,code_len,description,mfn_advalorem,mfn_specific,rev_number,rev_date,hts10')
        .in('code', codes);

      const byCode = new Map<string, FullRow>();
      (fullRows || []).forEach((r) => byCode.set(r.code, r as FullRow));

      const qLower = qRaw.toLowerCase();
      const hits = codes.map((code) => {
        const row =
          byCode.get(code) ||
          ({
            code,
            description: (kwStd as any[]).find((k) => k.hs_code === code)?.description ?? '',
          } as Partial<FullRow>);
        const contains = (row.description || '').toLowerCase().includes(qLower);
        const confidence = contains ? 0.6 : 0.45;
        const reason = contains ? 'keyword in description' : 'keyword partial';
        return shapeHit(row, confidence, reason);
      });

      return NextResponse.json({ hits, q: qRaw });
    }

    // 4) Nothing
    return NextResponse.json({ hits: [], q: qRaw });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e?.message || 'search failed' }, { status: 500 });
  }
}
