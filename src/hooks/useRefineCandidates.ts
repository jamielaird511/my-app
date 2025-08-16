'use client';

import { useCallback, useMemo, useState } from 'react';

export type RefineCandidate = {
  code10: string;
  description: string;
  confidence: number; // 0..1
};

// ---- in-memory cache for the dataset (module-level, shared across hook calls)
let HTS10_CACHE: Array<{ code10: string; description: string }> | null = null;
let HTS10_LOADING: Promise<void> | null = null;

async function ensureHtsLoaded() {
  if (HTS10_CACHE) return;
  if (!HTS10_LOADING) {
    HTS10_LOADING = (async () => {
      const res = await fetch('/hts10.json', { cache: 'force-cache' });
      if (!res.ok) throw new Error('Failed to load hts10.json');
      const data = (await res.json()) as Array<{ code10: string; description: string }>;
      // tiny guardrails
      HTS10_CACHE = Array.isArray(data)
        ? data
            .filter((r) => r && /^\d{10}$/.test(String(r.code10)))
            .map((r) => ({ code10: String(r.code10), description: String(r.description || '') }))
        : [];
    })();
  }
  await HTS10_LOADING;
}

function sanitizeSeed(raw: string): string {
  const digits = (raw || '').replace(/\D/g, '');
  if (digits.length === 4) return digits + '00'; // pad headings to 6
  // only 6–8 makes sense as a seed
  if (digits.length > 8) return digits.slice(0, 8);
  return digits;
}

export function useRefineCandidates() {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [candidates, setCandidates] = useState<RefineCandidate[]>([]);

  const closeRefine = useCallback(() => setIsOpen(false), []);

  const openRefine = useCallback(async (hsSeed: string) => {
    const seed = sanitizeSeed(hsSeed);
    // open immediately so the modal shows the spinner
    setIsOpen(true);
    setLoading(true);
    try {
      // need at least 6 digits to find 10-digit children
      if (seed.length < 6) {
        setCandidates([]);
        return;
      }
      await ensureHtsLoaded();
      const src = HTS10_CACHE || [];

      // smarter prefix match:
      // - if seed is 8 digits → match first 8
      // - if seed is 6 digits and ends with '00' (padded 4-digit) → match first 4
      // - else if seed is 6 digits (real 6) → match first 6
      // - otherwise no match
      let prefix = '';
      if (seed.length >= 8) {
        prefix = seed.slice(0, 8);
      } else if (seed.length === 6) {
        prefix = seed.endsWith('00') ? seed.slice(0, 4) : seed.slice(0, 6);
      }
      const matches = prefix
        ? src.filter((r) => r.code10.startsWith(prefix))
        : [];

      // adjust confidence to reflect prefix length:
      const conf =
        prefix.length >= 8 ? 0.98 :
        prefix.length === 6 ? 0.95 :
        prefix.length === 4 ? 0.80 :
        0.5;

      // map + light sort by description length (often "cleaner" first), then code
      const mapped: RefineCandidate[] = matches
        .map((m) => ({
          code10: m.code10,
          description: m.description,
          confidence: conf
        }))
        .sort((a, b) =>
          a.description.length === b.description.length
            ? a.code10.localeCompare(b.code10)
            : a.description.length - b.description.length
        )
        .slice(0, 25); // keep it tidy

      setCandidates(mapped);
    } catch (e) {
      console.error('[refine] load/filter failed', e);
      setCandidates([]);
    } finally {
      setLoading(false);
    }
  }, []);

  return useMemo(
    () => ({ candidates, loading, isOpen, openRefine, closeRefine }),
    [candidates, loading, isOpen, openRefine, closeRefine]
  );
}
