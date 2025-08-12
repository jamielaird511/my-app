'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

/* Icons */
function IconCalc(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
      <rect x="4" y="3" width="16" height="18" rx="2" ry="2" strokeWidth="1.8" />
      <path d="M8 7h8M8 11h2M12 11h2M16 11h0M8 15h2M12 15h2M16 15h0" strokeWidth="1.8" />
    </svg>
  );
}
function IconReceipt(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
      <path d="M6 4h12v16l-3-2-3 2-3-2-3 2V4Z" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M8.5 9H15.5M8.5 12H15.5M8.5 15H13" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
function IconRobot(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
      <rect x="3" y="6" width="18" height="12" rx="3" ry="3" strokeWidth="1.8" />
      <circle cx="9" cy="12" r="1.5" />
      <circle cx="15" cy="12" r="1.5" />
      <path d="M12 6V3" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

/* Lightweight HS suggestion (local fallback) */
type Suggestion = { code: string; description: string; confidence: number };

const LOCAL_DICTIONARY: Array<{ code: string; aliases: string[]; description: string }> = [
  {
    code: '900410',
    aliases: ['sunglass', 'sunglasses', 'shades', 'eyewear'],
    description: 'Sunglasses',
  },
  {
    code: '420221',
    aliases: ['handbag', 'leather bag', 'purse'],
    description: 'Handbags with outer surface of leather',
  },
  { code: '950651', aliases: ['ski', 'skis', 'snow ski'], description: 'Skis (snow) and parts' },
  {
    code: '950691',
    aliases: ['yoga mat', 'yoga', 'exercise mat'],
    description: 'Articles/equipment for general physical exercise',
  },
  {
    code: '610910',
    aliases: ['t-shirt', 'tee shirt', 'cotton tshirt', 'tee'],
    description: 'T-shirts, of cotton, knitted',
  },
  {
    code: '871200',
    aliases: ['bicycle', 'bike'],
    description: 'Bicycles and other cycles, not motorized',
  },
];

function localGuess(input: string): Suggestion[] {
  const q = input.trim().toLowerCase();

  // Numeric path: accept 6–10 digits with punctuation stripped, fall back 10→8→6
  const digits = q.replace(/\D/g, '');
  const candidates: string[] = [];
  if (digits.length >= 6) {
    if (digits.length >= 10) candidates.push(digits.slice(0, 10));
    if (digits.length >= 8) candidates.push(digits.slice(0, 8));
    candidates.push(digits.slice(0, 6));
  }
  for (const c of candidates) {
    const hit = LOCAL_DICTIONARY.find((d) => c.startsWith(d.code));
    if (hit) return [{ code: hit.code, description: hit.description, confidence: 0.9 }];
  }

  // Keyword path
  const scored = LOCAL_DICTIONARY.map((d) => {
    let score = 0;
    for (const a of d.aliases) if (q.includes(a)) score += 1;
    const tokens = q.split(/\s+/);
    for (const t of tokens) if (d.aliases.some((a) => a.includes(t))) score += 0.3;
    return { code: d.code, description: d.description, confidence: Math.min(0.95, score / 2) };
  })
    .filter((s) => s.confidence > 0.35)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 3);

  return scored;
}

async function fetchSuggestions(query: string): Promise<Suggestion[]> {
  if (!query.trim()) return [];

  try {
    const res = await fetch(`/api/hs/search?q=${encodeURIComponent(query)}`, {
      cache: 'no-store',
    });

    if (!res.ok) throw new Error(`bad status ${res.status}`);

    const json = await res.json();
    console.log('hs/search json:', json); // DEBUG

    // Map API rows -> UI suggestions
    return (json.items ?? []).map((r: any) => ({
      code: r.code,
      description: r.description,
      confidence: 0.9, // simple placeholder score
    }));
  } catch (e) {
    console.warn('hs/search failed, fallback to localGuess', e);
    return localGuess(query);
  }
}

export default function HomePage() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualHs, setManualHs] = useState('');

  const heroCtaDisabled = useMemo(() => query.trim().length === 0 || loading, [query, loading]);

  const handleFindHs = async () => {
    setLoading(true);
    setError(null);
    setSuggestions(null);
    try {
      const res = await fetchSuggestions(query);
      setSuggestions(res ?? []);
    } catch {
      setError('Something went wrong. Try a simpler description.');
    } finally {
      setLoading(false);
    }
  };

  // renamed from "useCode" to avoid rules-of-hooks false positive
  const selectCode = (s: Suggestion) => {
    const params = new URLSearchParams();
    params.set('hs', s.code);
    params.set('desc', s.description);
    params.set('source', 'landing');
    router.push(`/estimate?${params.toString()}`);
  };

  const goManual = () => {
    const hs = manualHs.replace(/\D/g, '').slice(0, 10);
    if (!hs || hs.length < 6) return; // keep it strict
    const params = new URLSearchParams();
    params.set('hs', hs);
    params.set('source', 'manual');
    router.push(`/estimate?${params.toString()}`);
  };

  return (
    <main className="min-h-screen bg-white">
      {/* HERO with AI concierge */}
      <section className="relative bg-indigo-200">
        <div className="mx-auto max-w-6xl px-6 py-16 text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1 text-xs font-medium text-indigo-700 ring-1 ring-indigo-300">
            <span className="inline-block h-2 w-2 rounded-full bg-indigo-600" />
            Powered by official USITC data
          </div>

          <h1 className="mt-6 text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
            Tell us what you’re importing — we’ll handle the boring bits
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-slate-700">
            Importium suggests a likely HS code, estimates duties, and lists the paperwork you’ll
            need.
          </p>

          {/* AI input */}
          <div className="mx-auto mt-8 max-w-2xl">
            <div className="rounded-2xl border border-indigo-300/70 bg-white p-2 shadow-lg ring-1 ring-black/5">
              <div className="flex items-center gap-2 p-2">
                <IconRobot className="h-6 w-6 text-indigo-700" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !heroCtaDisabled) handleFindHs();
                  }}
                  placeholder="e.g. leather handbags"
                  className="flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
                />
                <button
                  onClick={handleFindHs}
                  disabled={heroCtaDisabled}
                  className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-50"
                >
                  {loading ? 'Thinking…' : 'Find my HS code'}
                </button>
              </div>

              {/* Results */}
              <div className="border-t border-slate-200/70 p-3 text-left">
                {error && <div className="text-sm text-red-600">{error}</div>}

                {suggestions && suggestions.length > 0 && (
                  <ul className="space-y-2">
                    {suggestions.map((s) => (
                      <li
                        key={s.code}
                        className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-slate-900">{s.code}</div>
                          <div className="truncate text-xs text-slate-600">{s.description}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-slate-500">
                            {Math.round(s.confidence * 100)}% match
                          </span>
                          <button
                            onClick={() => selectCode(s)}
                            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
                          >
                            Use this code
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

                {suggestions && suggestions.length === 0 && (
                  <div className="space-y-3">
                    <div className="text-sm text-slate-700">
                      Not confident yet. Try simpler wording (e.g., “leather handbags”) or enter a
                      code manually.
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-white p-3">
                      {!manualOpen ? (
                        <button
                          onClick={() => setManualOpen(true)}
                          className="text-xs font-medium text-indigo-700 underline underline-offset-2 hover:text-indigo-900"
                        >
                          I already know my HS code
                        </button>
                      ) : (
                        <div className="flex items-center gap-2">
                          <input
                            value={manualHs}
                            onChange={(e) => setManualHs(e.target.value)}
                            placeholder="Enter HS code (6–10 digits)"
                            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none"
                          />
                          <button
                            onClick={goManual}
                            disabled={manualHs.replace(/\D/g, '').length < 6}
                            className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
                          >
                            Use code
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <p className="mt-3 text-xs text-slate-600">
              No signup required • Free to start • Mobile friendly
            </p>
          </div>

          {/* Single CTA only (no HS Lookup anywhere) */}
          <div className="mt-6 flex items-center justify-center">
            <Link
              href="/estimate"
              className="rounded-xl bg-indigo-600 px-5 py-3 text-white shadow-sm transition hover:bg-indigo-700"
            >
              Open Tariff Estimator
            </Link>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="bg-slate-100">
        <div className="mx-auto max-w-6xl px-6 py-14">
          <h2 className="mb-6 text-center text-2xl font-semibold text-slate-900">
            Everything you need to import smart
          </h2>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-2xl border border-slate-300 bg-white p-6 shadow-lg ring-1 ring-indigo-100 transition hover:ring-indigo-200">
              <div className="mb-4">
                <IconRobot className="h-7 w-7 text-indigo-600" />
              </div>
              <h3 className="font-semibold text-slate-900">Plain-English HS Suggestions</h3>
              <p className="mt-2 text-sm text-slate-600">
                Describe your product and get likely HS codes with confidence hints. One click
                pre-fills the estimator.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-300 bg-white p-6 shadow-lg ring-1 ring-indigo-100 transition hover:ring-indigo-200">
              <div className="mb-4">
                <IconCalc className="h-7 w-7 text-indigo-600" />
              </div>
              <h3 className="font-semibold text-slate-900">Instant Duty Estimates</h3>
              <p className="mt-2 text-sm text-slate-600">
                Enter price and quantity to see dollar duties in seconds. Clear breakdowns for ad
                valorem or specific rates.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-300 bg-white p-6 shadow-lg ring-1 ring-indigo-100 transition hover:ring-indigo-200">
              <div className="mb-4">
                <IconReceipt className="h-7 w-7 text-indigo-600" />
              </div>
              <h3 className="font-semibold text-slate-900">Actionable Paperwork Checklist</h3>
              <p className="mt-2 text-sm text-slate-600">
                Get a clean, printable list of likely documents for your shipment. Avoid delays and
                surprises at the border.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="bg-white">
        <div className="mx-auto max-w-6xl px-6 py-14">
          <h2 className="mb-8 text-center text-2xl font-semibold text-slate-900">How it works</h2>

          <div className="grid gap-6 md:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm ring-1 ring-black/5">
              <div className="mb-2 text-sm font-semibold text-indigo-700">01</div>
              <h3 className="font-semibold text-slate-900">Describe your product</h3>
              <p className="mt-1 text-sm text-slate-600">
                Type a plain-English description (e.g., “leather handbags”).
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm ring-1 ring-black/5">
              <div className="mb-2 text-sm font-semibold text-indigo-700">02</div>
              <h3 className="font-semibold text-slate-900">Pick the best HS code</h3>
              <p className="mt-1 text-sm text-slate-600">
                Select a suggested code to pre-fill the estimator.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm ring-1 ring-black/5">
              <div className="mb-2 text-sm font-semibold text-indigo-700">03</div>
              <h3 className="font-semibold text-slate-900">Get duty & docs</h3>
              <p className="mt-1 text-sm text-slate-600">
                Enter price, quantity, origin; download your checklist.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA STRIP */}
      <section className="bg-indigo-100">
        <div className="mx-auto max-w-6xl px-6 py-14 text-center">
          <h2 className="text-2xl font-semibold text-slate-900">
            Ready to estimate your next shipment?
          </h2>
          <p className="mx-auto mt-2 max-w-2xl text-slate-700">
            Start with the concierge or jump straight to the estimator.
          </p>
          <div className="mt-6 flex items-center justify-center">
            <Link
              href="/estimate"
              className="rounded-xl bg-indigo-600 px-5 py-3 text-white shadow-sm transition hover:bg-indigo-700"
            >
              Open Tariff Estimator
            </Link>
          </div>
          <p className="mt-4 text-xs text-slate-600">
            Rates via USITC HTS. Excludes special programs and extra duties (e.g., Section 301).
          </p>
        </div>
      </section>
    </main>
  );
}
