/**
 * Admin utility: show current assignment counts by order and status.
 *
 * Usage: npx tsx scripts/admin_counts.ts
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

  // Get active order counts
  console.log('=== Active Order Counts (non-test, non-expired/cancelled) ===');
  const { data: activeCounts, error: activeError } = await supabase
    .from('active_order_counts')
    .select('*');

  if (activeError) {
    console.error('Error:', activeError.message);
  } else {
    console.table(activeCounts || []);
  }

  // Get detailed counts
  console.log('\n=== Detailed Assignment Status ===');
  const { data: detailed, error: detailedError } = await supabase.rpc('get_order_counts');

  if (detailedError) {
    console.error('Error:', detailedError.message);
  } else {
    console.table(detailed || []);
  }

  // Get recent sessions
  console.log('\n=== 10 Most Recent Sessions ===');
  const { data: sessions, error: sessionsError } = await supabase
    .from('sessions')
    .select('id, participant_id, status, is_test, started_at')
    .order('started_at', { ascending: false })
    .limit(10);

  if (sessionsError) {
    console.error('Error:', sessionsError.message);
  } else {
    console.table(sessions || []);
  }
}

main().catch(console.error);
