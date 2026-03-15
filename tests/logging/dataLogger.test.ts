import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DataLogger, EventRecord, BinRecord, PhaseSummaryRecord } from '../../src/logging/dataLogger';

// Mock the supabaseClient module
vi.mock('../../src/logging/supabaseClient', () => ({
  getSupabaseClient: vi.fn(),
  isOnline: vi.fn(),
}));

import { getSupabaseClient, isOnline } from '../../src/logging/supabaseClient';

const mockedGetSupabaseClient = vi.mocked(getSupabaseClient);
const mockedIsOnline = vi.mocked(isOnline);

function createMockUpsert(error: { message: string } | null = null) {
  return vi.fn().mockResolvedValue({ error });
}

function createMockClient(upsertFn: ReturnType<typeof vi.fn>) {
  return {
    from: vi.fn().mockReturnValue({ upsert: upsertFn }),
  };
}

function makeEvent(overrides: Partial<Omit<EventRecord, 'session_id' | 'participant_id' | 'experiment_id' | 'event_seq'>> = {}) {
  return {
    event_type: 'response' as const,
    client_timestamp_ms: performance.now(),
    ...overrides,
  };
}

function makeBin(phaseIndex: number, binIndex: number): Omit<BinRecord, 'session_id' | 'participant_id' | 'experiment_id'> {
  return {
    phase_label: 'baseline',
    phase_index: phaseIndex,
    bin_index: binIndex,
    bin_start_ms: binIndex * 5000,
    bin_end_ms: (binIndex + 1) * 5000,
    left_responses: 10,
    right_responses: 5,
    total_responses: 15,
    left_reinforcers: 2,
    right_reinforcers: 1,
    left_allocation: 0.67,
    right_allocation: 0.33,
  };
}

function makePhaseSummary(phaseIndex: number): Omit<PhaseSummaryRecord, 'session_id' | 'participant_id' | 'experiment_id'> {
  return {
    phase_label: 'baseline',
    phase_index: phaseIndex,
    phase_type: 'baseline',
    start_time_ms: 0,
    end_time_ms: 60000,
    duration_ms: 60000,
    ended_by: 'timer',
    total_left_responses: 100,
    total_right_responses: 50,
    total_left_reinforcers: 10,
    total_right_reinforcers: 5,
    final_left_allocation: 0.67,
    steady_state_reached: true,
  };
}

