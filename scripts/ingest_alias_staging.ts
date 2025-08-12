/* Usage: npx tsx scripts/ingest_alias_staging.ts data/hs_alias_staging.csv */
import 'dotenv/config';
import fs from 'fs';
import { parse } from 'csv-parse';
import { createClient } from '@supabase/supabase-js';

const [, , csvPath] = process.argv;
if (!csvPath) {
  console.error('Usage: npx tsx scripts/ingest_alias_staging.ts <csvPath>');
  process.exit(1);
}

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const sb = createClient(url, key, { auth: { persistSession: false } });

async function main() {
  const rows: string[] = [];
  await new Promise<void>((resolve, reject) => {
    fs.createReadStream(csvPath)
      .pipe(parse({ columns: true, trim: true, skip_empty_lines: true }))
      .on('data', (r) => {
        const a = (r.alias || '').toString().trim();
        if (a) rows.push(a);
      })
      .on('end', resolve)
      .on('error', reject);
  });

  // Deduplicate in memory
  const unique = Array.from(new Set(rows)).map((alias) => ({ alias }));

  const { error } = await sb.from('hs_alias_staging').upsert(unique, { onConflict: 'alias' });
  if (error) throw error;

  console.log(`Inserted/updated ${unique.length} aliases into hs_alias_staging`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
