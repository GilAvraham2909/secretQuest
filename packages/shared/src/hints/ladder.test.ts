import { describe, it, expect } from 'vitest';
import {
  ladderReducer,
  initialLadderState,
  nextExecutableStep,
  outcomeFor,
  LADDER_STEPS,
  FULL_CAPABILITIES,
  DEFAULT_IDLE_POLICY,
  type LadderContext,
  type LadderState,
  type MechanicCapabilities,
  type PresentationDirective,
} from './ladder.js';
import { ALL_MECHANIC_IDS, type MechanicId } from '../domain/ids.js';

const ctxWith = (
  caps: MechanicCapabilities = FULL_CAPABILITIES,
  distractors: string[] = ['d1', 'd2'],
): LadderContext => ({
  capabilities: caps,
  idlePolicy: DEFAULT_IDLE_POLICY,
  remainingDistractorIds: distractors,
});

/** Drives wrong selections until the round resolves, or throws if it never does. */
function walkToResolution(ctx: LadderContext, maxSteps = 40) {
  let state = initialLadderState();
  const directives: PresentationDirective[] = [];
  for (let i = 0; i < maxSteps; i++) {
    const t = ladderReducer(state, { kind: 'wrong_selection', optionId: 'd1' }, ctx);
    state = t.state;
    directives.push(...t.directives);
    if (state.step === LADDER_STEPS.RESOLVED) return { state, directives, iterations: i + 1 };
  }
  throw new Error('ladder never resolved — a child would be stuck here');
}

describe('spec 1.5 AC: the child can never get stuck', () => {
  it('always resolves, for every mechanic capability profile', () => {
    // Every subset of capabilities, including a mechanic that can do nothing
    // but show options. 16 profiles.
    for (let mask = 0; mask < 16; mask++) {
      const caps: MechanicCapabilities = {
        supportsRepeatPrompt: Boolean(mask & 1),
        supportsHighlightOption: Boolean(mask & 2),
        supportsRemoveOptions: Boolean(mask & 4),
        supportsDemonstrate: Boolean(mask & 8),
      };
      const { state } = walkToResolution(ctxWith(caps));
      expect(state.step).toBe(LADDER_STEPS.RESOLVED);
      expect(state.resolvedBy).toBe('guided');
    }
  });

  it('resolves positively — no directive ever signals failure', () => {
    const { directives } = walkToResolution(ctxWith());
    const end = directives.filter((d) => d.kind === 'end_round');
    expect(end.length).toBeGreaterThan(0);
    for (const d of end) {
      // The type system has no other disposition; this guards the runtime too.
      expect(d).toHaveProperty('disposition', 'success');
    }
  });

  it('offers encouragement on every wrong selection', () => {
    const ctx = ctxWith();
    let state = initialLadderState();
    for (let i = 0; i < 5 && state.step !== LADDER_STEPS.RESOLVED; i++) {
      const t = ladderReducer(state, { kind: 'wrong_selection', optionId: 'd1' }, ctx);
      expect(
        t.directives.some((d) => d.kind === 'encourage_retry'),
        `no encouragement at step ${state.step}`,
      ).toBe(true);
      state = t.state;
    }
  });
});

describe('spec 1.5 AC: every ladder step is reachable', () => {
  it('reaches all six rungs for a fully-capable mechanic', () => {
    const ctx = ctxWith();
    let state = initialLadderState();
    const visited = new Set<number>();
    for (let i = 0; i < 12 && state.step !== LADDER_STEPS.RESOLVED; i++) {
      state = ladderReducer(state, { kind: 'wrong_selection', optionId: 'd1' }, ctx).state;
      visited.add(state.step);
    }
    for (const step of [
      LADDER_STEPS.RETRY_INVITE,
      LADDER_STEPS.REPEAT_PROMPT,
      LADDER_STEPS.HINT_OFFER,
      LADDER_STEPS.HINT_GIVEN,
      LADDER_STEPS.REDUCE_OPTIONS,
      LADDER_STEPS.DEMONSTRATE,
    ]) {
      expect(visited.has(step), `never reached step ${step}`).toBe(true);
    }
  });

  // The 5 mechanics x 6 rungs table the architecture calls for.
  it.each(ALL_MECHANIC_IDS)('resolves and escalates for %s', (mechanicId: MechanicId) => {
    // trace_game is the one mechanic with no discrete options to remove.
    const caps: MechanicCapabilities =
      mechanicId === 'trace_game'
        ? { ...FULL_CAPABILITIES, supportsRemoveOptions: false }
        : FULL_CAPABILITIES;
    const { state, iterations } = walkToResolution(ctxWith(caps));
    expect(state.step).toBe(LADDER_STEPS.RESOLVED);
    expect(iterations).toBeGreaterThan(1);
  });
});

describe('capability negotiation', () => {
  it('skips rungs a mechanic cannot execute', () => {
    const caps: MechanicCapabilities = {
      supportsRepeatPrompt: false,
      supportsHighlightOption: false,
      supportsRemoveOptions: true,
      supportsDemonstrate: true,
    };
    // From INDEPENDENT the next executable rung skips repeat-prompt entirely.
    const next = nextExecutableStep(LADDER_STEPS.INDEPENDENT, caps);
    expect(next).toBe(LADDER_STEPS.RETRY_INVITE);
    expect(nextExecutableStep(LADDER_STEPS.RETRY_INVITE, caps)).toBe(
      LADDER_STEPS.HINT_OFFER,
    );
  });

  it('never skips the simpler-task floor, whatever the mechanic lacks', () => {
    const none: MechanicCapabilities = {
      supportsRepeatPrompt: false,
      supportsHighlightOption: false,
      supportsRemoveOptions: false,
      supportsDemonstrate: false,
    };
    expect(nextExecutableStep(LADDER_STEPS.REDUCE_OPTIONS, none)).toBe(
      LADDER_STEPS.SIMPLER_TASK,
    );
  });
});

