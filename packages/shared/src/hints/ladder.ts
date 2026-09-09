import type { HintType, HintTrigger } from '../domain/types.js';

/**
 * The hint ladder — spec 11, six escalating steps.
 *
 * WHY THIS IS ONE SHARED MACHINE
 * ==============================
 * Spec 11 defines the ladder once, but 1.5, 4.4, 5.4, 6.4, 7, 8.5 and 9.6 each
 * restate it with mechanic-specific flavour. The previous build read that as
 * "each station implements its own wrong-answer handling" and ended up with
 * seven divergent copies. Here the flavour is COPY (data, keyed by mechanic and
 * step); the LOGIC is this single reducer.
 *
 * PURITY
 * ======
 * (state, event, capabilities, policy) -> (state, directives). No DOM, no
 * clock, no storage, no randomness — idle timeouts arrive as IDLE events from
 * an injected clock. That is what makes spec 1.5's acceptance criterion
 * ("כל שלבי רצף העזרה ניתנים להפעלה") a table-driven unit test rather than a
 * manual click-through of five mechanics.
 */

export const LADDER_STEPS = {
  INDEPENDENT: 0,
  RETRY_INVITE: 1,
  REPEAT_PROMPT: 2,
  HINT_OFFER: 3,
  HINT_GIVEN: 4,
  REDUCE_OPTIONS: 5,
  DEMONSTRATE: 6,
  SIMPLER_TASK: 7,
  GUIDED: 8,
  RESOLVED: 9,
} as const;

export type LadderStep = (typeof LADDER_STEPS)[keyof typeof LADDER_STEPS];

/** What a mechanic can physically do. Steps it cannot execute are skipped. */
export interface MechanicCapabilities {
  readonly supportsRepeatPrompt: boolean;
  readonly supportsHighlightOption: boolean;
  readonly supportsRemoveOptions: boolean;
  readonly supportsDemonstrate: boolean;
}

export const FULL_CAPABILITIES: MechanicCapabilities = {
  supportsRepeatPrompt: true,
  supportsHighlightOption: true,
  supportsRemoveOptions: true,
  supportsDemonstrate: true,
};

export interface IdlePolicy {
  /** A presence nudge. Does NOT advance the ladder — see below. */
  readonly nudgeMs: number;
  /** Cumulative idle before offering to repeat the instruction. */
  readonly offerMs: number;
  /** Further idle before the hint fires by itself (spec 11 step 3). */
  readonly autoHintMs: number;
}

export const DEFAULT_IDLE_POLICY: IdlePolicy = {
  nudgeMs: 8_000,
  offerMs: 18_000,
  autoHintMs: 30_000,
};

export interface LadderState {
  readonly step: LadderStep;
  readonly wrongAttempts: number;
  readonly hintOffersDeclined: number;
  /** Distractor option ids already culled, so step 5 never removes twice. */
  readonly removedOptionIds: readonly string[];
  readonly hintsGiven: readonly HintType[];
  /** Set once the round is over; drives the recorded TaskOutcome. */
  readonly resolvedBy: 'correct' | 'guided' | null;
}

export function initialLadderState(): LadderState {
  return {
    step: LADDER_STEPS.INDEPENDENT,
    wrongAttempts: 0,
    hintOffersDeclined: 0,
    removedOptionIds: [],
    hintsGiven: [],
    resolvedBy: null,
  };
}

export type LadderEvent =
  | { readonly kind: 'wrong_selection'; readonly optionId: string }
  | { readonly kind: 'correct_selection'; readonly optionId: string }
  | { readonly kind: 'help_requested' }
  | { readonly kind: 'hint_offer_answered'; readonly accepted: boolean }
  | { readonly kind: 'idle'; readonly elapsedMs: number };

/**
 * What the mechanic is told to render. A mechanic may not invent feedback of
 * its own — it applies directives. This is what makes it impossible for a
 * mechanic to celebrate a wrong answer or skip recording an attempt.
 */
export type PresentationDirective =
  | { readonly kind: 'affirm_success'; readonly optionId: string }
  | { readonly kind: 'encourage_retry'; readonly optionId: string }
  | { readonly kind: 'repeat_prompt' }
  | {
      readonly kind: 'highlight_option';
      readonly intensity: 'soft' | 'strong';
    }
  | { readonly kind: 'remove_options'; readonly optionIds: readonly string[] }
  | { readonly kind: 'demonstrate' }
  | { readonly kind: 'offer_hint' }
  | { readonly kind: 'nudge' }
  | { readonly kind: 'swap_to_simpler_task' }
  /** Disposition is always success. There is no failure to represent. */
  | { readonly kind: 'end_round'; readonly disposition: 'success' };

