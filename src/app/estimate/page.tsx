"use client";

import { useState } from "react";
import NavBar from "../../components/NavBar";

export default function EstimatePage() {
  const [product, setProduct] = useState("");
  const [price, setPrice] = useState("");
  const [country, setCountry] = useState("");
  const [result, setResult] = useState<string | null>(null);

  const handleEstimate = (e: React.FormEvent) => {
    e.preventDefault();
    const dutyRate = 0.05; // Fake calculation: 5%
    const dutyAmount = parseFloat(price) * dutyRate;
    setResult(
      `Estimated duty for ${product} from ${country}: $${dutyAmount.toFixed(2)}`
    );
  };

  return (
    <>
      <NavBar />
      <main className="min-h-screen bg-gray-50 flex items-center justify-center px-6">
        <div className="max-w-lg w-full bg-white p-8 rounded-lg shadow-md">
          <h1 className="text-2xl font-bold mb-6 text-gray-900">
            Duty Estimator
          </h1>

          <form
            onSubmit={handleEstimate}
            className="flex flex-col gap-4"
          >
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
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition"
            >
              Estimate Duty
            </button>
          </form>

          {result && (
            <p className="mt-4 font-semibold text-green-600">{result}</p>
          )}
        </div>
      </main>
    </>
  );
}
