/** Valid perturbation orders */
export const PERTURBATION_ORDERS = ['BCD', 'BDC', 'CBD', 'CDB', 'DBC', 'DCB'] as const;
export type PerturbationOrder = typeof PERTURBATION_ORDERS[number];

/** Phase types */
export type PhaseType = 'A' | 'B' | 'C' | 'D' | 'practice';

/** Side/key */
export type Side = 'left' | 'right';
export type KeyMapping = { left: string; right: string };

/** Phase definition in the sequence */
export interface PhaseDef {
  label: string;
  type: PhaseType;
  index: number;
  perturbationType?: 'B' | 'C' | 'D';
  perturbationInstance?: 1 | 2;
}

/** VI schedule state for one side */
export interface ScheduleState {
  intervalMs: number;
  baited: boolean;
  nextBaitTimeMs: number;
  lastReinforcerTimeMs: number;
}

/** COD state */
export interface CODState {
  active: boolean;
  side: Side | null;
  startTimeMs: number;
  durationMs: number;
}

/** Lockout state for C perturbation */
export interface LockoutState {
  active: boolean;
  lockedSide: Side | null;
  startTimeMs: number;
  durationMs: number;
  nextLockoutTimeMs: number;
}

/** 5-second bin data */
export interface BinData {
  binIndex: number;
  binStartMs: number;
  binEndMs: number;
  leftResponses: number;
  rightResponses: number;
  totalResponses: number;
  leftReinforcers: number;
  rightReinforcers: number;
  leftAllocation: number;
}

/** Steady state check result */
export interface SteadyStateResult {
  met: boolean;
  slope: number;
  sd: number;
  totalResponses: number;
  binsUsed: number;
  consecutivePasses: number;
}

/** Response event from user */
export interface ResponseEvent {
  side: Side;
  timestampMs: number;
  key: string;
}

/** Engine configuration */
export interface EngineConfig {
  viBaselineMs: number;
  viPerturbBLessPreferredMs: number;
  viPerturbBMorePreferredMs: number;
  codDurationMs: number;
  binSizeMs: number;
  minAPhaseDurationMs: number;
  maxAPhaseDurationMs: number;
  perturbationDurationMs: number;
  practiceDurationMs: number;
  lockoutIntervalMs: number;
  lockoutDurationMs: number;
  steadyStateBins: number;
  steadyStateMaxSlope: number;
  steadyStateMaxSD: number;
  steadyStateMinResponses: number;
  steadyStateConsecutive: number;
  pointsPerReinforcer: number;
  rngSeed?: string;
}

/** Phase engine state */
export interface PhaseState {
  phaseDef: PhaseDef;
  startTimeMs: number;
  elapsedMs: number;
  leftSchedule: ScheduleState;
  rightSchedule: ScheduleState;
  cod: CODState;
  lockout: LockoutState;
  bins: BinData[];
  currentBinIndex: number;
  totalLeftResponses: number;
  totalRightResponses: number;
  totalLeftReinforcers: number;
  totalRightReinforcers: number;
  totalPoints: number;
  lastResponseSide: Side | null;
  lastResponseTimeMs: number;
  steadyState: SteadyStateResult;
  preferredKey: Side | null;
  isComplete: boolean;
  endReason: 'steady_state' | 'timeout' | 'duration' | null;
}

export const DEFAULT_ENGINE_CONFIG: EngineConfig = {
  viBaselineMs: 20000,
  viPerturbBLessPreferredMs: 8000,
  viPerturbBMorePreferredMs: 30000,
  codDurationMs: 2000,
  binSizeMs: 5000,
  minAPhaseDurationMs: 60000,
  maxAPhaseDurationMs: 360000,
  perturbationDurationMs: 45000,
  practiceDurationMs: 30000,
  lockoutIntervalMs: 10000,
  lockoutDurationMs: 2000,
  steadyStateBins: 12,
  steadyStateMaxSlope: 0.002,
  steadyStateMaxSD: 0.08,
  steadyStateMinResponses: 100,
  steadyStateConsecutive: 2,
  pointsPerReinforcer: 1,
};
