import Link from 'next/link';

/* Simple, single-color icons (stroke = currentColor) */
function IconCalc(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
      <rect x="4" y="3" width="16" height="18" rx="2" ry="2" strokeWidth="1.8" />
      <path d="M8 7h8M8 11h2M12 11h2M16 11h0M8 15h2M12 15h2M16 15h0" strokeWidth="1.8" />
    </svg>
  );
}
function IconSearch(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
      <circle cx="11" cy="11" r="7" strokeWidth="1.8" />
      <path d="M20 20l-3.5-3.5" strokeWidth="1.8" strokeLinecap="round" />
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

export default function HomePage() {
  return (
    <main className="min-h-screen bg-white">
      {/* HERO (bolder indigo) */}
      <section className="relative bg-indigo-200">
        <div className="mx-auto max-w-6xl px-6 py-16 text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1 text-xs font-medium text-indigo-700 ring-1 ring-indigo-300">
            <span className="inline-block h-2 w-2 rounded-full bg-indigo-600" />
            Powered by official USITC data
          </div>

          <h1 className="mt-6 text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
            Import to the U.S. with <span className="text-indigo-800">Confidence</span>
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-slate-700">
            Instant duty estimates from keywords or HS codes — with clear descriptions and notes —
            so you can budget before your shipment leaves port.
          </p>

          <div className="mt-8 flex items-center justify-center gap-3">
            <Link
              href="/estimate"
              className="rounded-xl bg-indigo-600 px-5 py-3 text-white shadow-sm transition hover:bg-indigo-700"
            >
              Try the Tariff Estimator
            </Link>
            <Link
              href="/hs"
              className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-slate-900 transition hover:bg-slate-50"
            >
              Search HS Codes
            </Link>
          </div>

          <p className="mt-3 text-xs text-slate-600">
            No signup required • Free to start • Mobile friendly
          </p>
        </div>
      </section>

      {/* FEATURES (light slate) */}
      <section className="bg-slate-100">
        <div className="mx-auto max-w-6xl px-6 py-14">
          <h2 className="mb-6 text-center text-2xl font-semibold text-slate-900">
            Everything you need to import smart
          </h2>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-2xl border border-slate-300 bg-white p-6 shadow-lg ring-1 ring-indigo-100 transition hover:ring-indigo-200">
              <div className="mb-4">
                <IconCalc className="h-7 w-7 text-indigo-600" />
              </div>
              <h3 className="font-semibold text-slate-900">Instant Duty Estimates</h3>
              <p className="mt-2 text-sm text-slate-600">
                Enter a product or HS code, add price and quantity, and get a duty rate and dollar
                estimate in seconds.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-300 bg-white p-6 shadow-lg ring-1 ring-indigo-100 transition hover:ring-indigo-200">
              <div className="mb-4">
                <IconSearch className="h-7 w-7 text-indigo-600" />
              </div>
              <h3 className="font-semibold text-slate-900">Reliable HS Code Matching</h3>
              <p className="mt-2 text-sm text-slate-600">
                We match against the USITC HTS API and fall back to a curated dictionary when the
                API can’t find your term.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-300 bg-white p-6 shadow-lg ring-1 ring-indigo-100 transition hover:ring-indigo-200">
              <div className="mb-4">
                <IconReceipt className="h-7 w-7 text-indigo-600" />
              </div>
              <h3 className="font-semibold text-slate-900">Clear, Actionable Output</h3>
              <p className="mt-2 text-sm text-slate-600">
                See the HS description, rate breakdown, notes, and alternates — with quick links to
                the official USITC listing.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS (white, keep subtle but tidy) */}
      <section className="bg-white">
        <div className="mx-auto max-w-6xl px-6 py-14">
          <h2 className="mb-8 text-center text-2xl font-semibold text-slate-900">How it works</h2>

          <div className="grid gap-6 md:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm ring-1 ring-black/5">
              <div className="mb-2 text-sm font-semibold text-indigo-700">01</div>
              <h3 className="font-semibold text-slate-900">Describe or paste a code</h3>
              <p className="mt-1 text-sm text-slate-600">
                Type a product (e.g., “sunglasses”) or a 6/10-digit HS code and set unit price and
                quantity.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm ring-1 ring-black/5">
              <div className="mb-2 text-sm font-semibold text-indigo-700">02</div>
              <h3 className="font-semibold text-slate-900">We fetch & parse rates</h3>
              <p className="mt-1 text-sm text-slate-600">
                We query the HTS, parse the General rate (including specific/compound components),
                and compute the duty.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm ring-1 ring-black/5">
              <div className="mb-2 text-sm font-semibold text-indigo-700">03</div>
              <h3 className="font-semibold text-slate-900">Review & export</h3>
              <p className="mt-1 text-sm text-slate-600">
                Get a clean breakdown with alternates and links. Print or save a PDF for your
                records.
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
            Start with the estimator or look up an HS code. No login required.
          </p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <Link
              href="/estimate"
              className="rounded-xl bg-indigo-600 px-5 py-3 text-white shadow-sm transition hover:bg-indigo-700"
            >
              Get Started
            </Link>
            <Link
              href="/hs"
              className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-slate-900 transition hover:bg-slate-50"
            >
              HS Lookup
            </Link>
          </div>

          <p className="mt-4 text-xs text-slate-600">
            Rates via USITC HTS API. Does not include special programs or additional duties (e.g.,
            Section 301).
          </p>
        </div>
      </section>
    </main>
  );
}
