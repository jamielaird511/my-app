// src/app/page.tsx
'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { logEvent } from '@/lib/analytics';
import RefineModal from '@/components/RefineModal';

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

/* Types */
type Suggestion = {
  code: string;
  description: string;
  confidence: number;
  reason?: string;
  mfn_advalorem?: number | null;
};

/* Choose 1–3 best suggestions */
function selectTopSuggestions(hits: Suggestion[]): Suggestion[] {
  const sorted = [...hits].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));
  if (sorted.length === 0) return [];
  const top = sorted[0];
  const second = sorted[1];
  if ((top.confidence ?? 0) >= 0.8) return [top];
  if (second && top.confidence! - second.confidence! < 0.08 && second.confidence! >= 0.55) {
    return sorted.slice(0, 3);
  }
  return sorted.slice(0, 2);
}

/* API call -> suggestions */
async function fetchSuggestions(query: string): Promise<Suggestion[]> {
  if (!query.trim()) return [];
  const res = await fetch(`/api/hs/search?q=${encodeURIComponent(query)}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const hits = Array.isArray(json.hits) ? json.hits : [];
  return hits.map((h: any) => ({
    code: h.code,
    description: h.description ?? '',
    confidence: typeof h.confidence === 'number' ? h.confidence : 0.8,
    reason: h.reason,
    mfn_advalorem: h.mfn_advalorem ?? null,
  }));
}

/* Helpers */
const hsDigitsFrom = (code: string) => (code ?? '').replace(/\D/g, '').slice(0, 10);
const codeIsValid = (code: string) => {
  const len = hsDigitsFrom(code).length;
  return len >= 4 && len <= 10;
};
// Normalize for estimator + meta
function normalizeHsCodeWithMeta(code: string) {
  const original = hsDigitsFrom(code);
  let digits = original;
  let padded_from: 4 | null = null;
  if (digits.length === 4) {
    digits = digits + '00'; // pad 4->6
    padded_from = 4;
  }
  const meta = {
    hs: digits,
    hs_len: digits.length,
    needs_refine: digits.length < 10 ? '1' : '0', // flag for banner
    padded_from, // null or 4
  };
  return meta;
}

export default function HomePage() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualHs, setManualHs] = useState('');
  const [showRefine, setShowRefine] = useState(false);

  function handleUseCodeFromLanding(codeLike: string, description?: string) {
    const hs = String(codeLike || '').replace(/\D/g, '').slice(0, 10);
    if (!hs) return; // nothing to do
    const params = new URLSearchParams();
    params.set('hs', hs);
    if (description) params.set('desc', description);
    params.set('source', 'landing');
    router.push(`/estimate?${params.toString()}`);
  }

  const heroCtaDisabled = useMemo(() => query.trim().length === 0 || loading, [query, loading]);

  const handleFindHs = async () => {
    setLoading(true);
    setError(null);
    setSuggestions(null);
    const rawTerm = query;
    const normalized = query.trim().toLowerCase();

    try {
      const allHits = await fetchSuggestions(rawTerm);
      const selected = selectTopSuggestions(allHits);
      setSuggestions(selected ?? []);

      await logEvent({
        event_type: 'search_performed',
        search_term: rawTerm,
        normalized_term: normalized,
        suggested_codes: (selected ?? []).map((s) => ({
          code: s.code,
          confidence: s.confidence ?? 0,
          label: s.description,
        })),
      });
    } catch (e: any) {
      setError(e?.message || 'Something went wrong. Try a simpler description.');
      setSuggestions([]);
      await logEvent({
        event_type: 'search_performed',
        search_term: rawTerm,
        normalized_term: normalized,
        suggested_codes: [],
      });
    } finally {
      setLoading(false);
    }
  };

  // Route with precision flags
  const routeToEstimator = (opts: {
    hs: string;
    hs_display?: string;
    desc?: string;
    padded_from: 4 | null;
  }) => {
    const params = new URLSearchParams();
    params.set('hs', opts.hs);
    if (opts.hs_display) params.set('hs_display', opts.hs_display);
    if (opts.desc) params.set('desc', opts.desc);
    params.set('source', 'landing');

    // Precision metadata for estimator banner
    params.set('hs_len', String(opts.hs.length));
    if (opts.padded_from) params.set('padded_from', String(opts.padded_from));
    if (opts.hs.length < 10) params.set('needs_refine', '1');

    router.push(`/estimate?${params.toString()}`);
  };

  // Pass digits-only HS to estimator (normalize 4->6) + meta
  const selectCode = async (s: Suggestion) => {
    const meta = normalizeHsCodeWithMeta(s.code);
    if (!meta.hs || meta.hs.length < 6) return;
    await logEvent({ event_type: 'result_clicked', clicked_code: meta.hs });
    routeToEstimator({
      hs: meta.hs,
      hs_display: s.code,
      desc: s.description,
      padded_from: meta.padded_from,
    });
  };

  const goManual = () => {
    const meta = normalizeHsCodeWithMeta(manualHs);
    if (!meta.hs || meta.hs.length < 6) return;
    routeToEstimator({ hs: meta.hs, padded_from: meta.padded_from });
  };

  return (
    <main className="min-h-[100svh] bg-white">
      {/* HERO */}
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

          {/* Input + button + results */}
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
                  placeholder='e.g. "leather handbags"'
                  className="flex-1 bg-transparent text-[16px] md:text-sm outline-none placeholder:text-slate-400"
                />
                <button
                  onClick={handleFindHs}
                  disabled={heroCtaDisabled}
                  className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-50"
                >
                  {loading ? 'Searching…' : 'Find my HS code'}
                </button>
              </div>

              <div className="border-t border-slate-200/70 p-3 text-left">
                {error && <div className="text-sm text-red-600">{error}</div>}

                {suggestions && suggestions.length > 0 && (
                  <ul className="space-y-2">
                    {suggestions.map((s) => {
                      const isValid = codeIsValid(s.code);
                      const activate = () => {
                        if (isValid) selectCode(s);
                      };

                      return (
                        <li
                          key={`${s.code}-${s.confidence}`}
                          className={[
                            'flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2',
                            isValid
                              ? 'bg-slate-50 hover:bg-indigo-50 cursor-pointer'
                              : 'bg-slate-50 opacity-80',
                          ].join(' ')}
                          onClick={activate}
                          onKeyDown={(e) => {
                            if ((e.key === 'Enter' || e.key === ' ') && isValid) {
                              e.preventDefault();
                              activate();
                            }
                          }}
                          role="button"
                          tabIndex={0}
                          aria-disabled={!isValid}
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <div className="text-sm font-semibold text-slate-900">{s.code}</div>
                              {s.reason && (
                                <span className="text-[10px] uppercase text-slate-500">
                                  {s.reason}
                                </span>
                              )}
                            </div>
                            <div className="truncate text-xs text-slate-600">{s.description}</div>
                            {typeof s.mfn_advalorem === 'number' && (
                              <div className="mt-0.5 text-[11px] text-slate-500">
                                Duty: {s.mfn_advalorem}% (MFN)
                              </div>
                            )}
                            {!isValid && (
                              <div className="mt-1 text-[11px] text-amber-700">
                                This suggestion doesn’t include a usable HS code yet.
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-slate-500">
                              {Math.round((s.confidence ?? 0.8) * 100)}% match
                            </span>
                                                         <button
                               type="button"
                               onClick={() => handleUseCodeFromLanding(s.code, s.description)}
                               disabled={!isValid}
                               title={
                                 isValid ? 'Send to estimator' : 'Needs at least a 4-digit code'
                               }
                               className={[
                                 'rounded-lg px-3 py-1.5 text-xs font-medium',
                                 isValid
                                   ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                                   : 'bg-slate-200 text-slate-500 cursor-not-allowed',
                               ].join(' ')}
                             >
                               Use this code
                             </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}

                {suggestions && suggestions.length === 0 && (
                  <div className="space-y-3">
                    <div className="text-sm text-slate-700">
                      Not confident yet. Try simpler wording (e.g., “leather handbags”) or enter a
                      code manually.
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-white p-3">
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
                            placeholder="Enter HS code (4–10 digits)"
                            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-[16px] md:text-sm outline-none"
                          />
                          <button
                            onClick={goManual}
                            disabled={manualHs.replace(/\D/g, '').length < 4}
                            className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
                          >
                            Use code
                          </button>
                        </div>
                      )}
                    </div>

                    <p className="text-[11px] text-slate-500">
                      We show up to 3 likely codes with confidence. If one is very strong, we pick
                      just that to keep things fast.
                    </p>
                  </div>
                )}
              </div>
            </div>

            <p className="mt-3 text-xs text-slate-600">
              No signup required • Free to start • Mobile friendly
            </p>
          </div>

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

      {/* CTA BAND */}
      <section className="bg-indigo-600">
        <div className="mx-auto max-w-6xl px-6 py-10 text-center">
          <h3 className="text-2xl font-semibold text-white">Ready to estimate your shipment?</h3>
          <p className="mt-2 text-indigo-100">
            Start with a likely HS code and get a clear duty breakdown in seconds.
          </p>
          <div className="mt-5">
            <Link
              href="/estimate"
              className="inline-block rounded-xl bg-white px-5 py-3 text-indigo-700 font-medium shadow-sm hover:bg-indigo-50"
            >
              Open Tariff Estimator
            </Link>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-white">
        <div className="mx-auto max-w-5xl px-6 py-14">
          <h2 className="text-center text-2xl font-semibold text-slate-900">FAQ</h2>
          <div className="mt-8 grid gap-6 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-6">
              <h4 className="font-semibold text-slate-900">Is this official duty advice?</h4>
              <p className="mt-2 text-sm text-slate-600">
                No. Importium gives quick estimates and pointers to official sources. For binding
                decisions, consult CBP or a licensed customs broker.
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-6">
              <h4 className="font-semibold text-slate-900">What if I don’t know my HS code?</h4>
              <p className="mt-2 text-sm text-slate-600">
                Use the search box on the homepage. We’ll suggest 1–3 likely codes with confidence,
                and you can one-tap send it to the estimator.
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-6">
              <h4 className="font-semibold text-slate-900">Do you handle Section 301 tariffs?</h4>
              <p className="mt-2 text-sm text-slate-600">
                Yes—our estimator flags likely Section 301 duties where applicable and shows the
                combined rate.
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-6">
              <h4 className="font-semibold text-slate-900">Is it free?</h4>
              <p className="mt-2 text-sm text-slate-600">
                The core estimator is free to start. Advanced features may become paid later.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-slate-50">
        <div className="mx-auto max-w-6xl px-6 py-10">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <p className="text-sm text-slate-600">© {new Date().getFullYear()} Importium</p>
            <nav className="flex items-center gap-4 text-sm text-slate-600">
              <Link href="/estimate" className="hover:text-slate-900">
                Estimator
              </Link>
              <a
                href="https://www.usitc.gov/tata/hts/index.htm"
                target="_blank"
                rel="noreferrer"
                className="hover:text-slate-900"
              >
                HTSUS
              </a>
            </nav>
          </div>
        </div>
      </footer>

      {Array.isArray(suggestions) && suggestions.length > 1 && (
        <>
          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              className="rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50"
              onClick={() => setShowRefine(true)}
            >
              See other matches ({Math.max(0, (suggestions?.length ?? 0) - 1)})
            </button>

            {/* Risk nudges derived from API fields; safe-optional access so types don't break */}
            {(() => {
              const best: any = suggestions?.[0] ?? null;
              const flags: string[] = (best?.flags ?? []) as string[];
              const conf: number = typeof best?.confidence === 'number' ? best.confidence : 0.8;
              const isGeneric = !!best?.forceRefine || flags.includes('generic-query');

              if (isGeneric) {
                return (
                  <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                    Too broad — choose a type (material, use, value bracket, gender)
                  </span>
                );
              }
              if (conf < 0.9) {
                return (
                  <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                    Confidence {Math.round(conf * 100)}% — consider reviewing alternatives
                  </span>
                );
              }
              return null;
            })()}
          </div>

          <RefineModal
            isOpen={showRefine}
            onClose={() => setShowRefine(false)}
            candidates={(suggestions ?? []).slice(0, 5).map((r: any) => ({
              code10: r.code10,
              description: r.description,
              confidence: typeof r.confidence === 'number' ? r.confidence : 0.8,
            }))}
            loading={false}
            onSelectCandidate={(c) => {
              setShowRefine(false);
              handleUseCodeFromLanding(c.code10, c.description);
            }}
          />
        </>
      )}
    </main>
  );
}
