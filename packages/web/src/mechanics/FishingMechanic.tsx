import { useEffect, useRef, useState } from 'react';
import type { MechanicProps, MechanicDefinition } from '@secret-journey/shared';
import signStone from '../../../../assets/images/props/sign-stone-blank.png';
import fishingRod from '../../../../assets/images/props/fishing-rod.png';

/**
 * דיג אותיות — spec 5.
 *
 * TAP, NOT DRAG. Client decision, backed by the research finding that children
 * aged 3-6 reliably fail to keep a target selected while dragging. A drag
 * mechanic here would measure motor control rather than letter recognition and
 * would quietly corrupt the data this MVP exists to collect.
 *
 * Wrong answer, spec 5.4: "האות הזאת שוחה לה" — the stone swims away a little
 * and comes back. It is never removed and never marked.
 *
 * Like the balloon mechanic, this file contains no answer key, no scoring, no
 * ladder and no telemetry. The only difference between the two mechanics is how
 * an option is drawn and how it moves.
 */

export const fishingDefinition: MechanicDefinition = {
  mechanicId: 'fishing_game',
  capabilities: {
    supportsRepeatPrompt: true,
    supportsHighlightOption: true,
    supportsRemoveOptions: true,
    supportsDemonstrate: true,
  },
};

type Anim = 'idle' | 'swim-away' | 'caught' | 'glow-soft' | 'glow-strong' | 'demo' | 'sink';

export function FishingMechanic({ round, host, directive }: MechanicProps) {
  const [anims, setAnims] = useState<Record<string, Anim>>({});
  const [caught, setCaught] = useState<string | null>(null);
  const readyRef = useRef(false);

  useEffect(() => {
    if (readyRef.current) return;
    readyRef.current = true;
    const t = setTimeout(() => {
      host.reportReady();
      host.playPrompt();
    }, 350);
    return () => clearTimeout(t);
  }, [host]);

  useEffect(() => {
    if (!directive) return;
    const timers: number[] = [];
    const later = (fn: () => void, ms: number) => timers.push(window.setTimeout(fn, ms));

    switch (directive.kind) {
      case 'affirm_success':
        setAnims((a) => ({ ...a, [directive.optionId]: 'caught' }));
        setCaught(directive.optionId);
        host.playEffect('chime');
        break;
      case 'encourage_retry':
        setAnims((a) => ({ ...a, [directive.optionId]: 'swim-away' }));
        host.playEffect('whoosh');
        later(() => setAnims((a) => ({ ...a, [directive.optionId]: 'idle' })), 750);
        break;
      case 'highlight_option':
        setAnims((a) => ({
          ...a,
          [directive.optionId]: directive.intensity === 'soft' ? 'glow-soft' : 'glow-strong',
        }));
        break;
      case 'demonstrate':
        setAnims((a) => ({ ...a, [directive.optionId]: 'demo' }));
        break;
      case 'remove_options':
        for (const id of directive.optionIds) setAnims((a) => ({ ...a, [id]: 'sink' }));
        break;
      case 'repeat_prompt':
        host.playPrompt();
        break;
      case 'end_round':
        later(() => host.reportRoundComplete(), 950);
        break;
      default:
        break;
    }

    return () => timers.forEach(clearTimeout);
  }, [directive, host]);

  return (
    <div className="fishing-scene mech-scene">
      <p className="mech-prompt">{round.prompt.textHe}</p>

      {/*
        The rod sprite deliberately carries NO line. A baked-in line is a fixed
        length that cannot reach the water, and the first version looked exactly
        as limp as that implies. Drawing it here lets it span the real distance
        to the surface, sway, and snap taut on a catch.
      */}
      <div className={`fishing__gear ${caught ? 'fishing__gear--bite' : ''}`}>
        <img className="fishing__rod" src={fishingRod} alt="" draggable={false} />
        <span className="fishing__line" aria-hidden="true" />
        <span className="fishing__bobber" aria-hidden="true" />
        <span className="fishing__ripple" aria-hidden="true" />
      </div>

      <div className="fishing__water">
        {round.options.map((opt, i) => {
          const anim = anims[opt.optionId] ?? 'idle';
          if (anim === 'sink') return null;

          return (
            <button
              key={opt.optionId}
              className={`stone stone--${anim}`}
              style={{ ['--bob-delay' as string]: `${i * 0.9}s` }}
              onClick={() => {
                if (caught) return;
                host.reportSelection(opt.optionId);
              }}
              aria-label={opt.labelHe}
              disabled={caught !== null && caught !== opt.optionId}
            >
              <img className="stone__art" src={signStone} alt="" draggable={false} />
              <span className="stone__glyph">{opt.glyph}</span>
            </button>
          );
        })}
      </div>

      <button className="mech-help" onClick={() => host.requestHint()} disabled={!!caught}>
        רוצה רמז קטן?
      </button>
    </div>
  );
}
