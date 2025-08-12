/* scripts/ingest_hts.ts
   Usage: npx tsx scripts/ingest_hts.ts data/hts_us.csv "Rev 18" 2025-08-07
*/
import 'dotenv/config';
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import { parse } from 'csv-parse';
import dayjs from 'dayjs';

// ---------- CLI ----------
const [, , csvPath, revNumber, revDateStr] = process.argv;
if (!csvPath || !revNumber || !revDateStr) {
  console.error('Usage: npx tsx scripts/ingest_hts.ts <csvPath> <revNumber> <revDate YYYY-MM-DD>');
  process.exit(1);
}
const revDate = dayjs(revDateStr).format('YYYY-MM-DD');

// ---------- Supabase (server key) ----------
const URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
const KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
if (!URL || !KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env');
  process.exit(1);
}
const sb = createClient(URL, KEY, { auth: { persistSession: false } });

// ---------- Helpers ----------
type CsvRow = Record<string, any>;
const LOG = process.env.LOG_PARSE === '1';

function cleanStr(v: unknown): string {
  return (v ?? '').toString().trim();
}
function onlyDigits(s: string): string {
  return s.replace(/\D/g, '');
}
function normalizeCode(raw: string) {
  const formatted = cleanStr(raw);
  const digits = onlyDigits(formatted);

  let code_len = 0;
  if (digits.length >= 10) code_len = 10;
  else if (digits.length >= 8) code_len = 8;
  else if (digits.length >= 6) code_len = 6;
  else code_len = digits.length;

  // we still compute hts10 locally (useful) but we DO NOT insert it if DB generates it
  let hts10 = '';
  if (code_len === 10) hts10 = digits.slice(0, 10);
  else if (code_len === 8) hts10 = digits.slice(0, 8) + '00';
  else if (code_len === 6) hts10 = digits.slice(0, 6) + '0000';

  return { formatted, digits, code_len, hts10 };
}
function parseMFN(raw: string | null) {
  if (!raw) return { advalorem: null as number | null, specific: null as string | null };
  const s = raw.trim();
  if (!s) return { advalorem: null, specific: null };
  if (/^free$/i.test(s)) return { advalorem: 0, specific: null };
  const m = s.match(/^(\d+(?:\.\d+)?)\s*%$/);
  if (m) return { advalorem: parseFloat(m[1]), specific: null };
  return { advalorem: null, specific: s };
}

async function upsertBatch(rows: any[]) {
  if (!rows.length) return;
  const { error } = await sb.from('hts_lines').upsert(rows, { onConflict: 'code,rev_number' });
  if (error) throw error;
}

// ---------- Main ----------
async function main() {
  console.log(`Ingesting ${csvPath} → ${revNumber} (${revDate})`);

  const parser = fs.createReadStream(csvPath).pipe(
    parse({
      columns: (hdr: string[]) => hdr.map((h) => h.trim().toLowerCase()), // normalize headers
      trim: true,
      skip_empty_lines: true,
    }),
  );

  const batch: any[] = [];
  let parsed = 0;
  let skipped = 0;
  let upserted = 0;

  for await (const rawRow of parser) {
    const r = rawRow as CsvRow;

    // flexible header aliases
    const code = cleanStr(r.code ?? r['hs code'] ?? r['hs_code'] ?? '');
    const description = cleanStr(r.description ?? r['desc'] ?? r['item_description'] ?? '');
    const mfnRaw = cleanStr(r.mfn ?? r['mfn rate'] ?? r['mfn_rate'] ?? '');
    const unit1 = cleanStr(r.unit1 ?? '');
    const unit2 = cleanStr(r.unit2 ?? '');
    const legal_note = cleanStr(r.legal_note ?? r['legal note'] ?? '');

    if (!code || !description) {
      skipped++;
      if (LOG) console.log('[skip] missing code/description:', rawRow);
      continue;
    }

    const { formatted, code_len /* hts10 */ } = normalizeCode(code);
    if (code_len < 6) {
      skipped++;
      if (LOG) console.log('[skip] code too short:', code);
      continue;
    }

    const { advalorem, specific } = parseMFN(mfnRaw || null);

    // IMPORTANT: do NOT include hts10 here (it’s a generated column in your DB)
    batch.push({
      code: formatted,
      code_len,
      description,
      mfn_advalorem: advalorem,
      mfn_specific: specific,
      unit1: unit1 || null,
      unit2: unit2 || null,
      legal_note: legal_note || null,
      rev_number: revNumber,
      rev_date: revDate,
    });

    parsed++;

    if (batch.length >= 2000) {
      await upsertBatch(batch.splice(0, batch.length));
      upserted += 2000;
      console.log(`Upserted ~${upserted} rows…`);
    }
  }

  if (batch.length) {
    await upsertBatch(batch);
    upserted += batch.length;
  }

  console.log(
    `Done. Total parsed: ${parsed + skipped}. Upserted: ${upserted}. Skipped: ${skipped}.`,
  );

  const { error: metaErr } = await sb.from('hts_meta').upsert({
    id: true,
    current_rev: revNumber,
    rev_date: revDate,
    ingested_at: new Date().toISOString(),
  });
  if (metaErr) throw metaErr;

  console.log('hts_meta updated.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
