import { describe, it, expect } from 'vitest';
import { windowedEvidenceStrategy, scoreAll } from './engine.js';
import { DEFAULT_POLICY } from './policy.js';
import { ALL_SKILL_IDS, type MechanicId, type SkillId } from '../domain/ids.js';
import { LETTERS } from '../hebrew/letters.js';
import type { Evidence, TaskOutcome } from '../domain/types.js';

let seq = 0;
function ev(
  outcome: TaskOutcome,
  opts: Partial<Pick<Evidence, 'skillId' | 'mechanicId' | 'rootLetterId' | 'isScaffolded' | 'sessionId'>> = {},
): Evidence {
  seq += 1;
  return {
    taskInstanceId: `ti-${seq}`,
    skillId: opts.skillId ?? 'visual_letter_recognition',
    contentId: opts.rootLetterId ?? 'letter:mem',
    rootLetterId: opts.rootLetterId ?? 'letter:mem',
    mechanicId: opts.mechanicId ?? 'balloon_game',
    outcome,
    isScaffolded: opts.isScaffolded ?? false,
    sessionId: opts.sessionId ?? 'session-1',
    // Zero-padded so lexicographic sort is chronological.
    occurredAt: `2026-09-09T10:${String(seq).padStart(2, '0')}:00.000Z`,
  };
}

const score = (evidence: Evidence[], over: Partial<Parameters<typeof windowedEvidenceStrategy.score>[0]> = {}) =>
  windowedEvidenceStrategy.score({
    childId: 'child-1',
    skillId: 'visual_letter_recognition',
    contentScopeId: 'letter:mem',
    evidence,
    policy: DEFAULT_POLICY,
    sessionsSinceLastAdventure: 99,
    adventuresThisSession: 0,
    now: '2026-09-09T12:00:00.000Z',
    ...over,
  });

// ═══════════════════════════════════════════════════════════════════════════
// CRITERION 3.8 — the client's contractual guarantee.
// "אף טעות יחידה אינה מפעילה לבדה משימת חיזוק או שינוי סטטוס חד־משמעי"
// ═══════════════════════════════════════════════════════════════════════════

