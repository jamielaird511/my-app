/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ---------- Supabase (server-only key) ----------
const SB_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
const SB_KEY = (
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  ''
).trim();
if (!SB_URL || !SB_KEY) {
  // Fail early with a clear message
  throw new Error(
    'Supabase env missing: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY',
  );
}
const sb = createClient(SB_URL, SB_KEY, { auth: { persistSession: false } });

// ---------- Types ----------
type RateComponent =
  | { kind: 'pct'; value: number; label?: string }
  | { kind: 'amount'; value: number; per: string; label?: string };

type RateType = 'advalorem' | 'specific' | 'compound' | null;

type ApiBody = {
  query?: string;
  input?: string;
  product?: string;
  price?: number;
  unitPriceUsd?: number;
  qty?: number | null;
  quantity?: number | null;
  value?: number | null; // explicit customs value (USD)
  weightKg?: number | null;
  unitWeightKg?: number | null;
  country?: string | null;
  origin?: string | null;
  originCountry?: string | null;
  originCountryCode?: string | null;
  code?: string | null; // explicit HS input
};

// ---------- Utils ----------
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
  return m ? Number(m[1]) / 100 : null; // decimal
}
function sumPct(components: RateComponent[]) {
  return components
    .filter((c): c is { kind: 'pct'; value: number } => c.kind === 'pct')
    .reduce((a, b) => a + b.value, 0);
}
function pick<T>(...vals: (T | undefined | null)[]) {
  return vals.find((v) => v !== undefined && v !== null);
}

// ---------- Lookups ----------
async function lookupSupabase(hs10: string) {
  const code8 = hs10.slice(0, 8);
  const code6 = hs10.slice(0, 6);

  let { data: d1, error: e1 } = await sb
    .from('hs_public')
    .select('code, code8, code6, description, duty_rate')
    .eq('code', hs10)
    .limit(1)
    .maybeSingle();
  if (e1) console.error(e1);

  if (!d1) {
    const { data: d2, error: e2 } = await sb
      .from('hs_public')
      .select('code, code8, code6, description, duty_rate')
      .eq('code8', code8)
      .limit(1)
      .maybeSingle();
    if (e2) console.error(e2);
    d1 = d2 || null;
  }
  if (!d1) {
    const { data: d3, error: e3 } = await sb
      .from('hs_public')
      .select('code, code8, code6, description, duty_rate')
      .eq('code6', code6)
      .limit(1)
      .maybeSingle();
    if (e3) console.error(e3);
    d1 = d3 || null;
  }
  if (!d1) return null;

  const rawRate = Number(d1.duty_rate);
  const rate = rawRate > 1 ? rawRate / 100 : rawRate; // decimal
  const components: RateComponent[] =
    rate != null ? [{ kind: 'pct' as const, value: rate, label: 'MFN' }] : [];

  return {
    hsCode: d1.code || hs10,
    description: d1.description as string,
    rate,
    components,
    rateType: rate != null ? ('advalorem' as RateType) : (null as RateType),
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
    const components: RateComponent[] =
      rate != null ? [{ kind: 'pct' as const, value: rate, label: 'MFN' }] : [];

    return {
      hsCode: hs10,
      description: String(desc).trim(),
      rate,
      components,
      rateType: rate != null ? ('advalorem' as RateType) : (null as RateType),
      note: undefined,
    };
  } catch {
    return null;
  }
}

async function lookupSection301(hs10: string, origin: string): Promise<RateComponent[]> {
  if ((origin || '').toUpperCase() !== 'CN') return [];
  const today = new Date().toISOString().slice(0, 10);
  const candidates = [hs10.slice(0, 10), hs10.slice(0, 8), hs10.slice(0, 6)].filter(
    (x) => x.length >= 6,
  );

  const { data, error } = await sb
    .from('hts_surcharges')
    .select('code_prefix, rate_percent, starts_on, ends_on')
    .eq('country_iso', 'CN')
    .in('code_prefix', candidates)
    .or(`ends_on.is.null,ends_on.gt.${today}`)
    .lte('starts_on', today);

  if (error) {
    console.error('section301 query failed:', error.message);
    return [];
  }
  if (!data?.length) return [];

  const best = [...data].sort((a, b) => b.code_prefix.length - a.code_prefix.length)[0];
  const rateDec = (Number(best.rate_percent) || 0) / 100;

  return [{ kind: 'pct' as const, value: rateDec, label: 'Section 301' }];
}

// ---------- HTTP helpers ----------
function buildOk(body: any, status = 200) {
  return NextResponse.json(body, { status });
}
function buildErr(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status });
}

// ---------- Core handler ----------
async function handle(body: ApiBody | URLSearchParams) {
  const get = (k: string) =>
    body instanceof URLSearchParams ? (body.get(k) ?? undefined) : (body as any)[k];

  const input = (pick(get('code'), get('query'), get('input')) ?? '').toString().trim();
  if (!input) return buildErr("Provide 'code' or 'input' (HS code only)", 400);

  const product = (pick(get('product'), get('query')) ?? '').toString().trim();
  const origin =
    (pick(get('origin'), get('originCountry'), get('originCountryCode'), get('country')) as
      | string
      | undefined) ?? 'US';

  const qty = Number(pick(get('qty'), get('quantity')) ?? 1) || 1;
  const unitPrice = Number(pick(get('unitPriceUsd'), get('price')) ?? 0) || 0;
  const explicitValue = Number(pick(get('value')) ?? NaN);
  const weightKg = Number(pick(get('unitWeightKg'), get('weightKg')) ?? 0) || 0;

  const customsValue = Number.isFinite(explicitValue)
    ? Math.max(0, explicitValue)
    : Math.max(0, unitPrice * qty);

  const cleaned = sanitizeHS(input);
  if (!(cleaned.length === 6 || cleaned.length === 8 || cleaned.length === 10)) {
    return buildErr('HS code must be 6, 8, or 10 digits', 400);
  }
  const hs10 = padTo10(cleaned);

  // Local DB → USITC fallback
  const local = await lookupSupabase(hs10);
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
        country: origin,
        price: unitPrice,
        hsCode: null,
        hsCodeFormatted: null,
        description: null,
        qty,
        weightKg,
        customsValue,
      },
      alternates: [] as any[],
      notes: ['No HTS or dictionary match found.'],
    });
  }

  // Add Section 301 if applicable
  const surcharges = await lookupSection301(hs10, origin ?? '');
  hit.components.push(...surcharges);

  const pctTotal = sumPct(hit.components);
  const duty = customsValue * pctTotal;

  return buildOk({
    duty,
    rate: pctTotal, // decimal (e.g., 0.275 for 27.5%)
    rateType: hit.rateType,
    components: hit.components,
    resolution: local ? ('dict' as const) : ('numeric' as const),
    breakdown: {
      product,
      country: origin,
      price: unitPrice,
      hsCode: hit.hsCode,
      hsCodeFormatted: formatHs(hit.hsCode),
      description: hit.description,
      qty,
      weightKg,
      customsValue,
    },
    alternates: [] as any[],
    notes: hit.note ? [hit.note] : [],
  });
}

// ---------- Routes ----------
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
