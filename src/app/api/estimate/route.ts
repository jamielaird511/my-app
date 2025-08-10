/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import * as HSD from '@/lib/hsDict';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** ---------- Types ---------- */
type RateComponent =
  | { kind: 'pct'; value: number } // 0.05 = 5%
  | { kind: 'amount'; value: number; per: string }; // $ per <unit> (kg, pair, doz, etc.)

type RateType = 'advalorem' | 'specific' | 'compound';

type HtsMini = {
  hsCode: string;
  description: string;
  rate: number | null; // first ad-valorem % if present ("Free" => 0)
  rateType: RateType;
  components: RateComponent[]; // all parsed components from General rate
  _rawGeneral?: string; // raw HTS "General rate of duty" (for debug/notes)
};

type Resolution = 'numeric' | 'hts' | 'dict' | 'none';

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

/** ---------- utils ---------- */
function normalizeNumeric(input: string): string {
  const digits = (input || '').replace(/\D+/g, '');
  if (!digits) return '';
  if (digits.length >= 10) return digits.slice(0, 10);
  return digits.padEnd(10, '0');
}
function looksNumeric(input: string): boolean {
  return /\d/.test(input) && input.replace(/\D+/g, '').length >= 6;
}
function is10Digit(code: string) {
  return /^\d{10}$/.test(code);
}
function formatHs(hs: string | null | undefined): string | null {
  if (!hs) return null;
  let d = String(hs).replace(/\D+/g, '');
  if (!d) return null;
  if (d.length < 10) d = d.padEnd(10, '0');
  return `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6, 10)}`;
}

/** ---------- Rate parsing ---------- */
/** Smarter parser for HTS “General rate of duty”
 * Supports:
 *  - "Free" → { pct: 0 }
 *  - Percentages: "5%", "2.5% ad val." (tolerant of footnotes like 2%*)
 *  - Dollar-per-unit: $/kg, $/g (→ $/kg), $/lb (→ $/kg), $/pair, $/pr, $/prs
 *  - Per dozen pairs: $/doz. pr., $/dozen pr(s), $/dz pr. (→ $/pair ÷ 12)
 *  - Per dozen (generic): $/doz., $/dozen, $/dz
 *  - Per gross: $/gross (→ $/unit ÷ 144)
 *  - Cents per unit: "7.5¢/kg", "2 c/kg", "2 c per doz. pr." (→ dollars)
 *  - “per” wording: "$1 per kg", "2 c per doz. pr."
 */
