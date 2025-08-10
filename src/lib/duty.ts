/* eslint-disable @typescript-eslint/no-explicit-any */

/** ---------- Types ---------- */
export type RateComponent =
  | { kind: 'pct'; value: number } // 0.05 = 5%
  | { kind: 'amount'; value: number; per: string }; // $ per <unit> (kg, pair, doz, gross, unit)

export type RateType = 'advalorem' | 'specific' | 'compound';

export type HtsMini = {
  hsCode: string;
  description: string;
  rate: number | null; // first ad-valorem % if present ("Free" => 0)
  rateType: RateType;
  components: RateComponent[]; // all parsed components from General rate
  _rawGeneral?: string; // raw HTS “General rate of duty”
};

/** ---------- Small helpers (shared) ---------- */
export function normalizeNumeric(input: string): string {
  const digits = (input || '').replace(/\D+/g, '');
  if (!digits) return '';
  if (digits.length >= 10) return digits.slice(0, 10);
  return digits.padEnd(10, '0');
}
export function looksNumeric(input: string): boolean {
  return /\d/.test(input) && input.replace(/\D+/g, '').length >= 6;
}
export function is10Digit(code: string) {
  return /^\d{10}$/.test(code);
}
export function formatHs(hs: string | null | undefined): string | null {
  if (!hs) return null;
  let d = String(hs).replace(/\D+/g, '');
  if (!d) return null;
  if (d.length < 10) d = d.padEnd(10, '0');
  return `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6, 10)}`;
}

/** ---------- Parser: HTS “General rate of duty” ---------- */
/**
 * Supports:
 * - "Free" → { pct: 0 }
 * - Percentages: "5%", "2.5% ad val." (tolerant of footnotes like 2%*)
 * - $/kg, $/g (→ $/kg), $/lb (→ $/kg)
 * - $/pair, $/pr, $/prs
 * - $/doz. pr., $/dozen pr., $/dz pr. (→ $/pair ÷ 12)
 * - $/doz., $/dozen, $/dz
 * - $/gross (→ per unit ÷ 144)
 * - Cents versions: "7.5¢/kg", "2 c per doz. pr."
 * - “per” wording: "$1 per kg", "2 c per doz. pr."
 */
