// src/app/estimate/page.tsx
'use client';

import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import CountrySelect from '@/components/CountrySelect';
import { findCountryByCode } from '@/lib/countries';

/* --------------------------------
   Page wrapper (Suspense required)
----------------------------------*/
export default function EstimatePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-indigo-50 flex items-center justify-center px-6">
          <div className="max-w-xl w-full bg-white p-6 rounded-2xl shadow ring-1 ring-black/5 text-sm text-gray-600">
            Loading estimator…
          </div>
        </div>
      }
    >
      <EstimateClient />
    </Suspense>
  );
}

/* -----------------------
   Types (two API shapes)
------------------------*/
type Resolution = 'none' | 'dict' | 'numeric' | 'hts';

type RateComponent =
  | { kind: 'pct'; value: number } // 0.05 = 5%
  | { kind: 'amount'; value: number; per: string };

type DetailedApiResult = {
  duty: number | null;
  rate: number | null; // 0.05 = 5%
  rateType: 'advalorem' | 'specific' | 'compound' | null;
  components: RateComponent[];
  resolution: Resolution;
  breakdown: {
    product: string | null;
    country: string | null; // name or code
    price: number | null;
    hsCode?: string | null;
    hsCodeFormatted?: string | null;
    description?: string | null;
    qty?: number | null;
    weightKg?: string | number | null;
  };
  alternates?: Array<{
    hsCode: string;
    hsCodeFormatted?: string | null;
    description: string;
    rate: number | null;
    rateType: 'advalorem' | 'specific' | 'compound';
  }>;
  notes?: string[];
};

type SimpleAlternate = { hsCode: string; description: string; dutyRate: number };
type SimpleApiResult = {
  hsCode: string;
  description: string;
  dutyRate: number; // 0.05 = 5%
  dutyUsd: number;
  notes?: string[];
  alternates?: SimpleAlternate[];
};

type ViewAlt = {
  hsCode: string;
  hsCodeFormatted?: string | null;
  description: string;
  rate: number | null;
  rateType: 'advalorem' | 'specific' | 'compound' | null;
};

type ViewModel = {
  duty: number | null;
  rate: number | null; // 0.05 = 5%
  rateType: 'advalorem' | 'specific' | 'compound' | null;
  components?: RateComponent[];
  resolution: Resolution;
  breakdown: {
    product: string | null;
    country: string | null;
    price: number | null;
    hsCode?: string | null;
    hsCodeFormatted?: string | null;
    description?: string | null;
    qty?: number | null;
    weightKg?: string | number | null;
  };
  notes?: string[];
  alternates?: ViewAlt[];
};

/* -----------------------
   Small UI helpers
------------------------*/
const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
});

const titleCase = (s: string) =>
  s
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1).toLowerCase() : ''))
    .join(' ');

const rateToText = (rate: number | null | undefined) => {
  if (rate === 0) return 'Free';
  if (rate == null) return '—';
  const pct = rate * 100;
  return `${pct.toFixed(pct < 1 ? 2 : 1)}%`;
};

const componentsText = (components?: RateComponent[]) =>
  !components?.length
    ? '—'
    : components
        .map((c) => (c.kind === 'pct' ? `${(c.value * 100).toFixed(2)}%` : `$${c.value}/${c.per}`))
        .join(' + ');

/* -----------------------------------
   Toast + SourcePill
------------------------------------*/
function Toast({
  kind,
  message,
  onClose,
}: {
  kind: 'success' | 'error';
  message: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const id = setTimeout(onClose, 2500);
    return () => clearTimeout(id);
  }, [onClose]);
  const base = 'fixed top-4 right-4 z-50 rounded-md px-4 py-2 shadow text-sm';
  const style = kind === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white';
  return <div className={`${base} ${style}`}>{message}</div>;
}

type SourceLabel = 'usitc' | 'local' | 'none';
const sourceFromResolution = (r: Resolution): SourceLabel =>
  r === 'dict' ? 'local' : r === 'none' ? 'none' : 'usitc';

