'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

type Hit = {
  code: string;
  description: string;
  confidence: number;
  reason: string;
  mfn_advalorem: number | null;
};

export default function HeroSearch() {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [idx, setIdx] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Debounced search
  useEffect(() => {
    if (!q.trim()) {
      setHits([]);
      setOpen(false);
      setIdx(-1);
      return;
    }
    const t = setTimeout(async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/hs/search?q=${encodeURIComponent(q)}`, { cache: 'no-store' });
        const json = await res.json();
        const items: Hit[] = json?.hits ?? [];
        setHits(items);
        setOpen(items.length > 0);
        setIdx(items.length ? 0 : -1);
      } catch {
        setHits([]);
        setOpen(false);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  // Close dropdown if you click outside
  useEffect(() => {
    const onClickAway = (e: MouseEvent) => {
      if (!boxRef.current) return;
      if (!boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onClickAway);
    return () => window.removeEventListener('mousedown', onClickAway);
  }, []);

  function goToEstimateWithCode(code: string) {
    router.push(`/estimate?code=${encodeURIComponent(code)}`);
  }

  function handleSelect(h: Hit) {
    setOpen(false);
    if (h?.code) return goToEstimateWithCode(h.code);
    // fallback: send raw query
    router.push(`/estimate?query=${encodeURIComponent(q)}`);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || hits.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIdx((i) => (i + 1) % hits.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIdx((i) => (i - 1 + hits.length) % hits.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (idx >= 0 && idx < hits.length) handleSelect(hits[idx]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  // Decide what clicking the purple "Find my HS code" button does
  const primaryAction = useMemo(() => {
    if (hits.length > 0) return () => handleSelect(hits[0]); // choose top result
    // if numeric, jump straight to estimate; otherwise send query to estimate to let it decide
    const digits = (q.match(/\d+/g) || []).join('');
    if (digits.length >= 6) return () => goToEstimateWithCode(formatHsFromDigits(digits));
    return () => router.push(`/estimate?query=${encodeURIComponent(q)}`);
  }, [hits, q]);

  return (
    <div ref={boxRef} className="relative w-full">
      {/* Your existing shell styling; keep it as-is */}
      <div className="flex items-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
        {/* left icon keeps your look */}
        <svg width="18" height="18" viewBox="0 0 24 24" className="opacity-70">
          <path
            fill="currentColor"
            d="m21.53 20.47l-4.66-4.66A7.94 7.94 0 1 0 16 17.34l4.66 4.66zM4 10a6 6 0 1 1 6 6a6 6 0 0 1-6-6"
          />
        </svg>

        <input
          className="w-full bg-transparent outline-none placeholder:text-gray-400"
          placeholder="e.g. leather handbags"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKeyDown}
        />

        <button
          type="button"
          onClick={primaryAction}
          className="rounded-xl bg-indigo-500 px-4 py-2 text-white hover:bg-indigo-600"
        >
          Find my HS code
        </button>
      </div>

      {/* loading hint */}
      {loading && q && <div className="mt-2 text-xs text-gray-500">Searching…</div>}

      {/* dropdown */}
      {open && hits.length > 0 && (
        <div className="absolute z-50 mt-2 w-full overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl">
          <ul className="divide-y divide-gray-100">
            {hits.map((h, i) => {
              const active = i === idx;
              return (
                <li
                  key={`${h.code}-${i}`}
                  className={`cursor-pointer px-4 py-3 text-sm ${active ? 'bg-gray-50' : ''}`}
                  onMouseEnter={() => setIdx(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleSelect(h)}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-medium tabular-nums">{h.code}</div>
                    <div className="text-[11px] text-gray-500">
                      {Math.round(h.confidence * 100)}%
                    </div>
                  </div>
                  <div className="mt-0.5 text-gray-700">{h.description}</div>
                  <div className="mt-1 text-[11px] text-gray-400">{h.reason}</div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

/** helper: format 6/8/10-digit input into dotted HS for estimator route */
function formatHsFromDigits(d: string) {
  if (d.length >= 10) return `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6, 10)}`;
  if (d.length >= 8) return `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6, 8)}00`;
  if (d.length >= 6) return `${d.slice(0, 4)}.${d.slice(4, 6)}.0000`;
  return d;
}