describe('criterion 3.8: a single error never triggers reinforcement', () => {
  it('single_error_never_triggers_reinforcement — every skill x every letter', () => {
    // Exhaustive over the whole MVP content surface, because the guarantee is
    // about the RULE, not about one lucky example.
    for (const skillId of ALL_SKILL_IDS) {
      for (const letter of LETTERS) {
        for (const bad of ['correct_after_retry', 'correct_after_hint', 'correct_after_demo'] as const) {
          const state = score([ev(bad, { skillId, rootLetterId: letter.contentId })], {
            skillId,
            contentScopeId: letter.contentId,
          });
          expect(
            state.needsReinforcement,
            `${skillId} / ${letter.contentId} / ${bad} fired on ONE error`,
          ).toBe(false);
        }
      }
    }
  });

  it('does not fire on two errors either, when there is no third observation', () => {
    // The window needs minExposuresInWindow observations before it says
    // anything — two data points is still an anecdote.
    const state = score([ev('correct_after_retry'), ev('correct_after_hint')]);
    expect(state.needsReinforcement).toBe(false);
  });

  it('never lets one error move a skill to a definitive status', () => {
    const state = score([ev('correct_after_hint')]);
    expect(state.status).toBe('חדש'); // not enough evidence to say more
  });

  it('treats an abandoned task as exposure but never as difficulty', () => {
    // A child leaving the room is not evidence of struggle. The previous
    // build's streak counter would have scored this as failure.
    const state = score([ev('abandoned'), ev('abandoned'), ev('abandoned'), ev('abandoned')]);
    expect(state.exposures).toBe(4);
    expect(state.needsReinforcement).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CRITERION 3.9 — the trigger must actually be reachable, and must name the
// right letter.
// ═══════════════════════════════════════════════════════════════════════════

describe('criterion 3.9: sustained difficulty does trigger reinforcement', () => {
  it('scripted_struggle_triggers_reinforcement_for_correct_letter', () => {
    // ר struggled with across two different mechanics — spec 10.1's preferred
    // evidence, because it points at the letter rather than at the game.
    const evidence = [
      ev('correct_after_retry', { rootLetterId: 'letter:resh', mechanicId: 'balloon_game' }),
      ev('first_try_correct', { rootLetterId: 'letter:resh', mechanicId: 'balloon_game' }),
      ev('correct_after_hint', { rootLetterId: 'letter:resh', mechanicId: 'fishing_game' }),
    ];
    const state = score(evidence, { contentScopeId: 'letter:resh' });

    expect(state.needsReinforcement).toBe(true);
    expect(state.contentScopeId).toBe('letter:resh');
    expect(state.distinctMechanics).toContain('fishing_game');
  });

  it('fires on persistent difficulty inside a single mechanic too', () => {
    // Spec 10.1 allows "ביותר ממכניקה אחת, או לאחר מספר ניסיונות".
    const evidence = [
      ev('correct_after_retry', { mechanicId: 'balloon_game' }),
      ev('correct_after_hint', { mechanicId: 'balloon_game' }),
      ev('correct_after_hint', { mechanicId: 'balloon_game' }),
    ];
    expect(score(evidence).needsReinforcement).toBe(true);
  });

  it('targets only the letter that was actually hard', () => {
    // מ is fine, ר is not. The adventure must be about ר.
    const evidence = [
      ev('first_try_correct', { rootLetterId: 'letter:mem' }),
      ev('first_try_correct', { rootLetterId: 'letter:mem' }),
      ev('first_try_correct', { rootLetterId: 'letter:mem' }),
      ev('correct_after_hint', { rootLetterId: 'letter:resh', mechanicId: 'balloon_game' }),
      ev('correct_after_hint', { rootLetterId: 'letter:resh', mechanicId: 'fishing_game' }),
      ev('correct_after_retry', { rootLetterId: 'letter:resh', mechanicId: 'fishing_game' }),
    ];
    const states = scoreAll({ childId: 'c1', evidence, policy: DEFAULT_POLICY });

    const flagged = states.filter((s) => s.contentScopeId !== null && s.needsReinforcement);
    expect(flagged).toHaveLength(1);
    expect(flagged[0]!.contentScopeId).toBe('letter:resh');
  });

  it('respects the cooldown so an adventure cannot loop on one letter', () => {
    const evidence = [ev('correct_after_hint'), ev('correct_after_hint'), ev('correct_after_retry')];
    expect(score(evidence, { sessionsSinceLastAdventure: 0 }).needsReinforcement).toBe(false);
    expect(score(evidence, { sessionsSinceLastAdventure: 99 }).needsReinforcement).toBe(true);
  });

  it('allows only one adventure per session (spec 19)', () => {
    const evidence = [ev('correct_after_hint'), ev('correct_after_hint'), ev('correct_after_retry')];
    expect(score(evidence, { adventuresThisSession: 1 }).needsReinforcement).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Status derivation — what the parent screen shows.
// ═══════════════════════════════════════════════════════════════════════════

describe('skill status (spec 1.4 #9, 14.3)', () => {
  it('starts at חדש while evidence is thin', () => {
    expect(score([]).status).toBe('חדש');
    expect(score([ev('first_try_correct'), ev('first_try_correct')]).status).toBe('חדש');
  });

  it('reaches הצלחה עקבית only across more than one mechanic', () => {
    const oneMechanic = [
      ev('first_try_correct', { mechanicId: 'balloon_game' }),
      ev('first_try_correct', { mechanicId: 'balloon_game' }),
      ev('first_try_correct', { mechanicId: 'balloon_game' }),
      ev('first_try_correct', { mechanicId: 'balloon_game' }),
    ];
    // Four clean successes, but all in one game — that is "good at balloons",
    // not "knows the letter".
    expect(score(oneMechanic).status).toBe('בתרגול');

    const twoMechanics = [
      ev('first_try_correct', { mechanicId: 'balloon_game' }),
      ev('first_try_correct', { mechanicId: 'balloon_game' }),
      ev('first_try_correct', { mechanicId: 'fishing_game' }),
      ev('first_try_correct', { mechanicId: 'fishing_game' }),
    ];
    expect(score(twoMechanics).status).toBe('הצלחה עקבית');
  });

  it('blocks mastery when the most recent successes needed help', () => {
    const evidence = [
      ev('first_try_correct', { mechanicId: 'balloon_game' }),
      ev('first_try_correct', { mechanicId: 'balloon_game' }),
      ev('first_try_correct', { mechanicId: 'fishing_game' }),
      ev('first_try_correct', { mechanicId: 'fishing_game' }),
      ev('correct_after_hint', { mechanicId: 'fishing_game' }),
    ];
    expect(score(evidence).status).toBe('בתרגול');
  });

  it('never reports a status implying failure', () => {
    // Spec 14.4 bans that vocabulary outright. A struggling child is בתרגול.
    const allowed = new Set(['חדש', 'בתרגול', 'הצלחה עקבית']);
    const rough = [ev('correct_after_demo'), ev('correct_after_demo'), ev('correct_after_hint')];
    expect(allowed.has(score(rough).status)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// The scaffolding rule — the subtlest correctness requirement here.
// ═══════════════════════════════════════════════════════════════════════════

describe('scaffolded rounds are exposure only', () => {
  it('does not let easy 2-option rounds manufacture mastery', () => {
    // A coin flip clears three in a row 12.5% of the time. Counting these
    // would let the system talk itself into mastery the child never showed.
    const evidence = [
      ev('first_try_correct', { mechanicId: 'balloon_game', isScaffolded: true }),
      ev('first_try_correct', { mechanicId: 'balloon_game', isScaffolded: true }),
      ev('first_try_correct', { mechanicId: 'fishing_game', isScaffolded: true }),
      ev('first_try_correct', { mechanicId: 'fishing_game', isScaffolded: true }),
    ];
    const state = score(evidence);
    expect(state.exposures).toBe(4);
    expect(state.firstTryCorrect).toBe(0);
    expect(state.status).toBe('בתרגול');
  });

  it('does not let the system punish its own help', () => {
    const evidence = [
      ev('correct_after_demo', { isScaffolded: true }),
      ev('correct_after_demo', { isScaffolded: true }),
      ev('correct_after_hint', { isScaffolded: true }),
    ];
    expect(score(evidence).needsReinforcement).toBe(false);
  });
});

describe('determinism', () => {
  it('is a pure function of its inputs', () => {
    const evidence = [ev('first_try_correct'), ev('correct_after_hint'), ev('first_try_correct')];
    const a = score(evidence);
    const b = score([...evidence].reverse());
    // Order of the input array must not matter — occurredAt defines order.
    expect(a.status).toBe(b.status);
    expect(a.needsReinforcement).toBe(b.needsReinforcement);
    expect(a.exposures).toBe(b.exposures);
  });

  it('records which policy produced the row, so a status can be explained', () => {
    expect(score([ev('first_try_correct')]).policyVersion).toBe(DEFAULT_POLICY.version);
  });
});

describe('scoreAll produces both rollups', () => {
  it('emits a skill-level row and a per-letter row', () => {
    const evidence = [
      ev('first_try_correct', { skillId: 'visual_letter_recognition', rootLetterId: 'letter:mem' }),
      ev('first_try_correct', { skillId: 'letter_name_recognition', rootLetterId: 'letter:shin' }),
    ];
    const states = scoreAll({ childId: 'c1', evidence, policy: DEFAULT_POLICY });

    const skillLevel = states.filter((s) => s.contentScopeId === null);
    const letterLevel = states.filter((s) => s.contentScopeId !== null);

    expect(skillLevel.map((s) => s.skillId).sort()).toEqual(
      ['letter_name_recognition', 'visual_letter_recognition'] satisfies SkillId[],
    );
    expect(letterLevel).toHaveLength(2);
  });

  it('separates skill from mechanic, so criterion 3.11 is answerable', () => {
    const evidence = [
      ev('first_try_correct', { mechanicId: 'balloon_game' }),
      ev('correct_after_hint', { mechanicId: 'fishing_game' }),
    ];
    const state = score(evidence);
    expect([...state.distinctMechanics].sort()).toEqual(
      ['balloon_game', 'fishing_game'] satisfies MechanicId[],
    );
  });
});
