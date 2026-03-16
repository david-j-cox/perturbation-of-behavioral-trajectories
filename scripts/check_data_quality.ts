/**
 * Pull session data from Supabase and flag participants with unusual responding.
 *
 * Checks:
 * 1. Total responses per session (too few = disengaged)
 * 2. Response rate over time (sustained low rate = checked out)
 * 3. Side bias (>95% one side = not making choices)
 * 4. Low response rate events logged by the experiment
 * 5. Focus loss events (tab switching)
 * 6. Session completion status
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey);

async function main() {
  // 1. Pull all sessions
  const { data: sessions, error: sessErr } = await supabase
    .from('sessions')
    .select('*')
    .eq('is_test', false)
    .order('started_at', { ascending: true });

  if (sessErr) { console.error('Sessions error:', sessErr); return; }
  console.log(`\n=== ${sessions.length} NON-TEST SESSIONS ===\n`);

  // 2. Pull order assignments
  const { data: assignments, error: assignErr } = await supabase
    .from('order_assignments')
    .select('*');
  if (assignErr) { console.error('Assignments error:', assignErr); return; }

  // 3. Pull phase summaries
  const { data: phaseSummaries, error: phaseErr } = await supabase
    .from('phase_summary')
    .select('*');
  if (phaseErr) { console.error('Phase summary error:', phaseErr); return; }

  // 4. Pull flagged events (low_response_rate, focus_lost)
  const { data: flagEvents, error: flagErr } = await supabase
    .from('event_log')
    .select('session_id, event_type, phase_label, phase_index, client_timestamp_ms, metadata_json')
    .in('event_type', ['low_response_rate', 'focus_lost', 'focus_restored']);
  if (flagErr) { console.error('Flag events error:', flagErr); return; }

  // 5. Pull total response counts per session
  const { data: responseCounts, error: rcErr } = await supabase
    .from('event_log')
    .select('session_id, event_type')
    .eq('event_type', 'response');
  if (rcErr) { console.error('Response counts error:', rcErr); return; }

  // Aggregate response counts by session
  const respBySession: Record<string, number> = {};
  for (const r of responseCounts || []) {
    respBySession[r.session_id] = (respBySession[r.session_id] || 0) + 1;
  }

  // Aggregate flag events by session
  const flagsBySession: Record<string, { lowRate: number; focusLost: number }> = {};
  for (const f of flagEvents || []) {
    if (!flagsBySession[f.session_id]) flagsBySession[f.session_id] = { lowRate: 0, focusLost: 0 };
    if (f.event_type === 'low_response_rate') flagsBySession[f.session_id].lowRate++;
    if (f.event_type === 'focus_lost') flagsBySession[f.session_id].focusLost++;
  }

  // Aggregate phase data by session
  const phasesBySession: Record<string, typeof phaseSummaries> = {};
  for (const p of phaseSummaries || []) {
    if (!phasesBySession[p.session_id]) phasesBySession[p.session_id] = [];
    phasesBySession[p.session_id].push(p);
  }

  // Assignment lookup
  const assignBySession: Record<string, any> = {};
  for (const a of assignments || []) {
    assignBySession[a.session_id] = a;
  }

  // Analyze each session
  const results: any[] = [];

  for (const session of sessions) {
    const sid = session.id;
    const assignment = assignBySession[sid];
    const phases = phasesBySession[sid] || [];
    const totalResponses = respBySession[sid] || 0;
    const flags = flagsBySession[sid] || { lowRate: 0, focusLost: 0 };

    // Compute total left/right across all phases
    let totalLeft = 0, totalRight = 0;
    let totalDurationMs = 0;
    let phasesCompleted = phases.length;
    let steadyStateCount = 0;
    let timeoutCount = 0;

    for (const p of phases) {
      totalLeft += p.total_left_responses || 0;
      totalRight += p.total_right_responses || 0;
      totalDurationMs += p.duration_ms || 0;
      if (p.ended_by === 'steady_state') steadyStateCount++;
      if (p.ended_by === 'timeout') timeoutCount++;
    }

    const totalResp = totalLeft + totalRight;
    const leftBias = totalResp > 0 ? totalLeft / totalResp : 0.5;
    const durationMin = totalDurationMs / 60000;
    const respPerMin = durationMin > 0 ? totalResp / durationMin : 0;

    // Flag issues
    const issues: string[] = [];
    if (totalResp < 50) issues.push(`VERY LOW RESPONSES: ${totalResp}`);
    else if (totalResp < 200) issues.push(`Low responses: ${totalResp}`);
    if (respPerMin < 3 && durationMin > 1) issues.push(`Low rate: ${respPerMin.toFixed(1)}/min`);
    if (leftBias > 0.95 || leftBias < 0.05) issues.push(`Extreme side bias: ${(leftBias * 100).toFixed(1)}% left`);
    if (flags.lowRate > 0) issues.push(`${flags.lowRate} low-rate flag(s)`);
    if (flags.focusLost > 3) issues.push(`${flags.focusLost} focus-loss events`);
    if (phasesCompleted < 12 && session.status !== 'completed') issues.push(`Incomplete: ${phasesCompleted} phases, status=${session.status}`);

    results.push({
      participant: session.participant_id,
      sessionId: sid.slice(0, 8),
      order: assignment?.assigned_order || 'N/A',
      status: assignment?.assignment_status || session.status,
      phases: phasesCompleted,
      totalResponses: totalResp,
      leftPct: `${(leftBias * 100).toFixed(1)}%`,
      respPerMin: respPerMin.toFixed(1),
      steadyStates: steadyStateCount,
      timeouts: timeoutCount,
      focusLoss: flags.focusLost,
      lowRateFlags: flags.lowRate,
      durationMin: durationMin.toFixed(1),
      issues: issues.length > 0 ? issues.join('; ') : 'OK',
    });
  }

  // Print summary table
  console.log('PID'.padEnd(20), 'Order', 'Status'.padEnd(10), 'Phases', 'Resp', 'Left%', 'R/min', 'SS', 'TO', 'Focus', 'LowR', 'Dur(m)', 'Issues');
  console.log('-'.repeat(140));

  for (const r of results) {
    console.log(
      r.participant.padEnd(20),
      r.order.padEnd(5),
      r.status.padEnd(10),
      String(r.phases).padEnd(6),
      String(r.totalResponses).padEnd(5),
      r.leftPct.padEnd(6),
      r.respPerMin.padEnd(6),
      String(r.steadyStates).padEnd(3),
      String(r.timeouts).padEnd(3),
      String(r.focusLoss).padEnd(6),
      String(r.lowRateFlags).padEnd(5),
      r.durationMin.padEnd(7),
      r.issues,
    );
  }

  // Summary
  const flagged = results.filter(r => r.issues !== 'OK');
  console.log(`\n=== SUMMARY ===`);
  console.log(`Total sessions: ${results.length}`);
  console.log(`Clean sessions: ${results.length - flagged.length}`);
  console.log(`Flagged sessions: ${flagged.length}`);
  if (flagged.length > 0) {
    console.log(`\nFLAGGED PARTICIPANTS:`);
    for (const r of flagged) {
      console.log(`  ${r.participant} (${r.sessionId}): ${r.issues}`);
    }
  }
}

main().catch(console.error);
