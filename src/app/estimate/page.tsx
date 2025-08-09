"use client";

import { useState } from "react";

export default function EstimatePage() {
  const [product, setProduct] = useState("");
  const [price, setPrice] = useState<string>("");
  const [country, setCountry] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ duty: number; notes: string } | null>(null);

  const handleEstimate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResult(null);

    const p = parseFloat(price);
    if (Number.isNaN(p) || p < 0) {
      setError("Enter a valid price.");
      return;
    }

    try {
      setLoading(true);
      const res = await fetch(
        `/api/estimate?product=${encodeURIComponent(product)}&country=${encodeURIComponent(
          country
        )}&price=${p}`
      );
      if (!res.ok) throw new Error("Request failed");
      const data = await res.json();
      setResult(data);
    } catch (err) {
      setError("Couldn’t get an estimate. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-xl">
        <h1 className="text-3xl font-semibold mb-6">Duty Estimator</h1>

        <form onSubmit={handleEstimate} className="space-y-4 bg-white p-6 rounded-xl shadow">
          <input
            type="text"
            placeholder="Product (e.g., sunglasses)"
            value={product}
            onChange={(e) => setProduct(e.target.value)}
            className="w-full rounded-lg border p-3"
            required
          />

          <div className="flex gap-2">
            <span className="inline-flex items-center rounded-lg border px-3">USD</span>
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              placeholder="Price per unit"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="w-full rounded-lg border p-3"
              required
            />
          </div>

          <input
            type="text"
            placeholder="Country of origin (e.g., China)"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className="w-full rounded-lg border p-3"
            required
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-blue-600 px-4 py-3 text-white font-medium hover:bg-blue-700 disabled:opacity-60"
          >
            {loading ? "Calculating…" : "Get Estimate"}
          </button>

          {error && <p className="text-red-600">{error}</p>}
        </form>

        {result && (
          <div className="mt-6 rounded-xl bg-white p-6 shadow">
            <h2 className="text-xl font-semibold mb-2">Estimated Costs</h2>
            <p className="text-gray-800">
              Duty: <span className="font-semibold">${result.duty.toFixed(2)} per unit</span>
            </p>
            <p className="text-gray-600 mt-2">{result.notes}</p>
          </div>
        )}
      </div>
    </main>
  );
}
