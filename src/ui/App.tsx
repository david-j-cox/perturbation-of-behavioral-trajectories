import React, { useState, useCallback, useRef, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { WelcomeScreen } from './screens/WelcomeScreen';
import { ParticipantIdScreen } from './screens/ParticipantIdScreen';
import { InstructionsScreen } from './screens/InstructionsScreen';
import { EndScreen } from './screens/EndScreen';
import { DeclinedScreen } from './screens/DeclinedScreen';
import { ExperimentRunner } from './task/ExperimentRunner';
import { loadConfig } from '../config';
import { DataLogger } from '../logging/dataLogger';
import { createSession, requestAssignment, activateAssignment, completeAssignment, abandonAssignment } from '../assignment/assignmentClient';
import { PerturbationOrder } from '../engine/types';
import { resumeAudio } from '../utils/audio';

type Screen = 'welcome' | 'declined' | 'participantId' | 'instructions' | 'experiment' | 'end';

const SESSION_STORAGE_KEY = 'experiment_session';

function loadSavedSession(): { sessionId: string; assignedOrder: PerturbationOrder; participantId: string } | null {
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.sessionId && parsed.assignedOrder && parsed.participantId) {
      return parsed;
    }
  } catch { /* ignore corrupt data */ }
  return null;
}

export const App: React.FC = () => {
  const savedSession = useRef(loadSavedSession());

  const [screen, setScreen] = useState<Screen>(savedSession.current ? 'instructions' : 'welcome');
  const [participantId, setParticipantId] = useState(savedSession.current?.participantId ?? '');
  const [sessionId] = useState(() => savedSession.current?.sessionId ?? uuidv4());
  const [assignedOrder, setAssignedOrder] = useState<PerturbationOrder | null>(savedSession.current?.assignedOrder ?? null);
  const [totalPoints, setTotalPoints] = useState(0);
  const [completionCode, setCompletionCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const loggerRef = useRef<DataLogger | null>(null);
  const config = useRef(loadConfig());

  // Re-initialize logger for restored session
  useEffect(() => {
    if (savedSession.current) {
      const logger = new DataLogger(
        savedSession.current.sessionId,
        savedSession.current.participantId,
        config.current.experimentId,
        config.current.debugLocalOnly,
      );
      loggerRef.current = logger;
      logger.logEvent({
        event_type: 'session_restored',
        client_timestamp_ms: performance.now(),
        metadata_json: {
          restored_session_id: savedSession.current.sessionId,
          restored_order: savedSession.current.assignedOrder,
        },
      });
      savedSession.current = null; // Only run once
    }
  }, []);

  // Fixed Prolific completion code
  const generateCompletionCode = useCallback(() => {
    return 'C9HF9X23';
  }, []);

  const isComplete = useRef(false);

  // beforeunload handler — warn, flush data, and abandon the reservation
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isComplete.current) return;

      // Show browser's default "Leave site?" dialog
      e.preventDefault();

      // If session is saved for resume, do NOT abandon — the participant is refreshing
      const hasSavedSession = sessionStorage.getItem(SESSION_STORAGE_KEY) !== null;
      if (!hasSavedSession) {
        // Best-effort data flush and slot release via sendBeacon
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
        if (supabaseUrl && anonKey) {
          // Abandon the assignment to free the slot immediately
          navigator.sendBeacon(
            `${supabaseUrl}/rest/v1/rpc/abandon_assignment?apikey=${encodeURIComponent(anonKey)}`,
            new Blob(
              [JSON.stringify({ p_session_id: sessionId })],
              { type: 'application/json' }
            )
          );
        }
      }

      // Best-effort flush of any buffered data
      loggerRef.current?.flush();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [sessionId]);

  // Cleanup logger on unmount
  useEffect(() => {
    return () => {
      loggerRef.current?.destroy();
    };
  }, []);

  const handleConsent = useCallback(() => {
    const logger = new DataLogger(
      sessionId,
      'pending', // Will be updated when participant ID is entered
      config.current.experimentId,
      config.current.debugLocalOnly,
    );
    loggerRef.current = logger;
    logger.logEvent({
      event_type: 'consent_agreed',
      client_timestamp_ms: performance.now(),
    });
    setScreen('participantId');
  }, [sessionId]);

  const handleDecline = useCallback(() => {
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
    loggerRef.current?.logEvent({
      event_type: 'consent_declined',
      client_timestamp_ms: performance.now(),
    });
    setScreen('declined');
  }, []);

  const handleParticipantId = useCallback(async (pid: string) => {
    setParticipantId(pid);
    setError(null);

    // Re-initialize logger with actual participant ID
    loggerRef.current?.destroy();
    const logger = new DataLogger(
      sessionId,
      pid,
      config.current.experimentId,
      config.current.debugLocalOnly,
    );
    loggerRef.current = logger;

    logger.logEvent({
      event_type: 'participant_id_submitted',
      client_timestamp_ms: performance.now(),
      metadata_json: { participant_id: pid },
    });

    // Create session in DB
    const rngSeed = config.current.defaultSeed || `${pid}-${sessionId}`;
    await createSession({
      sessionId,
      participantId: pid,
      experimentId: config.current.experimentId,
      appVersion: config.current.appVersion,
      rngSeed,
      isTest: false,
      debugMode: config.current.debugLocalOnly,
    });

    // Request order assignment
    logger.logEvent({
      event_type: 'assignment_requested',
      client_timestamp_ms: performance.now(),
    });

    const result = await requestAssignment(pid, sessionId, config.current.experimentId, {
      isTest: false,
      reservationMinutes: config.current.reservationMinutes,
      targetN: config.current.targetNPerOrder,
      debugLocalOnly: config.current.debugLocalOnly,
      rngSeed,
    });

    if (result.success && result.assignedOrder) {
      setAssignedOrder(result.assignedOrder);
      sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({
        sessionId,
        assignedOrder: result.assignedOrder,
        participantId: pid,
      }));
      logger.logEvent({
        event_type: 'assignment_reserved',
        client_timestamp_ms: performance.now(),
        metadata_json: {
          assigned_order: result.assignedOrder,
          candidate_orders: result.candidateOrders,
          method: result.method,
          already_assigned: result.alreadyAssigned,
          reservation_expires_at: result.reservationExpiresAt,
        },
      });
      setScreen('instructions');
    } else {
      logger.logEvent({
        event_type: 'assignment_failed',
        client_timestamp_ms: performance.now(),
        metadata_json: { error: result.error, method: result.method },
      });
      setError(result.error || 'Failed to get assignment. Please try again.');
    }
  }, [sessionId]);

  const handleInstructionsReady = useCallback(() => {
    loggerRef.current?.logEvent({
      event_type: 'instructions_viewed',
      client_timestamp_ms: performance.now(),
    });
    // Resume audio context after user gesture
    resumeAudio();
    setScreen('experiment');
  }, []);

  const handleExperimentStart = useCallback(async () => {
    await activateAssignment(sessionId);
  }, [sessionId]);

  const handleExperimentEnd = useCallback(async (points: number) => {
    isComplete.current = true;
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
    setTotalPoints(points);
    setCompletionCode(generateCompletionCode());
    await completeAssignment(sessionId);
    await loggerRef.current?.flush();
    setScreen('end');
  }, [sessionId, generateCompletionCode]);

  const handleDownloadLog = useCallback(() => {
    loggerRef.current?.downloadLocalLog();
  }, []);

  return (
    <>
      {error && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, padding: '12px 24px',
          background: '#fef2f2', color: '#991b1b', borderBottom: '1px solid #fecaca',
          fontFamily: 'system-ui', fontSize: 14, zIndex: 9999, textAlign: 'center',
        }}>
          {error}
          <button
            onClick={() => setError(null)}
            style={{ marginLeft: 16, background: 'none', border: 'none', color: '#991b1b', cursor: 'pointer', fontWeight: 600 }}
          >
            Dismiss
          </button>
        </div>
      )}

      {screen === 'welcome' && (
        <WelcomeScreen onConsent={handleConsent} onDecline={handleDecline} />
      )}
      {screen === 'declined' && <DeclinedScreen />}
      {screen === 'participantId' && (
        <ParticipantIdScreen onSubmit={handleParticipantId} />
      )}
      {screen === 'instructions' && (
        <InstructionsScreen onReady={handleInstructionsReady} />
      )}
      {screen === 'experiment' && assignedOrder && loggerRef.current && (
        <ExperimentRunner
          participantId={participantId}
          sessionId={sessionId}
          assignedOrder={assignedOrder}
          config={config.current.engine}
          logger={loggerRef.current}
          onExperimentStart={handleExperimentStart}
          onExperimentEnd={handleExperimentEnd}
        />
      )}
      {screen === 'end' && (
        <EndScreen
          totalPoints={totalPoints}
          completionCode={completionCode}
          debugMode={config.current.debugLocalOnly}
          assignedOrder={assignedOrder || undefined}
          onDownloadLog={config.current.debugLocalOnly ? handleDownloadLog : undefined}
        />
      )}
    </>
  );
};
