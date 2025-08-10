'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

type Resolution = 'none' | 'dict' | 'numeric' | 'hts';
type RateComponent =
  | { kind: 'pct'; value: number }
  | { kind: 'amount'; value: number; per: string };

type ApiResult = {
  duty: number | null;
  rate: number | null; // 0 => Free
  rateType: 'advalorem' | 'specific' | 'compound' | null;
  components: RateComponent[];
  resolution: Resolution;
  breakdown: {
    product: string | null;
    country: string | null;
    price: number | null; // per unit
    hsCode?: string | null;
    hsCodeFormatted?: string | null;
    description?: string | null;
    qty?: number | null;
    weightKg?: number | null;
  };
  alternates?: Array<{
    hsCode: string;
    hsCodeFormatted?: string | null;
    description: string;
    rate: number | null;
    rateType: 'advalorem' | 'specific' | 'compound';
  }>;
  notes?: string[];
};

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
});

function titleCase(s: string) {
  return s
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1).toLowerCase() : ''))
    .join(' ');
}

function Toast({
  kind,
  message,
  onClose,
}: {
  kind: 'success' | 'error';
  message: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const id = setTimeout(onClose, 2500);
    return () => clearTimeout(id);
  }, [onClose]);

  const base = 'fixed top-4 right-4 z-50 rounded-md px-4 py-2 shadow text-sm';
  const style = kind === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white';
  return <div className={`${base} ${style}`}>{message}</div>;
}

function ResolutionBadge({ r }: { r: Resolution }) {
  const map: Record<Resolution, { label: string; className: string }> = {
    numeric: { label: 'HTS (Numeric)', className: 'bg-blue-100 text-blue-700' },
    hts: { label: 'HTS (Keyword)', className: 'bg-indigo-100 text-indigo-700' },
    dict: { label: 'Dictionary', className: 'bg-gray-100 text-gray-700' },
    none: { label: 'No Match', className: 'bg-amber-100 text-amber-800' },
  };
  const s = map[r] ?? map.none;
  return (
    <span
      className={`rounded-full text-xs px-3 py-1 shadow ${s.className}`}
      title={`Resolution: ${s.label}`}
    >
      {s.label}
    </span>
  );
}

function rateToText(rate: number | null | undefined) {
  if (rate === 0) return 'Free';
  if (rate == null) return '—';
  const pct = rate * 100;
  return `${pct.toFixed(pct < 1 ? 2 : 1)}%`;
}

function componentsText(components: RateComponent[]) {
  if (!components?.length) return '—';
  return components
    .map((c) => (c.kind === 'pct' ? `${(c.value * 100).toFixed(2)}%` : `$${c.value}/${c.per}`))
    .join(' + ');
}

