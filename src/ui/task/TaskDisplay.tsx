import React, { useEffect, useRef, useCallback, useState, useMemo } from 'react';
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

// Static fake leaderboard entries
const FAKE_LEADERS = [
  { name: 'Alex M.', score: 102 },
  { name: 'Jordan K.', score: 91 },
  { name: 'Sam T.', score: 79 },
  { name: 'Riley P.', score: 68 },
  { name: 'Casey W.', score: 55 },
  { name: 'Morgan L.', score: 43 },
  { name: 'Quinn D.', score: 34 },
];

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

  const handleClick = useCallback((side: Side) => {
    if (side === 'left') {
      setLeftPressed(true);
      setTimeout(() => setLeftPressed(false), 100);
    } else {
      setRightPressed(true);
      setTimeout(() => setRightPressed(false), 100);
    }
    onResponse(side);
  }, [onResponse]);

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

  // Build sorted leaderboard with player inserted
  const leaderboard = useMemo(() => {
    const entries = [
      ...FAKE_LEADERS.map(e => ({ ...e, isPlayer: false })),
      { name: 'You', score: totalPoints, isPlayer: true },
    ];
    entries.sort((a, b) => b.score - a.score);
    return entries;
  }, [totalPoints]);

  const isLeftLocked = lockout.active && lockout.lockedSide === 'left';
  const isRightLocked = lockout.active && lockout.lockedSide === 'right';

  const panelStyle = (side: Side, pressed: boolean, flash: boolean, locked: boolean): React.CSSProperties => ({
    width: 220,
    height: 160,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    background: flash
      ? '#fbbf24'
      : pressed
        ? (side === 'left' ? palette.pressLeft : palette.pressRight)
        : locked
          ? '#4a1c1c'
          : (side === 'left' ? palette.leftPanel : palette.rightPanel),
    transition: 'background 0.08s ease, transform 0.05s ease',
    transform: pressed ? 'scale(0.97)' : 'scale(1)',
    position: 'relative',
    border: `3px solid ${pressed ? palette.accent : '#d0d5dd44'}`,
    userSelect: 'none' as const,
    cursor: locked ? 'not-allowed' : 'pointer',
  });

  return (
    <div style={{
      width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column',
      background: palette.background, color: palette.text, fontFamily: 'system-ui, sans-serif',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'center', alignItems: 'center',
        padding: '16px 32px', borderBottom: `1px solid ${palette.accent}33`,
        position: 'relative',
      }}>
        {showContextShiftLabel && (
          <div style={{
            position: 'absolute', left: 32,
            fontSize: 14, fontWeight: 600, color: palette.accent,
            padding: '4px 12px', background: `${palette.accent}22`, borderRadius: 4,
          }}>
            Context Shift
          </div>
        )}
        <div style={{ fontSize: 28, fontWeight: 700 }}>
          Points: <span style={{ color: palette.accent }}>{totalPoints}</span>
        </div>
      </div>

      {/* Main content area */}
      <div style={{ flex: 1, display: 'flex', padding: '20px 24px', gap: 28 }}>
        {/* Task area — panels centered */}
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 32,
        }}>
          {/* Left panel */}
          <div style={panelStyle('left', leftPressed, leftFlash, isLeftLocked)} onClick={() => handleClick('left')}>
            <div style={{ fontSize: 22, fontWeight: 700, opacity: 0.9 }}>Option A</div>
            {isLeftLocked && (
              <div style={{
                position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(0,0,0,0.6)', borderRadius: 16, fontSize: 14, fontWeight: 600, color: '#fca5a5',
              }}>
                Temporarily unavailable
              </div>
            )}
          </div>

          {/* Right panel */}
          <div style={panelStyle('right', rightPressed, rightFlash, isRightLocked)} onClick={() => handleClick('right')}>
            <div style={{ fontSize: 22, fontWeight: 700, opacity: 0.9 }}>Option B</div>
            {isRightLocked && (
              <div style={{
                position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(0,0,0,0.6)', borderRadius: 16, fontSize: 14, fontWeight: 600, color: '#fca5a5',
              }}>
                Temporarily unavailable
              </div>
            )}
          </div>
        </div>

        {/* Leaderboard sidebar */}
        <div style={{
          width: 220, flexShrink: 0,
          background: isContextShift ? '#1f3d1f' : '#273548',
          border: `1px solid ${isContextShift ? '#3d5a3d' : '#3a4a5c'}`,
          borderRadius: 12, padding: 16,
          display: 'flex', flexDirection: 'column',
          alignSelf: 'flex-start', marginTop: 20,
        }}>
          <div style={{
            fontSize: 14, fontWeight: 700, marginBottom: 12,
            color: palette.accent, textAlign: 'center',
            borderBottom: `1px solid ${palette.accent}33`, paddingBottom: 8,
          }}>
            Leaderboard
          </div>
          {leaderboard.map((entry, i) => (
            <div key={entry.name} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '5px 8px', borderRadius: 6, marginBottom: 2,
              fontSize: 13,
              background: entry.isPlayer ? `${palette.accent}22` : 'transparent',
              fontWeight: entry.isPlayer ? 700 : 400,
              color: entry.isPlayer ? palette.accent : palette.text,
            }}>
              <span style={{ width: 20, textAlign: 'right', opacity: 0.6, fontWeight: 700 }}>
                {i + 1}.
              </span>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {entry.name}
              </span>
              <span style={{ fontWeight: 700, opacity: entry.isPlayer ? 1 : 0.7 }}>
                {entry.score.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
