import { describe, it, expect } from 'vitest';
import { RoundController, type ContentResolver, type Clock } from './controller.js';
import { FULL_CAPABILITIES } from '../hints/ladder.js';
import type { TaskTemplate } from '../domain/types.js';

const TASK: TaskTemplate = {
  taskId: 'BAL-001',
  skillId: 'visual_letter_recognition',
  alsoEvidences: ['letter_name_recognition'],
  mechanicId: 'balloon_game',
  targetContentId: 'letter:mem',
  distractorContentIds: ['letter:shin', 'letter:gimel'],
  defaultOptionCount: 3,
  promptCopyId: 'bal.prompt.find_letter',
  feedbackCorrectCopyId: 'bal.ok.found',
  feedbackRetryCopyId: 'bal.retry.look_again',
  hintCopyIds: ['hint.listen_name', 'hint.starts_with_sound'],
  simplerTaskId: 'BAL-001-S',
};

const GLYPHS: Record<string, string> = {
  'letter:mem': 'מ',
  'letter:shin': 'ש',
  'letter:gimel': 'ג',
};

const resolver: ContentResolver = {
  optionKind: () => 'glyph',
  glyph: (id) => GLYPHS[id],
  imageRef: () => undefined,
  audioRef: (id) => `sound-${id}.mp3`,
  label: (id) => GLYPHS[id] ?? id,
  copy: () => ({ textHe: 'פוצץ את הבלון עם האות מֵם', audioRef: 'p.mp3' }),
};

class FakeClock implements Clock {
  private t = 1_000_000;
  now() { return this.t; }
  isoNow() { return new Date(this.t).toISOString(); }
  advance(ms: number) { this.t += ms; }
}

function make(over: Partial<ConstructorParameters<typeof RoundController>[0]> = {}) {
  const clock = new FakeClock();
  const c = new RoundController({
    task: TASK,
    resolver,
    capabilities: FULL_CAPABILITIES,
    childId: 'child-1',
    sessionId: 'session-1',
    taskInstanceId: 'ti-1',
    clock,
    random: () => 0.5,
    ...over,
  });
  return { c, clock };
}

describe('information hiding: the mechanic cannot see what is being taught', () => {
  it('gives the mechanic no skill id anywhere in the round view', () => {
    const { c } = make();
    const view = c.buildRoundView();
    const json = JSON.stringify(view);
    expect(json).not.toContain('visual_letter_recognition');
    expect(json).not.toContain('skillId');
  });

  it('gives the mechanic opaque option tokens, not content ids', () => {
    const { c } = make();
    const view = c.buildRoundView();
    for (const o of view.options) {
      expect(o.optionId).not.toContain('letter:');
    }
    // A mechanic that cannot identify "the mem tile" cannot special-case it.
    expect(JSON.stringify(view)).not.toContain('letter:mem');
  });

  it('keeps audio filenames out of the view entirely', () => {
    // A filename like "sound-letter-mem.mp3" would hand back exactly the
    // identity optionId exists to hide. Audio goes through the host instead.
    const { c } = make();
    const json = JSON.stringify(c.buildRoundView());
    expect(json).not.toContain('.mp3');
    // The controller still knows how to resolve it, for the host to call.
    expect(c.optionAudioRef(c.targetOptionId)).toBe('sound-letter:mem.mp3');
  });

  it('never tells the mechanic which option is correct', () => {
    const { c } = make();
    const json = JSON.stringify(c.buildRoundView());
    expect(json).not.toContain('isTarget');
    expect(json).not.toContain('correct');
  });
});

describe('selection handling', () => {
  it('celebrates and ends the round on the correct option', () => {
    const { c } = make();
    c.markReady();
    const directives = c.select(c.targetOptionId);
    expect(directives.map((d) => d.kind)).toEqual(['affirm_success', 'end_round']);
    expect(c.isResolved).toBe(true);
    expect(c.outcome).toBe('first_try_correct');
  });

  it('encourages rather than corrects on a wrong option', () => {
    const { c } = make();
    c.markReady();
    const view = c.buildRoundView();
    const wrong = view.options.find((o) => o.optionId !== c.targetOptionId)!;
    const directives = c.select(wrong.optionId);

    expect(directives.some((d) => d.kind === 'encourage_retry')).toBe(true);
    // Nothing in the response tells the child they were wrong.
    expect(directives.some((d) => d.kind === 'end_round')).toBe(false);
    expect(c.isResolved).toBe(false);
  });

  it('ignores a stray tap without recording an attempt', () => {
    // Tapping empty sky is not a wrong answer and must not become data.
    const { c } = make();
    c.markReady();
    expect(c.select('not-an-option')).toEqual([]);
    expect(c.telemetry().attempts).toHaveLength(0);
  });
});

