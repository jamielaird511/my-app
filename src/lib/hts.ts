// src/lib/hts.ts
//
// HS search/lookup for USITC RestStop with:
// - robust fetch policy (timeouts, retries, jitter, circuit breaker, 429 backoff)
// - in-memory LRU cache
// - normalization, ranking, dedupe, pagination
// - synonym expansion + light fuzzy (cap 1 edit)
// - strong error surfaces (degraded mode w/ cached results)
// - TypeScript throughout
//
// If you hit CORS, set `proxyBaseUrl` to `/api/hts-proxy?path=` (see optional proxy route).
//

import { expandQuery } from './synonyms';
import { scoreItem, defaultWeights as rankDefaults, setWeights as setRankWeights } from './rank';
import type { RankingWeights } from './rank';

/* ============================================================
   parseGeneralRateRich (lazy require to avoid build/timing issues)
============================================================ */

type ParsedRate = {
  rateType: 'advalorem' | 'specific' | 'compound' | 'free' | 'other';
  components: any[];
};

let parseGeneralRateRich: (raw: string) => ParsedRate;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  parseGeneralRateRich = require('./parseGeneralRateRich').parseGeneralRateRich as (
    raw: string,
  ) => ParsedRate;
} catch {
  // Minimal fallback if the real parser isn't available yet
  parseGeneralRateRich = (raw: string): ParsedRate => {
    if (!raw) return { rateType: 'other', components: [{ kind: 'other', raw }] };
    if (/free/i.test(raw)) return { rateType: 'free', components: [{ kind: 'free' }] };
    const m = raw.match(/([\d.]+)\s*%/);
    if (m)
      return { rateType: 'advalorem', components: [{ kind: 'advalorem', pct: parseFloat(m[1]) }] };
    return { rateType: 'other', components: [{ kind: 'other', raw }] };
  };
}

/* ============================================================
   Types
============================================================ */

export type RateComponent =
  | { kind: 'advalorem'; pct: number }
  | { kind: 'specific'; amount: number; unit: string }
  | { kind: 'compound'; parts: RateComponent[] }
  | { kind: 'free' }
  | { kind: 'other'; raw: string };

export type RateType = 'advalorem' | 'specific' | 'compound' | 'free' | 'other';

export type NormalizedHTSItem = {
  hsCode10: string; // 10 digits, zero-padded, no dots
  hsCodeShown: string; // pretty with dots, e.g. 6404.11.0000
  chapter: number; // 64
  description: string; // main line text
  notes?: string; // supplemental text if present
  rateType: RateType;
  components: RateComponent[];
  rawGeneral: string; // USITC “General” field as-is
  isTenDigit: boolean;
  hasNESOI: boolean;
  sourceUrl: string; // "View on USITC"
};

export type SearchOptions = {
  limit?: number; // default 50
  offset?: number; // default 0
  tenDigitOnly?: boolean; // filter
  chapter?: number; // filter, e.g. 64
  chapterBoosts?: Record<number, number>; // rank multipliers by chapter
  proxyBaseUrl?: string; // e.g. "/api/hts-proxy?path="
  timeoutMs?: number; // default 6500
  fuzzyEditsCap?: 0 | 1; // default 1 (typo tolerant)
};

export type SearchMeta = {
  query: string;
  expandedQueries: string[];
  totalFound: number; // post-filter, pre-pagination
  usedCache: boolean;
  degraded: boolean;
  warnings: string[];
};

export type SearchResponse = {
  items: NormalizedHTSItem[];
  meta: SearchMeta;
};

export { rankDefaults as rankingDefaultWeights };
export type { RankingWeights };
export function setRankingWeights(overrides: Partial<RankingWeights>) {
  setRankWeights(overrides);
}

/* ============================================================
   Small utilities
============================================================ */

const DEFAULT_USITC_BASE = 'https://hts.usitc.gov/api';

