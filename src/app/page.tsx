export default function Home() {
  return (
    <main className="min-h-screen p-8 bg-gray-50">
      <div className="mx-auto max-w-3xl text-center">
        <h1 className="text-5xl font-bold mb-4">Importium</h1>
        <p className="text-lg text-gray-700 mb-8">
          Your friendly import duty estimator — simple, fast, and fun.
        </p>
        <a
          href="/estimate"
          className="inline-block bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition"
        >
          Get Started
        </a>
      </div>
    </main>
  );
}
