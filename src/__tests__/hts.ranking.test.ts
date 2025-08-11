// If your tsconfig doesn't have "@/..." alias, change these to:
// import { scoreItem, defaultWeights } from "../../lib/rank";
// import type { NormalizedHTSItem } from "../../lib/hts";
import { scoreItem, defaultWeights } from '@/lib/rank';
import type { NormalizedHTSItem } from '@/lib/hts';

const baseItem: NormalizedHTSItem = {
  hsCode10: '6404110000',
  hsCodeShown: '6404.11.0000',
  chapter: 64,
  description: 'Sports footwear; training shoes',
  notes: '',
  rateType: 'advalorem',
  components: [{ kind: 'advalorem', pct: 8.5 }],
  rawGeneral: '8.5%',
  isTenDigit: true,
  hasNESOI: false,
  sourceUrl: '',
};

function mk(overrides: Partial<NormalizedHTSItem> = {}) {
  const item: NormalizedHTSItem = { ...baseItem, ...overrides };
  return {
    item,
    query: 'running shoes',
    expandedTokens: [['running', 'shoes']],
    options: { fuzzyEditsCap: 1 as const, chapterBoosts: { 64: 1.2 } },
    weights: defaultWeights,
  } as const;
}

test('exact phrase outranks token-only matches', () => {
  const exact = mk({ description: 'Running shoes; training footwear' });
  const tokeny = mk({ description: 'Shoes, footwear for running' });
  expect(scoreItem(exact)).toBeGreaterThan(scoreItem(tokeny));
});

test('10-digit gets a boost', () => {
  const ten = mk();
  const eight = mk({ isTenDigit: false });
  expect(scoreItem(ten)).toBeGreaterThan(scoreItem(eight));
});

test('NESOI is penalized', () => {
  const good = mk();
  const nesoi = mk({ description: 'Footwear, NESOI', hasNESOI: true });
  expect(scoreItem(good)).toBeGreaterThan(scoreItem(nesoi));
});

test('chapter boost applies', () => {
  const boosted = mk();
  const noBoost = { ...mk(), options: { fuzzyEditsCap: 1 as const, chapterBoosts: {} } };
  expect(scoreItem(boosted)).toBeGreaterThan(scoreItem(noBoost));
});