function buildUrl(base: string | undefined, pathWithQuery: string) {
  if (!base)
    return `${DEFAULT_USITC_BASE}${pathWithQuery.startsWith('/') ? '' : '/'}${pathWithQuery}`;
  // Proxy form: "/api/hts-proxy?path=" → we must encode the path+query
  if (base.includes('?')) return `${base}${encodeURIComponent(pathWithQuery.replace(/^\//, ''))}`;
  return `${base}${pathWithQuery.startsWith('/') ? '' : '/'}${pathWithQuery}`;
}

function prettyCode(code: string) {
  const c = code.replace(/\D/g, '').padStart(10, '0');
  return `${c.slice(0, 4)}.${c.slice(4, 6)}.${c.slice(6, 10)}`;
}
function chapterOf(code: string) {
  const c = code.replace(/\D/g, '').padStart(10, '0');
  return parseInt(c.slice(0, 2), 10);
}
function hasNESOIText(s: string) {
  return /\bnesoi\b|\bnot\s+elsewhere\s+specified/i.test(s || '');
}

function digitsOnly(q: string): string {
  return q.replace(/\D/g, '');
}
function isNumericQuery(q: string): boolean {
  return digitsOnly(q).length >= 6; // 6–10 digits (allow dots/spaces)
}
function rangeForNumeric(q: string): { from: string; to: string } {
  const d = digitsOnly(q).slice(0, 10);
  const from = (d + '0'.repeat(10)).slice(0, 10);
  const to = (d + '9'.repeat(10)).slice(0, 10);
  return { from, to };
}

/* ============================================================
   LRU cache (tiny, in-memory)
============================================================ */

type CacheKey = string;
type CacheVal = { when: number; value: any };
const CACHE_MAX = 120;
const CACHE = new Map<CacheKey, CacheVal>();

function makeKey(prefix: string, obj: unknown) {
  return `${prefix}:${JSON.stringify(obj)}`;
}
function getCache<T = unknown>(k: string): T | undefined {
  const v = CACHE.get(k);
  if (!v) return;
  // touch for LRU behavior
  CACHE.delete(k);
  CACHE.set(k, v);
  return v.value as T;
}
function setCache(k: string, value: any) {
  if (CACHE.size >= CACHE_MAX) {
    const first = CACHE.keys().next().value;
    if (first) CACHE.delete(first);
  }
  CACHE.set(k, { when: Date.now(), value });
}
export function clearHTSCache() {
  CACHE.clear();
}

/* ============================================================
   Circuit breaker (per endpoint)
============================================================ */

type Breaker = { failures: number; state: 'closed' | 'open' | 'half'; openedAt?: number };
const BREAKERS = new Map<string, Breaker>();
const FAIL_THRESH = 3;
const COOL_DOWN = 20_000;

function getBreaker(id: string): Breaker {
  const b = BREAKERS.get(id) ?? { failures: 0, state: 'closed' as const };
  BREAKERS.set(id, b);
  return b;
}
function noteSuccess(id: string) {
  const b = getBreaker(id);
  b.failures = 0;
  b.state = 'closed';
  b.openedAt = undefined;
}
function noteFailure(id: string) {
  const b = getBreaker(id);
  b.failures++;
  if (b.failures >= FAIL_THRESH && b.state !== 'open') {
    b.state = 'open';
    b.openedAt = Date.now();
  }
}
function canAttempt(id: string) {
  const b = getBreaker(id);
  if (b.state === 'open') {
    if (b.openedAt && Date.now() - b.openedAt > COOL_DOWN) {
      b.state = 'half';
      return true;
    }
    return false;
  }
  return true;
}

/* ============================================================
   Robust fetch (timeouts, retries, jitter, 429 backoff)
============================================================ */

