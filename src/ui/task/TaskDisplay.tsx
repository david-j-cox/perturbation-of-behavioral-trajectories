import React, { useEffect, useRef, useCallback, useState } from 'react';
import { Side, PhaseType, LockoutState } from '../../engine/types';

// Color palettes for context shift (D perturbation)
const PALETTES = {
  baseline: {
    background: '#1e293b',
    leftPanel: '#334155',
    rightPanel: '#334155',
    text: '#f1f5f9',
    accent: '#3b82f6',
    pressLeft: '#2563eb',
    pressRight: '#2563eb',
  },
  contextShift: {
    background: '#1a2e1a',
    leftPanel: '#2d4a2d',
    rightPanel: '#2d4a2d',
    text: '#d1fae5',
    accent: '#34d399',
    pressLeft: '#059669',
    pressRight: '#059669',
  },
};

interface Props {
  phaseLabel: string;
  phaseType: PhaseType;
  totalPoints: number;
  isPractice: boolean;
  isContextShift: boolean;
  lockout: LockoutState;
  onResponse: (side: Side) => void;
  showContextShiftLabel: boolean;
  elapsedMs: number;
}

export const TaskDisplay: React.FC<Props> = ({
  phaseLabel,
  phaseType,
  totalPoints,
  isPractice,
  isContextShift,
  lockout,
  onResponse,
  showContextShiftLabel,
  elapsedMs,
}) => {
  const [leftPressed, setLeftPressed] = useState(false);
  const [rightPressed, setRightPressed] = useState(false);
  const [leftFlash, setLeftFlash] = useState(false);
  const [rightFlash, setRightFlash] = useState(false);
  const leftTimer = useRef<ReturnType<typeof setTimeout>>();
  const rightTimer = useRef<ReturnType<typeof setTimeout>>();

  const palette = isContextShift ? PALETTES.contextShift : PALETTES.baseline;

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.repeat) return; // Ignore held keys
    const key = e.key.toLowerCase();
    if (key === 'f') {
      setLeftPressed(true);
      onResponse('left');
    } else if (key === 'j') {
      setRightPressed(true);
      onResponse('right');
    }
  }, [onResponse]);

  const handleKeyUp = useCallback((e: KeyboardEvent) => {
    const key = e.key.toLowerCase();
    if (key === 'f') setLeftPressed(false);
    else if (key === 'j') setRightPressed(false);
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [handleKeyDown, handleKeyUp]);

  // Cleanup timers
  useEffect(() => {
    return () => {
      if (leftTimer.current) clearTimeout(leftTimer.current);
      if (rightTimer.current) clearTimeout(rightTimer.current);
    };
  }, []);

  /** Flash a side when reinforcer delivered - called from parent via ref or effect */
  const flashSide = useCallback((side: Side) => {
    if (side === 'left') {
      setLeftFlash(true);
      if (leftTimer.current) clearTimeout(leftTimer.current);
      leftTimer.current = setTimeout(() => setLeftFlash(false), 200);
    } else {
      setRightFlash(true);
      if (rightTimer.current) clearTimeout(rightTimer.current);
      rightTimer.current = setTimeout(() => setRightFlash(false), 200);
    }
  }, []);

  // Expose flashSide via window for parent to call
  useEffect(() => {
    (window as any).__taskFlash = flashSide;
    return () => { delete (window as any).__taskFlash; };
  }, [flashSide]);

  const isLeftLocked = lockout.active && lockout.lockedSide === 'left';
  const isRightLocked = lockout.active && lockout.lockedSide === 'right';

  const panelStyle = (side: Side, pressed: boolean, flash: boolean, locked: boolean): React.CSSProperties => ({
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 16px',
    borderRadius: 16,
    background: flash
      ? '#fbbf24'
      : pressed
        ? (side === 'left' ? palette.pressLeft : palette.pressRight)
        : locked
          ? '#4a1c1c'
          : (side === 'left' ? palette.leftPanel : palette.rightPanel),
    transition: 'background 0.08s ease',
    position: 'relative',
    border: `3px solid ${pressed ? palette.accent : 'transparent'}`,
    userSelect: 'none' as const,
    minHeight: 300,
  });

  return (
    <div style={{
      width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column',
      background: palette.background, color: palette.text, fontFamily: 'system-ui, sans-serif',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '16px 32px', borderBottom: `1px solid ${palette.accent}33`,
      }}>
        <div style={{ fontSize: 14, opacity: 0.7 }}>
          {isPractice ? 'Practice Round' : `Phase ${phaseLabel}`}
        </div>
        {showContextShiftLabel && (
          <div style={{
            fontSize: 14, fontWeight: 600, color: palette.accent,
            padding: '4px 12px', background: `${palette.accent}22`, borderRadius: 4,
          }}>
            Context Shift
          </div>
        )}
        <div style={{ fontSize: 20, fontWeight: 700 }}>
          Points: <span style={{ color: palette.accent }}>{totalPoints}</span>
        </div>
      </div>

      {/* Panels */}
      <div style={{ flex: 1, display: 'flex', padding: '32px 16px', gap: 0 }}>
        {/* Left panel */}
        <div style={panelStyle('left', leftPressed, leftFlash, isLeftLocked)}>
          <div style={{ fontSize: 72, fontWeight: 800, opacity: 0.9 }}>F</div>
          <div style={{ fontSize: 16, opacity: 0.6, marginTop: 8 }}>Left</div>
          {isLeftLocked && (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(0,0,0,0.6)', borderRadius: 16, fontSize: 16, fontWeight: 600, color: '#fca5a5',
            }}>
              Temporarily unavailable
            </div>
          )}
        </div>

        {/* Right panel */}
        <div style={panelStyle('right', rightPressed, rightFlash, isRightLocked)}>
          <div style={{ fontSize: 72, fontWeight: 800, opacity: 0.9 }}>J</div>
          <div style={{ fontSize: 16, opacity: 0.6, marginTop: 8 }}>Right</div>
          {isRightLocked && (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(0,0,0,0.6)', borderRadius: 16, fontSize: 16, fontWeight: 600, color: '#fca5a5',
            }}>
              Temporarily unavailable
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div style={{ padding: '12px 32px', textAlign: 'center', opacity: 0.4, fontSize: 12 }}>
        Press F for left, J for right
      </div>
    </div>
  );
};
