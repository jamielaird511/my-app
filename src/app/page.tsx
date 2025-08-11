// app/page.tsx
import Link from 'next/link';

function CheckIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path
        d="M20 7L9 18l-5-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
function CalcIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <rect
        x="4"
        y="3"
        width="16"
        height="18"
        rx="3"
        className="fill-none stroke-current"
        strokeWidth="2"
      />
      <path
        d="M8 7h8M8 11h2M8 15h2M8 19h2M12 11h4M12 15h4M12 19h4"
        className="fill-none stroke-current"
        strokeWidth="2"
      />
    </svg>
  );
}
function SearchIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <circle cx="11" cy="11" r="7" className="fill-none stroke-current" strokeWidth="2" />
      <path
        d="M20 20l-3.5-3.5"
        className="fill-none stroke-current"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
function DocIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path
        d="M7 3h7l5 5v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"
        className="fill-none stroke-current"
        strokeWidth="2"
      />
      <path d="M14 3v5h5M8 13h8M8 17h6" className="fill-none stroke-current" strokeWidth="2" />
    </svg>
  );
}

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col text-gray-800">
      {/* HERO */}
      <section className="bg-indigo-100 border-b border-indigo-200">
        <div className="mx-auto w-full max-w-6xl px-6 py-16 sm:py-20">
          <div className="mx-auto max-w-3xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-white px-3 py-1 text-xs text-indigo-700 shadow-sm">
              <CheckIcon className="h-4 w-4 text-indigo-600" /> Powered by official USITC data
            </span>
            <h1 className="mt-4 text-4xl font-extrabold tracking-tight sm:text-5xl">
              Import to the U.S. with Confidence
            </h1>
            <p className="mt-4 text-lg text-gray-700">
              Instant duty estimates from keywords or HS codes — with clear descriptions and notes —
              so you can budget before your shipment leaves port.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link
                href="/estimate"
                className="w-full rounded-xl bg-indigo-600 px-6 py-3 text-center font-medium text-white shadow-sm transition hover:scale-[1.02] hover:bg-indigo-700 sm:w-auto"
              >
                Try the Tariff Estimator
              </Link>
              <Link
                href="/hs"
                className="w-full rounded-xl border border-gray-300 bg-white px-6 py-3 text-center font-medium transition hover:border-gray-400 sm:w-auto"
              >
                Search HS Codes
              </Link>
            </div>
            <p className="mt-3 text-xs text-gray-600">
              No signup required • Free to start • Mobile friendly
            </p>
          </div>
        </div>
      </section>

      <div className="h-2 w-full bg-white" />

      {/* FEATURES */}
      <section className="bg-sky-100 border-y border-sky-200">
        <div className="mx-auto w-full max-w-6xl px-6 py-12 sm:py-14">
          <h2 className="text-center text-2xl font-bold">Everything you need to import smart</h2>
          <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-2xl border border-sky-200 bg-white p-6 shadow-sm transition hover:shadow-md">
              <CalcIcon className="h-8 w-8 text-indigo-600" />
              <h3 className="mt-3 text-lg font-semibold">Instant Duty Estimates</h3>
              <p className="mt-2 text-sm text-gray-700">
                Enter a product or HS code, add price and quantity, and get a duty rate and dollar
                estimate in seconds.
              </p>
            </div>
            <div className="rounded-2xl border border-sky-200 bg-white p-6 shadow-sm transition hover:shadow-md">
              <SearchIcon className="h-8 w-8 text-indigo-600" />
              <h3 className="mt-3 text-lg font-semibold">Reliable HS Code Matching</h3>
              <p className="mt-2 text-sm text-gray-700">
                We match against the USITC HTS API and fall back to a curated dictionary when the
                API can’t find your term.
              </p>
            </div>
            <div className="rounded-2xl border border-sky-200 bg-white p-6 shadow-sm transition hover:shadow-md">
              <DocIcon className="h-8 w-8 text-indigo-600" />
              <h3 className="mt-3 text-lg font-semibold">Clear, Actionable Output</h3>
              <p className="mt-2 text-sm text-gray-700">
                See the HS description, rate breakdown, notes, and alternates — with quick links to
                the official USITC listing.
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="h-2 w-full bg-white" />

      {/* HOW IT WORKS */}
      <section className="bg-white border-b border-gray-200">
        <div className="mx-auto w-full max-w-6xl px-6 py-12 sm:py-14">
          <h2 className="text-center text-2xl font-bold">How it works</h2>
          <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-3">
            {[
              {
                n: '1',
                title: 'Search',
                body: 'Type a product name or HS code. We query USITC and backstop with our local dictionary.',
              },
              {
                n: '2',
                title: 'Calculate',
                body: 'Add unit price, quantity, and optional weight. We compute duty rate and dollar estimate.',
              },
              {
                n: '3',
                title: 'Decide',
                body: 'Use the estimate to budget, negotiate, and choose the right HS line with confidence.',
              },
            ].map((s) => (
              <div
                key={s.n}
                className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition hover:shadow-md"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-600 text-sm font-semibold text-white">
                  {s.n}
                </div>
                <h3 className="mt-3 text-lg font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm text-gray-700">{s.body}</p>
              </div>
            ))}
          </div>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/estimate"
              className="rounded-xl bg-indigo-600 px-6 py-3 font-medium text-white shadow-sm transition hover:scale-[1.02] hover:bg-indigo-700"
            >
              Estimate Duty
            </Link>
            <Link
              href="/hs"
              className="rounded-xl border border-gray-300 bg-white px-6 py-3 font-medium transition hover:border-gray-400"
            >
              Find an HS Code
            </Link>
          </div>
        </div>
      </section>

      <div className="h-2 w-full bg-white" />

      {/* TRUST STRIP */}
      <section className="bg-amber-100 border-y border-amber-200">
        <div className="mx-auto w-full max-w-6xl px-6 py-10">
          <div className="grid grid-cols-1 gap-6 text-center sm:grid-cols-3">
            <div className="rounded-xl border border-amber-200 bg-white p-5 shadow-sm">
              <div className="text-sm font-semibold text-gray-900">Live data</div>
              <p className="mt-1 text-sm text-gray-700">Rates from the official USITC HTS API.</p>
            </div>
            <div className="rounded-xl border border-amber-200 bg-white p-5 shadow-sm">
              <div className="text-sm font-semibold text-gray-900">Accurate by default</div>
              <p className="mt-1 text-sm text-gray-700">
                Sensible fallbacks when the API can’t match your term.
              </p>
            </div>
            <div className="rounded-xl border border-amber-200 bg-white p-5 shadow-sm">
              <div className="text-sm font-semibold text-gray-900">Fast & private</div>
              <p className="mt-1 text-sm text-gray-700">No account required to get started.</p>
            </div>
          </div>
        </div>
      </section>

      <div className="h-2 w-full bg-white" />

      {/* AI TEASER */}
      <section className="bg-violet-100 border-t border-violet-200">
        <div className="mx-auto w-full max-w-4xl px-6 py-12 text-center sm:py-14">
          <h2 className="text-2xl font-bold">Coming soon: Importium AI Q&A</h2>
          <p className="mt-3 text-gray-800">
            Ask, <em>“I’m importing sunglasses from China — what do I need to know?”</em> and get
            instant, trustworthy answers powered by trade data.
          </p>
          <button
            type="button"
            className="mt-6 rounded-xl bg-indigo-600 px-6 py-3 font-medium text-white shadow-sm transition hover:scale-[1.02] hover:bg-indigo-700"
          >
            Join the Waitlist
          </button>
        </div>
      </section>

      <footer className="mt-auto border-t border-gray-200 bg-white">
        <div className="mx-auto w-full max-w-6xl px-6 py-6 text-center text-sm text-gray-500">
          © {new Date().getFullYear()} Importium · Powered by USITC HTS data ·{' '}
          <span className="whitespace-nowrap">U.S. imports only</span>
        </div>
      </footer>
    </main>
  );
}