function parseGeneralRateRich(
  text?: string | null,
): { type: RateType; components: RateComponent[]; raw: string } | null {
  if (!text) return null;
  const raw = String(text);
  const t = raw.replace(/\s+/g, ' ').trim();

  // Free
  if (/^free\b/i.test(t)) {
    return { type: 'advalorem', components: [{ kind: 'pct', value: 0 }], raw };
  }

  const components: RateComponent[] = [];

  // Percentages (tolerant of footnotes like 2%*, 2%†)
  for (const m of t.matchAll(/(\d+(?:\.\d+)?)\s*%/giu)) {
    const v = parseFloat(m[1]);
    if (!Number.isNaN(v)) components.push({ kind: 'pct', value: v / 100 });
  }

  // $/unit — allow dots/spaces in unit, e.g., "doz. pr."
  for (const m of t.matchAll(/\$?\s*(\d+(?:\.\d+)?)\s*\/\s*([A-Za-z.\s0-9]+)\b/gi)) {
    let val = parseFloat(m[1]);
    let unit = (m[2] || '').toLowerCase().replace(/\s+/g, ' ').trim();
    const unitNorm = unit.replace(/\./g, '').replace(/\s+/g, ' ').trim(); // "doz pr", "prs", "dz pr", "gross", etc.

    // weights → per kg
    if (/\bkg(s)?\b/.test(unitNorm)) {
      components.push({ kind: 'amount', value: val, per: 'kg' });
      continue;
    }
    if (/\bg(ram|ams)?\b/.test(unitNorm)) {
      components.push({ kind: 'amount', value: val * 1000, per: 'kg' });
      continue;
    } // $/g → $/kg
    if (/\b(lb|lbs|pound|pounds)\b/.test(unitNorm)) {
      components.push({ kind: 'amount', value: val / 0.45359237, per: 'kg' });
      continue;
    } // $/lb → $/kg

    // pairs
    if (/\b(pair|pairs|pr|prs)\b/.test(unitNorm)) {
      components.push({ kind: 'amount', value: val, per: 'pair' });
      continue;
    }

    // dozen pairs → convert to per pair by /12  (doz/dozen/dz + pr/prs/pair/pairs)
    if (/\b(doz|dozen|dz)\b/.test(unitNorm) && /\b(pr|prs|pair|pairs)\b/.test(unitNorm)) {
      components.push({ kind: 'amount', value: val / 12, per: 'pair' });
      continue;
    }

    // dozen (generic)
    if (/\b(doz|dozen|dz)\b/.test(unitNorm)) {
      components.push({ kind: 'amount', value: val, per: 'dozen' });
      continue;
    }

    // gross (144 units) → per unit ÷ 144
    if (/\bgross\b/.test(unitNorm)) {
      components.push({ kind: 'amount', value: val / 144, per: 'unit' });
      continue;
    }

    // each/unit
    if (/\b(no|unit|each|u)\b/.test(unitNorm)) {
      components.push({ kind: 'amount', value: val, per: 'unit' });
      continue;
    }

    // fallback
    components.push({ kind: 'amount', value: val, per: unitNorm });
  }

  // $ per unit (e.g., "$1 per kg", "$0.50 per pair")
  for (const m of t.matchAll(/\$\s*(\d+(?:\.\d+)?)\s*(?:per)\s*([A-Za-z.\s0-9]+)\b/gi)) {
    const val = parseFloat(m[1]);
    let unit = (m[2] || '').toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ').trim();

    if (/\bkg(s)?\b/.test(unit)) {
      components.push({ kind: 'amount', value: val, per: 'kg' });
      continue;
    }
    if (/\b(pair|pairs|pr|prs)\b/.test(unit)) {
      components.push({ kind: 'amount', value: val, per: 'pair' });
      continue;
    }
    // dozen pairs → convert to per pair by /12
    if (/\b(doz|dozen|dz)\b/.test(unit) && /\b(pr|prs|pair|pairs)\b/.test(unit)) {
      components.push({ kind: 'amount', value: val / 12, per: 'pair' });
      continue;
    }
    if (/\b(doz|dozen|dz)\b/.test(unit)) {
      components.push({ kind: 'amount', value: val, per: 'dozen' });
      continue;
    }
    if (/\bgross\b/.test(unit)) {
      components.push({ kind: 'amount', value: val / 144, per: 'unit' });
      continue;
    }
    if (/\b(no|unit|each|u)\b/.test(unit)) {
      components.push({ kind: 'amount', value: val, per: 'unit' });
      continue;
    }
    components.push({ kind: 'amount', value: val, per: unit });
  }

  // cents per unit with "c" (e.g., "2 c/kg", "2 c per doz. pr.")
  for (const m of t.matchAll(/(\d+(?:\.\d+)?)\s*c\s*(?:per|\/)\s*([A-Za-z.\s0-9]+)\b/gi)) {
    const val = parseFloat(m[1]) / 100; // convert cents to dollars
    let unit = (m[2] || '').toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ').trim();

    if (/\bkg(s)?\b/.test(unit)) {
      components.push({ kind: 'amount', value: val, per: 'kg' });
      continue;
    }
    if (/\b(pair|pairs|pr|prs)\b/.test(unit)) {
      components.push({ kind: 'amount', value: val, per: 'pair' });
      continue;
    }
    if (/\b(doz|dozen|dz)\b/.test(unit) && /\b(pr|prs|pair|pairs)\b/.test(unit)) {
      components.push({ kind: 'amount', value: val / 12, per: 'pair' });
      continue;
    }
    if (/\b(doz|dozen|dz)\b/.test(unit)) {
      components.push({ kind: 'amount', value: val, per: 'dozen' });
      continue;
    }
    if (/\bgross\b/.test(unit)) {
      components.push({ kind: 'amount', value: val / 144, per: 'unit' });
      continue;
    }
    if (/\b(no|unit|each|u)\b/.test(unit)) {
      components.push({ kind: 'amount', value: val, per: 'unit' });
      continue;
    }
    components.push({ kind: 'amount', value: val, per: unit });
  }

  // cents per unit (¢) → dollars
  for (const m of t.matchAll(/(\d+(?:\.\d+)?)\s*¢\s*\/\s*([A-Za-z.\s0-9]+)\b/gi)) {
    let val = parseFloat(m[1]) / 100;
    let unit = (m[2] || '').toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ').trim();

    if (/\bkg(s)?\b/.test(unit)) {
      components.push({ kind: 'amount', value: val, per: 'kg' });
      continue;
    }
    if (/\b(pair|pairs|pr|prs)\b/.test(unit)) {
      components.push({ kind: 'amount', value: val, per: 'pair' });
      continue;
    }
    if (/\b(doz|dozen|dz)\b/.test(unit) && /\b(pr|prs|pair|pairs)\b/.test(unit)) {
      components.push({ kind: 'amount', value: val / 12, per: 'pair' });
      continue;
    }
    if (/\b(doz|dozen|dz)\b/.test(unit)) {
      components.push({ kind: 'amount', value: val, per: 'dozen' });
      continue;
    }
    if (/\bgross\b/.test(unit)) {
      components.push({ kind: 'amount', value: val / 144, per: 'unit' });
      continue;
    }
    if (/\b(no|unit|each|u)\b/.test(unit)) {
      components.push({ kind: 'amount', value: val, per: 'unit' });
      continue;
    }
    components.push({ kind: 'amount', value: val, per: unit });
  }

  if (!components.length) return null;

  const pctCount = components.filter((c) => c.kind === 'pct').length;
  const amtCount = components.filter((c) => c.kind === 'amount').length;
  const type: RateType =
    pctCount > 0 && amtCount > 0 ? 'compound' : pctCount > 0 ? 'advalorem' : 'specific';

  return { type, components, raw };
}

