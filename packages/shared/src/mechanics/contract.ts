import type { MechanicId } from '../domain/ids.js';
import type { MechanicCapabilities, PresentationDirective } from '../hints/ladder.js';

/**
 * The mechanic contract.
 *
 * THE ONE RULE
 * ============
 * A mechanic never decides whether an answer is correct, never records
 * anything, never chooses a hint, and never sees a skill or a content id.
 *
 * It renders a prompt, renders N options, and reports which one was touched.
 * Everything else belongs to the round controller. This is the direct fix for
 * the previous build, where seven station files each reimplemented correctness,
 * scoring, wrong-answer handling and telemetry — and drifted apart.
 *
 * A NOTE ON THE SHAPE
 * ===================
 * The architecture sketched this as `mount(container, round, host)`, a
 * DOM-level API. Implemented here as props instead, because the app is React
 * and a hand-rolled imperative mount would fight the framework for no gain.
 * The guarantees are identical and they were never about the DOM: RoundView
 * carries no skillId, and options are opaque tokens rather than content ids, so
 * a mechanic *cannot* branch on what is being taught even if it wanted to.
 */

export type OptionKind = 'glyph' | 'image' | 'audio' | 'trace';

export interface OptionView {
  /**
   * Per-instance opaque token. Deliberately NOT the content id: a mechanic
   * that could read "this is the mem tile" could special-case it, and then
   * swapping content would silently change behaviour.
   */
  readonly optionId: string;
  readonly kind: OptionKind;
  /** The character to draw, for glyph options. "מ" | "מַ" */
  readonly glyph?: string;
  readonly imageRef?: string;
  /** Accessibility label, already resolved to Hebrew. */
  readonly labelHe: string;
  /**
   * NOTE: there is deliberately no audioRef here. A filename like
   * "sound-letter-mem.mp3" would hand the mechanic the content identity that
   * optionId exists to hide — a test caught exactly that leak. To play an
   * option's sound, call host.playOptionAudio(optionId) and let the host
   * resolve it.
   */
}

export interface RoundView {
  readonly roundId: string;
  readonly prompt: {
    /**
     * Already token-substituted. The mechanic never sees a template.
     *
     * This necessarily names the target letter — it is the visible instruction
     * a child reads or hears. That is fine: knowing the prompt says "מֵם" does
     * not tell a mechanic WHICH OPTION is the mem, which is the isolation that
     * actually matters. Prompt audio still goes through host.playPrompt(), so
     * no filename hands over more than the visible text already does.
     */
    readonly textHe: string;
    /** Optional visual instruction, e.g. the letter painted on the train gate. */
    readonly displayGlyph?: string;
  };
  /** Already shuffled by the controller. */
  readonly options: readonly OptionView[];
  /** Cosmetic only. Never behavioural. */
  readonly theme?: { readonly accentColor: string };
}

/**
 * What a mechanic may do. Note there is no "tell me if this was right" — the
 * answer arrives as a directive instead, so a mechanic physically cannot
 * celebrate a wrong tap or skip recording an attempt.
 */
export interface MechanicHost {
  /** Options are on screen and touchable. Starts the response clock. */
  reportReady(): void;
  reportSelection(optionId: string): void;
  /** Child tapped the help affordance. */
  requestHint(): void;
  answerHintOffer(accepted: boolean): void;
  /** Celebration finished; the controller may advance. */
  reportRoundComplete(): void;
  /**
   * Narration. Single channel, no queue: each call cancels whatever is
   * currently playing (spec 1.6 rule ב׳).
   */
  playPrompt(): void;
  /** Plays that option's own sound. The host resolves the file, not you. */
  playOptionAudio(optionId: string): void;
  stopNarration(): void;
  playEffect(name: 'pop' | 'chime' | 'whoosh'): void;
  /** Non-fatal breadcrumb, e.g. "child tapped empty sky". */
  reportInteraction(kind: string, detail?: Record<string, unknown>): void;
}

export interface MechanicDefinition {
  readonly mechanicId: MechanicId;
  readonly capabilities: MechanicCapabilities;
}

export type { PresentationDirective, MechanicCapabilities };

/** Props every mechanic component receives. Nothing else. */
export interface MechanicProps {
  readonly round: RoundView;
  readonly host: MechanicHost;
  /**
   * The directive to apply right now, or null. Applying a directive is the
   * mechanic's only route to showing feedback.
   */
  readonly directive: PresentationDirective | null;
}