export default function EstimatePage() {
  const search = useSearchParams();
  const router = useRouter();

  // seed from query params (shareable) + localStorage (sticky UX)
  const [product, setProduct] = useState(search.get('product') ?? '');
  const [price, setPrice] = useState<string>(
    search.get('price') ??
      (typeof window !== 'undefined' ? (localStorage.getItem('est_price') ?? '') : ''),
  );
  const [country, setCountry] = useState(
    search.get('country') ??
      (typeof window !== 'undefined' ? (localStorage.getItem('est_country') ?? '') : ''),
  );
  const [qty, setQty] = useState<string>(
    search.get('qty') ??
      (typeof window !== 'undefined' ? (localStorage.getItem('est_qty') ?? '') : ''),
  );
  const [weightKg, setWeightKg] = useState<string>(
    search.get('weightKg') ??
      (typeof window !== 'undefined' ? (localStorage.getItem('est_weight') ?? '') : ''),
  );

  const [loading, setLoading] = useState(false);
  const [autoUpdating, setAutoUpdating] = useState(false);
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; msg: string } | null>(null);
  const [result, setResult] = useState<ApiResult | null>(null);

  const priceNum = useMemo(() => Number(price), [price]);
  const qtyNum = useMemo(() => (qty === '' ? null : Number(qty)), [qty]);
  const weightNum = useMemo(() => (weightKg === '' ? null : Number(weightKg)), [weightKg]);

  const hasHsCode = useMemo(() => /^\d{6}(\d{4})?$/.test(product.trim()), [product]);
  const isMissingHsCode = product.trim().length > 0 && !hasHsCode;

  const canSubmit =
    !!product.trim() &&
    !!country.trim() &&
    Number.isFinite(priceNum) &&
    price !== '' &&
    priceNum >= 0 &&
    !loading &&
    !autoUpdating;

  // persist some fields locally (UX)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (country.trim()) localStorage.setItem('est_country', country.trim());
    if (price !== '') localStorage.setItem('est_price', String(priceNum));
    if (qty !== '') localStorage.setItem('est_qty', String(qtyNum));
    if (weightKg !== '') localStorage.setItem('est_weight', String(weightNum));
  }, [country, price, priceNum, qty, qtyNum, weightKg, weightNum]);

  // shareable URL (US-only; no destination param)
  useEffect(() => {
    const params = new URLSearchParams();
    if (product.trim()) params.set('product', product.trim());
    if (country.trim()) params.set('country', country.trim());
    if (Number.isFinite(priceNum) && price !== '') params.set('price', String(priceNum));
    if (qtyNum != null && Number.isFinite(qtyNum)) params.set('qty', String(qtyNum));
    if (weightNum != null && Number.isFinite(weightNum)) params.set('weightKg', String(weightNum));
    const qs = params.toString();
    router.replace(`/estimate${qs ? `?${qs}` : ''}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product, country, priceNum, qtyNum, weightNum]);

  async function callEstimate(payload: Record<string, any>) {
    const res = await fetch('/api/estimate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = (await res.json()) as ApiResult | { error?: string };
    if (!res.ok) throw new Error((data as any)?.error || 'Request failed');
    return data as ApiResult;
  }

  async function handleEstimate(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setResult(null);
    try {
      setLoading(true);
      const data = await callEstimate({
        input: product.trim(),
        product: product.trim(),
        country: country.trim(),
        price: priceNum,
        qty: qtyNum ?? undefined,
        weightKg: weightNum ?? undefined,
      });
      setResult(data);
      setToast({ kind: 'success', msg: 'Estimate ready' });
    } catch (err: any) {
      setToast({ kind: 'error', msg: err.message || 'Couldn’t get an estimate' });
    } finally {
      setLoading(false);
    }
  }

  // Auto-rerun when qty/weight/price change (400ms debounce) – keeps totals fresh
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!result) return;
    if (!product.trim() || !country.trim() || !(Number.isFinite(priceNum) && price !== '')) return;

    setAutoUpdating(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const data = await callEstimate({
          input: result.breakdown.hsCode || product.trim(), // force numeric if we have it
          product: product.trim(),
          country: country.trim(),
          price: priceNum,
          qty: qtyNum ?? undefined,
          weightKg: weightNum ?? undefined,
        });
        setResult(data);
      } catch (e: any) {
        setToast({ kind: 'error', msg: e?.message || 'Auto-update failed' });
      } finally {
        setAutoUpdating(false);
      }
    }, 400);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qtyNum, weightNum, priceNum]);

  // Use an alternate HS line: update input + URL + recompute
  async function useAlternate(hsCode: string) {
    try {
      setProduct(hsCode);
      setLoading(true);
      const data = await callEstimate({
        input: hsCode,
        product: hsCode,
        country: country.trim(),
        price: priceNum,
        qty: qtyNum ?? undefined,
        weightKg: weightNum ?? undefined,
      });
      setResult(data);
      const params = new URLSearchParams(window.location.search);
      params.set('product', hsCode);
      router.replace(`/estimate?${params}`, { scroll: false });
      setToast({ kind: 'success', msg: `Using ${hsCode}` });
    } catch (e: any) {
      setToast({ kind: 'error', msg: e?.message || 'Failed to use alternate' });
    } finally {
      setLoading(false);
    }
  }

  const money = (n: number | null | undefined) =>
    n == null || Number.isNaN(n) ? '—' : currency.format(n);

  const totalDeclared =
    result?.breakdown?.price != null
      ? (result.breakdown.price ?? 0) *
        (result.breakdown.qty != null &&
        Number.isFinite(result.breakdown.qty) &&
        (result.breakdown.qty as number) > 0
          ? (result.breakdown.qty as number)
          : 1)
      : null;

  // Print/PDF – clean print layout
  function handlePrint() {
    window.print();
  }

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center px-6">
      <div className="max-w-xl w-full bg-white p-8 rounded-2xl shadow print:shadow-none print:max-w-none print:w-full print:p-0">
        <h1 className="text-2xl font-bold text-gray-900 mb-6 print:mb-3">Duty Estimator</h1>

        <form onSubmit={handleEstimate} className="space-y-5 print:hidden">
          {/* Product */}
          <div>
            <label className="block text-sm font-medium text-gray-700">Product</label>
            <input
              autoFocus
              type="text"
              placeholder="e.g., Sunglasses, 6-digit HS code, or 10-digit HS code"
              value={product}
              onChange={(e) => setProduct(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {isMissingHsCode ? (
              <p className="mt-1 text-xs text-amber-600">
                Tip: Paste a 6-digit or 10-digit HS code for more accurate rates.
              </p>
            ) : (
              <p className="mt-1 text-xs text-gray-500">
                Keywords, a 6-digit HS code, or a 10-digit HS code all work.
              </p>
            )}
          </div>

          {/* Price */}
          <div>
            <label className="block text-sm font-medium text-gray-700">Price per unit (USD)</label>
            <div className="mt-1 flex">
              <span className="inline-flex items-center rounded-l-lg border border-r-0 border-gray-300 bg-gray-50 px-3 text-gray-600">
                USD
              </span>
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                placeholder="e.g., 49.99"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="w-full rounded-r-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            {!Number.isFinite(priceNum) || price === '' || priceNum < 0 ? (
              <p className="mt-1 text-xs text-red-600">Enter a non-negative number.</p>
            ) : (
              <p className="mt-1 text-xs text-gray-500">We’ll use {currency.format(priceNum)}.</p>
            )}
          </div>

          {/* Country */}
          <div>
            <label className="block text-sm font-medium text-gray-700">Country of origin</label>
            <input
              type="text"
              placeholder="e.g., China"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="mt-1 text-xs text-gray-500">Where is it manufactured?</p>
          </div>

          {/* Optional qty/weight */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Quantity (units/pairs){' '}
                {autoUpdating && <span className="text-xs text-gray-500">(recalculating…)</span>}
              </label>
              <input
                type="number"
                inputMode="numeric"
                min="0"
                step="1"
                placeholder="optional"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Weight (kg){' '}
                {autoUpdating && <span className="text-xs text-gray-500">(recalculating…)</span>}
              </label>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                placeholder="optional"
                value={weightKg}
                onChange={(e) => setWeightKg(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={!canSubmit}
              className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-white font-medium transition hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                    />
                  </svg>
                  Calculating…
                </>
              ) : (
                'Estimate Duty'
              )}
            </button>

            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(window.location.href);
                setToast({ kind: 'success', msg: 'Link copied' });
              }}
              className="rounded-lg border px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Copy link
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="rounded-lg border px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              title="Save or print a PDF of this estimate"
            >
              Save as PDF
            </button>
          </div>
        </form>

        {/* Result card */}
        {result && (
          <div className="mt-6 rounded-2xl border p-4 relative">
            <div className="absolute -top-3 right-3 print:hidden">
              <ResolutionBadge r={result.resolution} />
            </div>

            <h2 className="font-semibold mb-2">Estimated Costs</h2>

            <div className="text-gray-800 space-y-1">
              <div>
                Product:{' '}
                <span className="font-medium">
                  {result.breakdown.product ? titleCase(result.breakdown.product) : '—'}
                </span>
              </div>
              <div>
                Country:{' '}
                <span className="font-medium">
                  {result.breakdown.country ? titleCase(result.breakdown.country) : '—'}
                </span>
              </div>
              <div>
                Importing to: <span className="font-medium">United States</span>
              </div>

              {(result.breakdown.hsCodeFormatted ||
                result.breakdown.hsCode ||
                result.breakdown.description) && (
                <div className="flex items-center gap-2 flex-wrap">
                  <div>
                    HS code:{' '}
                    <span className="font-mono">
                      {result.breakdown.hsCodeFormatted || result.breakdown.hsCode || '—'}
                    </span>
                    {result.breakdown.description ? <> — {result.breakdown.description}</> : null}
                  </div>
                  {result.breakdown.hsCode && (
                    <div className="print:hidden">
                      <button
                        type="button"
                        onClick={() => navigator.clipboard.writeText(result.breakdown.hsCode!)}
                        className="rounded border px-2 py-0.5 text-xs hover:bg-gray-50"
                      >
                        Copy HS
                      </button>
                      <a
                        className="rounded border px-2 py-0.5 text-xs hover:bg-gray-50"
                        target="_blank"
                        rel="noreferrer"
                        href={`https://hts.usitc.gov/?query=${result.breakdown.hsCode}`}
                      >
                        View on USITC
                      </a>
                    </div>
                  )}
                </div>
              )}

              <div>Declared price (per unit): {money(result.breakdown.price)}</div>

              {result.breakdown.qty != null && Number.isFinite(result.breakdown.qty) && (
                <div className="text-sm text-gray-700">
                  Total declared value: {money(totalDeclared)}
                  <span className="text-gray-500">
                    {' '}
                    ({money(result.breakdown.price)} × {result.breakdown.qty})
                  </span>
                </div>
              )}

              <div>Duty rate: {rateToText(result.rate)}</div>
              <div className="text-sm text-gray-600">
                Components: {componentsText(result.components)}
              </div>

              <div className="mt-2 border-t pt-2">
                <span className="text-sm text-gray-600">
                  {money(result.breakdown.price)}
                  {result.breakdown.qty != null && Number.isFinite(result.breakdown.qty)
                    ? ` × ${result.breakdown.qty} × ${rateToText(result.rate)} =`
                    : ` × ${rateToText(result.rate)} =`}
                </span>{' '}
                <span className="font-semibold">{money(result.duty)}</span>
                {(result.breakdown.qty != null || result.breakdown.weightKg != null) && (
                  <div className="text-sm text-gray-600">
                    (Qty: {result.breakdown.qty ?? '—'}, Weight: {result.breakdown.weightKg ?? '—'}{' '}
                    kg)
                  </div>
                )}
              </div>

              {Array.isArray(result.notes) && result.notes.length > 0 && (
                <div className="mt-3 rounded-lg bg-amber-50 p-3 text-amber-900 text-sm">
                  <ul className="list-disc pl-5 space-y-1">
                    {result.notes.map((n, i) => (
                      <li key={i}>{n}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Alternates */}
            {result.alternates && result.alternates.length > 0 && (
              <div className="mt-4 rounded-lg border p-3 print:hidden">
                <div className="font-medium mb-2">Other close HTS lines</div>
                <ul className="space-y-2">
                  {result.alternates.slice(0, 5).map((alt, i) => (
                    <li key={i} className="flex items-start justify-between gap-3">
                      <div className="text-sm">
                        <div className="font-mono">
                          {alt.hsCodeFormatted || alt.hsCode}{' '}
                          <span className="text-gray-400">({alt.rateType})</span>
                        </div>
                        <div className="text-gray-700">{alt.description}</div>
                        <div className="text-gray-600 text-xs">
                          Rate:{' '}
                          {alt.rate === 0
                            ? 'Free'
                            : alt.rate == null
                              ? '—'
                              : `${(alt.rate * 100).toFixed(2)}%`}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => useAlternate(alt.hsCode)}
                        className="shrink-0 rounded border px-2 py-1 text-xs hover:bg-gray-50"
                      >
                        Use this
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Trust & timestamp footer */}
        <div className="mt-6 text-xs text-gray-500 text-center print:mt-2">
          Rates via USITC HTS REST API (General column). Calculated {new Date().toLocaleString()}.
          <span className="block">
            Does not include special programs or additional duties (e.g., Section 301).
          </span>
        </div>
      </div>

      {toast && <Toast kind={toast.kind} message={toast.msg} onClose={() => setToast(null)} />}

      <style jsx global>{`
        @media print {
          body,
          html {
            background: #fff !important;
          }
          .print:hidden {
            display: none !important;
          }
          .print:max-w-none {
            max-width: none !important;
          }
          .print:w-full {
            width: 100% !important;
          }
          .print:p-0 {
            padding: 0 !important;
          }
          .print:mb-3 {
            margin-bottom: 0.75rem !important;
          }
          .print:shadow-none {
            box-shadow: none !important;
          }
        }
      `}</style>
    </main>
  );
}
