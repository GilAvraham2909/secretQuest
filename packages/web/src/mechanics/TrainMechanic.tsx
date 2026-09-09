import { useEffect, useRef, useState } from 'react';
import type { MechanicProps, MechanicDefinition } from '@secret-journey/shared';
import signStone from '../../../../assets/images/props/sign-stone-blank.png';
import trainEngine from '../../../../assets/images/props/train-engine.png';

/**
 * רכבת האותיות — spec 6.
 *
 * The one mechanic whose prompt has a VISUAL anchor: the target letter is
 * carved on the gate the train has to pass, not only spoken. That is its
 * identity, and it is why RoundView carries an optional displayGlyph.
 *
 * Wrong answer, spec 6.4: "השער הזה עדיין סגור" — the gate rattles and stays
 * shut. The train simply waits. Nothing is lost and nothing is marked.
 *
 * Third mechanic, and still: no answer key, no scoring, no ladder, no
 * telemetry. Only the drawing and the motion differ.
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
        host.playEffect('pop');
        later(() => setAnims((a) => ({ ...a, [directive.optionId]: 'idle' })), 640);
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
        later(() => host.reportRoundComplete(), 1100);
        break;
      default:
        break;
    }

    return () => timers.forEach(clearTimeout);
  }, [directive, host]);

  return (
    <div className="train-scene mech-scene">
      <p className="mech-prompt">{round.prompt.textHe}</p>

      <div className={`train__track ${opened ? 'train__track--open' : ''}`}>
        <img className="train__engine" src={trainEngine} alt="" draggable={false} />
        <div className={`train__gate ${opened ? 'train__gate--open' : ''}`}>
          <span className="train__gate-leaf train__gate-leaf--a" />
          <span className="train__gate-leaf train__gate-leaf--b" />
        </div>
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
