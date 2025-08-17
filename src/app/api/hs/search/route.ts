import { NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';
import Fuse from 'fuse.js';
import { ALIASES } from '@/data/aliases';

export const runtime = 'nodejs';

type Row = { code10: string; description: string; aliases?: string[] };

let DATA: Row[] | null = null;
let FUSE: Fuse<Row> | null = null;

const to10 = (s: string) => (s || '').replace(/\D/g, '').slice(0, 10);

async function ensureLoaded() {
  if (DATA && FUSE) return;
  const file = path.join(process.cwd(), 'public', 'hts10.json');
  const json = await fs.readFile(file, 'utf8');
  const raw = JSON.parse(json) as any[];

  // Canonicalize rows; accept {code10} or {code}
  const base: Row[] = raw
    .map((r) => {
      const code10 = to10(String(r.code10 ?? r.code ?? ''));
      const description = String(r.description ?? r.desc ?? '');
      const aliases = Array.isArray(r.aliases) ? r.aliases.map(String) : [];
      return code10.length === 10 ? { code10, description, aliases } : null;
    })
    .filter(Boolean) as Row[];

  // Merge alias registry by injecting synonyms into likely prefixes
  const rowsByPrefix = new Map<string, Row[]>();
  for (const r of base) {
    const p4 = r.code10.slice(0, 4);
    const p6 = r.code10.slice(0, 6);
    (rowsByPrefix.get(p4) ?? rowsByPrefix.set(p4, []).get(p4)!).push(r);
    (rowsByPrefix.get(p6) ?? rowsByPrefix.set(p6, []).get(p6)!).push(r);
  }
  for (const a of ALIASES) {
    const words = new Set<string>([
      a.term.toLowerCase(),
      ...(a.synonyms ?? []).map((x) => x.toLowerCase()),
    ]);
    const prefixes = a.hintPrefixes ?? [];
    for (const pref of prefixes) {
      const bucket = rowsByPrefix.get(pref) ?? [];
      for (const row of bucket) {
        const merged = new Set([...(row.aliases || []), ...Array.from(words)]);
        row.aliases = Array.from(merged);
      }
    }
  }

  DATA = base;
  FUSE = new Fuse(DATA, {
    includeScore: true,
    threshold: 0.34, // fairly strict; tune later
    ignoreLocation: true,
    keys: [
      { name: 'description', weight: 0.7 },
      { name: 'aliases',     weight: 0.2 },
      { name: 'code10',      weight: 0.1 },
    ],
  });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get('q') || '').trim();
  if (!q) return NextResponse.json({ hits: [] });

  await ensureLoaded();

  // Prefix logic for digits: prefer children when 4/6/8 provided
  const digits = q.replace(/\D/g, '');
  let hits: Row[] = [];
  if (digits.length >= 4) {
    const prefix =
      digits.length >= 8 ? digits.slice(0, 8) :
      digits.length >= 6 ? digits.slice(0, 6) :
      digits.slice(0, 4);
    const pref = DATA!.filter((r) => r.code10.startsWith(prefix));
    hits = pref.slice(0, 50);
  }

  // Alias-prefix fallback: if text matches a known alias term/synonym,
  // include rows under its hintPrefixes (even if we didn't inject aliases).
  const textLower = q.replace(/\d/g, '').trim().toLowerCase();
  let matchedAliases: any[] = [];
  if (textLower) {
    matchedAliases = ALIASES.filter(a => {
      if (a.term.toLowerCase() === textLower) return true;
      return (a.synonyms ?? []).some(s => s.toLowerCase() === textLower);
    });

    if (matchedAliases.length) {
      const prefixes = new Set<string>();
      for (const a of matchedAliases) for (const p of (a.hintPrefixes ?? [])) prefixes.add(p);
      if (prefixes.size) {
        const aliasRows = DATA!.filter(r => {
          const p4 = r.code10.slice(0, 4);
          const p6 = r.code10.slice(0, 6);
          return prefixes.has(p4) || prefixes.has(p6);
        }).slice(0, 50);
        // merge uniquely (keep any prefix-digit matches first)
        const seen = new Set(hits.map(h => h.code10));
        for (const r of aliasRows) if (!seen.has(r.code10)) { hits.push(r); seen.add(r.code10); }
      }
    }
  }

  const aliasForceRefine = matchedAliases.some(a => a.forceRefine);

  // Text search via Fuse (aliases + description)
  const text = q.replace(/\d/g, '').trim();
  if (text) {
    const fuseRes = FUSE!.search(text, { limit: 50 }).map((r) => r.item);
    const seen = new Set(hits.map((h) => h.code10));
    for (const r of fuseRes) {
      if (!seen.has(r.code10)) {
        hits.push(r);
        seen.add(r.code10);
      }
    }
  }

  // Global heuristics for generic queries (broad, ambiguous, or risky)
  function hasDifferent4Prefixes(rows: Row[]) {
    const set = new Set(rows.slice(0, 3).map(r => r.code10.slice(0, 4)));
    return set.size >= 2;
  }

  const noSpecificDigits = digits.length > 0 && digits.length < 6; // e.g. "64", "640"
  const noDigitsAndShortVagueText = digits.length === 0 && textLower && textLower.split(/\s+/).length <= 2;
  const topIsRisky = hits.length > 0 && (
    /(^|\W)other(\W|$)|\bnesoi\b/i.test(hits[0].description) ||
    /valued over|valued not over|value/i.test(hits[0].description)
  );
  const divergentTop = hasDifferent4Prefixes(hits);

  const isGeneric =
    aliasForceRefine ||
    noSpecificDigits ||
    (noDigitsAndShortVagueText && divergentTop) ||
    (topIsRisky && !/\b(cotton|synthetic|leather|wool|men|women|boys|girls|sports|dress|running|tennis|value|over|under)\b/i.test(textLower || ''));

/* BEGIN REPLACEMENT for output mapping in route.ts */

function flagsFor(desc: string) {
  const d = (desc || '').toLowerCase();
  const flags: string[] = [];
  if (/(^|\W)other(\W|$)|\bnesoi\b/.test(d)) flags.push('other-bucket');
  if (/(valued over|valued not over|value)/.test(d)) flags.push('value-bracket');
  if (/\bmen('|')?s|\bboys'?/.test(d)) flags.push('gender-male');
  if (/\bwomen('|')?s|\bgirls'?/.test(d)) flags.push('gender-female');
  if (/\bcotton\b/.test(d)) flags.push('material-cotton');
  if (/(man-made|synthetic)/.test(d)) flags.push('material-synthetic');
  return flags;
}

// confidence heuristic based on any digits the user typed
// we already computed `digits` earlier in this function
function confFor(code10: string, digits: string) {
  if (!digits) return 0.8;
  if (digits.length >= 8 && code10.startsWith(digits.slice(0, 8))) return 0.92;
  if (digits.length >= 6 && code10.startsWith(digits.slice(0, 6))) return 0.9;
  if (digits.length >= 4 && code10.startsWith(digits.slice(0, 4))) return 0.85;
  return 0.8;
}

// assume confFor(code10, digits) and flagsFor(desc) already exist above
const baseConf = (code10: string) => confFor(code10, digits);
const confWithGeneric = (code10: string) => isGeneric ? Math.min(0.6, baseConf(code10)) : baseConf(code10);

const out = hits.slice(0, 25).map((r) => ({
  code: r.code10,
  code10: r.code10,
  description: r.description,
  confidence: confWithGeneric(r.code10),     // 0..1
  flags: [
    ...flagsFor(r.description),
    ...(isGeneric ? ['generic-query'] : [])
  ],
  forceRefine: isGeneric || undefined
}));

return NextResponse.json({ hits: out });
/* END REPLACEMENT for output mapping in route.ts */
}
