# Importium – Architecture Map

- Framework: Next.js (App Router), TypeScript, Tailwind.
- Pages:
  - `/` – HS code search & shortlist.
  - `/estimate` – estimator; query params for hs, origin, value, etc.
- State: local state + URLSearchParams. No global store unless needed.
- Data:
  - Supabase: `hs_aliases` (search), `hts_lines` (refine), future tables TBD.
  - HTS logic: pure modules in `/lib/estimate/*`.
- Refine API: `/api/hs/refine` for 10-digit HS code suggestions with confidence scoring.
- API routes: `/app/api/**` (server-only; no client imports).
- Analytics: `logEvent(name, payload)` stub.
- File size rules:  
  - Pages < 250 lines → extract to `/components/*` or `/lib/*`.
  - Pure logic in `/lib/*` with strong types.
