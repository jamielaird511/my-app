// scripts/peek_hts.ts
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

(async () => {
  const { data, error, count } = await sb
    .from('hts_lines')
    .select('code, code_len, description, mfn_advalorem, rev_number, rev_date', { count: 'exact' })
    .order('code', { ascending: true })
    .limit(10);

  if (error) {
    console.error('peek error:', error);
    process.exit(1);
  }

  console.log('rows:', count);
  console.table(data || []);
})();
