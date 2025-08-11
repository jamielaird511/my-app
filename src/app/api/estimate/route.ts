/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import * as HSD from '@/lib/hsDict';
import {
  RateComponent,
  RateType,
  HtsMini,
  parseGeneralRateRich,
  computeDutyUSD,
  looksNumeric,
  is10Digit,
  normalizeNumeric,
  formatHs,
} from '@/lib/duty';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** ---------- Config ---------- */
const HTS_BASE = 'https://hts.usitc.gov/reststop';

/** Resolve hsLookup regardless of export style */
const hsLookupFn: undefined | ((input: string) => any) = (() => {
  const cand =
    (HSD as any)?.hsLookup ??
    (HSD as any)?.default ??
    (typeof (HSD as any) === 'function' ? (HSD as any) : undefined);
  return typeof cand === 'function' ? cand : undefined;
})();

/** In-memory cache (per server instance) */
const cache = new Map<string, { t: number; data: any }>();
const TTL_MS = 5 * 60 * 1000;
function getCache(key: string) {
  const v = cache.get(key);
  if (!v) return null;
  if (Date.now() - v.t > TTL_MS) {
    cache.delete(key);
    return null;
  }
  return v.data;
}
function setCache(key: string, data: any) {
  cache.set(key, { t: Date.now(), data });
}

/** ---------- HTS helpers ---------- */
function extractGeneralRateField(rec: any): string | null {
  if (typeof rec?.general_rate === 'string') return rec.general_rate;
  if (typeof rec?.generalRate === 'string') return rec.generalRate;
  if (typeof rec?.general === 'string') return rec.general;
  if (rec?.rates && typeof rec.rates.general === 'string') return rec.rates.general;
  for (const k of Object.keys(rec || {})) {
    const v = rec[k];
    if (typeof v !== 'string') continue;
    const key = k.toLowerCase();
    if (key.includes('general') && key.includes('duty')) return v;
    if (key.includes('general rate')) return v;
  }
  return null;
}

function toHtsMini(rec: any): HtsMini | null {
  const hsCode =
    rec?.htsno || rec?.htsno_str || rec?.hts_number || rec?.hts || rec?.number || rec?.htsno10;
  const description =
    rec?.desc || rec?.description || rec?.article || rec?.short_desc || rec?.item_description;
  if (!hsCode || !description) return null;

  const rawGeneral = extractGeneralRateField(rec);
  const rich = parseGeneralRateRich(rawGeneral);
  let rate: number | null = null;
  let rateType: RateType = 'specific';
  let components: RateComponent[] = [];

  if (rich) {
    rateType = rich.type;
    components = rich.components;
    const firstPct = components.find((c) => c.kind === 'pct') as
      | { kind: 'pct'; value: number }
      | undefined;
    rate = firstPct ? firstPct.value : null;
  }

  return {
    hsCode: String(hsCode).replace(/\D+/g, '').padEnd(10, '0').slice(0, 10),
    description: String(description).replace(/\s+/g, ' ').trim(),
    rate,
    rateType,
    components,
    _rawGeneral: rawGeneral ?? undefined,
  };
}

function scoreKeywordHit(mini: HtsMini, q: string): number {
  const s = mini.description.toLowerCase();
  const ql = q.toLowerCase();
  let score = 0;
  if (new RegExp(`\\b${ql}\\b`).test(s)) score += 10;
  if (s.includes(ql)) score += 4;
  if (mini.rate !== null) score += 3;
  if (is10Digit(mini.hsCode)) score += 2;
  score += Math.max(0, 2 - Math.min(2, Math.floor(mini.description.length / 60)));
  return score;
}

