/**
 * Vercel serverless function for atomic order assignment.
 *
 * This is the ONLY production entry point for assignment.  The browser
 * never sees the service-role key.  The function validates inputs,
 * calls the Postgres RPC inside an advisory-locked transaction, and
 * returns the result.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const VALID_ORDERS = ['BCD', 'BDC', 'CBD', 'CDB', 'DBC', 'DCB'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS — restrict to same origin in production; override via env if needed
  const allowedOrigin = process.env.CORS_ALLOWED_ORIGIN || '*';
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // ---- Server config ----
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: 'Server configuration error: missing Supabase credentials' });
  }

  // ---- Input validation ----
  const {
    participantId,
    sessionId,
    experimentId,
    manualOrder,
    isTest,
    reservationMinutes,
    targetN,
  } = req.body || {};

  if (!participantId || typeof participantId !== 'string' || participantId.length > 50) {
    return res.status(400).json({ error: 'participantId is required (string, max 50 chars)' });
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(participantId)) {
    return res.status(400).json({ error: 'participantId contains invalid characters' });
  }
  if (!sessionId || typeof sessionId !== 'string' || !UUID_RE.test(sessionId)) {
    return res.status(400).json({ error: 'sessionId is required and must be a valid UUID v4' });
  }
  if (!experimentId || typeof experimentId !== 'string' || experimentId.length > 100) {
    return res.status(400).json({ error: 'experimentId is required (string, max 100 chars)' });
  }
  if (manualOrder != null && !VALID_ORDERS.includes(manualOrder)) {
    return res.status(400).json({ error: `Invalid order.  Must be one of: ${VALID_ORDERS.join(', ')}` });
  }

  const safeReservationMinutes = Math.max(1, Math.min(Number(reservationMinutes) || 30, 1440));
  const safeTargetN = Math.max(1, Math.min(Number(targetN) || 5, 100));

  // ---- Call RPC via service-role key ----
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const { data, error } = await supabase.rpc('reserve_counterbalanced_order', {
      p_participant_id: participantId,
      p_session_id: sessionId,
      p_experiment_id: experimentId,
      p_manual_order: manualOrder || null,
      p_is_test: isTest === true,
      p_reservation_minutes: safeReservationMinutes,
      p_target_n: safeTargetN,
    });

    if (error) {
      console.error('RPC error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    return res.status(200).json(data);
  } catch (err) {
    console.error('Assignment endpoint error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
