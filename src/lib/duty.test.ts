import { parseGeneralRateRich, computeDutyUSD } from '@/lib/duty';

describe('computeDutyUSD', () => {
  it('calculates simple ad valorem (2%)', () => {
    const duty = computeDutyUSD({
      components: [{ kind: 'pct', value: 0.02 }],
      priceUSD: 50,
      qty: 10,
      weightKg: null,
      notes: [],
    });
    expect(duty).toBeCloseTo(10, 2); // 50 * 10 * 0.02
  });

  it('handles $/kg specific duty', () => {
    const duty = computeDutyUSD({
      components: [{ kind: 'amount', value: 1, per: 'kg' }],
      priceUSD: 20,
      qty: 3,
      weightKg: 2.5,
      notes: [],
    });
    expect(duty).toBeCloseTo(2.5, 2); // 1 * 2.5kg
  });

  it('handles compound: % + $/kg + $/pair', () => {
    const duty = computeDutyUSD({
      components: [
        { kind: 'pct', value: 0.02 },
        { kind: 'amount', value: 1, per: 'kg' },
        { kind: 'amount', value: 0.12, per: 'pair' },
      ],
      priceUSD: 50,
      qty: 10,
      weightKg: 2.5,
      notes: [],
    });
    // 50*10*0.02 = 10, + 1*2.5 = 2.5, + 0.12*10 = 1.2 → 13.7
    expect(duty).toBeCloseTo(13.7, 2);
  });
});

describe('parseGeneralRateRich + computeDutyUSD', () => {
  const dutyFrom = (raw: string, price: number, qty?: number | null, kg?: number | null) => {
    const rich = parseGeneralRateRich(raw);
    if (!rich) throw new Error('Parse failed for: ' + raw);
    return computeDutyUSD({
      components: rich.components,
      priceUSD: price,
      qty: qty ?? null,
      weightKg: kg ?? null,
      notes: [],
    });
  };

  it('parses Free', () => {
    expect(dutyFrom('Free', 50, 5, 1)).toBeCloseTo(0, 2);
  });

  it('parses percent with footnote marker', () => {
    expect(dutyFrom('2%*', 100, 1, 0)).toBeCloseTo(2, 2);
  });

  it('parses $/doz. pr. as per pair ÷ 12', () => {
    // 20¢/doz. pr. = 0.20/12 per pair; qty 24 -> 0.40
    expect(dutyFrom('20¢/doz. pr.', 100, 24, 0)).toBeCloseTo(0.4, 2);
  });

  it('parses gross (÷144)', () => {
    // 2% + $0.50/gross, price=10, qty=144:
    // 10*144*0.02 = 28.8; + 0.50*(144/144) = 0.5 → 29.3
    expect(dutyFrom('2% + $0.50/gross', 10, 144, 0)).toBeCloseTo(29.3, 2);
  });
});