/** Try to find the general rate field across shapes */
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

/** Convert raw HTS record to our mini shape */
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

/** Simple keyword score */
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

  const url = `${HTS_BASE}/exportList?from=${encodeURIComponent(code10)}&to=${encodeURIComponent(code10)}&format=JSON`;
  const res = await fetch(url, { cache: 'no-store', headers: { Accept: 'application/json' } });
  if (!res.ok) return null;

  const data: any = await res.json().catch(() => null);
  if (!data) return null;

  const rows: any[] = Array.isArray(data)
    ? data
    : Array.isArray(data.results)
      ? data.results
      : Array.isArray(data.data)
        ? data.data
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

  const rows: any[] = Array.isArray(data) ? data : Array.isArray(data.results) ? data.results : [];

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

/** ---------- Duty calculator ---------- */
// Ad-valorem now uses TOTAL shipment value: priceUSD * (qty ?? 1)
function computeDutyUSD(args: {
  components: RateComponent[];
  priceUSD: number; // price per unit
  qty?: number | null; // units/pairs
  weightKg?: number | null; // total weight
  notes: string[];
}) {
  const { components, priceUSD } = args;
  let duty = 0;

  const units = args.qty != null && Number.isFinite(args.qty) && args.qty > 0 ? args.qty : 1;

  // ad valorem on total declared value
  for (const c of components) {
    if (c.kind === 'pct') duty += priceUSD * units * c.value;
  }

  // specific units
  for (const c of components) {
    if (c.kind !== 'amount') continue;
    const per = (c.per || '').toLowerCase();

    if (per === 'kg') {
      if (args.weightKg && args.weightKg > 0) duty += c.value * args.weightKg;
      else args.notes.push('This line charges per kilogram. Add weight (kg) to include that part.');
      continue;
    }

    if (per === 'pair') {
      if (args.qty && args.qty > 0) duty += c.value * args.qty;
      else args.notes.push('This line charges per pair. Add quantity to include that part.');
      continue;
    }

    if (per === 'unit') {
      if (args.qty && args.qty > 0) duty += c.value * args.qty;
      else args.notes.push('This line charges per unit. Add quantity to include that part.');
      continue;
    }

    if (per === 'dozen') {
      if (args.qty && args.qty > 0) duty += c.value * (args.qty / 12);
      else args.notes.push('This line charges per dozen. Add quantity (we’ll divide by 12).');
      continue;
    }

    // unknown unit -> warn
    args.notes.push(`Specific duty uses unsupported unit "/${per}" — not included in total yet.`);
  }

  return Number(duty.toFixed(2));
}

/** ---------- Core handler ---------- */
async function handleEstimate(params: {
  input?: string;
  product?: string;
  price?: any;
  country?: string;
  qty?: any;
  weightKg?: any;
}) {
  const input = String(params.input ?? params.product ?? '').trim();
  const product = String(params.product ?? input ?? '').trim();
  const country = String(params.country ?? 'China');
  const price = Number(params.price ?? 0);
  const qty = params.qty == null ? null : Number(params.qty);
  const weightKg = params.weightKg == null ? null : Number(params.weightKg);

  if (!input) {
    return { error: "Provide 'input' (keyword or HS code)", status: 400 };
  }

  let chosen: HtsMini | null = null;
  let resolution: Resolution = 'none';
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
          resolution: 'none' as Resolution,
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
    input: searchParams.get('input') ?? undefined,
    product: searchParams.get('product') ?? undefined,
    price: searchParams.get('price') ?? undefined,
    country: searchParams.get('country') ?? undefined,
    qty: searchParams.get('qty') ?? undefined,
    weightKg: searchParams.get('weightKg') ?? undefined,
  });
  if ('error' in out) return NextResponse.json({ error: out.error }, { status: out.status });
  return NextResponse.json(out.body, { status: out.status });
}
