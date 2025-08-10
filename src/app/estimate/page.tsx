"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type ApiResult = {
  duty: number;
  rate: number; // 0.05
  breakdown: { product: string; country: string; price: number };
  notes: string;
};

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

// super tiny toast
function Toast({
  kind,
  message,
  onClose,
}: {
  kind: "success" | "error";
  message: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const id = setTimeout(onClose, 2500);
    return () => clearTimeout(id);
  }, [onClose]);

  const base =
    "fixed top-4 right-4 z-50 rounded-md px-4 py-2 shadow text-sm";
  const style =
    kind === "success"
      ? "bg-green-600 text-white"
      : "bg-red-600 text-white";
  return <div className={`${base} ${style}`}>{message}</div>;
}

export default function EstimatePage() {
  const search = useSearchParams();
  const router = useRouter();

  // seed state from query params (so link is sharable)
  const [product, setProduct] = useState(search.get("product") ?? "");
  const [price, setPrice] = useState<string>(search.get("price") ?? "");
  const [country, setCountry] = useState(search.get("country") ?? "");

  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ kind: "success" | "error"; msg: string } | null>(null);
  const [result, setResult] = useState<ApiResult | null>(null);

  const priceNum = useMemo(() => Number(price), [price]);
  const canSubmit =
    !!product.trim() && !!country.trim() && Number.isFinite(priceNum) && priceNum >= 0 && !loading;

  // keep URL in sync when values change (lightweight, debounced-ish)
  useEffect(() => {
    const params = new URLSearchParams();
    if (product.trim()) params.set("product", product.trim());
    if (country.trim()) params.set("country", country.trim());
    if (Number.isFinite(priceNum) && price !== "") params.set("price", String(priceNum));
    const qs = params.toString();
    router.replace(`/estimate${qs ? `?${qs}` : ""}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product, country, priceNum]);

  async function handleEstimate(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setResult(null);
    try {
      setLoading(true);
      const res = await fetch("/api/estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product: product.trim(),
          country: country.trim(),
          price: priceNum,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Request failed");

      setResult(data as ApiResult);
      setToast({ kind: "success", msg: "Estimate ready" });
    } catch (err: any) {
      setToast({ kind: "error", msg: err.message || "Couldn’t get an estimate" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center px-6">
      <div className="max-w-lg w-full bg-white p-8 rounded-2xl shadow">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Duty Estimator</h1>

        <form onSubmit={handleEstimate} className="space-y-4">
          {/* Product */}
          <div>
            <label className="block text-sm font-medium text-gray-700">Product</label>
            <input
              autoFocus
              type="text"
              placeholder="e.g., Sunglasses"
              value={product}
              onChange={(e) => setProduct(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="mt-1 text-xs text-gray-500">What are you importing?</p>
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
            {!Number.isFinite(priceNum) || priceNum < 0 ? (
              <p className="mt-1 text-xs text-red-600">Enter a non-negative number.</p>
            ) : (
              <p className="mt-1 text-xs text-gray-500">We’ll use ${priceNum.toFixed(2)}.</p>
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

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={!canSubmit}
              className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-white font-medium transition hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading && (
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
              )}
              {loading ? "Calculating…" : "Estimate Duty"}
            </button>

            {/* Copy sharable link */}
            <button
              type="button"
              onClick={async () => {
                const url = window.location.href;
                await navigator.clipboard.writeText(url);
                setToast({ kind: "success", msg: "Link copied" });
              }}
              className="rounded-lg border px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Copy link
            </button>
          </div>
        </form>

        {/* Result */}
        {result && (
          <div className="mt-6 rounded-2xl border p-4">
            <h2 className="font-semibold mb-2">Estimated Costs</h2>
            <div className="text-gray-800 space-y-1">
              <div>
                Product: <span className="font-medium">{result.breakdown.product}</span>
              </div>
              <div>
                Country: <span className="font-medium">{result.breakdown.country}</span>
              </div>
              <div>Price: {currency.format(result.breakdown.price)}</div>
              <div>Duty rate: {(result.rate * 100).toFixed(1)}%</div>
              <div className="mt-1 border-t pt-2">
                <span className="text-sm text-gray-600">
                  {currency.format(result.breakdown.price)} × {(result.rate * 100).toFixed(1)}% =
                </span>{" "}
                <span className="font-semibold">{currency.format(result.duty)}</span>
              </div>
              <p className="text-gray-600 mt-2">{result.notes}</p>
            </div>
          </div>
        )}
      </div>

      {toast && (
        <Toast
          kind={toast.kind}
          message={toast.msg}
          onClose={() => setToast(null)}
        />
      )}
    </main>
  );
}
