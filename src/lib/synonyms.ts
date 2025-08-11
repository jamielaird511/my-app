// src/lib/synonyms.ts
// Lightweight query expansions + a couple typo corrections.
// Keep tiny and focused; add more as you see real queries.

const table: Record<string, string[]> = {
  sneakers: ['trainers', 'running shoes', 'athletic shoes', 'tennis shoes'],
  trainers: ['sneakers', 'running shoes', 'athletic shoes'],
  'running shoes': ['sneakers', 'athletic shoes'],
  'safety footwear': ['protective footwear', 'safety shoes', 'steel toe'],
  'golf shoes': ['golf footwear', 'sports footwear'],
  'work boots': ['safety footwear', 'protective footwear'],
};

const typoMap: Record<string, string> = {
  snekaers: 'sneakers',
};

function unique(arr: string[]) {
  return Array.from(new Set(arr));
}

export function expandQuery(q: string): string[] {
  const base = q.trim().toLowerCase();
  const corrected = typoMap[base] ?? base;
  const expansions = table[corrected] ?? [];
  return unique([corrected, ...expansions]);
}
