import { ScheduleState, CODState, LockoutState, Side } from './types';

/**
 * Generate an exponentially distributed inter-reinforcement interval.
 * Clamped to [0.1 * viMs, 3 * viMs] to avoid extreme values.
 */
export function generateInterval(viMs: number, rng: () => number): number {
  const raw = -viMs * Math.log(1 - rng());
  const minVal = viMs * 0.1;
  const maxVal = viMs * 3;
  return Math.max(minVal, Math.min(maxVal, raw));
}

/** Create initial schedule state */
export function createScheduleState(intervalMs: number, startTimeMs: number, rng: () => number): ScheduleState {
  return {
    intervalMs,
    baited: false,
    nextBaitTimeMs: startTimeMs + generateInterval(intervalMs, rng),
    lastReinforcerTimeMs: 0,
  };
}

/**
 * Update baiting: if current time >= nextBaitTimeMs, set baited=true
 * and generate the next bait time. Baiting accumulates (stays true until collected).
 */
export function updateBaiting(schedule: ScheduleState, currentTimeMs: number, rng: () => number): ScheduleState {
  if (currentTimeMs >= schedule.nextBaitTimeMs) {
    return {
      ...schedule,
      baited: true,
      nextBaitTimeMs: currentTimeMs + generateInterval(schedule.intervalMs, rng),
    };
  }
  return schedule;
}

/**
 * Check if a response should produce reinforcement.
 * Delivers only if baited AND no COD active AND no lockout active.
 */
export function checkReinforcement(
  schedule: ScheduleState,
  currentTimeMs: number,
  codActive: boolean,
  lockoutActive: boolean
): { delivered: boolean; updatedSchedule: ScheduleState } {
  if (schedule.baited && !codActive && !lockoutActive) {
    return {
      delivered: true,
      updatedSchedule: {
        ...schedule,
        baited: false,
        lastReinforcerTimeMs: currentTimeMs,
      },
    };
  }
  return { delivered: false, updatedSchedule: schedule };
}

/** Create initial COD state (inactive) */
export function createCODState(): CODState {
  return { active: false, side: null, startTimeMs: 0, durationMs: 0 };
}

/** Start a changeover delay */
export function startCOD(side: Side, timeMs: number, durationMs: number): CODState {
  return { active: true, side, startTimeMs: timeMs, durationMs };
}

/** Check if COD is currently active */
export function isCODActive(cod: CODState, currentTimeMs: number): boolean {
  if (!cod.active) return false;
  return currentTimeMs < cod.startTimeMs + cod.durationMs;
}

/** Create initial lockout state (inactive) */
export function createLockoutState(): LockoutState {
  return { active: false, lockedSide: null, startTimeMs: 0, durationMs: 0, nextLockoutTimeMs: 0 };
}

/**
 * Check and update lockout state for C perturbation.
 * Lockouts occur every intervalMs, lasting durationMs.
 * The lockedSide is the preferred key.
 */
export function checkLockout(
  lockout: LockoutState,
  currentTimeMs: number,
  lockedSide: Side,
  intervalMs: number,
  durationMs: number
): LockoutState {
  let state = lockout;

  // Initialize on first call: set first lockout time
  if (state.nextLockoutTimeMs === 0) {
    state = {
      active: false,
      lockedSide,
      startTimeMs: 0,
      durationMs,
      nextLockoutTimeMs: intervalMs,
    };
  }

  // If currently in a lockout, check if it's ended
  if (state.active) {
    if (currentTimeMs >= state.startTimeMs + state.durationMs) {
      state = {
        active: false,
        lockedSide,
        startTimeMs: state.startTimeMs,
        durationMs,
        nextLockoutTimeMs: state.startTimeMs + intervalMs,
      };
    } else {
      return state;
    }
  }

  // Check if it's time for the next lockout
  if (currentTimeMs >= state.nextLockoutTimeMs) {
    return {
      active: true,
      lockedSide,
      startTimeMs: currentTimeMs,
      durationMs,
      nextLockoutTimeMs: state.nextLockoutTimeMs,
    };
  }

  return state;
}

/** Check if lockout is currently active */
export function isLockoutActive(lockout: LockoutState, currentTimeMs: number): boolean {
  if (!lockout.active) return false;
  return currentTimeMs >= lockout.startTimeMs && currentTimeMs < lockout.startTimeMs + lockout.durationMs;
}
