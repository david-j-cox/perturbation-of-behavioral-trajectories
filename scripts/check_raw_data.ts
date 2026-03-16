import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  // Count rows in each table
  for (const table of ['sessions', 'order_assignments', 'event_log', 'bin_log', 'phase_summary']) {
    const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true });
    console.log(`${table}: ${count ?? 'error'} rows${error ? ` (${error.message})` : ''}`);
  }

  // Check a few event types
  const { data: eventTypes } = await supabase
    .from('event_log')
    .select('event_type')
    .limit(1000);

  if (eventTypes && eventTypes.length > 0) {
    const counts: Record<string, number> = {};
    for (const e of eventTypes) counts[e.event_type] = (counts[e.event_type] || 0) + 1;
    console.log('\nEvent type distribution (first 1000):');
    for (const [type, count] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${type}: ${count}`);
    }
  } else {
    console.log('\nNo events in event_log!');
  }

  // Check RLS policies - try selecting as anon
  console.log('\n--- Checking if data exists but is RLS-blocked ---');
  const anonClient = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);
  for (const table of ['event_log', 'bin_log', 'phase_summary']) {
    const { count, error } = await anonClient.from(table).select('*', { count: 'exact', head: true });
    console.log(`${table} (anon): ${count ?? 'error'} rows${error ? ` (${error.message})` : ''}`);
  }
}

main().catch(console.error);