function SourcePill({ source }: { source: SourceLabel }) {
  const map: Record<SourceLabel, { label: string; cls: string }> = {
    usitc: { label: 'USITC', cls: 'bg-blue-100 text-blue-700' },
    local: { label: 'Local', cls: 'bg-gray-100 text-gray-700' },
    none: { label: 'No rate', cls: 'bg-amber-100 text-amber-800' },
  };
  const s = map[source];
  return (
    <span className={`ml-2 rounded-full text-[11px] px-2 py-0.5 align-middle ${s.cls}`}>
      {s.label}
    </span>
  );
}

/* -----------------------
   HS sanitizing & formatting
------------------------*/
function formatHsCode(code: string): string {
  const digits = code.replace(/\D/g, '');
  if (digits.length === 6) return digits.replace(/(\d{4})(\d{2})/, '$1.$2');
  if (digits.length === 8) return digits.replace(/(\d{4})(\d{2})(\d{2})/, '$1.$2.$3');
  if (digits.length === 10) return digits.replace(/(\d{4})(\d{2})(\d{4})/, '$1.$2.$3');
  return code;
}
function sanitizeHS(raw: string) {
  const groups = raw.match(/\d+/g) || [];
  const digits = groups.join('');
  if (digits.length <= 10) return digits;
  const first6 = digits.slice(0, 6);
  const last4 = digits.slice(-4);
  const candidate = `${first6}${last4}`;
  if (candidate.length === 10) return candidate;
  return digits.slice(0, 10);
}
function isValidHS(raw: string) {
  const d = sanitizeHS(raw);
  return d.length === 6 || d.length === 8 || d.length === 10;
}

/* -----------------------
   Type guards & normalize
------------------------*/
function isDetailed(x: unknown): x is DetailedApiResult {
  return !!x && typeof x === 'object' && 'breakdown' in (x as any) && 'resolution' in (x as any);
}
function isSimple(x: unknown): x is SimpleApiResult {
  return !!x && typeof x === 'object' && 'hsCode' in (x as any) && 'dutyUsd' in (x as any);
}

function normalizeResult(
  res: DetailedApiResult | SimpleApiResult,
  input: {
    product: string;
    country: string;
    unitPrice: number;
    qty?: number | null;
    weightKg?: number | null;
  },
): ViewModel {
  if (isDetailed(res)) {
    return {
      duty: res.duty ?? null,
      rate: res.rate ?? null,
      rateType: res.rateType ?? null,
      components: res.components,
      resolution: res.resolution ?? 'none',
      breakdown: {
        product: res.breakdown.product ?? input.product,
        country: res.breakdown.country ?? input.country,
        price: res.breakdown.price ?? input.unitPrice,
        hsCode: res.breakdown.hsCode ?? undefined,
        hsCodeFormatted: res.breakdown.hsCodeFormatted ?? undefined,
        description: res.breakdown.description ?? undefined,
        qty: res.breakdown.qty ?? input.qty ?? undefined,
        weightKg: res.breakdown.weightKg ?? input.weightKg ?? undefined,
      },
      notes: res.notes ?? [],
      alternates: res.alternates?.map((a) => ({
        hsCode: a.hsCode,
        hsCodeFormatted: a.hsCodeFormatted ?? undefined,
        description: a.description,
        rate: a.rate,
        rateType: a.rateType ?? 'advalorem',
      })),
    };
  }

  // Simple shape
  return {
    duty: res.dutyUsd ?? null,
    rate: res.dutyRate ?? null,
    rateType: 'advalorem',
    components: res.dutyRate != null ? [{ kind: 'pct', value: res.dutyRate }] : [],
    resolution: /^\d{6,10}$/.test(res.hsCode) ? 'numeric' : 'hts',
    breakdown: {
      product: input.product,
      country: input.country,
      price: input.unitPrice,
      hsCode: res.hsCode,
      hsCodeFormatted: undefined,
      description: res.description,
      qty: input.qty ?? undefined,
      weightKg: input.weightKg ?? undefined,
    },
    notes: res.notes ?? [],
    alternates: res.alternates?.map((a) => ({
      hsCode: a.hsCode,
      hsCodeFormatted: undefined,
      description: a.description,
      rate: a.dutyRate,
      rateType: 'advalorem',
    })),
  };
}

/* -----------------------
   Country-based base rates (demo)
------------------------*/
const BASE_BY_ORIGIN: Record<string, number> = {
  CN: 0, // handled by Section 301 overlay
  CA: 0.0,
  MX: 0.0,
  JP: 0.0,
  VN: 0.0,
  OTHER: 0.0,
};

