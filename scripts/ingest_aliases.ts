/* scripts/ingest_aliases.ts
   Usage:
     # Recommended: ingest to staging
     npx tsx scripts/ingest_aliases.ts data/hs_aliases.csv

     # If you want to ingest straight to live (upserts by alias_norm)
     HS_INGEST_TARGET=hs_aliases_data npx tsx scripts/ingest_aliases.ts data/hs_aliases.csv
*/
import 'dotenv/config';
import fs from 'fs';
import { parse } from 'csv-parse';
import { createClient } from '@supabase/supabase-js';

const [, , csvPath] = process.argv;
if (!csvPath) {
  console.error('Usage: npx tsx scripts/ingest_aliases.ts <csvPath>');
  process.exit(1);
}

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env');
  process.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false } });

// Default (safe) is staging. Override with HS_INGEST_TARGET=hs_aliases_data to write to live.
const TARGET = (process.env.HS_INGEST_TARGET || 'hs_alias_staging').trim();
// Column name for HS code on the target table
const CODE_COL = TARGET === 'hs_aliases_data' ? 'hs_code' : 'code';

function digitsOnly(s: string) {
  return (s || '').replace(/\D/g, '');
}
function isValidHsLength(d: string) {
  return d.length === 6 || d.length === 8 || d.length === 10;
}

type Row = { alias: string; [k: string]: any };

async function writeBatch(rows: Row[]) {
  if (!rows.length) return;

  // Staging has no unique constraint → regular INSERT
  if (TARGET === 'hs_alias_staging') {
    const { error } = await sb.from(TARGET).insert(rows);
    if (error) throw error;
    return;
  }

  // Live table has unique constraint on alias_norm → upsert using alias_norm
  if (TARGET === 'hs_aliases_data') {
    const { error } = await sb.from(TARGET).upsert(rows, { onConflict: 'alias_norm' }); // generated from alias
    if (error) throw error;
    return;
  }

  throw new Error(`Unknown HS_INGEST_TARGET: ${TARGET}`);
}

async function main() {
  console.log(`Ingesting ${csvPath} -> ${TARGET} (${CODE_COL})`);

  const parser = fs
    .createReadStream(csvPath)
    .pipe(parse({ columns: true, trim: true, skip_empty_lines: true }));

  const batch: Row[] = [];
  let parsed = 0,
    written = 0,
    skipped = 0;

  for await (const r of parser) {
    parsed++;

    const alias = String(r.alias ?? '').trim();
    const codeRaw = String(r.code ?? '').trim();
    const description = String(r.description ?? '').trim();

    if (!alias || !codeRaw) {
      skipped++;
      continue;
    }

    const d = digitsOnly(codeRaw);
    if (!isValidHsLength(d)) {
      skipped++;
      continue;
    }

    const row: Row = { alias, description: description || null };
    row[CODE_COL] = codeRaw; // keep dots if present; live table will compute normalized_code

    batch.push(row);

    if (batch.length >= 2000) {
      await writeBatch(batch.splice(0, batch.length));
      written += 2000;
      console.log(`Wrote ~${written}…`);
    }
  }

  await writeBatch(batch);
  written += batch.length;

  console.log(`Done. Parsed: ${parsed}. Wrote: ${written}. Skipped: ${skipped}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
