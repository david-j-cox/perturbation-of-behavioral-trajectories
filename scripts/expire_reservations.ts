/**
 * Maintenance script: expire stale reservations.
 * Run periodically via cron or manually.
 *
 * Usage: npx tsx scripts/expire_reservations.ts
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

async function main() {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  console.log('Expiring stale reservations...');
  const { data, error } = await supabase.rpc('expire_stale_reservations');

  if (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }

  console.log('Result:', data);

  // Show current counts
  console.log('\nCurrent order counts:');
  const { data: counts, error: countError } = await supabase.rpc('get_order_counts');
  if (countError) {
    console.error('Error getting counts:', countError.message);
  } else {
    console.table(counts);
  }
}

main().catch(console.error);