async function fetchWithPolicy(
  url: string,
  opts: { timeoutMs: number; fetchImpl?: typeof fetch },
  breakerId: string,
): Promise<Response> {
  if (!canAttempt(breakerId)) {
    throw new Error('circuit_open');
  }

  const fetchImpl = opts.fetchImpl ?? fetch;
  const controller = new AbortController();
  const to = setTimeout(() => controller.abort(), opts.timeoutMs);

  try {
    let attempt = 0;
    let lastErr: any;
    const MAX_RETRIES = 2;

    while (attempt <= MAX_RETRIES) {
      try {
        const res = await fetchImpl(url, { signal: controller.signal });
        // 429 → honor Retry-After when present; then retry
        if (res.status === 429) {
          const ra = parseInt(res.headers.get('Retry-After') || '0', 10);
          const wait = Number.isFinite(ra) && ra > 0 ? ra * 1000 : 500 + Math.random() * 500;
          await new Promise((r) => setTimeout(r, wait));
          attempt++;
          if (attempt > MAX_RETRIES) {
            lastErr = new Error('429 Too Many Requests');
            break;
          }
          continue;
        }
        // 5xx → retry with exponential backoff + jitter
        if (res.status >= 500) {
          attempt++;
          if (attempt > MAX_RETRIES) {
            lastErr = new Error(`HTTP ${res.status}`);
            break;
          }
          const jitter = 250 * Math.pow(2, attempt) + Math.random() * 150;
          await new Promise((r) => setTimeout(r, jitter));
          continue;
        }
        // Success
        noteSuccess(breakerId);
        return res;
      } catch (e: any) {
        if (e?.name === 'AbortError') throw e;
        lastErr = e;
        attempt++;
        if (attempt > MAX_RETRIES) break;
        const jitter = 200 * Math.pow(2, attempt) + Math.random() * 200;
        await new Promise((r) => setTimeout(r, jitter));
      }
    }
    noteFailure(breakerId);
    throw lastErr ?? new Error('fetch_failed');
  } finally {
    clearTimeout(to);
  }
}

/* ============================================================
   Normalization
============================================================ */

export function normalizeUSITCItem(raw: any): NormalizedHTSItem {
  const codeRaw = (raw.htsno || raw.hts_no || raw.number || raw.hts || '').toString();
  const hsCode10 = codeRaw.replace(/\D/g, '').padStart(10, '0').slice(0, 10);
  const hsCodeShown = raw.htsnoFormatted || prettyCode(hsCode10);
  const description = (raw.description || raw.desc || raw.item_description || '').toString().trim();
  const notes = (raw.notes || raw.additional || '').toString().trim() || undefined;
  const rawGeneral = (
    raw.general_rate ||
    raw.general ||
    raw.rate ||
    raw.generalRate ||
    ''
  ).toString();

  // Parse general rate into structured components
  const parsed = parseGeneralRateRich(rawGeneral);
  const rateType = (parsed.rateType?.toLowerCase() as RateType) ?? 'other';
  const components = (parsed.components as RateComponent[]) ?? [{ kind: 'other', raw: rawGeneral }];

  const isTenDigit = /^\d{10}$/.test(hsCode10);
  const hasNESOI = hasNESOIText(description);

  return {
    hsCode10,
    hsCodeShown,
    chapter: chapterOf(hsCode10),
    description,
    notes,
    rateType,
    components,
    rawGeneral,
    isTenDigit,
    hasNESOI,
    sourceUrl: `https://hts.usitc.gov/?query=${encodeURIComponent(hsCode10)}`,
  };
}

/* ============================================================
   Dedupe + Pagination (preserve incoming order)
============================================================ */

