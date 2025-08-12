/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RateComponent =
  | { kind: 'pct'; value: number }
  | { kind: 'amount'; value: number; per: string };

type RateType = 'advalorem' | 'specific' | 'compound' | null;

type ApiBody = {
  query?: string;
  input?: string;
  product?: string;
  price?: number;
  unitPriceUsd?: number;
  qty?: number | null;
  quantity?: number | null;
  weightKg?: number | null;
  unitWeightKg?: number | null;
  country?: string | null;
  originCountry?: string | null;
  originCountryCode?: string | null;
};

function sanitizeHS(raw: string) {
  const d = (raw.match(/\d+/g) || []).join('');
  if (d.length <= 10) return d;
  const first6 = d.slice(0, 6);
  const last4 = d.slice(-4);
  return `${first6}${last4}`.slice(0, 10);
}
function padTo10(d: string) {
  const n = d.replace(/\D/g, '');
  if (n.length === 10) return n;
  if (n.length === 8) return `${n}00`;
  if (n.length === 6) return `${n}0000`;
  return n.padEnd(10, '0').slice(0, 10);
}
function formatHs(code: string) {
  const d = code.replace(/\D/g, '');
  if (d.length === 10) return d.replace(/(\d{4})(\d{2})(\d{4})/, '$1.$2.$3');
  if (d.length === 8) return d.replace(/(\d{4})(\d{2})(\d{2})/, '$1.$2.$3');
  if (d.length === 6) return d.replace(/(\d{4})(\d{2})/, '$1.$2');
  return code;
}
function pctFromString(s?: string | null): number | null {
  if (!s) return null;
  const m = String(s).match(/(\d+(?:\.\d+)?)\s*%/);
  return m ? Number(m[1]) / 100 : null;
}
function sumPct(components: RateComponent[]) {
  return components
    .filter((c): c is { kind: 'pct'; value: number } => c.kind === 'pct')
    .reduce((a, b) => a + b.value, 0);
}

function pick<T>(...vals: (T | undefined | null)[]) {
  return vals.find((v) => v !== undefined && v !== null);
}

async function lookupSupabase(hs10: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!; // RLS disabled on table
  if (!url || !key) return null;

  const supabase = createClient(url, key);
  // exact 10 → 8 → 6
  const code8 = hs10.slice(0, 8);
  const code6 = hs10.slice(0, 6);

  let { data: d1 } = await supabase
    .from('hs_public')
    .select('code, code8, code6, description, duty_rate')
    .eq('code', hs10)
    .limit(1)
    .maybeSingle();

  if (!d1) {
    const { data: d2 } = await supabase
      .from('hs_public')
      .select('code, code8, code6, description, duty_rate')
      .eq('code8', code8)
      .limit(1)
      .maybeSingle();
    d1 = d2 || null;
  }
  if (!d1) {
    const { data: d3 } = await supabase
      .from('hs_public')
      .select('code, code8, code6, description, duty_rate')
      .eq('code6', code6)
      .limit(1)
      .maybeSingle();
    d1 = d3 || null;
  }
  if (!d1) return null;

  const rawRate = Number(d1.duty_rate);
  const rate = rawRate > 1 ? rawRate / 100 : rawRate; // table may store 4.5 or 0.045
  return {
    hsCode: hs10,
    description: d1.description as string,
    rate,
    components:
      rate != null ? ([{ kind: 'pct', value: rate }] as RateComponent[]) : ([] as RateComponent[]),
    rateType: (rate != null ? 'advalorem' : 'specific') as RateType,
    note: 'Rate from local HS dictionary (Supabase).',
  };
}

async function lookupUsitc(hs10: string) {
  const url = `https://hts.usitc.gov/reststop/exportList?from=${hs10}&to=${hs10}&format=JSON`;
  try {
    const res = await fetch(url, { cache: 'no-store', headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const data: any = await res.json().catch(() => null);
    const rows: any[] = Array.isArray(data)
      ? data
      : Array.isArray((data as any)?.results)
        ? (data as any).results
        : Array.isArray((data as any)?.data)
          ? (data as any).data
          : [];
    if (!rows.length) return null;

    const r = rows[0];
    const desc =
      r?.desc || r?.description || r?.article || r?.short_desc || r?.item_description || '';
    const general =
      r?.general_rate || r?.generalRate || r?.general || (r?.rates && r?.rates.general) || '';
    const rate = pctFromString(general);
    const comps: RateComponent[] = rate != null ? [{ kind: 'pct', value: rate }] : [];
    return {
      hsCode: hs10,
      description: String(desc).trim(),
      rate,
      components: comps,
      rateType: rate != null ? ('advalorem' as RateType) : (null as RateType),
      note: undefined,
    };
  } catch {
    return null;
  }
}

function buildOk(body: any, status = 200) {
  return NextResponse.json(body, { status });
}
function buildErr(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status });
}

async function handle(body: ApiBody | URLSearchParams) {
  const get = (k: string) =>
    body instanceof URLSearchParams ? (body.get(k) ?? undefined) : (body as any)[k];

  const input = (pick(get('query'), get('input'), get('product')) ?? '').toString().trim();
  if (!input) return buildErr("Provide 'query' or 'input' (HS code only)", 400);

  const product = (pick(get('product'), get('query'), get('input')) ?? '').toString().trim();
  const price = Number(pick(get('unitPriceUsd'), get('price')) ?? 0);
  const qtyRaw = pick(get('qty'), get('quantity'));
  const qty = qtyRaw == null ? null : Number(qtyRaw);
  const weightRaw = pick(get('unitWeightKg'), get('weightKg'));
  const weightKg = weightRaw == null ? null : Number(weightRaw);
  const country =
    (pick(get('originCountry'), get('country'), get('originCountryCode')) as string | undefined) ??
    null;

  const cleaned = sanitizeHS(input);
  if (!(cleaned.length === 6 || cleaned.length === 8 || cleaned.length === 10)) {
    return buildErr('HS code must be 6, 8, or 10 digits', 400);
  }
  const hs10 = padTo10(cleaned);

  // 1) Supabase local dictionary
  const local = await lookupSupabase(hs10);

  // 2) USITC fallback
  const remote = !local ? await lookupUsitc(hs10) : null;

  const hit = local || remote;

  if (!hit) {
    return buildOk({
      duty: null,
      rate: null,
      rateType: null as RateType,
      components: [] as RateComponent[],
      resolution: 'none' as const,
      breakdown: {
        product,
        country,
        price,
        hsCode: null,
        hsCodeFormatted: null,
        description: null,
        qty,
        weightKg,
      },
      alternates: [] as any[],
      notes: ['No HTS or dictionary match found.'],
    });
  }

  const notes: string[] = [];
  if (hit.note) notes.push(hit.note);

  const pctTotal = sumPct(hit.components);
  const q = qty != null && Number.isFinite(qty) && qty > 0 ? qty : 1;
  const duty = price * q * pctTotal;

  return buildOk({
    duty,
    rate: hit.rate,
    rateType: hit.rateType,
    components: hit.components,
    resolution: local ? ('dict' as const) : ('numeric' as const),
    breakdown: {
      product,
      country,
      price,
      hsCode: hit.hsCode,
      hsCodeFormatted: formatHs(hit.hsCode),
      description: hit.description,
      qty,
      weightKg,
    },
    alternates: [] as any[],
    notes,
  });
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  let body: any = {};
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return buildErr('Invalid JSON', 400);
  }
  return handle(body as ApiBody);
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  return handle(searchParams);
}
