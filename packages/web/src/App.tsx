import { useState } from 'react';
import { NiqqudCheck } from './NiqqudCheck.js';
import { EngineDemo } from './EngineDemo.js';
import { BalloonGame } from './game/BalloonGame.js';
import './game/balloon.css';

/**
 * Developer harness, not the finished game. Three things that can be checked
 * by hand: the playable balloon slice, the engine rules, and the niqqud gate.
 */

type View = 'balloons' | 'engine' | 'niqqud';

const TABS: { id: View; label: string }[] = [
  { id: 'balloons', label: 'פיצוץ בלונים' },
  { id: 'engine', label: 'מנוע וסולם רמזים' },
  { id: 'niqqud', label: 'בדיקת ניקוד' },
];

export function App() {
  const [view, setView] = useState<View>('balloons');

  return (
    <>
      <nav className="topnav">
        <strong>המסע הסודי</strong>
        <span className="tag">כלי פיתוח</span>
        {TABS.map((t) => (
          <button
            key={t.id}
            className={view === t.id ? 'on' : ''}
            onClick={() => setView(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {view === 'balloons' && <BalloonGame />}
      {view === 'engine' && <div className="page"><EngineDemo /></div>}
      {view === 'niqqud' && <NiqqudCheck />}
    </>
  );
}
