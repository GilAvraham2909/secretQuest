import { useState } from 'react';
import { NiqqudCheck } from './NiqqudCheck.js';
import { EngineDemo } from './EngineDemo.js';

/**
 * Developer harness, not the game. These are the two things built so far that
 * can be checked by hand; the real product shell starts at M2.
 */

type View = 'niqqud' | 'engine';

export function App() {
  const [view, setView] = useState<View>('engine');

  return (
    <>
      <nav className="topnav">
        <strong>המסע הסודי</strong>
        <span className="tag">כלי פיתוח</span>
        <button className={view === 'engine' ? 'on' : ''} onClick={() => setView('engine')}>
          מנוע וסולם רמזים
        </button>
        <button className={view === 'niqqud' ? 'on' : ''} onClick={() => setView('niqqud')}>
          בדיקת ניקוד
        </button>
      </nav>
      {view === 'niqqud' ? <NiqqudCheck /> : <div className="page"><EngineDemo /></div>}
    </>
  );
}
