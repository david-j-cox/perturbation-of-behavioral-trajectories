import React from 'react';

export const DeclinedScreen: React.FC = () => (
  <div style={{ maxWidth: 480, margin: '0 auto', padding: 40, fontFamily: 'system-ui, sans-serif', textAlign: 'center' }}>
    <h1 style={{ fontSize: 28, marginBottom: 16 }}>Thank You</h1>
    <p style={{ fontSize: 16, color: '#64748b', lineHeight: 1.6 }}>
      You have chosen not to participate. No data has been recorded.
      You may close this window.
    </p>
  </div>
);
