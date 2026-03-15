import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  requestAssignment,
  activateAssignment,
  completeAssignment,
  abandonAssignment,
  createSession,
} from '../../src/assignment/assignmentClient';
import { PERTURBATION_ORDERS } from '../../src/engine/types';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../src/logging/supabaseClient', () => ({
  getSupabaseClient: vi.fn(() => null),
  isOnline: vi.fn(() => true),
}));

import { getSupabaseClient, isOnline } from '../../src/logging/supabaseClient';

const mockGetSupabaseClient = vi.mocked(getSupabaseClient);
const mockIsOnline = vi.mocked(isOnline);

const originalFetch = globalThis.fetch;

beforeEach(() => {
  vi.restoreAllMocks();
  // Re-apply mock defaults after restoreAllMocks clears them
  mockGetSupabaseClient.mockReturnValue(null);
  mockIsOnline.mockReturnValue(true);
  globalThis.fetch = originalFetch;
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockClient({
  rpcResult,
  insertResult,
}: {
  rpcResult?: { data: unknown; error: unknown };
  insertResult?: { error: unknown };
} = {}) {
  const rpc = vi.fn().mockResolvedValue(rpcResult ?? { data: { rows_updated: 1 }, error: null });
  const insert = vi.fn().mockResolvedValue(insertResult ?? { error: null });
  const client = {
    rpc,
    from: vi.fn(() => ({ insert })),
  };
  return { client, rpc, insert };
}

// ---------------------------------------------------------------------------
// 1. Offline fallback (debugLocalOnly: true)
// ---------------------------------------------------------------------------

describe('requestAssignment — offline fallback (debugLocalOnly)', () => {
  it('returns success with a valid order', async () => {
    const result = await requestAssignment('p1', 's1', 'exp1', {
      debugLocalOnly: true,
      rngSeed: 'seed-1',
    });

    expect(result.success).toBe(true);
    expect(PERTURBATION_ORDERS).toContain(result.assignedOrder);
    expect(result.method).toBe('offline');
  });

  it('returns the manual order when one is provided', async () => {
    const result = await requestAssignment('p1', 's1', 'exp1', {
      debugLocalOnly: true,
      manualOrder: 'CBD',
    });

    expect(result.success).toBe(true);
    expect(result.assignedOrder).toBe('CBD');
    expect(result.candidateOrders).toEqual(['CBD']);
    expect(result.method).toBe('offline');
  });

  it('returns all 6 orders as candidates when no manual order', async () => {
    const result = await requestAssignment('p1', 's1', 'exp1', {
      debugLocalOnly: true,
      rngSeed: 'seed-2',
    });

    expect(result.candidateOrders).toEqual([...PERTURBATION_ORDERS]);
  });

  it('has method "offline"', async () => {
    const result = await requestAssignment('p1', 's1', 'exp1', {
      debugLocalOnly: true,
    });

    expect(result.method).toBe('offline');
  });
});

// ---------------------------------------------------------------------------
// 2. Offline fallback when isOnline() returns false
// ---------------------------------------------------------------------------

describe('requestAssignment — offline when isOnline() is false', () => {
  it('falls through to offline assignment', async () => {
    mockIsOnline.mockReturnValue(false);

    const result = await requestAssignment('p1', 's1', 'exp1', { rngSeed: 'seed-3' });

    expect(result.success).toBe(true);
    expect(result.method).toBe('offline');
    expect(PERTURBATION_ORDERS).toContain(result.assignedOrder);
  });
});

// ---------------------------------------------------------------------------
// 3. API assignment success path
// ---------------------------------------------------------------------------

describe('requestAssignment — API success path', () => {
  it('sends correct request body and returns mapped fields', async () => {
    const apiPayload = {
      success: true,
      assigned_order: 'BCD',
      candidate_orders: ['BCD', 'BDC'],
      already_assigned: false,
      reservation_expires_at: '2026-01-01T00:00:00Z',
      assignment_status: 'reserved',
    };

    let capturedBody: string | undefined;

    globalThis.fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      capturedBody = init?.body as string;
      return new Response(JSON.stringify(apiPayload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as unknown as typeof fetch;

    mockIsOnline.mockReturnValue(true);

    const result = await requestAssignment('p1', 's1', 'exp1', {
      isTest: true,
      reservationMinutes: 15,
      targetN: 10,
    });

    // Verify request body
    const body = JSON.parse(capturedBody!);
    expect(body.participantId).toBe('p1');
    expect(body.sessionId).toBe('s1');
    expect(body.experimentId).toBe('exp1');
    expect(body.isTest).toBe(true);
    expect(body.reservationMinutes).toBe(15);
    expect(body.targetN).toBe(10);
    expect(body.manualOrder).toBeNull();

    // Verify result mapping
    expect(result.success).toBe(true);
    expect(result.method).toBe('api');
    expect(result.assignedOrder).toBe('BCD');
    expect(result.candidateOrders).toEqual(['BCD', 'BDC']);
    expect(result.alreadyAssigned).toBe(false);
    expect(result.reservationExpiresAt).toBe('2026-01-01T00:00:00Z');
    expect(result.assignmentStatus).toBe('reserved');
  });
});

// ---------------------------------------------------------------------------
// 4. API assignment failure paths
// ---------------------------------------------------------------------------

describe('requestAssignment — API failure paths', () => {
  beforeEach(() => {
    mockIsOnline.mockReturnValue(true);
  });

  it('returns failure with error when fetch returns non-ok status', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response('Internal Server Error', { status: 500 }),
    ) as unknown as typeof fetch;

    const result = await requestAssignment('p1', 's1', 'exp1');

    expect(result.success).toBe(false);
    expect(result.method).toBe('api');
    expect(result.error).toContain('500');
    expect(result.error).toContain('Internal Server Error');
  });

  it('returns failure when response is ok but body has success: false', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ success: false, error: 'quota exceeded' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ) as unknown as typeof fetch;

    const result = await requestAssignment('p1', 's1', 'exp1');

    expect(result.success).toBe(false);
    expect(result.method).toBe('api');
    expect(result.error).toBe('quota exceeded');
  });

  it('returns failure when fetch throws (network error)', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('network failure');
    }) as unknown as typeof fetch;

    const result = await requestAssignment('p1', 's1', 'exp1');

    expect(result.success).toBe(false);
    expect(result.method).toBe('api');
    expect(result.error).toContain('network failure');
  });
});

