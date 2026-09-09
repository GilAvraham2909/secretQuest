import { useEffect, useRef, useState } from 'react';
import type { MechanicProps, MechanicDefinition } from '@secret-journey/shared';
import balloonCoral from '../../../../assets/images/props/balloon-coral.png';
import balloonLagoon from '../../../../assets/images/props/balloon-lagoon.png';
import balloonGold from '../../../../assets/images/props/balloon-gold.png';

/**
 * פיצוץ בלונים — the reference mechanic implementation.
 *
 * Note what this file does NOT contain: no answer key, no scoring, no ladder,
 * no telemetry, no skill id, no content id. It draws balloons and reports
 * touches. Every piece of feedback it shows arrives as a directive.
 *
 * The wrong-answer behaviour is taken literally from spec 4.4: the balloon the
 * child chose "זז מעט, אך אינו נעלם" — it bobs on its string and stays. It is
 * never popped, greyed out, crossed through, or removed. A child who taps the
 * same balloon five times sees the same gentle bob five times.
 */

export const balloonDefinition: MechanicDefinition = {
  mechanicId: 'balloon_game',
  capabilities: {
    supportsRepeatPrompt: true,
    supportsHighlightOption: true,
    supportsRemoveOptions: true,
    supportsDemonstrate: true,
  },
};

/**
 * Balloon art, keyed by SLOT rather than by content. A child must never be able
 * to learn "the answer is the red one" — the correct letter lands on a
 * different coloured balloon every round because the controller shuffles.
 */
const BALLOON_ART = [balloonCoral, balloonLagoon, balloonGold];

type Anim = 'idle' | 'bob' | 'pop' | 'glow-soft' | 'glow-strong' | 'demo' | 'drift-away';

export function BalloonMechanic({ round, host, directive }: MechanicProps) {
  const [anims, setAnims] = useState<Record<string, Anim>>({});
  const [popped, setPopped] = useState<string | null>(null);
  const readyRef = useRef(false);

  // Announce readiness once, after first paint. This starts the response clock,
  // so it must not fire until the balloons are genuinely touchable.
  useEffect(() => {
    if (readyRef.current) return;
    readyRef.current = true;
    const t = setTimeout(() => {
      host.reportReady();
      host.playPrompt();
    }, 350);
    return () => clearTimeout(t);
  }, [host]);

  // Apply whatever the controller told us to show.
  useEffect(() => {
    if (!directive) return;
    // Timers scheduled here must not outlive the directive that created them:
    // a leftover end_round timer once completed the FOLLOWING round.
    const timers: number[] = [];
    const later = (fn: () => void, ms: number) => {
      timers.push(window.setTimeout(fn, ms));
    };

    switch (directive.kind) {
      case 'affirm_success': {
        setAnims((a) => ({ ...a, [directive.optionId]: 'pop' }));
        setPopped(directive.optionId);
        host.playEffect('pop');
        break;
      }
      case 'encourage_retry': {
        // Bob, do not remove. Spec 4.4.
        setAnims((a) => ({ ...a, [directive.optionId]: 'bob' }));
        host.playEffect('whoosh');
        later(() => {
          setAnims((a) => ({ ...a, [directive.optionId]: 'idle' }));
        }, 600);
        break;
      }
      case 'highlight_option': {
        setAnims((a) => ({
          ...a,
          [directive.optionId]: directive.intensity === 'soft' ? 'glow-soft' : 'glow-strong',
        }));
        break;
      }
      case 'demonstrate': {
        setAnims((a) => ({ ...a, [directive.optionId]: 'demo' }));
        break;
      }
      case 'remove_options': {
        for (const id of directive.optionIds) {
          setAnims((a) => ({ ...a, [id]: 'drift-away' }));
        }
        break;
      }
      case 'repeat_prompt': {
        host.playPrompt();
        break;
      }
      case 'end_round': {
        // The celebration is the controller's business to time; we just tell it
        // when our own animation is done.
        later(() => host.reportRoundComplete(), 900);
        break;
      }
      default:
        break;
    }

    return () => timers.forEach(clearTimeout);
  }, [directive, host]);

  return (
    <div className="balloon-scene">
      <p className="balloon-prompt">{round.prompt.textHe}</p>

      <div className="balloon-field">
        {round.options.map((opt, i) => {
          const anim = anims[opt.optionId] ?? 'idle';
          if (anim === 'drift-away') return null;

          return (
            <button
              key={opt.optionId}
              className={`balloon balloon--${anim}`}
              style={{ ['--float-delay' as string]: `${i * 0.7}s` }}
              onClick={() => {
                if (popped) return;
                host.reportSelection(opt.optionId);
              }}
              aria-label={opt.labelHe}
              disabled={popped !== null && popped !== opt.optionId}
            >
              <span className="balloon__body">
                <img
                  className="balloon__art"
                  src={BALLOON_ART[i % BALLOON_ART.length]}
                  alt=""
                  draggable={false}
                />
                {/* The letter is set live in type, never baked into the art —
                    spec 18 requires swapping content without touching the
                    mechanic, and a painted letter would break that. */}
                <span className="balloon__glyph">{opt.glyph}</span>
              </span>
            </button>
          );
        })}
      </div>

      <button className="balloon-help" onClick={() => host.requestHint()} disabled={!!popped}>
        רוצה רמז קטן?
      </button>
    </div>
  );
}
