import { useState } from 'react';
import { NiqqudCheck } from './NiqqudCheck.js';
import { EngineDemo } from './EngineDemo.js';
import { StationGame } from './game/StationGame.js';
import { MECHANIC_REGISTRY, PLAYABLE_MECHANICS } from './mechanics/registry.js';
import type { MechanicId } from '@secret-journey/shared';
import './game/balloon.css';
import './game/mechanics.css';

/** Developer harness. The three playable mechanics, plus the two check tools. */

type View = MechanicId | 'engine' | 'niqqud';

export function App() {
  const [view, setView] = useState<View>('balloon_game');

  return (
    <>
      <nav className="topnav">
        <strong>המסע הסודי</strong>
        <span className="tag">כלי פיתוח</span>
        {PLAYABLE_MECHANICS.map((m) => (
          <button key={m} className={view === m ? 'on' : ''} onClick={() => setView(m)}>
            {MECHANIC_REGISTRY[m]!.labelHe}
          </button>
        ))}
        <span className="topnav__sep" />
        <button className={view === 'engine' ? 'on' : ''} onClick={() => setView('engine')}>
          מנוע
        </button>
        <button className={view === 'niqqud' ? 'on' : ''} onClick={() => setView('niqqud')}>
          ניקוד
        </button>
      </nav>

      {view === 'engine' ? (
        <div className="page"><EngineDemo /></div>
      ) : view === 'niqqud' ? (
        <NiqqudCheck />
      ) : (
        <StationGame mechanicId={view} />
      )}
    </>
  );
}
