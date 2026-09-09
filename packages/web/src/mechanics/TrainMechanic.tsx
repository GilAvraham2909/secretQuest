import { useEffect, useRef, useState } from 'react';
import type { MechanicProps, MechanicDefinition } from '@secret-journey/shared';
import signStone from '../../../../assets/images/props/sign-stone-blank.png';
import trainRear from '../../../../assets/images/props/train-rear.png';
import gateClosed from '../../../../assets/images/props/gate-closed.png';
import gateOpen from '../../../../assets/images/props/gate-open.png';

/**
 * רכבת האותיות — spec 6.
 *
 * COMPOSITION NOTE
 * The first attempt pasted a side-view locomotive onto a scene whose track
 * recedes to a vanishing point — two incompatible viewpoints on one screen, and
 * it read exactly like unrelated images stuck together. The generator is very
 * strongly biased toward drawing railway track in perspective; after two
 * attempts to force a side-on scene it was cheaper to change the design to
 * match the picture than to keep fighting it.
 *
 * So the scene is now composed as one depth: the gate stands where the track
 * vanishes, the train sits on the track between the viewer and the gate, and
 * the sign-stones are in the foreground. Everything shares one horizon.
 *
 * Wrong answer, spec 6.4: "השער הזה עדיין סגור" — the gate rattles and stays
 * shut, the train waits. Nothing is lost and nothing is marked.
 */

export const trainDefinition: MechanicDefinition = {
  mechanicId: 'letter_train_game',
  capabilities: {
    supportsRepeatPrompt: true,
    supportsHighlightOption: true,
    supportsRemoveOptions: true,
    supportsDemonstrate: true,
  },
};

type Anim = 'idle' | 'rattle' | 'chosen' | 'glow-soft' | 'glow-strong' | 'demo' | 'gone';

export function TrainMechanic({ round, host, directive }: MechanicProps) {
  const [anims, setAnims] = useState<Record<string, Anim>>({});
  const [opened, setOpened] = useState(false);
  const [gateShake, setGateShake] = useState(false);
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
        setAnims((a) => ({ ...a, [directive.optionId]: 'chosen' }));
        setOpened(true);
        host.playEffect('chime');
        break;
      case 'encourage_retry':
        setAnims((a) => ({ ...a, [directive.optionId]: 'rattle' }));
        // The gate itself answers, not just the stone: the child sees the world
        // respond rather than being told they were wrong.
        setGateShake(true);
        host.playEffect('pop');
        later(() => setAnims((a) => ({ ...a, [directive.optionId]: 'idle' })), 640);
        later(() => setGateShake(false), 640);
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
        for (const id of directive.optionIds) setAnims((a) => ({ ...a, [id]: 'gone' }));
        break;
      case 'repeat_prompt':
        host.playPrompt();
        break;
      case 'end_round':
        later(() => host.reportRoundComplete(), 1400);
        break;
      default:
        break;
    }

    return () => timers.forEach(clearTimeout);
  }, [directive, host]);

  return (
    <div className="train-scene mech-scene">
      <p className="mech-prompt">{round.prompt.textHe}</p>

      <div className="train__depth">
        <img
          className={`train__gate-art ${gateShake ? 'train__gate-art--shake' : ''}`}
          src={opened ? gateOpen : gateClosed}
          alt=""
          draggable={false}
        />
        <img
          className={`train__loco ${opened ? 'train__loco--go' : ''}`}
          src={trainRear}
          alt=""
          draggable={false}
        />
      </div>

      <div className="train__options">
        {round.options.map((opt, i) => {
          const anim = anims[opt.optionId] ?? 'idle';
          if (anim === 'gone') return null;

          return (
            <button
              key={opt.optionId}
              className={`stone stone--${anim}`}
              style={{ ['--bob-delay' as string]: `${i * 0.6}s` }}
              onClick={() => {
                if (opened) return;
                host.reportSelection(opt.optionId);
              }}
              aria-label={opt.labelHe}
              disabled={opened}
            >
              <img className="stone__art" src={signStone} alt="" draggable={false} />
              <span className="stone__glyph">{opt.glyph}</span>
            </button>
          );
        })}
      </div>

      <button className="mech-help" onClick={() => host.requestHint()} disabled={opened}>
        רוצה רמז קטן?
      </button>
    </div>
  );
}