export interface LadderTransition {
  readonly state: LadderState;
  readonly directives: readonly PresentationDirective[];
  /** Emitted so telemetry never depends on a mechanic remembering to report. */
  readonly hintEvent: { readonly type: HintType; readonly trigger: HintTrigger } | null;
}

/**
 * The next step this mechanic can actually execute. A mechanic that cannot
 * highlight, for example, skips that rung rather than stalling on it.
 *
 * SIMPLER_TASK is never skippable: it is executed by the round controller
 * (swap in a different task), not by the mechanic. That is the ladder's
 * guaranteed floor.
 */
export function nextExecutableStep(
  from: LadderStep,
  caps: MechanicCapabilities,
): LadderStep {
  for (let s = from + 1; s <= LADDER_STEPS.SIMPLER_TASK; s++) {
    if (s === LADDER_STEPS.REPEAT_PROMPT && !caps.supportsRepeatPrompt) continue;
    if (s === LADDER_STEPS.HINT_GIVEN && !caps.supportsHighlightOption) continue;
    if (s === LADDER_STEPS.REDUCE_OPTIONS && !caps.supportsRemoveOptions) continue;
    if (s === LADDER_STEPS.DEMONSTRATE && !caps.supportsDemonstrate) continue;
    return s as LadderStep;
  }
  return LADDER_STEPS.SIMPLER_TASK;
}

const HINT_TYPE_BY_STEP: Partial<Record<LadderStep, HintType>> = {
  [LADDER_STEPS.RETRY_INVITE]: 'retry_invite',
  [LADDER_STEPS.REPEAT_PROMPT]: 'repeat_prompt',
  [LADDER_STEPS.HINT_GIVEN]: 'audio_hint',
  [LADDER_STEPS.REDUCE_OPTIONS]: 'reduce_options',
  [LADDER_STEPS.DEMONSTRATE]: 'demonstrate',
  [LADDER_STEPS.SIMPLER_TASK]: 'simpler_task',
};

function directivesForStep(
  step: LadderStep,
  ctx: { readonly optionId?: string; readonly removableDistractorId?: string },
): PresentationDirective[] {
  switch (step) {
    case LADDER_STEPS.RETRY_INVITE:
      return [{ kind: 'encourage_retry', optionId: ctx.optionId ?? '' }];
    case LADDER_STEPS.REPEAT_PROMPT:
      return [{ kind: 'repeat_prompt' }];
    case LADDER_STEPS.HINT_OFFER:
      return [{ kind: 'offer_hint' }];
    case LADDER_STEPS.HINT_GIVEN:
      return [{ kind: 'highlight_option', intensity: 'soft' }];
    case LADDER_STEPS.REDUCE_OPTIONS:
      return ctx.removableDistractorId
        ? [{ kind: 'remove_options', optionIds: [ctx.removableDistractorId] }]
        : [{ kind: 'highlight_option', intensity: 'strong' }];
    case LADDER_STEPS.DEMONSTRATE:
      return [{ kind: 'demonstrate' }];
    case LADDER_STEPS.SIMPLER_TASK:
      return [{ kind: 'swap_to_simpler_task' }];
    default:
      return [];
  }
}

export interface LadderContext {
  readonly capabilities: MechanicCapabilities;
  readonly idlePolicy: IdlePolicy;
  /** Distractor option ids still on screen, for step 5's cull. */
  readonly remainingDistractorIds: readonly string[];
}

/**
 * The reducer. Every transition either advances toward help or resolves the
 * round — there is no arc that leaves the child stuck.
 */
