/* scripts/ingest_aliases.ts
   Usage: npx tsx scripts/ingest_aliases.ts data/hs_aliases.csv
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

function normalizeCode(code: string) {
  const d = (code || '').replace(/\D/g, '');
  // take 10, else 8, else 6
  const len = d.length >= 10 ? 10 : d.length >= 8 ? 8 : 6;
  return { digits: d.slice(0, len), len };
}

async function upsertBatch(rows: any[]) {
  if (!rows.length) return;
  const { error } = await sb.from('hs_aliases').upsert(rows, {
    onConflict: 'code,code_len,alias',
  });
  if (error) throw error;
}

async function main() {
  console.log('Ingesting', csvPath);

  const parser = fs
    .createReadStream(csvPath)
    .pipe(parse({ columns: true, trim: true, skip_empty_lines: true }));

  const batch: any[] = [];
  let parsed = 0,
    upserted = 0,
    skipped = 0;

  for await (const r of parser) {
    parsed++;
    const codeRaw = (r.code || '').toString();
    const desc = (r.description || '').toString();
    const alias = (r.alias || '').toString();

    if (!codeRaw || !alias) {
      skipped++;
      continue;
    }

    const { digits, len } = normalizeCode(codeRaw);
    if (![6, 8, 10].includes(len)) {
      skipped++;
      continue;
    }

    batch.push({
      code: digits, // store digits only
      code_len: len,
      description: desc || null,
      alias,
    });

    if (batch.length >= 2000) {
      await upsertBatch(batch.splice(0, batch.length));
      upserted += 2000;
      console.log(`Upserted ~${upserted}…`);
    }
  }

  await upsertBatch(batch);
  upserted += batch.length;

  console.log(`Done. Parsed: ${parsed}. Upserted: ${upserted}. Skipped: ${skipped}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
