import { useCallback, useEffect, useRef, useState } from 'react';
import type { MechanicProps, MechanicDefinition } from '@secret-journey/shared';
import { measureLink, applyLink } from '../game/geometry.js';
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

type Anim = 'idle' | 'swim-away' | 'reeled' | 'glow-soft' | 'glow-strong' | 'demo' | 'sink';

export function FishingMechanic({ round, host, directive }: MechanicProps) {
  const [anims, setAnims] = useState<Record<string, Anim>>({});
  const [caught, setCaught] = useState<string | null>(null);
  const readyRef = useRef(false);

  const gearRef = useRef<HTMLDivElement | null>(null);
  const tipRef = useRef<HTMLSpanElement | null>(null);
  const stoneRefs = useRef(new Map<string, HTMLButtonElement>());

  /**
   * Aims the line at the stone that was just caught.
   *
   * The client's note was "the line doesn't touch the letter" — and it did not:
   * the line hung at a fixed length into open water while the stone rose on an
   * unrelated animation, so nothing was ever caught by anything. A fishing line
   * has to end ON the fish, and where that is is only knowable at runtime.
   * The measuring itself lives in game/geometry.ts, which the match mechanic
   * draws its sound-link with too.
   *
   * 0.46 aims at the glyph rather than the box centre — the stone sprite is
   * drawn in perspective, so its visual middle sits above its box middle.
   * 0.86 stops the stone short of the tip, so it arrives beside the rod rather
   * than through it.
   */
  const aimAtStone = useCallback((optionId: string) => {
    const gear = gearRef.current;
    const tip = tipRef.current;
    const stone = stoneRefs.current.get(optionId);
    if (!gear || !tip || !stone) return;
    applyLink(measureLink(tip, stone, 0.46), gear, stone, 0.86);
  }, []);

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
        // Measure BEFORE the state update, so the custom properties are already
        // on the elements when the bite class lands and the animation starts.
        // Otherwise the first frame plays with an unset length and the line
        // visibly snaps twice.
        aimAtStone(directive.optionId);
        setAnims((a) => ({ ...a, [directive.optionId]: 'reeled' }));
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
  }, [directive, host, aimAtStone]);

  return (
    <div className="fishing-scene mech-scene">
      <p className="mech-prompt">{round.prompt.textHe}</p>

      {/*
        The rod sprite deliberately carries NO line. A baked-in line is a fixed
        length that cannot reach the water, and the first version looked exactly
        as limp as that implies. Drawing it here lets it span the real distance
        to the surface, sway, and snap taut on a catch.
      */}
      <div className={`fishing__gear ${caught ? 'fishing__gear--bite' : ''}`} ref={gearRef}>
        <span className="fishing__rod-wrap" aria-hidden="true">
          <img className="fishing__rod" src={fishingRod} alt="" draggable={false} />
        </span>
        {/* A zero-size marker at the rod tip. The line itself is a poor thing to
            measure — it is rotating — but this never moves, so the aim is exact. */}
        <span className="fishing__tip" aria-hidden="true" ref={tipRef} />
        {/* Bobber and ripple hang INSIDE the line, so they follow its length and
            its angle for free instead of duplicating the same clamp() twice. */}
        <span className="fishing__line" aria-hidden="true">
          <span className="fishing__bobber" />
          <span className="fishing__ripple" />
        </span>
      </div>

      <div className="fishing__water">
        {round.options.map((opt, i) => {
          const anim = anims[opt.optionId] ?? 'idle';
          if (anim === 'sink') return null;

          return (
            <button
              key={opt.optionId}
              ref={(el) => {
                if (el) stoneRefs.current.set(opt.optionId, el);
                else stoneRefs.current.delete(opt.optionId);
              }}
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
