import {
  PerturbationOrder, PhaseDef, PhaseState, EngineConfig, Side,
  BinData, SteadyStateResult,
} from './types';
import { createScheduleState, createCODState, createLockoutState } from './scheduleEngine';

/**
 * Build the 12-phase experiment sequence from a perturbation order.
 *
 * Pattern: A1 P1_1 A2 P1_2 A3 P2_1 A4 P2_2 A5 P3_1 A6 P3_2
 * where P1, P2, P3 are the three perturbation types in assigned order.
 *
 * Examples:
 *   BCD -> A1 B1 A2 B2 A3 C1 A4 C2 A5 D1 A6 D2
 *   DBC -> A1 D1 A2 D2 A3 B1 A4 B2 A5 C1 A6 C2
 */
export function buildPhaseSequence(order: PerturbationOrder): PhaseDef[] {
  const pertTypes = order.split('') as ('B' | 'C' | 'D')[];
  const phases: PhaseDef[] = [];
  let idx = 0;
  let aCount = 1;

  for (let p = 0; p < 3; p++) {
    const pertType = pertTypes[p];
    for (let instance = 1; instance <= 2; instance++) {
      // A phase before each perturbation
      phases.push({
        label: `A${aCount}`,
        type: 'A',
        index: idx++,
      });
      aCount++;

      // Perturbation phase
      phases.push({
        label: `${pertType}${instance}`,
        type: pertType,
        index: idx++,
        perturbationType: pertType,
        perturbationInstance: instance as 1 | 2,
      });
    }
  }

  return phases;
}

/**
 * Determine the preferred key from recent bin data.
 * Looks at bins within the last windowMs and computes mean left allocation.
 * If mean left allocation >= 0.5, preferred = left; else right.
 */
export function determinePreferredKey(bins: BinData[], windowMs: number): Side {
  if (bins.length === 0) return 'left';

  const lastBinEnd = bins[bins.length - 1].binEndMs;
  const windowStart = lastBinEnd - windowMs;

  const windowBins = bins.filter(b => b.binEndMs > windowStart);
  if (windowBins.length === 0) return 'left';

  const totalLeft = windowBins.reduce((s, b) => s + b.leftResponses, 0);
  const totalRight = windowBins.reduce((s, b) => s + b.rightResponses, 0);
  const total = totalLeft + totalRight;

  if (total === 0) return 'left';
  return totalLeft / total >= 0.5 ? 'left' : 'right';
}

/**
 * Get VI schedule values for a phase.
 *
 * A, C, D phases: baseline VI 20s / VI 20s
 * B phases: VI 8s for less-preferred key, VI 30s for more-preferred key
 */
export function getScheduleValuesForPhase(
  phaseDef: PhaseDef,
  config: EngineConfig,
  preferredKey: Side | null
): { leftMs: number; rightMs: number } {
  if (phaseDef.type === 'B' && preferredKey) {
    // B perturbation: enrich less-preferred, lean more-preferred
    if (preferredKey === 'left') {
      return {
        leftMs: config.viPerturbBMorePreferredMs,  // 30s - lean
        rightMs: config.viPerturbBLessPreferredMs,  // 8s - rich
      };
    } else {
      return {
        leftMs: config.viPerturbBLessPreferredMs,   // 8s - rich
        rightMs: config.viPerturbBMorePreferredMs,   // 30s - lean
      };
    }
  }

  // All other phases: baseline
  return {
    leftMs: config.viBaselineMs,
    rightMs: config.viBaselineMs,
  };
}

/**
 * Create the initial PhaseState for a phase.
 */
export function createInitialPhaseState(
  phaseDef: PhaseDef,
  config: EngineConfig,
  startTimeMs: number,
  preferredKey: Side | null,
  rng: () => number
): PhaseState {
  const { leftMs, rightMs } = getScheduleValuesForPhase(phaseDef, config, preferredKey);

  return {
    phaseDef,
    startTimeMs,
    elapsedMs: 0,
    leftSchedule: createScheduleState(leftMs, startTimeMs, rng),
    rightSchedule: createScheduleState(rightMs, startTimeMs, rng),
    cod: createCODState(),
    lockout: createLockoutState(),
    bins: [],
    currentBinIndex: 0,
    totalLeftResponses: 0,
    totalRightResponses: 0,
    totalLeftReinforcers: 0,
    totalRightReinforcers: 0,
    totalPoints: 0,
    lastResponseSide: null,
    lastResponseTimeMs: 0,
    steadyState: { met: false, slope: 0, sd: 0, totalResponses: 0, binsUsed: 0, consecutivePasses: 0 },
    preferredKey,
    isComplete: false,
    endReason: null,
  };
}
