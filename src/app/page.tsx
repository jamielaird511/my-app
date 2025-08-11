// src/app/page.tsx
import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 px-6">
      <div className="max-w-2xl text-center">
        <h1 className="text-5xl font-bold mb-4 text-gray-900">Importium</h1>
        <p className="text-lg text-gray-700 mb-8">
          Your friendly import duty estimator — simple, fast, and fun.
        </p>
        <Link
          href="/estimate"
          className="inline-block bg-blue-600 text-white px-8 py-4 rounded-lg shadow-md hover:bg-blue-700 hover:shadow-lg transition duration-200"
        >
          Get Started
        </Link>
      </div>
    </main>
  );
}
