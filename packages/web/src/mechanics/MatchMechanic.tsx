import { useCallback, useEffect, useRef, useState } from 'react';
import type { MechanicProps, MechanicDefinition } from '@secret-journey/shared';
import { measureLink, applyLink } from '../game/geometry.js';
import signStone from '../../../../assets/images/props/sign-stone-blank.png';

/**
 * משחק התאמה — spec §7 (אות–צליל), §8 (צליל פותח) and §9 (אות עם ניקוד).
 *
 * ONE MECHANIC, THREE SKILLS
 * ==========================
 * Spec 15 lists these as three separate "mechanics" — התאמה, תמונות, ניקוד —
 * but they are one interaction: something is played, and the child picks the
 * option it belongs to. The only difference is what an option looks like, and
 * that is already in the round view as `kind`.
 *
 * So this file branches on kind — a PRESENTATION fact — and never on content.
 * It cannot tell a letter-sound round from a niqqud round, and it has no idea
 * that PHO rounds are about opening sounds. That is the point: all three skills
 * arrived without the engine, the ladder, the assessment engine or the content
 * schema changing, which is acceptance criterion 3.12, and the diff is again
 * the evidence.
 *
 * WHY THE SOUND IS A VISIBLE OBJECT
 * =================================
 * Every one of these rounds asks about something the child HEARS, and the
 * recordings do not exist yet (deferred by the client). A prompt panel that is
 * a real, tappable object rather than a line of text keeps the round playable
 * and honest in the meantime, and is what §2.8 of the design direction asks for
 * once the audio does land: a paper speaker with a waveform, which replays on
 * tap and pulses whenever the ladder repeats the prompt.
 *
 * Spec 9.5 frames the correct answer as making a CONNECTION — "חבר את הצירוף
 * לצליל שלו", feedback "החיבור הצליח!". So success draws a light-thread from
 * the speaker to the chosen card and pulls it home, measured the same way the
 * fishing line is.
 *
 * As with every mechanic here: no answer key, no scoring, no ladder, no
 * telemetry. It draws options and reports touches.
 */

export const matchDefinition: MechanicDefinition = {
  mechanicId: 'match_game',
  capabilities: {
    supportsRepeatPrompt: true,
    supportsHighlightOption: true,
    supportsRemoveOptions: true,
    supportsDemonstrate: true,
  },
};

type Anim = 'idle' | 'wobble' | 'linked' | 'glow-soft' | 'glow-strong' | 'demo' | 'fade';

