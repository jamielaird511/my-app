'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useDebounce } from '@/hooks/useDebounce';
import { formatHs } from '@/lib/duty';

type RateType = 'advalorem' | 'specific' | 'compound' | null;

type ApiAlt = {
  hsCode: string;
  hsCodeFormatted?: string | null;
  description: string;
  rate: number | null;
  rateType: RateType;
};

type ApiResult = {
  rate: number | null;
  rateType: RateType;
  breakdown: {
    hsCode?: string | null;
    hsCodeFormatted?: string | null;
    description?: string | null;
  };
  alternates?: ApiAlt[];
};

type Row = {
  hsCode: string;
  description: string;
  dutyRate: number | null;
  rateType: RateType;
};

function pct(n: number | null) {
  if (n === 0) return 'Free';
  if (n == null) return '—';
  const v = n * 100;
  return `${v < 1 ? v.toFixed(2) : v.toFixed(1)}%`;
}

export default function HSLookupPage() {
  const [q, setQ] = useState('');
  const debouncedQ = useDebounce(q, 350);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const canSearch = debouncedQ.trim().length >= 2;

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setError(null);
      setRows([]);
      if (!canSearch) return;
      setLoading(true);
      try {
        const res = await fetch(`/api/estimate?query=${encodeURIComponent(debouncedQ)}&price=0`, {
          method: 'GET',
          cache: 'no-store',
        });
        const data = (await res.json()) as ApiResult;
        if (!res.ok) throw new Error((data as any)?.error || 'Search failed');

        const list: Row[] = [];
        const mainHs = data.breakdown.hsCode ?? null;
        const mainDesc = data.breakdown.description ?? null;
        if (mainHs && mainDesc) {
          list.push({
            hsCode: mainHs,
            description: mainDesc,
            dutyRate: data.rate,
            rateType: data.rateType,
          });
        }
        if (Array.isArray(data.alternates)) {
          for (const a of data.alternates) {
            if (!a?.hsCode || !a?.description) continue;
            if (!list.some((r) => r.hsCode === a.hsCode)) {
              list.push({
                hsCode: a.hsCode,
                description: a.description,
                dutyRate: a.rate,
                rateType: a.rateType,
              });
            }
          }
        }
        if (!cancelled) setRows(list.slice(0, 12));
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Search failed');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [debouncedQ, canSearch]);

  const hint = useMemo(() => {
    if (!q.trim()) return 'Try: sunglasses, 900410, yoga mats, LED lamp…';
    if (q.trim().length < 2) return 'Type at least 2 characters.';
    if (loading) return 'Searching…';
    if (!loading && canSearch && rows.length === 0 && !error)
      return 'No matches yet. Try a different term.';
    return '';
  }, [q, loading, rows.length, canSearch, error]);

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

        <form className="mb-6" onSubmit={(e) => e.preventDefault()}>
          <label htmlFor="q" className="block text-sm font-medium text-gray-700">
            Search
          </label>
          <input
            id="q"
            name="q"
            type="text"
            placeholder="e.g., sunglasses or 900410"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoFocus
            className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          {hint && <p className="mt-2 text-xs text-gray-500">{hint}</p>}
          {error && (
            <div
              role="alert"
              className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
            >
              {error}
            </div>
          )}
        </form>

        <section aria-live="polite">
          {loading && (
            <ul className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <li key={i} className="animate-pulse rounded-xl border bg-white p-4">
                  <div className="h-4 w-24 rounded bg-gray-200" />
                  <div className="mt-2 h-4 w-3/4 rounded bg-gray-200" />
                </li>
              ))}
            </ul>
          )}

          {!loading && rows.length > 0 && (
            <>
              <div className="mb-3 text-sm text-gray-600">
                {rows.length} match{rows.length > 1 ? 'es' : ''}
              </div>
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
                                    : 'bg-gray-100 text-gray-700'
                            }`}
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
                          href={`https://hts.usitc.gov/?query=${encodeURIComponent(r.hsCode)}`}
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
            </>
          )}

          {!loading && canSearch && rows.length === 0 && !error && (
            <div className="rounded-xl border bg-white p-5 text-sm text-gray-600">
              No results. Try a different keyword or a 6-digit HS code.
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
