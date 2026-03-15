/**
 * Seed fake sessions for testing without contaminating production.
 * All seeded sessions are marked is_test = true.
 *
 * Usage: npx tsx scripts/seed_test_sessions.ts [count]
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const ORDERS = ['BCD', 'BDC', 'CBD', 'CDB', 'DBC', 'DCB'] as const;

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

async function main() {
  const count = parseInt(process.argv[2] || '6', 10);

  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  console.log(`Seeding ${count} test sessions...`);

  for (let i = 0; i < count; i++) {
    const sessionId = generateUUID();
    const participantId = `test_seed_${Date.now()}_${i}`;
    const order = ORDERS[i % ORDERS.length];

    // Create participant
    await supabase.from('participants').insert({ participant_id: participantId }).single();

    // Create session
    await supabase.from('sessions').insert({
      id: sessionId,
      participant_id: participantId,
      experiment_id: 'test_seed',
      is_test: true,
      app_version: 'seed_script',
    });

    // Assign order
    const { data, error } = await supabase.rpc('reserve_counterbalanced_order', {
      p_participant_id: participantId,
      p_session_id: sessionId,
      p_experiment_id: 'test_seed',
      p_manual_order: order,
      p_is_test: true,
      p_reservation_minutes: 60,
    });

    if (error) {
      console.error(`  Error seeding ${participantId}:`, error.message);
    } else {
      console.log(`  Seeded ${participantId} -> ${data.assigned_order}`);
    }
  }

  console.log('Done.');
}

main().catch(console.error);