/** ---------- HTS calls (cached) ---------- */
async function htsExportByCode(numericInput: string): Promise<HtsMini[] | null> {
  const code10 = normalizeNumeric(numericInput);
  if (!code10) return null;

  const key = `export:${code10}`;
  const cached = getCache(key);
  if (cached) return cached;

  const url = `${HTS_BASE}/exportList?from=${encodeURIComponent(code10)}&to=${encodeURIComponent(
    code10,
  )}&format=JSON`;
  const res = await fetch(url, { cache: 'no-store', headers: { Accept: 'application/json' } });
  if (!res.ok) return null;

  const data: any = await res.json().catch(() => null);
  if (!data) return null;

  const rows: any[] = Array.isArray(data)
    ? data
    : Array.isArray((data as any).results)
      ? (data as any).results
      : Array.isArray((data as any).data)
        ? (data as any).data
        : [];

  const minis = rows.map(toHtsMini).filter(Boolean) as HtsMini[];
  const out = minis.length ? minis : null;
  setCache(key, out);
  return out;
}

async function htsSearchByKeyword(keyword: string): Promise<HtsMini[] | null> {
  const q = keyword.toLowerCase().trim();
  const key = `search:${q}`;
  const cached = getCache(key);
  if (cached) return cached;

  const url = `${HTS_BASE}/search?keyword=${encodeURIComponent(keyword)}`;
  const res = await fetch(url, { cache: 'no-store', headers: { Accept: 'application/json' } });
  if (!res.ok) return null;

  const data: any = await res.json().catch(() => null);
  if (!data) return null;

  const rows: any[] = Array.isArray(data)
    ? data
    : Array.isArray((data as any).results)
      ? (data as any).results
      : [];
  const minis = rows.map(toHtsMini).filter(Boolean) as HtsMini[];
  const out = minis.length ? minis : null;
  setCache(key, out);
  return out;
}

/** ---------- Dict fallback ---------- */
function dictFallback(input: string) {
  try {
    if (!hsLookupFn) return null;
    const hit = hsLookupFn(input); // { hsCode, description, usDutyRate, resolution }
    if (!hit) return null;
    return {
      hsCode: hit.hsCode,
      description: hit.description,
      rate: typeof hit.usDutyRate === 'number' ? hit.usDutyRate : null,
      rateType: (typeof hit.usDutyRate === 'number' ? 'advalorem' : 'specific') as RateType,
      components:
        typeof hit.usDutyRate === 'number'
          ? ([{ kind: 'pct', value: hit.usDutyRate }] as RateComponent[])
          : [],
      _dictResolution: hit.resolution,
    };
  } catch {
    return null;
  }
}

/** ---------- Normalization ---------- */
function pick<T>(...vals: (T | undefined | null)[]) {
  return vals.find((v) => v !== undefined && v !== null);
}

function normalizeIncoming(body: any) {
  const input = (pick(body.query, body.input, body.product) ?? '').toString().trim();
  const product = (pick(body.product, body.query, body.input) ?? '').toString().trim();
  const country = (pick(body.originCountry, body.country) ?? 'CN').toString().trim();
  const price = Number(pick(body.unitPriceUsd, body.price) ?? 0);
  const qtyRaw = pick(body.quantity, body.qty);
  const qty = qtyRaw == null ? null : Number(qtyRaw);
  const weightRaw = pick(body.unitWeightKg, body.weightKg);
  const weightKg = weightRaw == null ? null : Number(weightRaw);

  return { input, product, country, price, qty, weightKg };
}