describe('DataLogger', () => {
  let logger: DataLogger;

  beforeEach(() => {
    vi.useFakeTimers();
    mockedIsOnline.mockReturnValue(true);
    mockedGetSupabaseClient.mockReturnValue(null);
  });

  afterEach(async () => {
    if (logger) {
      // Destroy clears the interval and calls flush; since we have fake timers
      // we need to ensure any pending promises resolve.
      await logger.destroy();
    }
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('event sequence numbers', () => {
    it('assigns monotonically incrementing event_seq starting from 0', () => {
      logger = new DataLogger('sess-1', 'part-1', 'exp-1', true);

      logger.logEvent(makeEvent());
      logger.logEvent(makeEvent());
      logger.logEvent(makeEvent());

      const log = logger.getLocalLog();
      const seqs = log
        .filter(entry => entry.table === 'event_log')
        .map(entry => entry.event_seq);

      expect(seqs).toEqual([0, 1, 2]);
    });
  });

  describe('events are buffered and flushed', () => {
    it('calls upsert with the buffered event records on flush', async () => {
      const upsertFn = createMockUpsert(null);
      const mockClient = createMockClient(upsertFn);
      mockedGetSupabaseClient.mockReturnValue(mockClient as any);
      mockedIsOnline.mockReturnValue(true);

      logger = new DataLogger('sess-1', 'part-1', 'exp-1');

      logger.logEvent(makeEvent({ event_type: 'phase_start' }));
      logger.logEvent(makeEvent({ event_type: 'response' }));

      await logger.flush();

      expect(mockClient.from).toHaveBeenCalledWith('event_log');
      expect(upsertFn).toHaveBeenCalledTimes(1);

      const [batch, opts] = upsertFn.mock.calls[0];
      expect(batch).toHaveLength(2);
      expect(batch[0].event_type).toBe('phase_start');
      expect(batch[0].session_id).toBe('sess-1');
      expect(batch[0].event_seq).toBe(0);
      expect(batch[1].event_type).toBe('response');
      expect(batch[1].event_seq).toBe(1);
      expect(opts).toEqual({
        onConflict: 'session_id,event_seq',
        ignoreDuplicates: true,
      });
    });
  });

  describe('flush retry re-queues on error', () => {
    it('re-queues the batch when upsert returns an error, then succeeds on retry', async () => {
      const upsertFn = createMockUpsert({ message: 'timeout' });
      const mockClient = createMockClient(upsertFn);
      mockedGetSupabaseClient.mockReturnValue(mockClient as any);
      mockedIsOnline.mockReturnValue(true);

      logger = new DataLogger('sess-1', 'part-1', 'exp-1');

      logger.logEvent(makeEvent({ event_type: 'response' }));
      logger.logEvent(makeEvent({ event_type: 'response' }));

      // First flush fails
      await logger.flush();

      // The batch should be re-queued -- flushing again should retry
      expect(upsertFn).toHaveBeenCalledTimes(1);
      const firstBatch = upsertFn.mock.calls[0][0];
      expect(firstBatch).toHaveLength(2);
      expect(firstBatch[0].event_seq).toBe(0);
      expect(firstBatch[1].event_seq).toBe(1);

      // Now mock success
      upsertFn.mockResolvedValue({ error: null });

      await logger.flush();

      expect(upsertFn).toHaveBeenCalledTimes(2);
      const retryBatch = upsertFn.mock.calls[1][0];
      expect(retryBatch).toHaveLength(2);
      // Same event_seq values -- dedup via upsert
      expect(retryBatch[0].event_seq).toBe(0);
      expect(retryBatch[1].event_seq).toBe(1);
    });
  });

  describe('bins are flushed with upsert', () => {
    it('calls upsert with correct onConflict and ignoreDuplicates for bins', async () => {
      const upsertFn = createMockUpsert(null);
      const mockClient = createMockClient(upsertFn);
      mockedGetSupabaseClient.mockReturnValue(mockClient as any);
      mockedIsOnline.mockReturnValue(true);

      logger = new DataLogger('sess-1', 'part-1', 'exp-1');

      logger.logBin(makeBin(0, 0));
      logger.logBin(makeBin(0, 1));

      await logger.flush();

      expect(mockClient.from).toHaveBeenCalledWith('bin_log');
      expect(upsertFn).toHaveBeenCalledTimes(1);

      const [batch, opts] = upsertFn.mock.calls[0];
      expect(batch).toHaveLength(2);
      expect(batch[0].bin_index).toBe(0);
      expect(batch[1].bin_index).toBe(1);
      expect(opts).toEqual({
        onConflict: 'session_id,phase_index,bin_index',
        ignoreDuplicates: true,
      });
    });
  });

  describe('phase summaries are flushed with upsert', () => {
    it('calls upsert with correct onConflict and ignoreDuplicates for phase summaries', async () => {
      const upsertFn = createMockUpsert(null);
      const mockClient = createMockClient(upsertFn);
      mockedGetSupabaseClient.mockReturnValue(mockClient as any);
      mockedIsOnline.mockReturnValue(true);

      logger = new DataLogger('sess-1', 'part-1', 'exp-1');

      logger.logPhaseSummary(makePhaseSummary(0));

      await logger.flush();

      expect(mockClient.from).toHaveBeenCalledWith('phase_summary');
      expect(upsertFn).toHaveBeenCalledTimes(1);

      const [batch, opts] = upsertFn.mock.calls[0];
      expect(batch).toHaveLength(1);
      expect(batch[0].phase_index).toBe(0);
      expect(opts).toEqual({
        onConflict: 'session_id,phase_index',
        ignoreDuplicates: true,
      });
    });
  });

  describe('debug/offline mode skips Supabase', () => {
    it('does not call Supabase when debugLocalOnly is true', async () => {
      const upsertFn = createMockUpsert(null);
      const mockClient = createMockClient(upsertFn);
      mockedGetSupabaseClient.mockReturnValue(mockClient as any);
      mockedIsOnline.mockReturnValue(true);

      logger = new DataLogger('sess-1', 'part-1', 'exp-1', true);

      logger.logEvent(makeEvent());
      logger.logEvent(makeEvent());

      await logger.flush();

      expect(upsertFn).not.toHaveBeenCalled();

      // Events should still be in local log
      const log = logger.getLocalLog();
      const events = log.filter(e => e.table === 'event_log');
      expect(events).toHaveLength(2);
    });
  });

  describe('local log captures all entries', () => {
    it('includes events, bins, and phase summaries with correct table fields', () => {
      logger = new DataLogger('sess-1', 'part-1', 'exp-1', true);

      logger.logEvent(makeEvent({ event_type: 'phase_start' }));
      logger.logBin(makeBin(0, 0));
      logger.logPhaseSummary(makePhaseSummary(0));

      const log = logger.getLocalLog();

      expect(log).toHaveLength(3);
      expect(log[0].table).toBe('event_log');
      expect(log[1].table).toBe('bin_log');
      expect(log[2].table).toBe('phase_summary');
    });
  });

  describe('auto-flush triggers at BATCH_SIZE', () => {
    it('automatically flushes events when BATCH_SIZE (50) is reached', async () => {
      const upsertFn = createMockUpsert(null);
      const mockClient = createMockClient(upsertFn);
      mockedGetSupabaseClient.mockReturnValue(mockClient as any);
      mockedIsOnline.mockReturnValue(true);

      logger = new DataLogger('sess-1', 'part-1', 'exp-1');

      for (let i = 0; i < 50; i++) {
        logger.logEvent(makeEvent());
      }

      // flushEvents is called synchronously inside logEvent when buffer hits 50,
      // but the upsert is async. Flush microtask queue.
      await vi.waitFor(() => {
        expect(upsertFn).toHaveBeenCalled();
      });

      const [batch] = upsertFn.mock.calls[0];
      expect(batch).toHaveLength(50);
    });
  });

  describe('periodic flush via setInterval', () => {
    it('triggers flush after FLUSH_INTERVAL_MS elapses', async () => {
      const upsertFn = createMockUpsert(null);
      const mockClient = createMockClient(upsertFn);
      mockedGetSupabaseClient.mockReturnValue(mockClient as any);
      mockedIsOnline.mockReturnValue(true);

      logger = new DataLogger('sess-1', 'part-1', 'exp-1');

      logger.logEvent(makeEvent());

      // Advance past the 5000ms flush interval
      await vi.advanceTimersByTimeAsync(5000);

      expect(upsertFn).toHaveBeenCalled();
    });
  });
});
