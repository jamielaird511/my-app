'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useDebounce } from '@/hooks/useDebounce';
import { formatHs } from '@/lib/duty';
import { searchHTS, type NormalizedHTSItem } from '@/lib/hts';

type RateType = 'advalorem' | 'specific' | 'compound' | 'free' | 'other' | null;

type Row = {
  hsCode: string;
  description: string;
  dutyRate: number | null; // 0 => Free, null => unknown/complex
  rateType: RateType;
  sourceUrl: string;
};

type FetchState = 'idle' | 'loading' | 'ok' | 'degraded' | 'error';

function pct(n: number | null) {
  if (n === 0) return 'Free';
  if (n == null) return '—';
  const v = n * 100;
  return `${v < 1 ? v.toFixed(2) : v.toFixed(1)}%`;
}

// Pull a simple ad valorem % if present; otherwise return null (we’ll show raw on hover via title).
function extractDutyRate(it: NormalizedHTSItem): number | null {
  if (/(^|\s)free(\s|$)/i.test(it.rawGeneral)) return 0;
  const ad = it.components.find((c) => c.kind === 'advalorem') as
    | { kind: 'advalorem'; pct: number }
    | undefined;
  return ad ? ad.pct / 100 : null;
}

export default function HSLookupPage() {
  const [q, setQ] = useState('');
  const debouncedQ = useDebounce(q, 350);

  // Filters
  const [tenOnly, setTenOnly] = useState(false);
  const [chapter, setChapter] = useState<number | undefined>(undefined);

  // UI state
  const [state, setState] = useState<FetchState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [totalFound, setTotalFound] = useState<number>(0);

  const canSearch = debouncedQ.trim().length >= 2;

  // Helper: any state that is not actively loading
  const isSettled = state === 'idle' || state === 'ok' || state === 'degraded' || state === 'error';

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setError(null);
      setWarnings([]);
      setTotalFound(0);
      setRows([]);
      if (!canSearch) {
        setState('idle');
        return;
      }

      setState('loading');
      try {
        const res = await searchHTS(debouncedQ, {
          limit: 50,
          tenDigitOnly: tenOnly,
          chapter,
          fuzzyEditsCap: 1,
          chapterBoosts: { 64: 1.15 }, // small footwear nudge; tweak as needed
          // Force the proxy so we don't hit CORS or HTML responses
          proxyBaseUrl: '/api/hts-proxy?path=',
        });

        if (cancelled) return;

        const mapped: Row[] = res.items.map((it) => ({
          hsCode: it.hsCode10,
          description: it.description,
          dutyRate: extractDutyRate(it),
          rateType: it.rateType,
          sourceUrl: it.sourceUrl,
        }));

        setRows(mapped);
        setWarnings(res.meta.warnings);
        setTotalFound(res.meta.totalFound);
        setState(res.meta.degraded ? 'degraded' : 'ok');
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message || 'Search failed');
          setState('error');
        }
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [debouncedQ, canSearch, tenOnly, chapter]);

  const hint = useMemo(() => {
    if (!q.trim()) return 'Try: sunglasses, 900410, yoga mats, LED lamp…';
    if (q.trim().length < 2) return 'Type at least 2 characters.';
    if (state === 'loading') return 'Searching…';
    if (isSettled && canSearch && rows.length === 0 && !error)
      return 'No matches yet. Try a different term.';
    return '';
  }, [q, state, rows.length, canSearch, error]);

  return (
    <main className="min-h-screen bg-gray-50 px-6 py-10">
      <div className="mx-auto w-full max-w-3xl">
        <nav className="mb-4 text-sm">
          <Link href="/" className="text-indigo-600 hover:underline">
            Home
          </Link>
          <span className="mx-2 text-gray-400">/</span>
          <span className="text-gray-700">HS Code Lookup</span>
        </nav>

        <h1 className="text-2xl font-bold mb-2">HS Code Lookup</h1>
        <p className="text-gray-600 mb-6">
          Search the U.S. Harmonized Tariff Schedule. Click a result to use it in the estimator.
        </p>

        {/* Controls */}
        <form className="mb-4" onSubmit={(e) => e.preventDefault()}>
          <label htmlFor="q" className="block text-sm font-medium text-gray-700">
            Search
          </label>
          <input
            id="q"
            name="q"
            type="text"
            placeholder='e.g., "running shoes" or 6404.11'
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoFocus
            className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <div className="mt-3 flex items-center gap-4">
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={tenOnly}
                onChange={(e) => setTenOnly(e.target.checked)}
              />
              10-digit only
            </label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-700">Chapter</span>
              <input
                type="number"
                min={1}
                max={99}
                value={chapter ?? ''}
                onChange={(e) => setChapter(e.target.value ? Number(e.target.value) : undefined)}
                className="w-20 rounded-md border px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="e.g., 64"
              />
            </div>
          </div>

          {hint && <p className="mt-2 text-xs text-gray-500">{hint}</p>}

          {error && (
            <div
              role="alert"
              className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
            >
              {error}
            </div>
          )}

          {state === 'degraded' && !error && (
            <div className="mt-2 rounded-md border border-yellow-200 bg-yellow-50 px-3 py-2 text-xs text-yellow-800">
              Degraded mode: showing cached or partial results while the HTS service is flaky.{' '}
              <a
                className="underline hover:no-underline"
                href={`https://hts.usitc.gov/?query=${encodeURIComponent(q.trim())}`}
                target="_blank"
                rel="noreferrer"
              >
                Open this search on USITC
              </a>
              .
            </div>
          )}

          {warnings.length > 0 && (
            <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {warnings.map((w, i) => (
                <div key={i}>• {w}</div>
              ))}
            </div>
          )}
        </form>

        {/* Meta */}
        {isSettled && rows.length > 0 && (
          <div className="mb-3 text-sm text-gray-600">
            {totalFound} match{totalFound === 1 ? '' : 'es'}
          </div>
        )}

        {/* Results */}
        <section aria-live="polite">
          {state === 'loading' && (
            <ul className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <li key={i} className="animate-pulse rounded-xl border bg-white p-4">
                  <div className="h-4 w-24 rounded bg-gray-200" />
                  <div className="mt-2 h-4 w-3/4 rounded bg-gray-200" />
                </li>
              ))}
            </ul>
          )}

          {isSettled && rows.length > 0 && (
            <ul className="divide-y rounded-xl border bg-white">
              {rows.map((r) => (
                <li key={r.hsCode} className="p-4 sm:p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm text-gray-700">
                          {formatHs(r.hsCode)}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs ${
                            r.rateType === 'advalorem'
                              ? 'bg-green-100 text-green-700'
                              : r.rateType === 'specific'
                                ? 'bg-amber-100 text-amber-800'
                                : r.rateType === 'compound'
                                  ? 'bg-indigo-100 text-indigo-700'
                                  : r.rateType === 'free'
                                    ? 'bg-emerald-100 text-emerald-700'
                                    : 'bg-gray-100 text-gray-700'
                          }`}
                          title={r.rateType ? `Rate type: ${r.rateType}` : 'Rate type unknown'}
                        >
                          {r.rateType ?? 'unknown'}
                        </span>
                        <span className="text-xs text-gray-500">Rate: {pct(r.dutyRate)}</span>
                      </div>
                      <div className="mt-1 font-medium">{r.description}</div>
                    </div>
                    <div className="flex gap-2 sm:mt-0">
                      <Link
                        href={`/estimate?product=${encodeURIComponent(r.hsCode)}`}
                        className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                      >
                        Use in Estimator
                      </Link>
                      <a
                        href={r.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-lg border px-3 py-2 text-sm hover:bg-gray-50"
                      >
                        View on USITC
                      </a>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {isSettled && canSearch && rows.length === 0 && !error && (
            <div className="rounded-xl border bg-white p-5 text-sm text-gray-600">
              No results. Try a different keyword or a 6–10 digit HS code.{' '}
              <a
                className="underline hover:no-underline"
                href={`https://hts.usitc.gov/?query=${encodeURIComponent(q.trim())}`}
                target="_blank"
                rel="noreferrer"
              >
                Open on USITC
              </a>
              .
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
