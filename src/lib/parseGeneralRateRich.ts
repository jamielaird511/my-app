// src/lib/parseGeneralRateRich.ts
// Minimal parser: handles "free" and simple ad valorem "%". Extend as needed.
export function parseGeneralRateRich(raw: string): {
  rateType: 'advalorem' | 'specific' | 'compound' | 'free' | 'other';
  components: any[];
} {
  if (!raw) return { rateType: 'other', components: [{ kind: 'other', raw }] };
  if (/free/i.test(raw)) return { rateType: 'free', components: [{ kind: 'free' }] };
  const m = raw.match(/([\d.]+)\s*%/);
  if (m)
    return { rateType: 'advalorem', components: [{ kind: 'advalorem', pct: parseFloat(m[1]) }] };
  return { rateType: 'other', components: [{ kind: 'other', raw }] };
}