// ---------------------------------------------------------------------------
// 5. activateAssignment / completeAssignment / abandonAssignment
// ---------------------------------------------------------------------------

describe.each([
  { name: 'activateAssignment', fn: activateAssignment, rpcName: 'activate_assignment' },
  { name: 'completeAssignment', fn: completeAssignment, rpcName: 'complete_assignment' },
  { name: 'abandonAssignment', fn: abandonAssignment, rpcName: 'abandon_assignment' },
])('$name', ({ fn, rpcName }) => {
  it('returns true when getSupabaseClient() returns null (offline graceful)', async () => {
    mockGetSupabaseClient.mockReturnValue(null);
    expect(await fn('session-1')).toBe(true);
  });

  it('returns true when RPC succeeds with rows_updated > 0', async () => {
    const { client, rpc } = makeMockClient({
      rpcResult: { data: { rows_updated: 1 }, error: null },
    });
    mockGetSupabaseClient.mockReturnValue(client as any);

    expect(await fn('session-1')).toBe(true);
    expect(rpc).toHaveBeenCalledWith(rpcName, { p_session_id: 'session-1' });
  });

  it('returns false when RPC returns an error', async () => {
    const { client } = makeMockClient({
      rpcResult: { data: null, error: { message: 'rpc failed' } },
    });
    mockGetSupabaseClient.mockReturnValue(client as any);

    expect(await fn('session-1')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 6. createSession
// ---------------------------------------------------------------------------

describe('createSession', () => {
  const params = {
    sessionId: 's1',
    participantId: 'p1',
    experimentId: 'exp1',
    appVersion: '1.0.0',
    rngSeed: 'seed',
    isTest: false,
    debugMode: false,
  };

  it('returns true when offline (null client)', async () => {
    mockGetSupabaseClient.mockReturnValue(null);
    expect(await createSession(params)).toBe(true);
  });

  it('returns true when insert succeeds', async () => {
    const { client, insert } = makeMockClient({ insertResult: { error: null } });
    mockGetSupabaseClient.mockReturnValue(client as any);

    expect(await createSession(params)).toBe(true);
    expect(client.from).toHaveBeenCalledWith('sessions');
    expect(insert).toHaveBeenCalled();
  });

  it('returns false when insert errors', async () => {
    const { client } = makeMockClient({
      insertResult: { error: { message: 'insert failed' } },
    });
    mockGetSupabaseClient.mockReturnValue(client as any);

    expect(await createSession(params)).toBe(false);
  });
});