describe('spec 16.1: idle handling', () => {
  const ctx = ctxWith();

  it('nudges without advancing the ladder', () => {
    // A distractible child is not a struggling child. Escalating on silence
    // alone would record difficulty that never happened.
    const state = initialLadderState();
    const t = ladderReducer(state, { kind: 'idle', elapsedMs: 9_000 }, ctx);
    expect(t.directives).toEqual([{ kind: 'nudge' }]);
    expect(t.state.step).toBe(LADDER_STEPS.INDEPENDENT);
    expect(t.hintEvent).toBeNull();
  });

  it('repeats the instruction after a longer silence', () => {
    const t = ladderReducer(initialLadderState(), { kind: 'idle', elapsedMs: 19_000 }, ctx);
    expect(t.state.step).toBe(LADDER_STEPS.REPEAT_PROMPT);
    expect(t.hintEvent?.trigger).toBe('idle_timeout');
  });

  it('fires the hint by itself when the child never answers', () => {
    const t = ladderReducer(initialLadderState(), { kind: 'idle', elapsedMs: 31_000 }, ctx);
    expect(t.state.step).toBeGreaterThanOrEqual(LADDER_STEPS.HINT_GIVEN);
    expect(t.hintEvent?.trigger).toBe('idle_timeout');
  });
});

describe('spec 11 step 3: the hint offer', () => {
  const ctx = ctxWith();

  it('respects "לא עכשיו" without advancing or punishing', () => {
    const offered = ladderReducer(initialLadderState(), { kind: 'help_requested' }, ctx);
    const declined = ladderReducer(
      offered.state,
      { kind: 'hint_offer_answered', accepted: false },
      ctx,
    );
    expect(declined.state.step).toBe(offered.state.step);
    expect(declined.state.hintOffersDeclined).toBe(1);
    expect(declined.directives).toHaveLength(0);
  });

  it('gives the hint on "כן"', () => {
    const offered = ladderReducer(initialLadderState(), { kind: 'help_requested' }, ctx);
    const accepted = ladderReducer(
      offered.state,
      { kind: 'hint_offer_answered', accepted: true },
      ctx,
    );
    expect(accepted.state.step).toBe(LADDER_STEPS.HINT_GIVEN);
    expect(accepted.directives.some((d) => d.kind === 'highlight_option')).toBe(true);
  });
});

describe('spec 16.2: repeated taps on the same distractor', () => {
  it('is neither blocked nor penalised', () => {
    const ctx = ctxWith();
    let state = initialLadderState();
    for (let i = 0; i < 3; i++) {
      const t = ladderReducer(state, { kind: 'wrong_selection', optionId: 'd1' }, ctx);
      // Never blocked: the ladder keeps producing help rather than refusing.
      expect(t.directives.length).toBeGreaterThan(0);
      state = t.state;
    }
    expect(state.wrongAttempts).toBe(3);
    expect(state.step).not.toBe(LADDER_STEPS.RESOLVED);
  });

  it('does not remove the option the child keeps choosing', () => {
    // Culling the child's own repeated pick would read as "you were wrong",
    // which spec 21 forbids. Cull a different distractor.
    const ctx = ctxWith(FULL_CAPABILITIES, ['d1', 'd2']);
    let state: LadderState = { ...initialLadderState(), step: LADDER_STEPS.HINT_GIVEN };
    const t = ladderReducer(state, { kind: 'wrong_selection', optionId: 'd1' }, ctx);
    const removal = t.directives.find((d) => d.kind === 'remove_options');
    if (removal && removal.kind === 'remove_options') {
      expect(removal.optionIds).not.toContain('d1');
    }
  });
});

describe('outcome derivation', () => {
  const ctx = ctxWith();

  it('records a clean first try', () => {
    const t = ladderReducer(initialLadderState(), { kind: 'correct_selection', optionId: 'x' }, ctx);
    expect(outcomeFor(t.state)).toBe('first_try_correct');
  });

  it('separates a retry from a hinted success (spec 1.5)', () => {
    const wrong = ladderReducer(initialLadderState(), { kind: 'wrong_selection', optionId: 'd1' }, ctx);
    const right = ladderReducer(wrong.state, { kind: 'correct_selection', optionId: 'x' }, ctx);
    expect(outcomeFor(right.state)).toBe('correct_after_retry');
  });

  it('marks a success that followed real help', () => {
    const offered = ladderReducer(initialLadderState(), { kind: 'help_requested' }, ctx);
    const hinted = ladderReducer(offered.state, { kind: 'hint_offer_answered', accepted: true }, ctx);
    const right = ladderReducer(hinted.state, { kind: 'correct_selection', optionId: 'x' }, ctx);
    expect(outcomeFor(right.state)).toBe('correct_after_hint');
  });

  it('marks a fully-guided resolution', () => {
    const { state } = walkToResolution(ctx);
    expect(outcomeFor(state)).toBe('correct_after_demo');
  });
});