export function MatchMechanic({ round, host, directive }: MechanicProps) {
  const [anims, setAnims] = useState<Record<string, Anim>>({});
  const [linked, setLinked] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const readyRef = useRef(false);

  const stageRef = useRef<HTMLDivElement | null>(null);
  const sourceRef = useRef<HTMLSpanElement | null>(null);
  const cardRefs = useRef(new Map<string, HTMLButtonElement>());

  /** A short pulse on the speaker, so a replay is visible as well as audible. */
  const pulse = useCallback(() => {
    setSpeaking(true);
    window.setTimeout(() => setSpeaking(false), 900);
  }, []);

  const replay = useCallback(() => {
    host.playPrompt();
    pulse();
  }, [host, pulse]);

  /** Draws the thread from the speaker to the card that was chosen. */
  const linkToCard = useCallback((optionId: string) => {
    const stage = stageRef.current;
    const source = sourceRef.current;
    const card = cardRefs.current.get(optionId);
    if (!stage || !source || !card) return;
    // 0.5: a card is a flat tile, so its visual centre IS its box centre —
    // unlike the sign-stone, which is drawn in perspective.
    // 0.34: the card only leans towards the speaker. It must stay readable
    // while the thread is visible, so it never travels all the way home.
    applyLink(measureLink(source, card, 0.5), stage, card, 0.34);
  }, []);

  useEffect(() => {
    if (readyRef.current) return;
    readyRef.current = true;
    const t = window.setTimeout(() => {
      host.reportReady();
      // Spec 7/8/9 all open by playing the thing being asked about.
      replay();
    }, 350);
    return () => window.clearTimeout(t);
  }, [host, replay]);

  useEffect(() => {
    if (!directive) return;
    const timers: number[] = [];
    const later = (fn: () => void, ms: number) => timers.push(window.setTimeout(fn, ms));

    switch (directive.kind) {
      case 'affirm_success':
        // Measure BEFORE the state update, so the thread's length and angle are
        // already on the elements when the class that animates them lands.
        linkToCard(directive.optionId);
        setAnims((a) => ({ ...a, [directive.optionId]: 'linked' }));
        setLinked(directive.optionId);
        host.playEffect('chime');
        break;
      case 'encourage_retry':
        // Spec 7.4 / 8.5 / 9.6: "בוא נקשיב שוב". The card tips and settles and
        // the sound offers itself again. Nothing is marked, nothing is removed.
        setAnims((a) => ({ ...a, [directive.optionId]: 'wobble' }));
        host.playEffect('whoosh');
        later(() => setAnims((a) => ({ ...a, [directive.optionId]: 'idle' })), 700);
        later(replay, 450);
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
        for (const id of directive.optionIds) setAnims((a) => ({ ...a, [id]: 'fade' }));
        break;
      case 'repeat_prompt':
        replay();
        break;
      case 'end_round':
        later(() => host.reportRoundComplete(), 950);
        break;
      default:
        break;
    }

    return () => timers.forEach(clearTimeout);
  }, [directive, host, linkToCard, replay]);

  return (
    <div className="match-scene mech-scene" ref={stageRef}>
      <p className="mech-prompt">{round.prompt.textHe}</p>

      {/*
        The sound, as an object. Tapping it replays — spec 11 step 2 and 16.1
        both assume the child can ask to hear the instruction again, and a child
        who cannot read needs somewhere obvious to press.
      */}
      <button
        className={`match__source ${speaking ? 'match__source--speaking' : ''} ${
          linked ? 'match__source--linked' : ''
        }`}
        onClick={replay}
        aria-label="להקשיב שוב"
      >
        <span className="match__speaker" aria-hidden="true" />
        <span className="match__wave" aria-hidden="true">
          <i /><i /><i /><i /><i />
        </span>
        {/* Zero-size anchor the thread hangs from. Measured instead of the
            thread itself, which is rotating by the time anyone asks. The thread
            is a child of the speaker so it starts exactly where the anchor is,
            without anyone computing an offset. */}
        <span className="match__anchor" aria-hidden="true" ref={sourceRef} />
        <span
          className={`match__thread ${linked ? 'match__thread--on' : ''}`}
          aria-hidden="true"
        />
      </button>

      <div className="match__cards">
        {round.options.map((opt, i) => {
          const anim = anims[opt.optionId] ?? 'idle';
          if (anim === 'fade') return null;

          return (
            <button
              key={opt.optionId}
              ref={(el) => {
                if (el) cardRefs.current.set(opt.optionId, el);
                else cardRefs.current.delete(opt.optionId);
              }}
              className={`card card--${opt.kind === 'image' ? 'picture' : 'sign'} card--${anim}`}
              style={{ ['--card-delay' as string]: `${i * 0.7}s` }}
              onClick={() => {
                if (linked) return;
                host.reportSelection(opt.optionId);
              }}
              aria-label={opt.labelHe}
              disabled={linked !== null && linked !== opt.optionId}
            >
              {opt.kind === 'image' ? (
                // imageRef is already a resolved asset URL — the content pack
                // hands over a bundled URL, not "matara.png", so a mechanic
                // cannot read content identity out of a filename. Same reason
                // OptionView carries no audioRef.
                <img className="card__art" src={opt.imageRef} alt="" draggable={false} />
              ) : (
                <>
                  <img className="card__stone" src={signStone} alt="" draggable={false} />
                  <span className="card__glyph">{opt.glyph}</span>
                </>
              )}
            </button>
          );
        })}
      </div>

      <button className="mech-help" onClick={() => host.requestHint()} disabled={!!linked}>
        רוצה רמז קטן?
      </button>
    </div>
  );
}
