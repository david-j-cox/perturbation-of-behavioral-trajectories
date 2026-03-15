import React, { useState } from 'react';

interface Props {
  onConsent: () => void;
  onDecline: () => void;
}

export const WelcomeScreen: React.FC<Props> = ({ onConsent, onDecline }) => {
  const [read, setRead] = useState(false);

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: 40, fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 28, marginBottom: 24 }}>Welcome to Our Study</h1>

      <div style={{
        background: '#f8f9fa', border: '1px solid #dee2e6', borderRadius: 8,
        padding: 24, marginBottom: 24, maxHeight: 400, overflowY: 'auto',
        lineHeight: 1.6, fontSize: 15,
      }}>
        <h2 style={{ fontSize: 20, marginTop: 0 }}>Informed Consent</h2>

        <p><strong>Study Title:</strong> Decision-Making Under Dynamic Conditions</p>
        <p><strong>Principal Investigator:</strong> David J. Cox, Endicott College</p>

        <p>You are being invited to participate in a research study. Please read the following information carefully before deciding whether to take part.</p>

        <p><strong>Purpose:</strong> This study investigates how people make repeated choices when outcomes may change over time.</p>

        <p><strong>What you will do:</strong> You will play a game (approximately 20-25 minutes total) in which you click panels to earn points. There is a brief practice round followed by the main task, which consists of several phases.</p>

        <p><strong>Risks:</strong> There are no known risks beyond those of everyday computer use. You may experience mild boredom or fatigue.</p>

        <p><strong>Benefits:</strong> There are no direct benefits to you. Your participation will contribute to scientific understanding of decision-making.</p>

        <p><strong>Confidentiality:</strong> Your responses will be recorded with an anonymous identifier. No personally identifying information will be collected beyond your Prolific ID, which is stored separately from your data.</p>

        <p><strong>Voluntary participation:</strong> Your participation is entirely voluntary. You may withdraw at any time by closing your browser, with no penalty.</p>

        <p><strong>Data usage:</strong> De-identified data may be shared with other researchers or made publicly available for replication purposes.</p>

        <p><strong>Contact:</strong> If you have questions about this study, please contact dcox@endicott.edu.</p>
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24, cursor: 'pointer', fontSize: 15 }}>
        <input type="checkbox" checked={read} onChange={e => setRead(e.target.checked)} style={{ width: 18, height: 18 }} />
        I have read and understood the information above, and I voluntarily agree to participate in this study
      </label>

      <div style={{ display: 'flex', gap: 16 }}>
        <button
          onClick={onConsent}
          disabled={!read}
          style={{
            padding: '12px 32px', fontSize: 16, fontWeight: 600,
            background: read ? '#2563eb' : '#94a3b8', color: 'white',
            border: 'none', borderRadius: 6, cursor: read ? 'pointer' : 'not-allowed',
          }}
        >
          I Agree &mdash; Participate
        </button>
        <button
          onClick={onDecline}
          style={{
            padding: '12px 32px', fontSize: 16, background: 'white',
            color: '#64748b', border: '1px solid #cbd5e1', borderRadius: 6, cursor: 'pointer',
          }}
        >
          No Thanks
        </button>
      </div>
    </div>
  );
};
