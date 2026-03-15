import React, { useState } from 'react';

interface Props {
  onSubmit: (id: string) => void;
}

export const ParticipantIdScreen: React.FC<Props> = ({ onSubmit }) => {
  const [id, setId] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = () => {
    const trimmed = id.trim();
    if (!trimmed) { setError('Please enter your participant ID.'); return; }
    if (trimmed.length < 2 || trimmed.length > 50) { setError('Participant ID must be between 2 and 50 characters.'); return; }
    if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) { setError('Participant ID may only contain letters, numbers, hyphens, and underscores.'); return; }
    onSubmit(trimmed);
  };

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: 40, fontFamily: 'system-ui, sans-serif', textAlign: 'center' }}>
      <h1 style={{ fontSize: 28, marginBottom: 16 }}>Enter Your Participant ID</h1>
      <p style={{ color: '#64748b', marginBottom: 32, fontSize: 15, lineHeight: 1.5 }}>
        Please enter the participant ID you were given. If you were not given one, please contact the research team.
      </p>

      <input
        type="text"
        value={id}
        onChange={e => { setId(e.target.value); setError(''); }}
        onKeyDown={e => e.key === 'Enter' && handleSubmit()}
        placeholder="e.g., P001"
        autoFocus
        style={{
          width: '100%', padding: '12px 16px', fontSize: 18, textAlign: 'center',
          border: `2px solid ${error ? '#ef4444' : '#cbd5e1'}`, borderRadius: 8,
          outline: 'none', boxSizing: 'border-box',
        }}
      />
      {error && <p style={{ color: '#ef4444', fontSize: 14, marginTop: 8 }}>{error}</p>}

      <button
        onClick={handleSubmit}
        style={{
          marginTop: 24, padding: '12px 48px', fontSize: 16, fontWeight: 600,
          background: '#2563eb', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer',
        }}
      >
        Continue
      </button>
    </div>
  );
};
