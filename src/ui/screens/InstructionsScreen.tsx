import React, { useState } from 'react';

interface Props {
  onReady: () => void;
}

export const InstructionsScreen: React.FC<Props> = ({ onReady }) => {
  const [page, setPage] = useState(0);

  const pages = [
    {
      title: 'How This Task Works',
      content: (
        <>
          <p>In this task, you will see two panels on the screen — one on the left and one on the right.</p>
          <p>You can respond to the left panel by pressing the <kbd style={{ padding: '2px 6px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 3 }}>F</kbd> key, and to the right panel by pressing the <kbd style={{ padding: '2px 6px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 3 }}>J</kbd> key.</p>
          <p>Pressing a key may sometimes earn you points. Your goal is to earn as many points as you can.</p>
        </>
      ),
    },
    {
      title: 'Earning Points',
      content: (
        <>
          <p>Points are not available after every key press. Sometimes a response will earn a point and sometimes it will not.</p>
          <p>Both sides can produce points, but the timing varies. Feel free to respond on whichever side you prefer, as often as you like.</p>
          <p>Your running point total is displayed at the top of the screen.</p>
        </>
      ),
    },
    {
      title: 'What to Expect',
      content: (
        <>
          <p>The task has several phases. Conditions may change between phases. You do not need to do anything differently — just keep responding to earn points.</p>
          <p>Occasionally, one side may become temporarily unavailable. If this happens, you can continue responding on the other side.</p>
          <p>The study takes approximately 30-60 minutes. Please stay focused and respond at a comfortable pace throughout.</p>
        </>
      ),
    },
    {
      title: 'Practice Round',
      content: (
        <>
          <p>Before the main task begins, you will complete a short 30-second practice round to familiarize yourself with the interface.</p>
          <p>Points earned during practice do not count toward your final total.</p>
          <p>When you are ready to begin the practice round, click the button below.</p>
        </>
      ),
    },
  ];

  const isLast = page === pages.length - 1;

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: 40, fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 28, marginBottom: 8 }}>{pages[page].title}</h1>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 24 }}>Page {page + 1} of {pages.length}</p>

      <div style={{ fontSize: 16, lineHeight: 1.7, marginBottom: 32 }}>
        {pages[page].content}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <button
          onClick={() => setPage(p => p - 1)}
          disabled={page === 0}
          style={{
            padding: '10px 24px', fontSize: 15, background: 'white',
            color: page === 0 ? '#cbd5e1' : '#475569', border: '1px solid #cbd5e1',
            borderRadius: 6, cursor: page === 0 ? 'default' : 'pointer',
          }}
        >
          Back
        </button>
        <button
          onClick={isLast ? onReady : () => setPage(p => p + 1)}
          style={{
            padding: '10px 32px', fontSize: 15, fontWeight: 600,
            background: '#2563eb', color: 'white', border: 'none',
            borderRadius: 6, cursor: 'pointer',
          }}
        >
          {isLast ? 'Start Practice' : 'Next'}
        </button>
      </div>
    </div>
  );
};