/** Apply a simple base rate override if API/enrich returned none. */
function applyOverrides(viewIn: ViewModel, originAlpha2: string | null | undefined): ViewModel {
  const v: ViewModel = JSON.parse(JSON.stringify(viewIn));
  if (v.rate != null) return v;

  const code = (originAlpha2 || '').toUpperCase();
  const overrideBase = BASE_BY_ORIGIN[code] ?? BASE_BY_ORIGIN.OTHER;

  v.rate = overrideBase;
  v.rateType = 'advalorem';
  v.components = [{ kind: 'pct', value: overrideBase }];
  if (v.resolution === 'none') v.resolution = 'dict';

  const price = Number(v.breakdown.price ?? 0);
  const qty =
    v.breakdown.qty != null &&
    Number.isFinite(Number(v.breakdown.qty)) &&
    Number(v.breakdown.qty) > 0
      ? Number(v.breakdown.qty)
      : 1;
  v.duty = price * qty * overrideBase;

  return v;
}

/* -----------------------
   China overlay (Section 301 demo)
------------------------*/
// demo list; add more as you wish (supports 6, 8, 10 digits)
const CHINA_EXTRAS: Record<string, number> = {
  // Laptops
  '847130': 0.25,
  '84713000': 0.25,
  '8471300000': 0.25,

  // Handbags (leather) – use the 4202.22 family to match 4202.22.1500
  '420222': 0.075,
  '42022200': 0.075,
  '4202221500': 0.075,

  // Sports footwear w/ plastic/rubber soles
  '640411': 0.25,
  '64041100': 0.25,
  '6404110000': 0.25,
};

/** Country check (accepts code 'CN' or name containing 'china') */
function isChina(code?: string | null, name?: string | null) {
  if (!code && !name) return false;
  const cc = (code || '').trim().toUpperCase();
  const nn = (name || '').trim().toLowerCase();
  return cc === 'CN' || nn.includes('china');
}

/** Find the best extra rate for an HS code by trying 10 -> 8 -> 6 digits */
function extraForHs(hs?: string | null): number {
  const d = (hs || '').replace(/\D/g, '');
  if (!d) return 0;
  return CHINA_EXTRAS[d] ?? CHINA_EXTRAS[d.slice(0, 8)] ?? CHINA_EXTRAS[d.slice(0, 6)] ?? 0;
}

/** Recompute duty from view, given a percentage rate */
function recomputeDutyFrom(view: ViewModel, rate: number | null): number | null {
  if (rate == null) return null;
  const price = Number(view.breakdown.price ?? 0);
  const qty =
    view.breakdown.qty != null &&
    Number.isFinite(Number(view.breakdown.qty)) &&
    Number(view.breakdown.qty) > 0
      ? Number(view.breakdown.qty)
      : 1;
  return price * qty * rate;
}

/** Mutates a clone of the view to add China overlay when applicable */
function applyChinaOverlay(viewIn: ViewModel): ViewModel {
  const v: ViewModel = JSON.parse(JSON.stringify(viewIn)); // deep-ish clone

  // Only apply when origin is China
  const originIsChina = isChina((v.breakdown.country || '').slice(0, 2), v.breakdown.country || '');
  if (!originIsChina) return v;

  // Look up extra via 10 -> 8 -> 6 fallback
  const hsRaw = (v.breakdown.hsCode || '').replace(/\D/g, '');
  const extra = extraForHs(hsRaw);
  if (!extra) return v;

  // Use base % if provided, else 0
  const basePct = v.rate ?? 0;
  const newPct = basePct + extra;

  // Update components and rate
  const comps = Array.isArray(v.components) ? [...v.components] : [];
  comps.push({ kind: 'pct', value: extra });
  v.components = comps;
  v.rate = newPct;

  // Recompute duty using the updated % (even if base was 0 / 'Free')
  v.duty = recomputeDutyFrom(v, newPct);

  // Add a note
  const notes = Array.isArray(v.notes) ? [...v.notes] : [];
  notes.push(`Additional Section 301 duty applied for origin China: ${(extra * 100).toFixed(1)}%.`);
  v.notes = notes;

  return v;
}

