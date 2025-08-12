// src/components/HeroSearch.tsx
'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

type Hit = {
  code: string;
  code_len: number | null;
  description: string | null;
  mfn_advalorem: number | null;
  mfn_specific: string | null;
  rev_number: string | null;
  rev_date: string | null;
  confidence: number;
  reason: string;
};

export default function HeroSearch() {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [active, setActive] = useState<number>(-1);
  const router = useRouter();

  // simple debounce to avoid hammering the API while typing
  const debounceMs = 300;
  const tRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  function openEstimator(code: string) {
    router.push(`/estimate?hs=${encodeURIComponent(code)}`);
  }

  async function runSearch(term: string) {
    const query = term.trim();
    if (!query) {
      setHits([]);
      setErr(null);
      setLoading(false);
      return;
    }

    // cancel previous in-flight request
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    setLoading(true);
    setErr(null);

    try {
      const r = await fetch(`/api/hs/search?q=${encodeURIComponent(query)}`, {
        signal: ac.signal,
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      setHits(Array.isArray(j.hits) ? j.hits : []);
      setActive(-1);
    } catch (e: any) {
      if (e?.name !== 'AbortError') {
        setErr(e?.message || 'Search failed');
        setHits([]);
      }
    } finally {
      setLoading(false);
    }
  }

  // Debounced search as the user types
  useEffect(() => {
    window.clearTimeout(tRef.current as any);
    tRef.current = window.setTimeout(() => runSearch(q), debounceMs) as any;
    return () => window.clearTimeout(tRef.current as any);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!hits.length) {
      if (e.key === 'Enter') runSearch(q); // manual trigger
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (i + 1) % hits.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (i - 1 + hits.length) % hits.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = hits[Math.max(0, active)];
      if (target) openEstimator(target.code);
    }
  }

  return (
    <div className="w-full max-w-3xl mx-auto">
      <div className="flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder='Try "leather handbags" or 900410'
          className="flex-1 rounded-xl border border-indigo-200 bg-white px-4 py-3 text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          aria-label="Describe your product or enter an HS code"
        />
        <button
          onClick={() => runSearch(q)}
          className="rounded-xl bg-indigo-600 px-4 py-3 text-white shadow hover:bg-indigo-700"
          aria-label="Find my HS code"
        >
          Find my HS code
        </button>
      </div>

      {/* status line */}
      <div className="mt-2 text-sm text-gray-600 min-h-[1.25rem]">
        {loading && 'Searching…'}
        {err && <span className="text-red-600">{err}</span>}
        {!loading &&
          !err &&
          hits.length === 0 &&
          q.trim() &&
          'No matches yet. Try simpler wording or a different term.'}
      </div>

      {/* results */}
      {hits.length > 0 && (
        <ul className="mt-4 divide-y divide-gray-200 rounded-xl bg-white shadow" role="listbox">
          {hits.map((it, i) => {
            const activeCls = i === active ? 'bg-indigo-50' : '';
            return (
              <li
                key={`${it.code}-${i}`}
                role="option"
                aria-selected={i === active}
                className={`px-4 py-3 cursor-pointer hover:bg-indigo-50 ${activeCls}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => openEstimator(it.code)}
              >
                <div className="flex items-center justify-between">
                  <div className="font-medium text-gray-900">{it.code}</div>
                  <span className="ml-3 text-xs text-gray-500 uppercase">{it.reason}</span>
                </div>
                <div className="text-sm text-gray-700">
                  {it.description || '—'}
                  {typeof it.mfn_advalorem === 'number' && (
                    <span className="ml-2 text-gray-500">• Duty: {it.mfn_advalorem}%</span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
