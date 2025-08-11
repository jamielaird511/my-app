/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import * as HSD from '@/lib/hsDict';
import {
  RateComponent,
  RateType,
  HtsMini,
  parseGeneralRateRich,
  computeDutyUSD,
  is10Digit,
  normalizeNumeric,
  formatHs,
} from '@/lib/duty';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** ---------- Config ---------- */
const HTS_BASE = 'https://hts.usitc.gov/reststop';

/** Optional curated dictionary (legacy hsLookup) */
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

/** ---------- HTS calls (cached, hardened) ---------- */
async function htsExportByCode(numericInput: string): Promise<HtsMini[] | null> {
  const code10 = normalizeNumeric(numericInput); // 6->+0000, 8->+00, 10->10
  if (!code10) return null;

  const key = `export:${code10}`;
  const cached = getCache(key);
  if (cached !== undefined) return cached;

  const url = `${HTS_BASE}/exportList?from=${encodeURIComponent(code10)}&to=${encodeURIComponent(
    code10,
  )}&format=JSON`;

  try {
    const res = await fetch(url, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });

    if (!res.ok) {
      console.warn(`[exportList ${code10}] HTTP ${res.status}`);
      setCache(key, null);
      return null;
    }

    const data: any = await res.json().catch(() => null);
    if (!data) {
      console.warn(`[exportList ${code10}] empty JSON`);
      setCache(key, null);
      return null;
    }

    const rows: any[] = Array.isArray(data)
      ? data
      : Array.isArray((data as any).results)
        ? (data as any).results
        : Array.isArray((data as any).data)
          ? (data as any).data
          : [];

    const minis = rows.map(toHtsMini).filter(Boolean) as HtsMini[];
    const out = minis.length ? minis : null;
    if (!out) console.warn(`[exportList ${code10}] no rows`);
    setCache(key, out);
    return out;
  } catch (e: any) {
    console.warn(`[exportList ${code10}] fetch failed: ${e?.message}`);
    setCache(key, null);
    return null;
  }
}

async function htsSearchByKeyword(keyword: string): Promise<HtsMini[] | null> {
  const q = keyword.toLowerCase().trim();
  const key = `search:${q}`;
  const cached = getCache(key);
  if (cached !== undefined) return cached;

  const url = `${HTS_BASE}/search?keyword=${encodeURIComponent(keyword)}`;

  try {
    const res = await fetch(url, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });

    if (!res.ok) {
      console.warn(`[search ${keyword}] HTTP ${res.status}`);
      setCache(key, null);
      return null;
    }

    const data: any = await res.json().catch(() => null);
    if (!data) {
      console.warn(`[search ${keyword}] empty JSON`);
      setCache(key, null);
      return null;
    }

    const rows: any[] = Array.isArray(data)
      ? data
      : Array.isArray((data as any).results)
        ? (data as any).results
        : [];
    const minis = rows.map(toHtsMini).filter(Boolean) as HtsMini[];
    const out = minis.length ? minis : null;
    if (!out) console.warn(`[search ${keyword}] no rows`);
    setCache(key, out);
    return out;
  } catch (e: any) {
    console.warn(`[search ${keyword}] fetch failed: ${e?.message}`);
    setCache(key, null);
    return null;
  }
}

/** ---------- Dict fallback ---------- */
function dictFallback(input: string) {
  try {
    if (!hsLookupFn) return null;
    const hit = hsLookupFn(input); // { hsCode, description, usDutyRate, resolution }
    if (!hit) return null;
    return {
      hsCode: String(hit.hsCode ?? input).replace(/\D+/g, ''),
      description: String(hit.description ?? '').trim(),
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

/** ---------- Core handler (numeric-only with robust fallback) ---------- */
async function handleEstimate(body: any) {
  const { input, product, country, price, qty, weightKg } = normalizeIncoming(body);

  if (!input) {
    return { error: "Provide 'query' or 'input' (HS code only)", status: 400 };
  }

  // Clean and validate: 6, 8, or 10 digits
  const clean = HSD.sanitizeHS(input).replace(/\D+/g, '');
  if (!(clean.length === 6 || clean.length === 8 || clean.length === 10)) {
    return { error: 'HS code must be 6, 8, or 10 digits', status: 400 };
  }

  let chosen: HtsMini | null = null;
  let chosenDesc: string | null = null;
  const notes: string[] = [];

  try {
    // Build strict candidate order and ALWAYS try parent 6->10
    const parent6to10 = `${clean.slice(0, 6)}0000`;
    const eightToTen = clean.length === 8 ? `${clean}00` : null;
    const directTen = clean.length === 10 ? clean : null;

    const exportCandidates: string[] = [];
    if (directTen) exportCandidates.push(directTen);
    if (eightToTen) exportCandidates.push(eightToTen);
    exportCandidates.push(parent6to10);

    console.log('[HTS candidates]', { input: clean, exportCandidates });

    // 1) exportList on each candidate
    for (const cand of exportCandidates) {
      const minis = await htsExportByCode(cand);
      console.log('[exportList try]', cand, '=>', minis?.length ?? 0);
      if (minis && minis.length) {
        chosen =
          minis.find((m) => m.hsCode === cand) ??
          minis.find((m) => is10Digit(m.hsCode)) ??
          minis[0]!;
        chosenDesc = chosen.description;
        break;
      }
    }

    // 2) search fallback (numeric keyword) if exportList failed
    if (!chosen) {
      const minisSearch = await htsSearchByKeyword(clean);
      console.log('[search keyword]', clean, '=>', minisSearch?.length ?? 0);
      if (minisSearch?.length) {
        const pref = minisSearch
          .filter((m) => is10Digit(m.hsCode) && m.hsCode.startsWith(clean.slice(0, 6)))
          .concat(minisSearch);
        chosen = pref[0] ?? null;
        chosenDesc = chosen?.description ?? null;
      }
    }

    // 3) Local dict fallback (last resort)
    if (!chosen) {
      const dict = dictFallback(clean);
      if (dict) {
        chosen = {
          hsCode: dict.hsCode,
          description: dict.description,
          rate: dict.rate,
          rateType: dict.rateType,
          components: dict.components,
        };
        chosenDesc = dict.description;
      }
    }

    // 4) No match at all
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

    // Notes if we had only raw general rate text
    if (chosen.components.length === 0 && chosen.rate == null && (chosen as any)._rawGeneral) {
      notes.push(`HTS General (raw): ${(chosen as any)._rawGeneral}`);
      notes.push('No parseable General rate of duty for this line.');
    }

    // Duty math
    let duty: number | null = null;
    if (chosen.components.length > 0 || chosen.rate != null) {
      duty = computeDutyUSD({
        components: chosen.components,
        priceUSD: price,
        qty,
        weightKg,
        notes,
      });
    } else {
      duty = 0;
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
        resolution: 'numeric' as const,
        breakdown: {
          product,
          country,
          price,
          hsCode: chosen.hsCode,
          hsCodeFormatted: formatHs(chosen.hsCode),
          description: chosenDesc,
          qty,
          weightKg,
        },
        alternates: [], // you can add neighbors later if needed
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
