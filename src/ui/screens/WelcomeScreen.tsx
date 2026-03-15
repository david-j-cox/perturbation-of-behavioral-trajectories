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

        <p><strong>Purpose:</strong> This study examines how people make choices between two options over time. You will click on panels to earn points.</p>

        <p><strong>Procedure:</strong> You will see two panels on screen. Clicking on a panel may earn you points. The study consists of several phases and takes approximately 30-60 minutes to complete.</p>

        <p><strong>Risks:</strong> There are no known risks beyond those of everyday computer use. You may experience mild fatigue from the repetitive clicking task.</p>

        <p><strong>Benefits:</strong> You will not directly benefit from participation. Your data will contribute to scientific understanding of choice behavior.</p>

        <p><strong>Confidentiality:</strong> Your responses are recorded with an anonymous participant ID. No personally identifying information is collected. Data are stored securely and used only for research purposes.</p>

        <p><strong>Voluntary participation:</strong> Your participation is voluntary. You may withdraw at any time by closing the browser window. There is no penalty for withdrawal.</p>

        <p><strong>Contact:</strong> If you have questions about this study, please contact the research team using the information provided by your recruitment source.</p>

        <p><strong>Data usage:</strong> De-identified data may be shared with other researchers or made publicly available for replication purposes.</p>

        <p>By clicking "I Agree" below, you confirm that you have read and understood this information, that you are at least 18 years of age, and that you voluntarily consent to participate.</p>
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24, cursor: 'pointer', fontSize: 15 }}>
        <input type="checkbox" checked={read} onChange={e => setRead(e.target.checked)} style={{ width: 18, height: 18 }} />
        I have read and understand the information above
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