export function parseGeneralRateRich(
  text?: string | null,
): { type: RateType; components: RateComponent[]; raw: string } | null {
  if (!text) return null;
  const raw = String(text);
  const t = raw.replace(/\s+/g, ' ').trim();

  // Free
  if (/^free\b/i.test(t)) {
    return { type: 'advalorem', components: [{ kind: 'pct', value: 0 }], raw };
  }

  const components: RateComponent[] = [];

  // Percentages (tolerant of footnotes like 2%*, 2%†)
  for (const m of t.matchAll(/(\d+(?:\.\d+)?)\s*%/giu)) {
    const v = parseFloat(m[1]);
    if (!Number.isNaN(v)) components.push({ kind: 'pct', value: v / 100 });
  }

  // Helper: push amount by unit norm
  const pushByUnit = (val: number, unitNorm: string) => {
    // weight → kg
    if (/\bkg(s)?\b/.test(unitNorm)) return components.push({ kind: 'amount', value: val, per: 'kg' });
    if (/\bg(ram|ams)?\b/.test(unitNorm)) return components.push({ kind: 'amount', value: val * 1000, per: 'kg' }); // $/g → $/kg
    if (/\b(lb|lbs|pound|pounds)\b/.test(unitNorm)) return components.push({ kind: 'amount', value: val / 0.45359237, per: 'kg' }); // $/lb → $/kg

    // *** IMPORTANT: dozen pairs FIRST ***
    if ((/\b(doz|dozen|dz)\b/.test(unitNorm)) && /\b(pr|prs|pair|pairs)\b/.test(unitNorm)) {
      return components.push({ kind: 'amount', value: val / 12, per: 'pair' });
    }

    // pairs (generic)
    if (/\b(pair|pairs|pr|prs)\b/.test(unitNorm)) {
      return components.push({ kind: 'amount', value: val, per: 'pair' });
    }

    // dozen (generic)
    if (/\b(doz|dozen|dz)\b/.test(unitNorm)) return components.push({ kind: 'amount', value: val, per: 'dozen' });

    // gross (144 units) → per unit ÷ 144
    if (/\bgross\b/.test(unitNorm)) return components.push({ kind: 'amount', value: val / 144, per: 'unit' });

    // each/unit
    if (/\b(no|unit|each|u)\b/.test(unitNorm)) return components.push({ kind: 'amount', value: val, per: 'unit' });

    // fallback: keep raw unit (we’ll warn later)
    components.push({ kind: 'amount', value: val, per: unitNorm });
  };

  // $/unit — allow dots/spaces in unit, e.g., "doz. pr."
  for (const m of t.matchAll(/\$?\s*(\d+(?:\.\d+)?)\s*\/\s*([A-Za-z.\s0-9]+)\b/gi)) {
    const val = parseFloat(m[1]);
    const unitNorm = (m[2] || '').toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ').trim();
    pushByUnit(val, unitNorm);
  }

  // $ per unit
  for (const m of t.matchAll(/\$\s*(\d+(?:\.\d+)?)\s*(?:per)\s*([A-Za-z.\s0-9]+)\b/gi)) {
    const val = parseFloat(m[1]);
    const unitNorm = (m[2] || '').toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ').trim();
    pushByUnit(val, unitNorm);
  }

  // cents with "c" (e.g., "2 c/kg")
  for (const m of t.matchAll(/(\d+(?:\.\d+)?)\s*c\s*(?:per|\/)\s*([A-Za-z.\s0-9]+)\b/gi)) {
    const val = parseFloat(m[1]) / 100;
    const unitNorm = (m[2] || '').toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ').trim();
    pushByUnit(val, unitNorm);
  }

  // cents with ¢
  for (const m of t.matchAll(/(\d+(?:\.\d+)?)\s*¢\s*\/\s*([A-Za-z.\s0-9]+)\b/gi)) {
    const val = parseFloat(m[1]) / 100;
    const unitNorm = (m[2] || '').toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ').trim();
    pushByUnit(val, unitNorm);
  }

  if (!components.length) return null;

  const pctCount = components.filter((c) => c.kind === 'pct').length;
  const amtCount = components.filter((c) => c.kind === 'amount').length;
  const type: RateType =
    pctCount > 0 && amtCount > 0 ? 'compound' : pctCount > 0 ? 'advalorem' : 'specific';

  return { type, components, raw };
}

/** ---------- Duty calculator ---------- */
/** Ad-valorem uses TOTAL shipment value: priceUSD * (qty ?? 1) */
export function computeDutyUSD(args: {
  components: RateComponent[];
  priceUSD: number; // price per unit
  qty?: number | null; // units/pairs
  weightKg?: number | null; // total weight
  notes: string[];
}) {
  const { components, priceUSD } = args;
  let duty = 0;
  const units = args.qty != null && Number.isFinite(args.qty) && args.qty > 0 ? args.qty : 1;

  // ad valorem on total declared value
  for (const c of components) {
    if (c.kind === 'pct') duty += priceUSD * units * c.value;
  }

  // specific components
  for (const c of components) {
    if (c.kind !== 'amount') continue;
    const per = (c.per || '').toLowerCase();

    if (per === 'kg') {
      if (args.weightKg && args.weightKg > 0) duty += c.value * args.weightKg;
      else args.notes.push('This line charges per kilogram. Add weight (kg) to include that part.');
      continue;
    }
    if (per === 'pair' || per === 'unit') {
      if (args.qty && args.qty > 0) duty += c.value * args.qty;
      else args.notes.push(`This line charges per ${per}. Add quantity to include that part.`);
      continue;
    }
    if (per === 'dozen') {
      if (args.qty && args.qty > 0) duty += c.value * (args.qty / 12);
      else args.notes.push('This line charges per dozen. Add quantity (we’ll divide by 12).');
      continue;
    }

    // unknown unit -> warn
    args.notes.push(`Specific duty uses unsupported unit "/${per}" — not included in total yet.`);
  }

  return Number(duty.toFixed(2));
}

/** test-only surface (safe to ship) */
export const __test = { parseGeneralRateRich, computeDutyUSD };
