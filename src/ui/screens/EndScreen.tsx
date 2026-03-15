import React, { useState } from 'react';

interface Props {
  totalPoints: number;
  completionCode: string;
  debugMode?: boolean;
  assignedOrder?: string;
  onDownloadLog?: () => void;
}

export const EndScreen: React.FC<Props> = ({ totalPoints, completionCode, debugMode, assignedOrder, onDownloadLog }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(completionCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div style={{ maxWidth: 520, margin: '0 auto', padding: 40, fontFamily: 'system-ui, sans-serif', textAlign: 'center' }}>
      <h1 style={{ fontSize: 32, marginBottom: 8 }}>Study Complete</h1>
      <p style={{ fontSize: 18, color: '#475569', marginBottom: 32 }}>Thank you for your participation!</p>

      <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12, padding: 24, marginBottom: 24 }}>
        <p style={{ fontSize: 14, color: '#16a34a', marginBottom: 4, fontWeight: 600 }}>Total Points Earned</p>
        <p style={{ fontSize: 48, fontWeight: 700, color: '#15803d', margin: 0 }}>{totalPoints}</p>
      </div>

      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 24, marginBottom: 24 }}>
        <p style={{ fontSize: 14, color: '#64748b', marginBottom: 8 }}>Your Completion Code</p>
        <p style={{ fontSize: 24, fontWeight: 700, fontFamily: 'monospace', margin: '0 0 12px 0', letterSpacing: 2 }}>{completionCode}</p>
        <button onClick={handleCopy} style={{
          padding: '8px 20px', fontSize: 14, background: '#2563eb', color: 'white',
          border: 'none', borderRadius: 6, cursor: 'pointer',
        }}>
          {copied ? 'Copied!' : 'Copy Code'}
        </button>
      </div>

      <p style={{ fontSize: 14, color: '#94a3b8', lineHeight: 1.6 }}>
        Please submit this code to your recruitment platform to receive credit.
        You may now close this window.
      </p>

      {debugMode && (
        <div style={{ marginTop: 32, padding: 16, background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 8, fontSize: 13 }}>
          <p style={{ fontWeight: 600, marginBottom: 8 }}>Debug Info</p>
          {assignedOrder && <p>Assigned Order: <code>{assignedOrder}</code></p>}
          {onDownloadLog && (
            <button onClick={onDownloadLog} style={{
              marginTop: 8, padding: '6px 16px', fontSize: 13, background: '#f59e0b',
              color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer',
            }}>
              Download Local Log (JSONL)
            </button>
          )}
        </div>
      )}
    </div>
  );
};
