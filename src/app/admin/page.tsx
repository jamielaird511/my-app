// src/app/admin/stats/page.tsx
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic'; // ensure this route is always rendered on request
export const revalidate = 0; // never cache

export default async function AdminStatsPage() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  if (!url || !serviceKey) {
    return (
      <main className="max-w-3xl mx-auto p-6">
        <h1 className="text-xl font-semibold mb-4">Stats</h1>
        <div className="rounded-lg border bg-amber-50 p-4 text-amber-900">
          Missing Supabase env vars. Please set <code>NEXT_PUBLIC_SUPABASE_URL</code> and{' '}
          <code>SUPABASE_SERVICE_ROLE_KEY</code> in your environment.
        </div>
      </main>
    );
  }

  // Server-only client with service role (no session persisted)
  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

  const { data, error } = await supabase
    .from('event_daily_summary')
    .select('*')
    .order('day', { ascending: false })
    .limit(14);

  if (error) {
    return (
      <main className="max-w-3xl mx-auto p-6">
        <h1 className="text-xl font-semibold mb-4">Stats</h1>
        <div className="text-red-600">Failed to load: {error.message}</div>
      </main>
    );
  }

  const rows = data ?? [];

  return (
    <main className="max-w-5xl mx-auto p-6">
      <h1 className="text-xl font-semibold mb-4">Last 14 days</h1>

      <div className="overflow-x-auto rounded-xl border">
        <table className="min-w-[720px] w-full text-sm">
          <thead className="bg-slate-50 text-slate-700">
            <tr>
              {[
                'Day',
                'Sessions',
                'Events',
                'Searches',
                'Clicks',
                'Estimator loaded',
                'Estimate req',
                'Estimate ok',
              ].map((h) => (
                <th key={h} className="px-3 py-2 text-left font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {rows.map((r: any) => {
              // Format date safely if needed
              const day =
                typeof r.day === 'string' ? r.day : new Date(r.day).toISOString().slice(0, 10);

              return (
                <tr key={day} className="border-t">
                  <td className="px-3 py-2">{day}</td>
                  <td className="px-3 py-2">{r.sessions}</td>
                  <td className="px-3 py-2">{r.events}</td>
                  <td className="px-3 py-2">{r.searches}</td>
                  <td className="px-3 py-2">{r.clicks}</td>
                  <td className="px-3 py-2">{r.estimator_loaded}</td>
                  <td className="px-3 py-2">{r.estimate_requested}</td>
                  <td className="px-3 py-2">{r.estimate_success}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}
