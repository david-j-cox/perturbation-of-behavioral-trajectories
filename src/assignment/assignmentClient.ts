import { getSupabaseClient, isOnline } from '../logging/supabaseClient';
import { PerturbationOrder, PERTURBATION_ORDERS } from '../engine/types';
import { randomChoice, createRng } from '../utils/rng';

export interface AssignmentResult {
  success: boolean;
  assignedOrder?: PerturbationOrder;
  alreadyAssigned?: boolean;
  candidateOrders?: string[];
  reservationExpiresAt?: string;
  assignmentStatus?: string;
  error?: string;
  method: 'api' | 'offline';
}

/**
 * Request counterbalanced order assignment.
 *
 * IMPORTANT: Assignment always goes through the Vercel serverless
 * endpoint (/api/assign-order) which holds the service-role key.
 * The browser anon key has NO policies on order_assignments, so
 * calling the RPC directly from the client would fail.
 *
 * Fallback chain:
 *   1. POST /api/assign-order  (Vercel -> service-role -> RPC)
 *   2. Offline pseudorandom    (debug / no-network only)
 */
export async function requestAssignment(
  participantId: string,
  sessionId: string,
  experimentId: string,
  options?: {
    manualOrder?: PerturbationOrder;
    isTest?: boolean;
    reservationMinutes?: number;
    targetN?: number;
    debugLocalOnly?: boolean;
    rngSeed?: string;
  }
): Promise<AssignmentResult> {
  const {
    manualOrder,
    isTest = false,
    reservationMinutes = 30,
    targetN = 5,
    debugLocalOnly = false,
    rngSeed,
  } = options || {};

  if (debugLocalOnly || !isOnline()) {
    return offlineAssignment(manualOrder, rngSeed);
  }

  return apiAssignment(
    participantId, sessionId, experimentId,
    manualOrder, isTest, reservationMinutes, targetN,
  );
}

/**
 * Call Vercel API endpoint for assignment.
 * This is the ONLY production path — it uses the service-role key
 * server-side and calls the RPC within a serialised transaction.
 */
async function apiAssignment(
  participantId: string,
  sessionId: string,
  experimentId: string,
  manualOrder?: PerturbationOrder,
  isTest?: boolean,
  reservationMinutes?: number,
  targetN?: number,
): Promise<AssignmentResult> {
  try {
    const response = await fetch('/api/assign-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        participantId,
        sessionId,
        experimentId,
        manualOrder: manualOrder || null,
        isTest: isTest || false,
        reservationMinutes: reservationMinutes || 30,
        targetN: targetN || 5,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      return { success: false, error: `API error (${response.status}): ${text}`, method: 'api' };
    }

    const data = await response.json();
    if (!data || !data.success) {
      return { success: false, error: data?.error || 'Unknown assignment error', method: 'api' };
    }

    return {
      success: true,
      assignedOrder: data.assigned_order as PerturbationOrder,
      alreadyAssigned: data.already_assigned,
      candidateOrders: data.candidate_orders,
      reservationExpiresAt: data.reservation_expires_at,
      assignmentStatus: data.assignment_status,
      method: 'api',
    };
  } catch (e) {
    console.error('API assignment failed:', e);
    return { success: false, error: String(e), method: 'api' };
  }
}

/** Offline fallback: pseudorandom assignment without database */
function offlineAssignment(manualOrder?: PerturbationOrder, rngSeed?: string): AssignmentResult {
  const order = manualOrder || randomChoice([...PERTURBATION_ORDERS], createRng(rngSeed || Date.now()));
  return {
    success: true,
    assignedOrder: order,
    alreadyAssigned: false,
    candidateOrders: manualOrder ? [manualOrder] : [...PERTURBATION_ORDERS],
    assignmentStatus: 'reserved',
    method: 'offline',
  };
}

/**
 * Activate an assignment (experiment has started).
 * Uses RPC via anon key — the RPC is SECURITY DEFINER so it bypasses RLS.
 */
export async function activateAssignment(sessionId: string): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return true;
  try {
    const { data, error } = await client.rpc('activate_assignment', { p_session_id: sessionId });
    if (error) { console.error('Activate assignment error:', error); return false; }
    return (data?.rows_updated ?? 0) > 0;
  } catch (e) { console.error('Activate assignment exception:', e); return false; }
}

/**
 * Complete an assignment (experiment finished).
 * Uses RPC via anon key — the RPC is SECURITY DEFINER so it bypasses RLS.
 */
export async function completeAssignment(sessionId: string): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return true;
  try {
    const { data, error } = await client.rpc('complete_assignment', { p_session_id: sessionId });
    if (error) { console.error('Complete assignment error:', error); return false; }
    return (data?.rows_updated ?? 0) > 0;
  } catch (e) { console.error('Complete assignment exception:', e); return false; }
}

/**
 * Abandon an assignment (participant left before completing).
 * Uses RPC via anon key — the RPC is SECURITY DEFINER so it bypasses RLS.
 */
export async function abandonAssignment(sessionId: string): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return true;
  try {
    const { data, error } = await client.rpc('abandon_assignment', { p_session_id: sessionId });
    if (error) { console.error('Abandon assignment error:', error); return false; }
    return (data?.rows_updated ?? 0) > 0;
  } catch (e) { console.error('Abandon assignment exception:', e); return false; }
}

/** Create a session in Supabase */
export async function createSession(params: {
  sessionId: string;
  participantId: string;
  experimentId: string;
  appVersion: string;
  rngSeed: string;
  isTest?: boolean;
  debugMode?: boolean;
}): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return true;
  try {
    const { error } = await client.from('sessions').insert({
      id: params.sessionId,
      participant_id: params.participantId,
      experiment_id: params.experimentId,
      app_version: params.appVersion,
      rng_seed: params.rngSeed,
      is_test: params.isTest || false,
      debug_mode: params.debugMode || false,
      user_agent: navigator.userAgent,
      screen_width: window.screen.width,
      screen_height: window.screen.height,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    if (error) { console.error('Create session error:', error); return false; }
    return true;
  } catch (e) { console.error('Create session exception:', e); return false; }
}