describe('spec 17: telemetry is derived, never asserted by a mechanic', () => {
  it('records the attempt before returning any directive', () => {
    // The ordering is the whole mid-session-quit guarantee: if the tab dies
    // during the pop animation, the attempt is already durable.
    const { c } = make();
    c.markReady();
    c.select(c.targetOptionId);
    expect(c.telemetry().attempts).toHaveLength(1);
  });

  it('keeps skill and mechanic in separate fields (spec 1.4 #8)', () => {
    const { c } = make();
    const ti = c.telemetry().taskInstance;
    expect(ti.skillId).toBe('visual_letter_recognition');
    expect(ti.mechanicId).toBe('balloon_game');
  });

  it('measures response time from when options became touchable', () => {
    const { c, clock } = make();
    c.markReady();
    clock.advance(2500);
    c.select(c.targetOptionId);
    expect(c.telemetry().attempts[0]!.responseTimeMs).toBe(2500);
  });

  it('numbers attempts and preserves every one of them', () => {
    const { c } = make();
    c.markReady();
    const view = c.buildRoundView();
    const wrong = view.options.filter((o) => o.optionId !== c.targetOptionId);
    c.select(wrong[0]!.optionId);
    c.select(wrong[0]!.optionId);
    c.select(c.targetOptionId);

    const attempts = c.telemetry().attempts;
    expect(attempts.map((a) => a.attemptNumber)).toEqual([1, 2, 3]);
    expect(attempts.map((a) => a.isCorrect)).toEqual([false, false, true]);
  });

  it('records a hint event for every ladder escalation', () => {
    const { c } = make();
    c.markReady();
    const wrong = c.buildRoundView().options.find((o) => o.optionId !== c.targetOptionId)!;
    c.select(wrong.optionId);
    c.select(wrong.optionId);
    expect(c.telemetry().hintEvents.length).toBeGreaterThan(0);
  });

  it('marks an abandoned round without pretending it was a failure', () => {
    const { c } = make();
    c.markReady();
    c.abandon();
    expect(c.outcome).toBe('abandoned');
  });
});

describe('option presentation', () => {
  it('presents exactly the configured number of options', () => {
    const { c } = make();
    expect(c.buildRoundView().options).toHaveLength(3);
  });

  it('does not always place the target in the same slot', () => {
    // A fixed position teaches position, not the letter.
    const positions = new Set<number>();
    for (let i = 0; i < 30; i++) {
      const c = new RoundController({
        task: TASK,
        resolver,
        capabilities: FULL_CAPABILITIES,
        childId: 'c',
        sessionId: 's',
        taskInstanceId: `ti-${i}`,
      });
      const view = c.buildRoundView();
      positions.add(view.options.findIndex((o) => o.optionId === c.targetOptionId));
    }
    expect(positions.size).toBeGreaterThan(1);
  });

  it('drops a culled distractor from the view after the ladder removes it', () => {
    const { c } = make();
    c.markReady();
    const wrong = c.buildRoundView().options.find((o) => o.optionId !== c.targetOptionId)!;
    // Walk far enough down the ladder to reach the reduce-options rung.
    for (let i = 0; i < 4; i++) c.select(wrong.optionId);

    const after = c.buildRoundView();
    const removed = c.telemetry().taskInstance.optionsPresented.filter(
      (o) => o.removedAtLadderStep !== null,
    );
    if (removed.length > 0) {
      expect(after.options.length).toBeLessThan(3);
      // The target is never the one removed.
      expect(removed.every((o) => !o.isTarget)).toBe(true);
    }
  });
});