export function dedupeAndPaginate(
  items: NormalizedHTSItem[],
  opts: { limit?: number; offset?: number },
) {
  const seen = new Set<string>();
  const deduped: NormalizedHTSItem[] = [];
  for (const it of items) {
    const key = `${it.hsCode10}|${it.description.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(it);
  }
  const total = deduped.length;
  const limit = Math.max(1, opts.limit ?? 50);
  const offset = Math.max(0, opts.offset ?? 0);
  const slice = deduped.slice(offset, offset + limit);
  return { items: slice, total };
}

/* ============================================================
   Internal helpers
============================================================ */

async function fetchSearch(
  keyword: string,
  opts: Required<Pick<SearchOptions, 'timeoutMs'>> & {
    fetchImpl?: typeof fetch;
    proxyBaseUrl?: string;
  },
) {
  const path = `/search?keyword=${encodeURIComponent(keyword)}`;
  const url = buildUrl(opts.proxyBaseUrl, path);
  const breakerId = (opts.proxyBaseUrl || DEFAULT_USITC_BASE) + ':search';
  const res = await fetchWithPolicy(
    url,
    { timeoutMs: opts.timeoutMs, fetchImpl: opts.fetchImpl },
    breakerId,
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<any>;
}

async function fetchExportList(
  from: string,
  to: string,
  opts: Required<Pick<SearchOptions, 'timeoutMs'>> & {
    fetchImpl?: typeof fetch;
    proxyBaseUrl?: string;
  },
) {
  const path = `/exportList?from=${from}&to=${to}&format=JSON`;
  const url = buildUrl(opts.proxyBaseUrl, path);
  const breakerId = (opts.proxyBaseUrl || DEFAULT_USITC_BASE) + ':exportList';
  const res = await fetchWithPolicy(
    url,
    { timeoutMs: opts.timeoutMs, fetchImpl: opts.fetchImpl },
    breakerId,
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<any>;
}

function optsKey(o: Pick<SearchOptions, 'tenDigitOnly' | 'chapter' | 'fuzzyEditsCap'>) {
  const { tenDigitOnly, chapter, fuzzyEditsCap } = o;
  return JSON.stringify({ tenDigitOnly, chapter, fuzzyEditsCap });
}

/* ============================================================
   Public: searchHTS
============================================================ */

export async function searchHTS(
  query: string,
  options: SearchOptions = {},
  deps?: { fetchImpl?: typeof fetch },
): Promise<SearchResponse> {
  const limit = options.limit ?? 50;
  const offset = options.offset ?? 0;
  const tenOnly = !!options.tenDigitOnly;
  const chapter = options.chapter;
  const timeoutMs = options.timeoutMs ?? 6500;
  const fuzzyEditsCap = options.fuzzyEditsCap ?? 1;

  const cacheKey = makeKey('q', {
    q: query,
    opts: optsKey({ tenDigitOnly: tenOnly, chapter, fuzzyEditsCap }),
  });
  const cached = getCache<SearchResponse>(cacheKey);

  const expandedQueries = expandQuery(query);
  const warnings: string[] = [];
  let degraded = false;
  let usedCache = false;

  // ---- Numeric fast-path via exportList (handles 6–10 digit queries) ----
  const numeric = isNumericQuery(query);
  let numericItems: any[] = [];
  if (numeric) {
    try {
      const { from, to } = rangeForNumeric(query);
      const ex = await fetchExportList(from, to, {
        timeoutMs,
        fetchImpl: deps?.fetchImpl,
        proxyBaseUrl: options.proxyBaseUrl,
      });
      const list =
        (Array.isArray(ex) && ex) ||
        (Array.isArray(ex?.results) && ex.results) ||
        (Array.isArray(ex?.data) && ex.data) ||
        [];
      numericItems = list;
    } catch (e: any) {
      warnings.push(`exportList fallback failed: ${e?.message || String(e)}`);
    }
  }

  try {
    // Fan-out to expansions; tolerate per-query failures
    const payloads = await Promise.all(
      expandedQueries.map((q: string) =>
        fetchSearch(q, {
          timeoutMs,
          fetchImpl: deps?.fetchImpl,
          proxyBaseUrl: options.proxyBaseUrl,
        }).catch((e: unknown) => ({ error: (e as Error).message })),
      ),
    );

    const rawItems: any[] = [];
    for (const p of payloads) {
      if ((p as any).error) {
        warnings.push(`Search degraded for "${query}": ${(p as any).error}`);
        continue;
      }
      const list = (p as any).results || (Array.isArray(p) ? p : []);
      rawItems.push(...list);
    }

    // Merge numeric fallback if it produced anything
    if (numericItems.length) rawItems.push(...numericItems);

    if (rawItems.length === 0 && cached) {
      degraded = true;
      usedCache = true;
      return {
        ...cached,
        meta: {
          ...cached.meta,
          degraded: true,
          usedCache: true,
          warnings: [...cached.meta.warnings, ...warnings],
        },
      };
    }

    // Normalize
    const normalized = rawItems.map(normalizeUSITCItem);

    // Filters
    const filtered = normalized.filter((it) => {
      if (tenOnly && !it.isTenDigit) return false;
      if (chapter && it.chapter !== chapter) return false;
      return true;
    });

    // Ranking
    const expandedTokens: string[][] = expandedQueries.map((q: string) =>
      q.split(/\s+/).filter(Boolean),
    );
    const scored = filtered
      .map((it) => ({
        it,
        score: scoreItem({
          item: it,
          query,
          expandedTokens,
          options: { fuzzyEditsCap, chapterBoosts: options.chapterBoosts },
        }),
      }))
      .sort((a, b) => b.score - a.score)
      .map((x) => x.it);

    // Dedupe + paginate (preserve score order)
    const { items, total } = dedupeAndPaginate(scored, { limit, offset });

    const value: SearchResponse = {
      items,
      meta: {
        query,
        expandedQueries,
        totalFound: total,
        usedCache: false,
        degraded: false,
        warnings,
      },
    };
    setCache(cacheKey, value);
    return value;
  } catch (e: unknown) {
    if (cached) {
      degraded = true;
      usedCache = true;
      return {
        ...cached,
        meta: {
          ...cached.meta,
          degraded: true,
          usedCache: true,
          warnings: [...cached.meta.warnings, (e as Error).message || String(e)],
        },
      };
    }
    throw new Error(`HTS search failed: ${(e as Error)?.message || String(e)}`);
  }
}

/* ============================================================
   Public: getByCode (prefix-friendly)
============================================================ */

export async function getByCode(
  code: string,
  options: Omit<SearchOptions, 'tenDigitOnly' | 'chapter'> = {},
  deps?: { fetchImpl?: typeof fetch },
): Promise<NormalizedHTSItem[]> {
  const timeoutMs = options.timeoutMs ?? 6500;
  const codeDigits = code.replace(/\D/g, '');
  const cacheKey = makeKey('code', { code: codeDigits });
  const cached = getCache<NormalizedHTSItem[]>(cacheKey);
  if (cached) return cached;

  // Prefer exportList for numeric/prefix lookups
  const { from, to } = rangeForNumeric(codeDigits);
  try {
    const json = await fetchExportList(from, to, {
      timeoutMs,
      fetchImpl: deps?.fetchImpl,
      proxyBaseUrl: options.proxyBaseUrl,
    });

    const items = (
      ((Array.isArray(json) && json) ||
        (Array.isArray(json?.results) && json.results) ||
        (Array.isArray(json?.data) && json.data) ||
        []) as any[]
    )
      .map(normalizeUSITCItem)
      .filter((it) => it.hsCode10.startsWith(codeDigits));

    setCache(cacheKey, items);
    return items;
  } catch {
    // Fallback to /search if exportList fails
    const path = `/search?keyword=${encodeURIComponent(codeDigits)}`;
    const url = buildUrl(options.proxyBaseUrl, path);
    const breakerId = (options.proxyBaseUrl || DEFAULT_USITC_BASE) + ':search';
    const res = await fetchWithPolicy(url, { timeoutMs, fetchImpl: deps?.fetchImpl }, breakerId);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as any;

    const items = ((json.results || []) as any[])
      .map(normalizeUSITCItem)
      .filter((it) => it.hsCode10.startsWith(codeDigits));

    setCache(cacheKey, items);
    return items;
  }
}
