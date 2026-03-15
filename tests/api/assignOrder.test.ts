import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import handler from '../../api/assign-order';

// ---- Mock @supabase/supabase-js ----
const mockRpc = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ rpc: mockRpc })),
}));

import { createClient } from '@supabase/supabase-js';

// ---- Helpers for VercelRequest / VercelResponse fakes ----
function makeReq(overrides: Record<string, unknown> = {}) {
  return {
    method: 'POST',
    body: {},
    ...overrides,
  } as any;
}

function makeRes() {
  const res: any = {
    _status: 0,
    _json: null as unknown,
    _ended: false,
    _headers: {} as Record<string, string>,
    setHeader(name: string, value: string) {
      res._headers[name] = value;
      return res;
    },
    status(code: number) {
      res._status = code;
      return res;
    },
    json(data: unknown) {
      res._json = data;
      return res;
    },
    end() {
      res._ended = true;
      return res;
    },
  };
  return res;
}

const VALID_SESSION_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const VALID_BODY = {
  participantId: 'participant-01',
  sessionId: VALID_SESSION_ID,
  experimentId: 'exp-1',
};

// ---- Test suite ----
describe('api/assign-order handler', () => {
  beforeEach(() => {
    process.env.VITE_SUPABASE_URL = 'https://fake.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-role-key';
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.VITE_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_URL;
    delete process.env.CORS_ALLOWED_ORIGIN;
  });

  // ---- 1. CORS preflight ----
  it('responds 200 to OPTIONS preflight request', async () => {
    const req = makeReq({ method: 'OPTIONS' });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(res._ended).toBe(true);
    expect(res._headers['Access-Control-Allow-Origin']).toBe('*');
    expect(res._headers['Access-Control-Allow-Methods']).toBe('POST, OPTIONS');
  });

  // ---- 2. Method not allowed ----
  it('returns 405 for GET requests', async () => {
    const req = makeReq({ method: 'GET' });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(405);
    expect(res._json).toEqual({ error: 'Method not allowed' });
  });

  // ---- 3. Missing server config ----
  it('returns 500 when env vars are missing', async () => {
    delete process.env.VITE_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const req = makeReq({ method: 'POST', body: VALID_BODY });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(500);
    expect(res._json.error).toMatch(/missing Supabase credentials/i);
  });

  // ---- 4. Input validation ----
  describe('input validation', () => {
    it('returns 400 when participantId is missing', async () => {
      const req = makeReq({ body: { ...VALID_BODY, participantId: undefined } });
      const res = makeRes();
      await handler(req, res);
      expect(res._status).toBe(400);
      expect(res._json.error).toMatch(/participantId/);
    });

    it('returns 400 when participantId contains invalid characters', async () => {
      const req = makeReq({ body: { ...VALID_BODY, participantId: 'bad id!' } });
      const res = makeRes();
      await handler(req, res);
      expect(res._status).toBe(400);
      expect(res._json.error).toMatch(/invalid characters/);
    });

    it('returns 400 when participantId is too long (>50 chars)', async () => {
      const req = makeReq({ body: { ...VALID_BODY, participantId: 'a'.repeat(51) } });
      const res = makeRes();
      await handler(req, res);
      expect(res._status).toBe(400);
      expect(res._json.error).toMatch(/participantId/);
    });

    it('returns 400 when sessionId is missing', async () => {
      const req = makeReq({ body: { ...VALID_BODY, sessionId: undefined } });
      const res = makeRes();
      await handler(req, res);
      expect(res._status).toBe(400);
      expect(res._json.error).toMatch(/sessionId/);
    });

    it('returns 400 when sessionId is not a valid UUID', async () => {
      const req = makeReq({ body: { ...VALID_BODY, sessionId: 'not-a-uuid' } });
      const res = makeRes();
      await handler(req, res);
      expect(res._status).toBe(400);
      expect(res._json.error).toMatch(/sessionId/);
    });

    it('returns 400 when experimentId is missing', async () => {
      const req = makeReq({ body: { ...VALID_BODY, experimentId: undefined } });
      const res = makeRes();
      await handler(req, res);
      expect(res._status).toBe(400);
      expect(res._json.error).toMatch(/experimentId/);
    });

    it('returns 400 when manualOrder is invalid', async () => {
      const req = makeReq({ body: { ...VALID_BODY, manualOrder: 'XYZ' } });
      const res = makeRes();
      await handler(req, res);
      expect(res._status).toBe(400);
      expect(res._json.error).toMatch(/Invalid order/);
    });
  });

  // ---- 5. Clamping ----
  describe('clamping', () => {
    beforeEach(() => {
      mockRpc.mockResolvedValue({
        data: { success: true, assigned_order: 'BCD' },
        error: null,
      });
    });

    it('clamps reservationMinutes below 1 up to 1 and targetN below 1 up to 1', async () => {
      // Note: 0 is falsy so `Number(0) || default` gives the default.
      // Use a small truthy number like 0.5 to actually trigger the lower clamp.
      const req = makeReq({
        body: { ...VALID_BODY, reservationMinutes: 0.5, targetN: 0.5 },
      });
      const res = makeRes();
      await handler(req, res);

      expect(mockRpc).toHaveBeenCalledWith(
        'reserve_counterbalanced_order',
        expect.objectContaining({
          p_reservation_minutes: 1,
          p_target_n: 1,
        }),
      );
    });

    it('uses default values when reservationMinutes and targetN are 0 (falsy)', async () => {
      const req = makeReq({
        body: { ...VALID_BODY, reservationMinutes: 0, targetN: 0 },
      });
      const res = makeRes();
      await handler(req, res);

      // 0 is falsy, so `Number(0) || 30` = 30 and `Number(0) || 5` = 5
      expect(mockRpc).toHaveBeenCalledWith(
        'reserve_counterbalanced_order',
        expect.objectContaining({
          p_reservation_minutes: 30,
          p_target_n: 5,
        }),
      );
    });

    it('clamps reservationMinutes of 9999 to 1440 and targetN of 999 to 100', async () => {
      const req = makeReq({
        body: { ...VALID_BODY, reservationMinutes: 9999, targetN: 999 },
      });
      const res = makeRes();
      await handler(req, res);

      expect(mockRpc).toHaveBeenCalledWith(
        'reserve_counterbalanced_order',
        expect.objectContaining({
          p_reservation_minutes: 1440,
          p_target_n: 100,
        }),
      );
    });
  });

  // ---- 6. Successful RPC call ----
  it('returns 200 with data on successful RPC call', async () => {
    mockRpc.mockResolvedValue({
      data: { success: true, assigned_order: 'BCD' },
      error: null,
    });

    const req = makeReq({ body: VALID_BODY });
    const res = makeRes();
    await handler(req, res);

    expect(createClient).toHaveBeenCalledWith(
      'https://fake.supabase.co',
      'fake-service-role-key',
    );
    expect(mockRpc).toHaveBeenCalledWith(
      'reserve_counterbalanced_order',
      expect.objectContaining({
        p_participant_id: 'participant-01',
        p_session_id: VALID_SESSION_ID,
        p_experiment_id: 'exp-1',
        p_manual_order: null,
        p_is_test: false,
      }),
    );
    expect(res._status).toBe(200);
    expect(res._json).toEqual({ success: true, assigned_order: 'BCD' });
  });

  // ---- 7. RPC error ----
  it('returns 500 when RPC returns an error', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'lock timeout' },
    });

    const req = makeReq({ body: VALID_BODY });
    const res = makeRes();
    await handler(req, res);

    expect(res._status).toBe(500);
    expect(res._json).toEqual({ success: false, error: 'lock timeout' });
  });

  // ---- 8. Exception in RPC ----
  it('returns 500 when RPC throws an exception', async () => {
    mockRpc.mockRejectedValue(new Error('connection refused'));

    const req = makeReq({ body: VALID_BODY });
    const res = makeRes();
    await handler(req, res);

    expect(res._status).toBe(500);
    expect(res._json).toEqual({ success: false, error: 'Internal server error' });
  });
});