/* -----------------------
   API helpers (with 8->10 fallback)
------------------------*/
async function callEstimate(payload: Record<string, unknown>) {
  const res = await fetch('/api/estimate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  let data: unknown = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(text || `Request failed: ${res.status}`);
  }
  if (!res.ok) throw new Error((data as any)?.error || text || 'Request failed');
  return data as DetailedApiResult | SimpleApiResult;
}

async function estimateWithEightToTenFallback(code: string, basePayload: Record<string, unknown>) {
  const run = (hs: string) => callEstimate({ ...basePayload, query: hs, input: hs, product: hs });

  let raw = await run(code);

  if (code.length === 8 && isDetailed(raw) && raw.resolution === 'none') {
    const padded = `${code}00`;
    try {
      const raw2 = await run(padded);
      if (!isDetailed(raw2) || raw2.resolution !== 'none') {
        return { raw: raw2, code: padded };
      }
    } catch {
      /* ignore */
    }
  }
  return { raw, code };
}

/* ---------------------------------------------------
   Fallback: enrich view using /api/hs/search
----------------------------------------------------*/
async function enrichFromHsSearch(
  view: ViewModel,
  usedCode: string,
  prefilledDesc?: string,
): Promise<ViewModel> {
  const q = (usedCode || '').replace(/\D/g, '');
  if (!q || q.length < 6) return view;

  try {
    const r = await fetch(`/api/hs/search?q=${encodeURIComponent(q)}`, { cache: 'no-store' });
    if (!r.ok) return view;
    const j = await r.json();
    const hit = Array.isArray(j.hits) && j.hits.length ? j.hits[0] : null;
    if (!hit) return view;

    const pct = typeof hit.mfn_advalorem === 'number' ? hit.mfn_advalorem / 100 : null;

    const v: ViewModel = JSON.parse(JSON.stringify(view));
    v.breakdown.hsCode = hit.code.replace(/\D/g, '').slice(0, 10);
    v.breakdown.hsCodeFormatted = hit.code;
    if (!v.breakdown.description)
      v.breakdown.description = hit.description || prefilledDesc || undefined;
    v.rate = pct;
    v.rateType = pct != null ? 'advalorem' : null;
    v.components = pct != null ? [{ kind: 'pct', value: pct }] : [];
    if (v.resolution === 'none') v.resolution = 'hts';

    v.duty = pct != null ? recomputeDutyFrom(v, pct) : null;

    return v;
  } catch {
    return view;
  }
}

