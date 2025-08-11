import { normalizeUSITCItem, dedupeAndPaginate } from '@/lib/hts';

const raw = {
  htsno: '6404110000',
  htsnoFormatted: '6404.11.0000',
  description: 'Sports footwear',
  general_rate: '8.5%',
};

test('normalizes USITC payload', () => {
  const n = normalizeUSITCItem(raw as any);
  expect(n.hsCode10).toBe('6404110000');
  expect(n.hsCodeShown).toBe('6404.11.0000');
  expect(n.chapter).toBe(64);
  expect(n.rateType).toBe('advalorem');
  expect(n.components[0]).toEqual({ kind: 'advalorem', pct: 8.5 });
});

test('dedupes by code+desc and paginates', () => {
  const a = normalizeUSITCItem(raw as any);
  const b = normalizeUSITCItem({ ...raw } as any);
  const { items, total } = dedupeAndPaginate([a, b], { limit: 50, offset: 0 });
  expect(total).toBe(1);
  expect(items.length).toBe(1);
});