/** ---------- Core handler ---------- */
async function handleEstimate(body: any) {
  const { input, product, country, price, qty, weightKg } = normalizeIncoming(body);

  if (!input) {
    return { error: "Provide 'query' or 'input' (keyword or HS code)", status: 400 };
  }

  let chosen: HtsMini | null = null;
  let resolution: 'numeric' | 'hts' | 'dict' | 'none' = 'none';
  const notes: string[] = [];
  let alternates: HtsMini[] = [];

  try {
    // 1) Numeric → exportList; fallback to numeric search
    if (looksNumeric(input)) {
      const minisExport = await htsExportByCode(input);
      if (minisExport?.length) {
        const exact = minisExport.find((m) => is10Digit(m.hsCode)) ?? minisExport[0];
        chosen = exact ?? null;
        resolution = 'numeric';
      } else {
        const minisSearch = await htsSearchByKeyword(input);
        if (minisSearch?.length) {
          const digits = input.replace(/\D+/g, '');
          const pref = minisSearch
            .filter((m) => is10Digit(m.hsCode) && m.hsCode.startsWith(digits.slice(0, 6)))
            .sort((a, b) => (a.rate === null ? 1 : 0) - (b.rate === null ? 1 : 0)); // prefer ad valorem
          chosen = pref[0] ?? minisSearch[0] ?? null;
          resolution = 'numeric';
        }
      }
    }

    // 2) Keyword → search (collect alternates)
    if (!chosen && !looksNumeric(input)) {
      const minis = await htsSearchByKeyword(input);
      if (minis?.length) {
        const scored = minis
          .map((m) => ({ m, s: scoreKeywordHit(m, input) }))
          .sort((a, b) => b.s - a.s);
        chosen = scored[0]?.m ?? null;
        resolution = 'hts';
        alternates = scored.slice(1, 6).map((x) => x.m);
      }
    }

    // 3) Local dict fallback
    if (!chosen) {
      const fb = dictFallback(input);
      if (fb) {
        chosen = {
          hsCode: fb.hsCode,
          description: fb.description,
          rate: fb.rate,
          rateType: fb.rate != null ? 'advalorem' : 'specific',
          components: fb.rate != null ? [{ kind: 'pct', value: fb.rate }] : [],
        };
        resolution = 'dict';
      }
    }

    // 4) No match
    if (!chosen) {
      return {
        body: {
          duty: null,
          rate: null,
          rateType: null as any,
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
        },
        status: 200,
      };
    }

    // If nothing parsed yet, include the raw text so we can see what HTS returned
    if (chosen.components.length === 0 && chosen.rate == null && (chosen as any)._rawGeneral) {
      notes.push(`HTS General (raw): ${(chosen as any)._rawGeneral}`);
    }

    // Compute duty
    let duty: number | null = null;
    if (chosen.components.length === 0 && chosen.rate == null) {
      notes.push('No parseable General rate of duty for this line.');
    } else {
      duty = computeDutyUSD({
        components: chosen.components,
        priceUSD: price,
        qty,
        weightKg,
        notes,
      });
    }

    if (chosen.rateType !== 'advalorem') {
      notes.push(
        'This line includes specific or compound duties. Provide quantity and/or weight (kg) for the most accurate total.',
      );
    }

    return {
      body: {
        duty,
        rate: chosen.rate,
        rateType: chosen.rateType,
        components: chosen.components,
        resolution,
        breakdown: {
          product,
          country,
          price,
          hsCode: chosen.hsCode,
          hsCodeFormatted: formatHs(chosen.hsCode),
          description: chosen.description,
          qty,
          weightKg,
        },
        alternates: alternates.map((a) => ({
          hsCode: a.hsCode,
          hsCodeFormatted: formatHs(a.hsCode),
          description: a.description,
          rate: a.rate,
          rateType: a.rateType,
        })),
        notes,
      },
      status: 200,
    };
  } catch (err: any) {
    console.error('[/api/estimate] error:', err);
    return { error: err?.message ?? 'Unexpected error', status: 500 };
  }
}

/** ---------- API handlers ---------- */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  let body: any = {};
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const out = await handleEstimate(body);
  if ('error' in out) return NextResponse.json({ error: out.error }, { status: out.status });
  return NextResponse.json(out.body, { status: out.status });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const out = await handleEstimate({
    // support both param styles in GET as well
    query: searchParams.get('query') ?? undefined,
    input: searchParams.get('input') ?? undefined,
    product: searchParams.get('product') ?? undefined,
    price: searchParams.get('price') ?? undefined,
    unitPriceUsd: searchParams.get('unitPriceUsd') ?? undefined,
    country: searchParams.get('country') ?? undefined,
    originCountry: searchParams.get('originCountry') ?? undefined,
    qty: searchParams.get('qty') ?? undefined,
    quantity: searchParams.get('quantity') ?? undefined,
    weightKg: searchParams.get('weightKg') ?? undefined,
    unitWeightKg: searchParams.get('unitWeightKg') ?? undefined,
  });
  if ('error' in out) return NextResponse.json({ error: out.error }, { status: out.status });
  return NextResponse.json(out.body, { status: out.status });
}