export function ladderReducer(
  state: LadderState,
  event: LadderEvent,
  ctx: LadderContext,
): LadderTransition {
  if (state.step === LADDER_STEPS.RESOLVED) {
    return { state, directives: [], hintEvent: null };
  }

  // ── Correct answer resolves from ANY rung ───────────────────────────────
  if (event.kind === 'correct_selection') {
    return {
      state: { ...state, step: LADDER_STEPS.RESOLVED, resolvedBy: 'correct' },
      directives: [
        { kind: 'affirm_success', optionId: event.optionId },
        { kind: 'end_round', disposition: 'success' },
      ],
      hintEvent: null,
    };
  }

  // ── The guaranteed floor ────────────────────────────────────────────────
  // At GUIDED the child has been walked all the way down the ladder. The next
  // selection ends the round positively whichever option it is. Recorded as
  // correct_after_demo, which carries zero mastery weight but full exposure —
  // so this can never inflate a skill status, and can never trap a child.
  if (state.step === LADDER_STEPS.GUIDED) {
    return {
      state: { ...state, step: LADDER_STEPS.RESOLVED, resolvedBy: 'guided' },
      directives: [
        { kind: 'affirm_success', optionId: 'optionId' in event ? event.optionId : '' },
        { kind: 'end_round', disposition: 'success' },
      ],
      hintEvent: null,
    };
  }

  // ── Idle handling, spec 16.1 ────────────────────────────────────────────
  if (event.kind === 'idle') {
    const { nudgeMs, offerMs, autoHintMs } = ctx.idlePolicy;

    // A nudge is a presence signal, not help. It must NOT advance the ladder:
    // escalating on inattention would penalise a distractible child for
    // something that is not a learning difficulty.
    if (event.elapsedMs >= autoHintMs) {
      const step = nextExecutableStep(
        Math.max(state.step, LADDER_STEPS.HINT_OFFER) as LadderStep,
        ctx.capabilities,
      );
      return advance(state, step, 'idle_timeout', {});
    }
    if (event.elapsedMs >= offerMs && state.step < LADDER_STEPS.REPEAT_PROMPT) {
      return advance(state, LADDER_STEPS.REPEAT_PROMPT, 'idle_timeout', {});
    }
    if (event.elapsedMs >= nudgeMs) {
      return { state, directives: [{ kind: 'nudge' }], hintEvent: null };
    }
    return { state, directives: [], hintEvent: null };
  }

  // ── Child asked for help (spec 11 step 3) ───────────────────────────────
  if (event.kind === 'help_requested') {
    return advance(state, LADDER_STEPS.HINT_OFFER, 'child_requested', {});
  }

  if (event.kind === 'hint_offer_answered') {
    if (event.accepted) {
      const step = nextExecutableStep(LADDER_STEPS.HINT_OFFER, ctx.capabilities);
      return advance(state, step, 'child_requested', {});
    }
    // "לא עכשיו" — respected. The child stays where they are and keeps trying.
    // The idle clock still runs, so help still arrives eventually (spec 11).
    return {
      state: { ...state, hintOffersDeclined: state.hintOffersDeclined + 1 },
      directives: [],
      hintEvent: null,
    };
  }

  // ── Wrong selection ─────────────────────────────────────────────────────
  const wrongAttempts = state.wrongAttempts + 1;
  const nextStep = nextExecutableStep(state.step, ctx.capabilities);
  const withCount: LadderState = { ...state, wrongAttempts };

  // Spec 16.2: repeatedly tapping the same distractor is never punished and
  // never blocked. It advances the ladder like any other wrong selection.
  const removable = ctx.remainingDistractorIds.find(
    (id) => !state.removedOptionIds.includes(id) && id !== event.optionId,
  );

  const transition = advance(withCount, nextStep, 'wrong_selection', {
    optionId: event.optionId,
    removableDistractorId: removable,
  });

  // Always pair the escalation with a gentle retry invitation, so the child
  // sees encouragement before they see help.
  return {
    ...transition,
    directives: [
      { kind: 'encourage_retry', optionId: event.optionId },
      ...transition.directives.filter((d) => d.kind !== 'encourage_retry'),
    ],
  };
}

function advance(
  state: LadderState,
  step: LadderStep,
  trigger: HintTrigger,
  extra: { optionId?: string; removableDistractorId?: string },
): LadderTransition {
  const directives = directivesForStep(step, extra);
  const hintType = HINT_TYPE_BY_STEP[step] ?? null;

  const removedOptionIds =
    step === LADDER_STEPS.REDUCE_OPTIONS && extra.removableDistractorId
      ? [...state.removedOptionIds, extra.removableDistractorId]
      : state.removedOptionIds;

  // After the terminal rung, the very next wrong selection lands on GUIDED,
  // which resolves positively no matter what. Nothing goes past this.
  const landedStep = step === LADDER_STEPS.SIMPLER_TASK ? LADDER_STEPS.GUIDED : step;

  return {
    state: {
      ...state,
      step: landedStep,
      removedOptionIds,
      hintsGiven: hintType ? [...state.hintsGiven, hintType] : state.hintsGiven,
    },
    directives,
    hintEvent: hintType ? { type: hintType, trigger } : null,
  };
}

/**
 * Maps the finished ladder onto the outcome the assessment engine reads.
 * Deriving it here rather than letting a mechanic assert it is what makes
 * spec 17's `success_after_hint` impossible to forget (criterion 3.7).
 */
export function outcomeFor(state: LadderState) {
  if (state.resolvedBy === 'guided') return 'correct_after_demo' as const;
  if (state.resolvedBy !== 'correct') return 'abandoned' as const;
  if (state.hintsGiven.some((h) => h !== 'retry_invite' && h !== 'repeat_prompt')) {
    return 'correct_after_hint' as const;
  }
  if (state.wrongAttempts > 0) return 'correct_after_retry' as const;
  return 'first_try_correct' as const;
}
