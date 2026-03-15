import React, { useEffect, useRef, useCallback, useState } from 'react';
import {
  PerturbationOrder, EngineConfig, PhaseDef, PhaseState, Side,
  BinData, ScheduleState, CODState, LockoutState,
  DEFAULT_ENGINE_CONFIG,
} from '../../engine/types';
import { buildPhaseSequence, determinePreferredKey, getScheduleValuesForPhase, createInitialPhaseState } from '../../engine/phaseController';
import { updateBaiting, checkReinforcement, startCOD, isCODActive, checkLockout, isLockoutActive, createLockoutState, generateInterval, createScheduleState } from '../../engine/scheduleEngine';
import { checkSteadyState } from '../../engine/steadyState';
import { DataLogger } from '../../logging/dataLogger';
import { createRng } from '../../utils/rng';
import { nowMs } from '../../utils/time';
import { playNeutralTone } from '../../utils/audio';
import { TaskDisplay } from './TaskDisplay';

interface Props {
  participantId: string;
  sessionId: string;
  assignedOrder: PerturbationOrder;
  config: EngineConfig;
  logger: DataLogger;
  onExperimentStart: () => void;
  onExperimentEnd: (totalPoints: number) => void;
}

export const ExperimentRunner: React.FC<Props> = ({
  participantId,
  sessionId,
  assignedOrder,
  config,
  logger,
  onExperimentStart,
  onExperimentEnd,
}) => {
  // Build full phase sequence: practice + 12 experiment phases
  const phases = useRef<PhaseDef[]>([]);
  const [currentPhaseIndex, setCurrentPhaseIndex] = useState(-1); // -1 = practice
  const [totalPoints, setTotalPoints] = useState(0);
  const [phaseLabel, setPhaseLabel] = useState('Practice');
  const [isContextShift, setIsContextShift] = useState(false);
  const [showContextShiftLabel, setShowContextShiftLabel] = useState(false);
  const [lockoutDisplay, setLockoutDisplay] = useState<LockoutState>({
    active: false, lockedSide: null, startTimeMs: 0, durationMs: 0, nextLockoutTimeMs: 0,
  });

  // Mutable state refs for the game loop (not React state to avoid re-render overhead)
  const phaseState = useRef<PhaseState | null>(null);
  const rng = useRef(createRng(config.rngSeed || `${participantId}-${sessionId}`));
  const animFrameRef = useRef<number>(0);
  const experimentStartTimeMs = useRef(0);
  const phaseStartTimeMs = useRef(0);
  const lastBinCheckTimeMs = useRef(0);
  const consecutiveSteadyPasses = useRef(0);
  const practiceMode = useRef(true);
  const isRunning = useRef(false);
  const lastPreferredKey = useRef<Side | null>(null);
  const allPhasesBins = useRef<BinData[][]>([]);
  const cumulativePoints = useRef(0);
  const hiddenAtMs = useRef<number | null>(null);
  const totalPausedMs = useRef(0);
  const gameLoopRef = useRef<() => void>(() => {});

  // Initialize phases
  useEffect(() => {
    const sequence = buildPhaseSequence(assignedOrder);
    phases.current = sequence;

    // Start with practice phase
    startPractice();
    onExperimentStart();

    return () => {
      isRunning.current = false;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pause the phase clock when tab loses focus; resume when it returns
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!isRunning.current) return;

      if (document.hidden) {
        // Tab hidden — stop the game loop and record the time
        const hideTime = nowMs();
        hiddenAtMs.current = hideTime;
        if (animFrameRef.current) {
          cancelAnimationFrame(animFrameRef.current);
          animFrameRef.current = 0;
        }
        logger.logEvent({
          event_type: 'focus_lost',
          client_timestamp_ms: hideTime,
          phase_label: phaseState.current?.phaseDef.label,
          phase_index: phaseState.current?.phaseDef.index,
        });
      } else if (hiddenAtMs.current !== null) {
        // Tab restored — shift timing references forward by the hidden duration
        const restoreTime = nowMs();
        const pauseDuration = restoreTime - hiddenAtMs.current;
        totalPausedMs.current += pauseDuration;

        // Shift the phase start time so elapsed calculations exclude paused time
        const ps = phaseState.current;
        if (ps) {
          ps.startTimeMs += pauseDuration;

          // Shift schedule bait times
          ps.leftSchedule.nextBaitTimeMs += pauseDuration;
          ps.rightSchedule.nextBaitTimeMs += pauseDuration;
          if (ps.leftSchedule.lastReinforcerTimeMs > 0) ps.leftSchedule.lastReinforcerTimeMs += pauseDuration;
          if (ps.rightSchedule.lastReinforcerTimeMs > 0) ps.rightSchedule.lastReinforcerTimeMs += pauseDuration;

          // Shift COD
          if (ps.cod.active) ps.cod.startTimeMs += pauseDuration;

          // Shift lockout
          if (ps.lockout.active) ps.lockout.startTimeMs += pauseDuration;
          if (ps.lockout.nextLockoutTimeMs > 0) ps.lockout.nextLockoutTimeMs += pauseDuration;

          // Shift last response time
          if (ps.lastResponseTimeMs > 0) ps.lastResponseTimeMs += pauseDuration;
        }

        // Also shift the experiment-level start time for total duration calc
        experimentStartTimeMs.current += pauseDuration;

        logger.logEvent({
          event_type: 'focus_restored',
          client_timestamp_ms: restoreTime,
          phase_label: ps?.phaseDef.label,
          phase_index: ps?.phaseDef.index,
          metadata_json: { pause_duration_ms: pauseDuration, total_paused_ms: totalPausedMs.current },
        });

        hiddenAtMs.current = null;

        // Restart the game loop
        animFrameRef.current = requestAnimationFrame(() => gameLoopRef.current());
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [logger]);

  const startPractice = useCallback(() => {
    practiceMode.current = true;
    isRunning.current = true;
    const startTime = nowMs();
    experimentStartTimeMs.current = startTime;
    phaseStartTimeMs.current = startTime;
    consecutiveSteadyPasses.current = 0;

    const practiceDef: PhaseDef = {
      label: 'Practice',
      type: 'practice',
      index: -1,
    };

    phaseState.current = createInitialPhaseState(practiceDef, config, startTime, null, rng.current);
    setPhaseLabel('Practice');
    setIsContextShift(false);
    setShowContextShiftLabel(false);

    logger.logEvent({
      event_type: 'practice_start',
      client_timestamp_ms: startTime,
      phase_label: 'Practice',
      phase_index: -1,
    });

    // Start game loop
    gameLoop();
  }, [config, logger]);

  const startPhase = useCallback((index: number) => {
    // Guard against double animation frame scheduling
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);

    if (index >= phases.current.length) {
      // Experiment complete
      endExperiment();
      return;
    }

    const phaseDef = phases.current[index];
    const startTime = nowMs();
    phaseStartTimeMs.current = startTime;
    consecutiveSteadyPasses.current = 0;

    // Determine preferred key from last A phase bins
    let preferredKey: Side | null = null;
    if (phaseDef.type !== 'A' && allPhasesBins.current.length > 0) {
      // Use bins from the preceding A phase
      const lastABins = allPhasesBins.current[allPhasesBins.current.length - 1];
      if (lastABins && lastABins.length > 0) {
        preferredKey = determinePreferredKey(lastABins, 60000);
        lastPreferredKey.current = preferredKey;
      }
    }

    phaseState.current = createInitialPhaseState(phaseDef, config, startTime, preferredKey, rng.current);

    // Context shift for D perturbation
    const isDPhase = phaseDef.type === 'D';
    setIsContextShift(isDPhase);
    setShowContextShiftLabel(isDPhase);
    if (isDPhase) {
      playNeutralTone();
    }

    setPhaseLabel(phaseDef.label);
    setCurrentPhaseIndex(index);

    logger.logEvent({
      event_type: 'phase_start',
      client_timestamp_ms: startTime,
      phase_label: phaseDef.label,
      phase_index: phaseDef.index,
      metadata_json: {
        phase_type: phaseDef.type,
        perturbation_type: phaseDef.perturbationType,
        perturbation_instance: phaseDef.perturbationInstance,
        preferred_key: preferredKey,
        vi_left_ms: phaseState.current.leftSchedule.intervalMs,
        vi_right_ms: phaseState.current.rightSchedule.intervalMs,
      },
    });
  }, [config, logger]);

  const endPhase = useCallback((reason: string) => {
    const ps = phaseState.current;
    if (!ps) return;

    const endTime = nowMs();
    const phaseDef = ps.phaseDef;

    // Store bins for this phase
    allPhasesBins.current.push([...ps.bins]);

    // Log bin data
    for (const bin of ps.bins) {
      logger.logBin({
        phase_label: phaseDef.label,
        phase_index: phaseDef.index,
        bin_index: bin.binIndex,
        bin_start_ms: bin.binStartMs,
        bin_end_ms: bin.binEndMs,
        left_responses: bin.leftResponses,
        right_responses: bin.rightResponses,
        total_responses: bin.totalResponses,
        left_reinforcers: bin.leftReinforcers,
        right_reinforcers: bin.rightReinforcers,
        left_allocation: bin.leftAllocation,
        right_allocation: bin.totalResponses > 0 ? bin.rightResponses / bin.totalResponses : 0,
      });
    }

    // Compute final left allocation
    const totalResp = ps.totalLeftResponses + ps.totalRightResponses;
    const finalLeftAlloc = totalResp > 0 ? ps.totalLeftResponses / totalResp : 0.5;

    // Log phase summary
    logger.logPhaseSummary({
      phase_label: phaseDef.label,
      phase_index: phaseDef.index,
      phase_type: phaseDef.type,
      perturbation_type: phaseDef.perturbationType,
      start_time_ms: ps.startTimeMs,
      end_time_ms: endTime,
      duration_ms: endTime - ps.startTimeMs,
      ended_by: reason,
      total_left_responses: ps.totalLeftResponses,
      total_right_responses: ps.totalRightResponses,
      total_left_reinforcers: ps.totalLeftReinforcers,
      total_right_reinforcers: ps.totalRightReinforcers,
      final_left_allocation: finalLeftAlloc,
      steady_state_reached: reason === 'steady_state',
      steady_state_slope: ps.steadyState.slope,
      steady_state_sd: ps.steadyState.sd,
      preferred_key: ps.preferredKey || undefined,
      vi_left_ms: ps.leftSchedule.intervalMs,
      vi_right_ms: ps.rightSchedule.intervalMs,
    });

    logger.logEvent({
      event_type: 'phase_end',
      client_timestamp_ms: endTime,
      phase_label: phaseDef.label,
      phase_index: phaseDef.index,
      metadata_json: { reason, duration_ms: endTime - ps.startTimeMs },
    });

    // Clear context shift
    setIsContextShift(false);
    setShowContextShiftLabel(false);
    setLockoutDisplay({ active: false, lockedSide: null, startTimeMs: 0, durationMs: 0, nextLockoutTimeMs: 0 });

    if (practiceMode.current) {
      // Practice is done, start main experiment
      practiceMode.current = false;
      logger.logEvent({
        event_type: 'practice_end',
        client_timestamp_ms: endTime,
      });
      // Reset points after practice
      cumulativePoints.current = 0;
      setTotalPoints(0);
      startPhase(0);
    } else {
      // Next phase
      const nextIndex = phases.current.findIndex(p => p.index === phaseDef.index) + 1;
      startPhase(nextIndex);
    }
  }, [logger, startPhase]);

  const endExperiment = useCallback(() => {
    isRunning.current = false;
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);

    const endTime = nowMs();
    logger.logEvent({
      event_type: 'experiment_end',
      client_timestamp_ms: endTime,
      points: cumulativePoints.current,
      metadata_json: {
        assigned_order: assignedOrder,
        total_duration_ms: endTime - experimentStartTimeMs.current,
      },
    });

    onExperimentEnd(cumulativePoints.current);
  }, [logger, assignedOrder, onExperimentEnd]);

  const handleResponse = useCallback((side: Side) => {
    const ps = phaseState.current;
    if (!ps || !isRunning.current || hiddenAtMs.current !== null) return;

    const currentTime = nowMs();
    const elapsed = currentTime - ps.startTimeMs;
    const key = side === 'left' ? 'f' : 'j';

    // Check for switch
    const isSwitch = ps.lastResponseSide !== null && ps.lastResponseSide !== side;

    // Update COD if switch occurred
    let cod = ps.cod;
    if (isSwitch) {
      cod = startCOD(ps.lastResponseSide!, currentTime, config.codDurationMs);
      logger.logEvent({
        event_type: 'switch',
        client_timestamp_ms: currentTime,
        phase_label: ps.phaseDef.label,
        phase_index: ps.phaseDef.index,
        key,
        side,
      });
      logger.logEvent({
        event_type: 'cod_start',
        client_timestamp_ms: currentTime,
        phase_label: ps.phaseDef.label,
        phase_index: ps.phaseDef.index,
        side,
        metadata_json: { duration_ms: config.codDurationMs },
      });
    }

    const codActive = isCODActive(cod, currentTime);

    // Check lockout (C perturbation)
    const lockoutActive = ps.phaseDef.type === 'C' && isLockoutActive(ps.lockout, currentTime) && ps.lockout.lockedSide === side;

    // Count response
    if (side === 'left') {
      ps.totalLeftResponses++;
    } else {
      ps.totalRightResponses++;
    }

    // Update current bin
    const binDuration = config.binSizeMs;
    const currentBinIdx = Math.floor(elapsed / binDuration);
    while (ps.bins.length <= currentBinIdx) {
      const binStart = ps.bins.length * binDuration;
      ps.bins.push({
        binIndex: ps.bins.length,
        binStartMs: binStart,
        binEndMs: binStart + binDuration,
        leftResponses: 0,
        rightResponses: 0,
        totalResponses: 0,
        leftReinforcers: 0,
        rightReinforcers: 0,
        leftAllocation: 0,
      });
    }
    const bin = ps.bins[currentBinIdx];
    if (side === 'left') bin.leftResponses++;
    else bin.rightResponses++;
    bin.totalResponses = bin.leftResponses + bin.rightResponses;
    bin.leftAllocation = bin.totalResponses > 0 ? bin.leftResponses / bin.totalResponses : 0;

    // Check reinforcement
    const schedule = side === 'left' ? ps.leftSchedule : ps.rightSchedule;
    const { delivered, updatedSchedule } = checkReinforcement(schedule, currentTime, codActive, lockoutActive);

    if (side === 'left') ps.leftSchedule = updatedSchedule;
    else ps.rightSchedule = updatedSchedule;

    let pointsEarned = 0;
    if (delivered) {
      pointsEarned = config.pointsPerReinforcer;
      ps.totalPoints += pointsEarned;
      cumulativePoints.current += pointsEarned;
      setTotalPoints(cumulativePoints.current);

      if (side === 'left') {
        ps.totalLeftReinforcers++;
        bin.leftReinforcers++;
      } else {
        ps.totalRightReinforcers++;
        bin.rightReinforcers++;
      }

      // Flash feedback
      if ((window as any).__taskFlash) {
        (window as any).__taskFlash(side);
      }

      logger.logEvent({
        event_type: 'reinforcer_delivered',
        client_timestamp_ms: currentTime,
        phase_label: ps.phaseDef.label,
        phase_index: ps.phaseDef.index,
        key,
        side,
        points: pointsEarned,
        schedule_value_ms: schedule.intervalMs,
      });
    }

    // Log response
    logger.logEvent({
      event_type: 'response',
      client_timestamp_ms: currentTime,
      phase_label: ps.phaseDef.label,
      phase_index: ps.phaseDef.index,
      key,
      side,
      points: pointsEarned,
      was_baited: schedule.baited || delivered,
      cod_active: codActive,
      lockout_active: lockoutActive,
      rt_ms: ps.lastResponseTimeMs > 0 ? currentTime - ps.lastResponseTimeMs : undefined,
    });

    // Update phase state
    ps.cod = cod;
    ps.lastResponseSide = side;
    ps.lastResponseTimeMs = currentTime;
  }, [config, logger]);

  const gameLoop = useCallback(() => {
    if (!isRunning.current) return;

    const ps = phaseState.current;
    if (!ps) return;

    const currentTime = nowMs();
    const elapsed = currentTime - ps.startTimeMs;
    ps.elapsedMs = elapsed;

    // Update baiting for both schedules
    ps.leftSchedule = updateBaiting(ps.leftSchedule, currentTime, rng.current);
    ps.rightSchedule = updateBaiting(ps.rightSchedule, currentTime, rng.current);

    // Update lockout for C perturbation
    if (ps.phaseDef.type === 'C' && ps.preferredKey) {
      const prevLockoutActive = isLockoutActive(ps.lockout, currentTime - 16); // ~1 frame ago
      ps.lockout = checkLockout(ps.lockout, currentTime, ps.preferredKey, config.lockoutIntervalMs, config.lockoutDurationMs);
      const nowLockoutActive = isLockoutActive(ps.lockout, currentTime);

      // Log lockout transitions
      if (!prevLockoutActive && nowLockoutActive) {
        logger.logEvent({
          event_type: 'lockout_start',
          client_timestamp_ms: currentTime,
          phase_label: ps.phaseDef.label,
          phase_index: ps.phaseDef.index,
          side: ps.preferredKey,
          metadata_json: { duration_ms: config.lockoutDurationMs },
        });
      } else if (prevLockoutActive && !nowLockoutActive) {
        logger.logEvent({
          event_type: 'lockout_end',
          client_timestamp_ms: currentTime,
          phase_label: ps.phaseDef.label,
          phase_index: ps.phaseDef.index,
          side: ps.preferredKey,
        });
      }

      // Update display
      setLockoutDisplay({
        active: nowLockoutActive,
        lockedSide: ps.preferredKey,
        startTimeMs: ps.lockout.startTimeMs,
        durationMs: config.lockoutDurationMs,
        nextLockoutTimeMs: ps.lockout.nextLockoutTimeMs,
      });
    }

    // Check COD expiry
    if (ps.cod.active && !isCODActive(ps.cod, currentTime)) {
      logger.logEvent({
        event_type: 'cod_end',
        client_timestamp_ms: currentTime,
        phase_label: ps.phaseDef.label,
        phase_index: ps.phaseDef.index,
      });
      ps.cod = { ...ps.cod, active: false };
    }

    // Close completed bins
    const binDuration = config.binSizeMs;
    const currentBinIdx = Math.floor(elapsed / binDuration);
    while (ps.bins.length > 0 && ps.currentBinIndex < currentBinIdx && ps.currentBinIndex < ps.bins.length) {
      const closedBin = ps.bins[ps.currentBinIndex];
      if (closedBin) {
        logger.logEvent({
          event_type: 'bin_closed',
          client_timestamp_ms: currentTime,
          phase_label: ps.phaseDef.label,
          phase_index: ps.phaseDef.index,
          metadata_json: {
            bin_index: closedBin.binIndex,
            left_responses: closedBin.leftResponses,
            right_responses: closedBin.rightResponses,
            left_allocation: closedBin.leftAllocation,
          },
        });
      }
      ps.currentBinIndex++;
    }

    // Check phase end conditions
    if (practiceMode.current) {
      // Practice: fixed duration
      if (elapsed >= config.practiceDurationMs) {
        endPhase('duration');
        return;
      }
    } else if (ps.phaseDef.type === 'A') {
      // A phase: steady state or timeout
      if (elapsed >= config.minAPhaseDurationMs && ps.bins.length >= config.steadyStateBins) {
        const recentBins = ps.bins.slice(-config.steadyStateBins);
        const ssResult = checkSteadyState(recentBins, {
          bins: config.steadyStateBins,
          maxSlope: config.steadyStateMaxSlope,
          maxSD: config.steadyStateMaxSD,
          minResponses: config.steadyStateMinResponses,
        });
        ps.steadyState = ssResult;

        if (ssResult.met) {
          consecutiveSteadyPasses.current++;
          if (consecutiveSteadyPasses.current >= config.steadyStateConsecutive) {
            endPhase('steady_state');
            return;
          }
        } else {
          consecutiveSteadyPasses.current = 0;
        }
      }

      if (elapsed >= config.maxAPhaseDurationMs) {
        endPhase('timeout');
        return;
      }
    } else {
      // Perturbation phases: fixed duration
      if (elapsed >= config.perturbationDurationMs) {
        endPhase('duration');
        return;
      }
    }

    animFrameRef.current = requestAnimationFrame(gameLoop);
  }, [config, logger, endPhase]);

  // Keep ref in sync for the visibilitychange handler
  gameLoopRef.current = gameLoop;

  // Start game loop when phase changes
  useEffect(() => {
    if (isRunning.current && phaseState.current) {
      animFrameRef.current = requestAnimationFrame(gameLoop);
    }
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [currentPhaseIndex, gameLoop]);

  return (
    <TaskDisplay
      phaseLabel={phaseLabel}
      phaseType={phaseState.current?.phaseDef.type || 'practice'}
      totalPoints={totalPoints}
      isPractice={practiceMode.current}
      isContextShift={isContextShift}
      lockout={lockoutDisplay}
      onResponse={handleResponse}
      showContextShiftLabel={showContextShiftLabel}
      elapsedMs={phaseState.current?.elapsedMs || 0}
    />
  );
};
