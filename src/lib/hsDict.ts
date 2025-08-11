// src/lib/hsDict.ts
// Fallback-aware HS utilities + dictionary/API lookup
// Works with 6, 8, or 10 digits. Accepts messy paste (dots/spaces).

export type Resolution = 'none' | 'numeric' | 'dict' | 'hts';

export type HsRecord = {
  hsCode: string; // numeric, no punctuation
  description: string;
  // Optional, depending on your pipeline:
  dutyRate?: number | null; // e.g., 0.02 for 2%
  notes?: string[];
};

export type HsLookupResult =
  | { resolution: 'none' }
  | ({ resolution: Exclude<Resolution, 'none'> } & HsRecord);

// -----------------------------
// Formatting / sanitizing utils
// -----------------------------
export function sanitizeHS(raw: string): string {
  const groups = raw.match(/\d+/g) || [];
  const digits = groups.join('');
  if (digits.length <= 10) return digits;

  // If someone pastes a verbose "900410.10.0000" with extra digits,
  // prefer first 6 + last 4 (=> 10)
  const first6 = digits.slice(0, 6);
  const last4 = digits.slice(-4);
  const candidate = `${first6}${last4}`;
  if (candidate.length === 10) return candidate;

  return digits.slice(0, 10);
}

export function isValidHS(raw: string): boolean {
  const d = sanitizeHS(raw);
  return d.length === 6 || d.length === 8 || d.length === 10;
}

// Display: 6->4.2, 8->4.2.2, 10->4.2.4
export function formatHsCode(code: string): string {
  const digits = code.replace(/\D/g, '');
  if (digits.length === 6) return digits.replace(/(\d{4})(\d{2})/, '$1.$2');
  if (digits.length === 8) return digits.replace(/(\d{4})(\d{2})(\d{2})/, '$1.$2.$3');
  if (digits.length === 10) return digits.replace(/(\d{4})(\d{2})(\d{4})/, '$1.$2.$3');
  return code;
}

// Candidate order given an initial length.
// 10 -> [10, 8, 6]
// 8  -> [8, 10(padded with 00), 6]
// 6  -> [6]
function candidateLengths(len: number): Array<6 | 8 | 10> {
  if (len === 10) return [10, 8, 6];
  if (len === 8) return [8, 10, 6];
  return [6];
}

// If we move to a shorter candidate, truncate.
// If we move 8 -> 10, pad with '00' (common US stats pattern).
function adjustToLength(digits: string, target: 6 | 8 | 10): string {
  if (target === 6) return digits.slice(0, 6);
  if (target === 8) return digits.slice(0, 8);
  // target === 10
  if (digits.length >= 10) return digits.slice(0, 10);
  if (digits.length === 8) return `${digits}00`; // 8->10 padding
  // 6->10 not typical; still allow as 6 + '0000'
  if (digits.length === 6) return `${digits}0000`;
  return digits.padEnd(10, '0');
}

// --------------------------------------------
// Plug-in lookups (API + local dictionary)
// --------------------------------------------

// 1) USITC/HTS API numeric lookup.
// Replace this with your real call (server-side preferred).
export async function apiLookupNumeric(hs: string, signal?: AbortSignal): Promise<HsLookupResult> {
  // Example stub: return "none" so dict can still work.
  // You should replace with your real API call to HTS/USITC.
  void signal;
  return { resolution: 'none' };
}

// 2) Local curated dictionary (fast path).
// Replace with your real dictionary store. Ship a few seeds for sanity.
const LOCAL_DICT: Record<string, HsRecord> = {
  // Sunglasses (good sanity check)
  '900410': { hsCode: '900410', description: 'Sunglasses' },
  '90041010': { hsCode: '90041010', description: 'Sunglasses, plastic frames' },
  '9004100000': { hsCode: '9004100000', description: 'Sunglasses' },
};

export async function dictLookup(hs: string): Promise<HsLookupResult> {
  const rec = LOCAL_DICT[hs];
  if (!rec) return { resolution: 'none' };
  return { resolution: 'numeric', ...rec };
}

// --------------------------------------------
// Fallback-aware resolver
// --------------------------------------------
export type ResolverOptions = {
  signal?: AbortSignal;
  // Override lookups if you prefer (e.g., inject mocks in tests)
  api?: (hs: string, signal?: AbortSignal) => Promise<HsLookupResult>;
  dict?: (hs: string) => Promise<HsLookupResult>;
};

// Try a single HS code once via dict, then API (or the opposite—tune order if you want).
async function tryOnce(hs: string, opts: ResolverOptions): Promise<HsLookupResult> {
  const dict = opts.dict ?? dictLookup;
  const api = opts.api ?? apiLookupNumeric;

  // Dict first (fast, deterministic)
  const d = await dict(hs);
  if (d.resolution !== 'none') return d;

  // API second
  const a = await api(hs, opts.signal);
  if (a.resolution !== 'none') return a;

  return { resolution: 'none' };
}

/**
 * Resolve an HS code with robust fallbacks:
 * - Accept messy paste
 * - Try exact length first
 * - If 10 fails => 8 => 6
 * - If 8 fails => 10 (padded '00') => 6
 * - If 6 exists => return it
 */
export async function resolveHsWithFallback(
  rawInput: string,
  opts: ResolverOptions = {},
): Promise<HsLookupResult> {
  const clean = sanitizeHS(rawInput);
  if (!clean) return { resolution: 'none' };

  const lengths = candidateLengths(clean.length as 6 | 8 | 10);

  for (const L of lengths) {
    const candidate = adjustToLength(clean, L);
    const res = await tryOnce(candidate, opts);
    if (res.resolution !== 'none') return res;

    // Special case: for 10-length branch, also try the corresponding 8 (truncate) before dropping to 6.
    if (L === 10 && clean.length === 10) {
      const as8 = adjustToLength(clean, 8);
      if (as8 !== candidate) {
        const res8 = await tryOnce(as8, opts);
        if (res8.resolution !== 'none') return res8;
      }
    }
  }

  return { resolution: 'none' };
}

// -----------------------------
// Convenience: one-shot describe
// -----------------------------
export async function describeHs(rawInput: string, opts?: ResolverOptions) {
  const r = await resolveHsWithFallback(rawInput, opts);
  if (r.resolution === 'none') {
    return { resolution: 'none' as const, hsCode: null, description: null };
  }
  return {
    resolution: r.resolution,
    hsCode: r.hsCode,
    hsCodeDisplay: formatHsCode(r.hsCode),
    description: r.description,
  };
}

/* --------------------------------------------------------------------
How to wire in /api/estimate (server route):

import { resolveHsWithFallback } from '@/lib/hsDict';

export async function POST(req: Request) {
  const { query, ...rest } = await req.json();
  const hs = await resolveHsWithFallback(query, {
    api: yourRealHtsApiLookup,   // implement server-side call to USITC/HTS
    dict: yourRealDictLookup,    // implement your dictionary lookup if you have one
  });

  if (hs.resolution === 'none') {
    // return your "no match" shape
  }

  // Continue: fetch rate for hs.hsCode, compute duty, etc.
}
--------------------------------------------------------------------- */
