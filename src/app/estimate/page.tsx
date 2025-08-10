"use client";

import { useState } from "react";

type ApiResult = {
  duty: number;
  rate: number;
  breakdown: { product: string; country: string; price: number };
  notes: string;
};

export default function EstimatePage() {
  const [product, setProduct] = useState("");
  const [price, setPrice] = useState("");
  const [country, setCountry] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ApiResult | null>(null);

  async function handleEstimate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);

    const priceNum = Number(price);
    if (!product.trim() || !country.trim() || !Number.isFinite(priceNum) || priceNum < 0) {
      setError("Enter product, country, and a valid non-negative price.");
      return;
    }

    try {
      setLoading(true);
      const res = await fetch("/api/estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product, country, price: priceNum }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");
      setResult(data as ApiResult);
    } catch (err: any) {
      setError(err.message || "Couldn’t get an estimate.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center px-6">
      <div className="max-w-lg w-full bg-white p-8 rounded-lg shadow-md">
        <h1 className="text-2xl font-bold mb-6 text-gray-900">Duty Estimator</h1>

        <form onSubmit={handleEstimate} className="flex flex-col gap-4">
          <input
            type="text"
            placeholder="Product name"
            value={product}
            onChange={(e) => setProduct(e.target.value)}
            required
            className="border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />

          <input
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            placeholder="Price in USD"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            required
            className="border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />

          <input
            type="text"
            placeholder="Country of origin"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            required
            className="border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />

          <button
            type="submit"
            disabled={loading}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition disabled:opacity-60"
          >
            {loading ? "Calculating…" : "Estimate Duty"}
          </button>

          {error && <p className="text-red-600">{error}</p>}
        </form>

        {result && (
          <div className="mt-6 rounded-lg border p-4">
            <h2 className="font-semibold mb-2">Estimated Costs</h2>
            <div className="text-gray-800">
              <div>
                Product: <span className="font-medium">{result.breakdown.product}</span>
              </div>
              <div>
                Country: <span className="font-medium">{result.breakdown.country}</span>
              </div>
              <div>Price: ${result.breakdown.price.toFixed(2)}</div>
              <div>Duty rate: {(result.rate * 100).toFixed(1)}%</div>
              <div className="mt-2">
                Duty due: <span className="font-semibold">${result.duty.toFixed(2)}</span>
              </div>
              <p className="text-gray-600 mt-2">{result.notes}</p>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
