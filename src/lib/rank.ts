// src/lib/rank.ts
import type { NormalizedHTSItem, SearchOptions } from './hts';

/** Tunable weights used by the ranking function. */
export type RankingWeights = {
  exactPhrase: number; // strong boost when the exact query phrase appears
  tokenMatch: number; // per token exact match
  fuzzyToken: number; // per token fuzzy (edit distance ≤ 1) match
  titleBoost: number; // multiplier for matches in description/title
  notesBoost: number; // multiplier for matches in notes
  tenDigitBoost: number; // multiplier if item.isTenDigit
  nesoiPenalty: number; // subtract if description has NESOI
  shortDescBoost: number; // multiplier favoring shorter descriptions (specificity)
  chapterBoost: number; // base multiplier; per-chapter overrides come from options.chapterBoosts
};

export const defaultWeights: RankingWeights = {
  exactPhrase: 5.0,
  tokenMatch: 1.6,
  fuzzyToken: 0.6,
  titleBoost: 1.3,
  notesBoost: 1.05,
  tenDigitBoost: 1.4,
  nesoiPenalty: 1.8,
  shortDescBoost: 0.9,
  chapterBoost: 1.0,
};

/** Override some or all ranking weights at runtime. */
export function setWeights(overrides: Partial<RankingWeights>) {
  Object.assign(defaultWeights, overrides);
}

/* ---------------- Helpers ---------------- */

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function hasExactPhrase(hay: string, needle: string) {
  return hay.toLowerCase().includes(needle.toLowerCase());
}

/** true if edit distance ≤ 1 (insert/delete/substitute one char). */
function editDistanceOne(a: string, b: string) {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;

  let i = 0,
    j = 0,
    edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    edits++;
    if (edits > 1) return false;
    if (a.length > b.length)
      i++; // deletion in a
    else if (a.length < b.length)
      j++; // insertion into a
    else {
      i++;
      j++;
    } // substitution
  }
  if (i < a.length || j < b.length) edits++;
  return edits <= 1;
}

/* ---------------- Ranking ---------------- */

/**
 * Compute a relevance score for an HTS item given a query.
 * Accepts readonly arrays so callers can use `as const` without type friction.
 */
export function scoreItem(params: {
  item: NormalizedHTSItem;
  query: string;
  expandedTokens: ReadonlyArray<ReadonlyArray<string>>;
  options: Pick<SearchOptions, 'fuzzyEditsCap' | 'chapterBoosts'>;
  weights?: Partial<RankingWeights>;
}) {
  const { item, query, expandedTokens, options } = params;
  const W = { ...defaultWeights, ...(params.weights ?? {}) };

  const hayTitle = item.description.toLowerCase();
  const hayNotes = (item.notes ?? '').toLowerCase();

  let score = 0;

  // Exact phrase bonus
  if (hasExactPhrase(hayTitle, query)) score += W.exactPhrase * W.titleBoost;
  if (hasExactPhrase(hayNotes, query)) score += W.exactPhrase * (W.notesBoost - 0.3);

  // Token matches (with optional fuzzy)
  const titleTokens = tokenize(hayTitle);
  const notesTokens = tokenize(hayNotes);

  let tokenScore = 0;
  for (const tokens of expandedTokens) {
    for (const t of tokens) {
      const titleHit = titleTokens.some((x) => x === t);
      const notesHit = notesTokens.some((x) => x === t);
      if (titleHit) tokenScore += W.tokenMatch * W.titleBoost;
      else if (notesHit) tokenScore += W.tokenMatch * W.notesBoost;
      else if ((options.fuzzyEditsCap ?? 1) > 0) {
        const fuzzyHit =
          titleTokens.some((x) => editDistanceOne(x, t)) ||
          notesTokens.some((x) => editDistanceOne(x, t));
        if (fuzzyHit) tokenScore += W.fuzzyToken;
      }
    }
  }
  score += tokenScore;

  // Structural boosts/penalties
  if (item.isTenDigit) score *= W.tenDigitBoost;
  if (item.hasNESOI) score -= W.nesoiPenalty;

  // Favor shorter (often more specific) descriptions
  const len = titleTokens.length;
  const shortFactor = Math.max(0.7, Math.min(1.15, 1.15 - len / 30));
  score *= W.shortDescBoost * shortFactor;

  // Chapter boost (from caller-provided map)
  const chapterMul = options.chapterBoosts?.[item.chapter] ?? 1.0;
  score *= W.chapterBoost * chapterMul;

  // Tiny nudge for deterministic ordering across ties
  const tiny = parseInt(item.hsCode10.slice(-2), 10) / 1000;
  score += tiny;

  return score;
}
