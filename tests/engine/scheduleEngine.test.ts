import { describe, it, expect } from 'vitest';
import {
  createScheduleState, generateInterval, updateBaiting,
  checkReinforcement, startCOD, isCODActive,
  createLockoutState, checkLockout, isLockoutActive,
} from '../../src/engine/scheduleEngine';
import { createRng } from '../../src/utils/rng';

describe('scheduleEngine', () => {
  const rng = createRng(42);

  describe('generateInterval', () => {
    it('returns positive values', () => {
      for (let i = 0; i < 100; i++) {
        const interval = generateInterval(20000, rng);
        expect(interval).toBeGreaterThan(0);
      }
    });

    it('clamps to reasonable range', () => {
      for (let i = 0; i < 100; i++) {
        const interval = generateInterval(20000, rng);
        expect(interval).toBeGreaterThanOrEqual(2000);  // 0.1 * 20000
        expect(interval).toBeLessThanOrEqual(60000);     // 3 * 20000
      }
    });

    it('averages near the VI value', () => {
      const testRng = createRng(123);
      const intervals = Array.from({ length: 1000 }, () => generateInterval(20000, testRng));
      const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      // Should be roughly around 20000 (within 30%)
      expect(mean).toBeGreaterThan(14000);
      expect(mean).toBeLessThan(26000);
    });
  });

  describe('createScheduleState', () => {
    it('creates a schedule with correct interval', () => {
      const state = createScheduleState(20000, 0, rng);
      expect(state.intervalMs).toBe(20000);
      expect(state.baited).toBe(false);
      expect(state.nextBaitTimeMs).toBeGreaterThan(0);
    });
  });

  describe('updateBaiting', () => {
    it('does not bait before next bait time', () => {
      const state = createScheduleState(20000, 0, rng);
      const updated = updateBaiting(state, state.nextBaitTimeMs - 1, rng);
      expect(updated.baited).toBe(false);
    });

    it('baits at next bait time', () => {
      const testRng = createRng(99);
      const state = createScheduleState(20000, 0, testRng);
      const updated = updateBaiting(state, state.nextBaitTimeMs + 1, testRng);
      expect(updated.baited).toBe(true);
    });

    it('generates new bait time after baiting', () => {
      const testRng = createRng(99);
      const state = createScheduleState(20000, 0, testRng);
      const oldBaitTime = state.nextBaitTimeMs;
      const updated = updateBaiting(state, oldBaitTime + 1, testRng);
      expect(updated.nextBaitTimeMs).toBeGreaterThan(oldBaitTime);
    });
  });

  describe('checkReinforcement', () => {
    it('delivers when baited and no COD/lockout', () => {
      const state: ReturnType<typeof createScheduleState> = {
        intervalMs: 20000,
        baited: true,
        nextBaitTimeMs: 40000,
        lastReinforcerTimeMs: 0,
      };
      const { delivered, updatedSchedule } = checkReinforcement(state, 21000, false, false);
      expect(delivered).toBe(true);
      expect(updatedSchedule.baited).toBe(false);
      expect(updatedSchedule.lastReinforcerTimeMs).toBe(21000);
    });

    it('does not deliver when COD active', () => {
      const state = { intervalMs: 20000, baited: true, nextBaitTimeMs: 40000, lastReinforcerTimeMs: 0 };
      const { delivered } = checkReinforcement(state, 21000, true, false);
      expect(delivered).toBe(false);
    });

    it('does not deliver when lockout active', () => {
      const state = { intervalMs: 20000, baited: true, nextBaitTimeMs: 40000, lastReinforcerTimeMs: 0 };
      const { delivered } = checkReinforcement(state, 21000, false, true);
      expect(delivered).toBe(false);
    });

    it('does not deliver when not baited', () => {
      const state = { intervalMs: 20000, baited: false, nextBaitTimeMs: 40000, lastReinforcerTimeMs: 0 };
      const { delivered } = checkReinforcement(state, 21000, false, false);
      expect(delivered).toBe(false);
    });
  });

  describe('COD', () => {
    it('starts COD correctly', () => {
      const cod = startCOD('left', 5000, 2000);
      expect(cod.active).toBe(true);
      expect(cod.side).toBe('left');
      expect(cod.startTimeMs).toBe(5000);
      expect(cod.durationMs).toBe(2000);
    });

    it('is active during duration', () => {
      const cod = startCOD('left', 5000, 2000);
      expect(isCODActive(cod, 5500)).toBe(true);
      expect(isCODActive(cod, 6999)).toBe(true);
    });

    it('is inactive after duration', () => {
      const cod = startCOD('left', 5000, 2000);
      expect(isCODActive(cod, 7001)).toBe(false);
    });
  });

  describe('Lockout (C perturbation)', () => {
    it('creates inactive lockout state', () => {
      const state = createLockoutState();
      expect(state.active).toBe(false);
    });

    it('activates lockout at correct intervals', () => {
      // Phase starts at time 0. Lockout every 10s for 2s.
      let state = createLockoutState();
      // At t=10000, lockout should start
      state = checkLockout(state, 10000, 'left', 10000, 2000);
      expect(isLockoutActive(state, 10000)).toBe(true);
      expect(isLockoutActive(state, 11000)).toBe(true);
      expect(isLockoutActive(state, 12001)).toBe(false);
    });

    it('locks the correct side', () => {
      let state = createLockoutState();
      state = checkLockout(state, 10000, 'right', 10000, 2000);
      expect(state.lockedSide).toBe('right');
    });
  });
});