/* -----------------------
   Main client component
------------------------*/
function EstimateClient() {
  const search = useSearchParams();
  const router = useRouter();

  // from landing/manual
  const preHs = search.get('hs') ?? '';
  const preDesc = search.get('desc') ?? '';
  const preSource = search.get('source') ?? '';

  const focusedFromPrefill = useRef(false);

  // HS input (raw as typed)
  const [hsInput, setHsInput] = useState<string>(preHs || '');
  const [prefilledDesc, setPrefilledDesc] = useState<string>(preDesc);

  const priceInputRef = useRef<HTMLInputElement | null>(null);

  // Price, country, qty, weight
  const [price, setPrice] = useState<string>(
    search.get('price') ??
      (typeof window !== 'undefined' ? (localStorage.getItem('est_price') ?? '') : ''),
  );

  const seededCode = useMemo(() => {
    const fromQuery = search.get('origin') || search.get('originCountryCode');
    return (fromQuery || '').toUpperCase();
  }, [search]);
  const [countryCode, setCountryCode] = useState<string>(seededCode || '');

  const countryName = useMemo(
    () => (countryCode ? (findCountryByCode(countryCode)?.name ?? '') : ''),
    [countryCode],
  );

  const [qty, setQty] = useState<string>(
    search.get('qty') ??
      (typeof window !== 'undefined' ? (localStorage.getItem('est_qty') ?? '') : ''),
  );
  const [weightKg, setWeightKg] = useState<string>(
    search.get('weightKg') ??
      (typeof window !== 'undefined' ? (localStorage.getItem('est_weight') ?? '') : ''),
  );

  const [loading, setLoading] = useState(false);
  const [autoUpdating, setAutoUpdating] = useState(false);
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; msg: string } | null>(null);
  const [view, setView] = useState<ViewModel | null>(null);
  const [calcTime, setCalcTime] = useState<string>('');

  const priceNum = useMemo(() => Number(price), [price]);
  const qtyNum = useMemo(() => (qty === '' ? null : Number(qty)), [qty]);
  const weightNum = useMemo(() => (weightKg === '' ? null : Number(weightKg)), [weightKg]);

  const hsDigits = useMemo(() => sanitizeHS(hsInput), [hsInput]);
  const hsValid = useMemo(() => isValidHS(hsInput), [hsInput]);

  const hasCountry = countryCode.trim().length === 2;

  const canSubmit =
    hsValid &&
    hasCountry &&
    Number.isFinite(priceNum) &&
    price !== '' &&
    priceNum >= 0 &&
    !loading &&
    !autoUpdating;

  // Focus price when arriving prefilled
  useEffect(() => {
    if (focusedFromPrefill.current) return;
    const cameFromPrefill = preHs && (preSource === 'landing' || preSource === 'manual');
    if (cameFromPrefill) {
      setHsInput(preHs);
      if (preDesc) setPrefilledDesc(preDesc);
      setTimeout(() => priceInputRef.current?.focus(), 50);
      if (preSource) setToast({ kind: 'success', msg: `HS ${formatHsCode(preHs)} prefilled` });
      focusedFromPrefill.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preHs, preDesc, preSource]);

  // persist locals
  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem('est_country_code', countryCode ?? '');
    if (price !== '') localStorage.setItem('est_price', String(priceNum));
    if (qty !== '') localStorage.setItem('est_qty', String(qtyNum));
    if (weightKg !== '') localStorage.setItem('est_weight', String(weightNum));
  }, [countryCode, price, priceNum, qty, qtyNum, weightKg, weightNum]);

  // shareable URL
  useEffect(() => {
    const params = new URLSearchParams();
    if (hsValid) params.set('hs', hsDigits);
    if (prefilledDesc) params.set('desc', prefilledDesc);
    if (countryName) params.set('country', countryName);
    if (countryCode.trim()) params.set('origin', countryCode.trim());
    if (Number.isFinite(priceNum) && price !== '') params.set('price', String(priceNum));
    if (qtyNum != null && Number.isFinite(qtyNum)) params.set('qty', String(qtyNum));
    if (weightNum != null && Number.isFinite(weightNum)) params.set('weightKg', String(weightNum));
    const qs = params.toString();
    router.replace(`/estimate${qs ? `?${qs}` : ''}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hsValid, hsDigits, prefilledDesc, countryName, countryCode, priceNum, qtyNum, weightNum]);

  /* -----------------------
     Submit handler
  ------------------------*/
  async function handleEstimate(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setView(null);
    try {
      setLoading(true);
      const basePayload = {
        originCountry: countryName || undefined,
        originCountryCode: countryCode || undefined,
        country: countryName || undefined,
        unitPriceUsd: Number(priceNum),
        price: priceNum,
        quantity: qtyNum ?? undefined,
        qty: qtyNum ?? undefined,
        unitWeightKg: weightNum ?? undefined,
        weightKg: weightNum ?? undefined,
      };

      let code = hsDigits;
      let { raw, code: usedCode } = await estimateWithEightToTenFallback(code, basePayload);
      code = usedCode;

      let normalized = normalizeResult(raw, {
        product: code,
        country: countryName || countryCode,
        unitPrice: priceNum,
        qty: qtyNum,
        weightKg: weightNum ?? undefined,
      });

      if (prefilledDesc && !normalized.breakdown.description) {
        normalized.breakdown.description = prefilledDesc;
      }

      if (normalized.rate == null || normalized.resolution === 'none') {
        normalized = await enrichFromHsSearch(normalized, code, prefilledDesc || undefined);
      }

      normalized = applyOverrides(normalized, countryCode);
      normalized = applyChinaOverlay(normalized);

      setView(normalized);
      setCalcTime(new Date().toLocaleString());
      setToast({ kind: 'success', msg: 'Estimate ready' });
    } catch (err: unknown) {
      setToast({
        kind: 'error',
        msg: err instanceof Error ? err.message : 'Couldn’t get an estimate',
      });
    } finally {
      setLoading(false);
    }
  }

  /* -----------------------
     Auto-rerun
  ------------------------*/
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!view) return;
    if (!hsValid || !hasCountry || !(Number.isFinite(priceNum) && price !== '')) return;

    setAutoUpdating(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const basePayload = {
          originCountry: countryName || undefined,
          originCountryCode: countryCode || undefined,
          country: countryName || undefined,
          unitPriceUsd: Number(priceNum),
          price: priceNum,
          quantity: qtyNum ?? undefined,
          qty: qtyNum ?? undefined,
          unitWeightKg: weightNum ?? undefined,
          weightKg: weightNum ?? undefined,
        };

        const startCode = (view.breakdown.hsCode || hsDigits).replace(/\D/g, '');
        const { raw, code: usedCode } = await estimateWithEightToTenFallback(
          startCode,
          basePayload,
        );

        let normalized = normalizeResult(raw, {
          product: usedCode,
          country: countryName || countryCode,
          unitPrice: priceNum,
          qty: qtyNum,
          weightKg: weightNum ?? undefined,
        });

        if (prefilledDesc && !normalized.breakdown.description) {
          normalized.breakdown.description = prefilledDesc;
        }

        if (normalized.rate == null || normalized.resolution === 'none') {
          normalized = await enrichFromHsSearch(normalized, usedCode, prefilledDesc || undefined);
        }

        normalized = applyOverrides(normalized, countryCode);
        normalized = applyChinaOverlay(normalized);

        setView(normalized);
        setCalcTime(new Date().toLocaleString());
      } catch (e: unknown) {
        setToast({ kind: 'error', msg: e instanceof Error ? e.message : 'Auto-update failed' });
      } finally {
        setAutoUpdating(false);
      }
    }, 400);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qtyNum, weightNum, priceNum, countryCode]);

  /* -----------------------
     Use alternate HS
  ------------------------*/
  async function selectAlternate(hsCode: string) {
    try {
      setHsInput(hsCode);
      setPrefilledDesc('');
      setLoading(true);

      const basePayload = {
        originCountry: countryName || undefined,
        originCountryCode: countryCode || undefined,
        country: countryName || undefined,
        unitPriceUsd: Number(priceNum),
        price: priceNum,
        quantity: qtyNum ?? undefined,
        qty: qtyNum ?? undefined,
        unitWeightKg: weightNum ?? undefined,
        weightKg: weightNum ?? undefined,
      };

      const code = sanitizeHS(hsCode);
      const { raw, code: usedCode } = await estimateWithEightToTenFallback(code, basePayload);

      let normalized = normalizeResult(raw, {
        product: usedCode,
        country: countryName || countryCode,
        unitPrice: priceNum,
        qty: qtyNum,
        weightKg: weightNum ?? undefined,
      });

      if (normalized.rate == null || normalized.resolution === 'none') {
        normalized = await enrichFromHsSearch(normalized, usedCode);
      }

      normalized = applyOverrides(normalized, countryCode);
      normalized = applyChinaOverlay(normalized);

      setView(normalized);
      setCalcTime(new Date().toLocaleString());
      const params = new URLSearchParams(window.location.search);
      params.set('hs', usedCode);
      router.replace(`/estimate?${params}`, { scroll: false });
      setToast({ kind: 'success', msg: `Using ${formatHsCode(usedCode)}` });
    } catch (e: unknown) {
      setToast({ kind: 'error', msg: e instanceof Error ? e.message : 'Failed to use alternate' });
    } finally {
      setLoading(false);
    }
  }

  const totalDeclared =
    view?.breakdown?.price != null
      ? (view.breakdown.price ?? 0) *
        (view.breakdown.qty != null &&
        Number.isFinite(view.breakdown.qty) &&
        (view.breakdown.qty as number) > 0
          ? (view.breakdown.qty as number)
          : 1)
      : null;

  const handlePrint = () => window.print();

  return (
    <main className="relative min-h-screen bg-indigo-50 flex items-center justify-center px-6">
      <div className="relative z-10 max-w-xl w-full bg-white p-8 rounded-2xl shadow-xl ring-1 ring-black/5 print:shadow-none print:max-w-none print:w-full print:p-0">
        <h1 className="text-2xl font-bold text-gray-900 mb-6 print:mb-3">Duty Estimator</h1>

        {(preSource === 'landing' || preSource === 'manual') && preHs && (
          <div className="mb-4 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-indigo-900">
            HS code <span className="font-mono">{formatHsCode(preHs)}</span> prefilled
            {prefilledDesc ? ` — ${prefilledDesc}` : ''}.
          </div>
        )}

        <form onSubmit={handleEstimate} className="space-y-5 print:hidden">
          {/* HS Code only */}
          <div>
            <label className="block text-sm font-medium text-gray-700">
              HS code (6, 8 or 10 digits)
            </label>
            <input
              autoFocus={!preHs}
              type="text"
              placeholder="Enter a 6, 8, or 10-digit HS code"
              value={hsInput}
              onChange={(e) => {
                setHsInput(e.target.value);
                if (preHs) setPrefilledDesc('');
              }}
              className={`mt-1 w-full rounded-lg border px-4 py-2 focus:outline-none focus:ring-2 ${
                hsInput.length === 0 || hsValid
                  ? 'border-gray-300 focus:ring-blue-500'
                  : 'border-red-300 focus:ring-red-500'
              }`}
            />
            {prefilledDesc && (
              <p className="mt-1 text-xs text-gray-600">
                Description: <span className="font-medium">{prefilledDesc}</span>
              </p>
            )}
            {hsInput.length > 0 && !hsValid ? (
              <p className="mt-1 text-xs text-red-600">
                HS must be 6, 8, or 10 digits (dots/spaces are OK).
              </p>
            ) : (
              <p className="mt-1 text-xs text-gray-500">Paste a clean HS for best accuracy.</p>
            )}
          </div>

          {/* Price */}
          <div>
            <label className="block text-sm font-medium text-gray-700">Price per unit (USD)</label>
            <div className="mt-1 flex">
              <span className="inline-flex items-center rounded-l-lg border border-r-0 border-gray-300 bg-gray-50 px-3 text-gray-600">
                USD
              </span>
              <input
                ref={priceInputRef}
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                placeholder="e.g., 49.99"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="w-full rounded-r-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Country */}
          <CountrySelect
            value={countryCode || null}
            onChange={(code) => setCountryCode(code ?? '')}
            frequentlyUsed={['CN', 'CA', 'MX', 'JP', 'VN']}
            placeholder="Select a country…"
          />

          {/* Optional qty/weight */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Quantity (units/pairs){' '}
                {autoUpdating && <span className="text-xs text-gray-500">(recalculating…)</span>}
              </label>
              <input
                type="number"
                inputMode="numeric"
                min="0"
                step="1"
                placeholder="optional"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Weight (kg){' '}
                {autoUpdating && <span className="text-xs text-gray-500">(recalculating…)</span>}
              </label>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                placeholder="optional"
                value={weightKg}
                onChange={(e) => setWeightKg(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={!canSubmit}
              className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-white font-medium transition hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                    />
                  </svg>
                  Calculating…
                </>
              ) : (
                'Estimate Duty'
              )}
            </button>

            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(window.location.href);
                setToast({ kind: 'success', msg: 'Link copied' });
              }}
              className="rounded-lg border px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Copy link
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="rounded-lg border px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              title="Save or print a PDF of this estimate"
            >
              Save as PDF
            </button>
          </div>
        </form>

        {/* Result card */}
        {view && (
          <div className="mt-6 rounded-2xl border p-4">
            <h2 className="font-semibold mb-2">Estimated Costs</h2>

            <div className="text-gray-800 space-y-1">
              <div>
                HS code:{' '}
                <span className="font-mono">
                  {view.breakdown.hsCodeFormatted ||
                    (view.breakdown.hsCode ? formatHsCode(view.breakdown.hsCode) : '—')}
                </span>
                {view.breakdown.description ? <> — {view.breakdown.description}</> : null}
              </div>
              <div>
                Country of origin:{' '}
                <span className="font-medium">
                  {view.breakdown.country ? titleCase(view.breakdown.country) : '—'}
                </span>
              </div>
              <div>
                Importing to: <span className="font-medium">United States</span>
              </div>

              <div>Declared price (per unit): {currency.format(view.breakdown.price ?? 0)}</div>

              {view.breakdown.qty != null && Number.isFinite(view.breakdown.qty) && (
                <div className="text-sm text-gray-700">
                  Total declared value:{' '}
                  {currency.format(
                    (view.breakdown.price ?? 0) *
                      (Number(view.breakdown.qty) > 0 ? Number(view.breakdown.qty) : 1),
                  )}{' '}
                  <span className="text-gray-500">
                    ({currency.format(view.breakdown.price ?? 0)} × {view.breakdown.qty})
                  </span>
                </div>
              )}

              <div className="flex items-center">
                <span>Duty rate: {rateToText(view.rate)}</span>
                <SourcePill source={sourceFromResolution(view.resolution)} />
              </div>

              <div className="text-sm text-gray-600">
                Components: {componentsText(view.components)}
              </div>

              <div className="mt-2 border-t pt-2">
                <span className="text-sm text-gray-600">
                  {currency.format(view.breakdown.price ?? 0)}
                  {view.breakdown.qty != null && Number.isFinite(view.breakdown.qty)
                    ? ` × ${view.breakdown.qty} × ${rateToText(view.rate)} =`
                    : ` × ${rateToText(view.rate)} =`}
                </span>{' '}
                <span className="font-semibold">{currency.format(view.duty ?? 0)}</span>
                {(view.breakdown.qty != null || view.breakdown.weightKg != null) && (
                  <div className="text-sm text-gray-600">
                    (Qty: {view.breakdown.qty ?? '—'}, Weight: {view.breakdown.weightKg ?? '—'} kg)
                  </div>
                )}
              </div>

              {view.rate == null && (
                <div className="mt-3 rounded-lg bg-amber-50 p-3 text-amber-900 text-sm">
                  No duty rate found for this HS. Double-check the HS (6–10 digits) or try a nearby
                  HS using HS Lookup.
                </div>
              )}

              {Array.isArray(view.notes) && view.notes.length > 0 && (
                <div className="mt-3 rounded-lg bg-amber-50 p-3 text-amber-900 text-sm">
                  <ul className="list-disc pl-5 space-y-1">
                    {view.notes.map((n, i) => (
                      <li key={i}>{n}</li>
                    ))}
                  </ul>
                </div>
              )}

              {view.alternates && view.alternates.length > 0 && (
                <div className="mt-4 rounded-lg border p-3 print:hidden">
                  <div className="font-medium mb-2">Other close HTS lines</div>
                  <ul className="space-y-2">
                    {view.alternates.slice(0, 5).map((alt, i) => (
                      <li key={i} className="flex items-start justify-between gap-3">
                        <div className="text-sm">
                          <div className="font-mono">
                            {alt.hsCodeFormatted || formatHsCode(alt.hsCode)}{' '}
                            <span className="text-gray-400">({alt.rateType || 'advalorem'})</span>
                          </div>
                          <div className="text-gray-700">{alt.description}</div>
                          <div className="text-gray-600 text-xs">
                            Rate:{' '}
                            {alt.rate === 0
                              ? 'Free'
                              : alt.rate == null
                                ? '—'
                                : `${(alt.rate * 100).toFixed(2)}%`}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => selectAlternate(alt.hsCode)}
                          className="shrink-0 rounded border px-2 py-1 text-xs hover:bg-gray-50"
                        >
                          Use this
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="mt-6 text-xs text-gray-500 text-center print:mt-2">
          Rates via USITC HTS API. Calculated{' '}
          <span suppressHydrationWarning>{calcTime || '—'}</span>.
          <span className="block">
            May require additional duties (e.g., Section 301/232) depending on origin and program
            eligibility.
          </span>
        </div>
      </div>

      {toast && <Toast kind={toast.kind} message={toast.msg} onClose={() => setToast(null)} />}

      <style jsx global>{`
        @media print {
          body,
          html {
            background: #fff !important;
          }
          .print:hidden {
            display: none !important;
          }
          .print:max-w-none {
            max-width: none !important;
          }
          .print:w-full {
            width: 100% !important;
          }
          .print:p-0 {
            padding: 0 !important;
          }
          .print:mb-3 {
            margin-bottom: 0.75rem !important;
          }
          .print:shadow-none {
            box-shadow: none !important;
          }
        }
      `}</style>
    </main>
  );
}
