import type { TaskTemplate, TaskInstance, Attempt, HintEvent, TaskOutcome, PresentedOption } from '../domain/types.js';
import type { ContentId } from '../domain/ids.js';
import type { OptionView, RoundView, OptionKind } from '../mechanics/contract.js';
import {
  ladderReducer,
  initialLadderState,
  outcomeFor,
  LADDER_STEPS,
  DEFAULT_IDLE_POLICY,
  type LadderState,
  type LadderContext,
  type MechanicCapabilities,
  type PresentationDirective,
  type IdlePolicy,
} from '../hints/ladder.js';

/**
 * The round controller.
 *
 * Owns the answer key, the hint ladder and the telemetry. A mechanic asks it
 * nothing and tells it everything; it decides what the mechanic renders next.
 *
 * Telemetry is appended BEFORE any directive is returned, never after. If the
 * tab dies during a balloon-pop animation, the attempt is already recorded —
 * which is what spec 1.4's "data survives the child quitting" and criterion 3.7
 * actually depend on.
 */

/** Turns a content id into something drawable, so mechanics never resolve content. */
export interface ContentResolver {
  optionKind(contentId: ContentId): OptionKind;
  glyph(contentId: ContentId): string | undefined;
  imageRef(contentId: ContentId): string | undefined;
  audioRef(contentId: ContentId): string | undefined;
  label(contentId: ContentId): string;
  /** Renders a copy template with this task's values already substituted. */
  copy(copyId: string, targetContentId: ContentId): { textHe: string; audioRef: string | null };
}

export interface Clock {
  now(): number;
  isoNow(): string;
}

export const systemClock: Clock = {
  now: () => Date.now(),
  isoNow: () => new Date().toISOString(),
};

export interface RoundControllerOptions {
  readonly task: TaskTemplate;
  readonly resolver: ContentResolver;
  readonly capabilities: MechanicCapabilities;
  readonly childId: string;
  readonly sessionId: string;
  readonly taskInstanceId: string;
  readonly idlePolicy?: IdlePolicy;
  readonly clock?: Clock;
  /** Deterministic shuffle for tests; defaults to Math.random. */
  readonly random?: () => number;
  readonly isScaffolded?: boolean;
}

export interface RoundTelemetry {
  readonly taskInstance: TaskInstance;
  readonly attempts: readonly Attempt[];
  readonly hintEvents: readonly HintEvent[];
}

let seq = 0;
const nextId = (prefix: string) => `${prefix}-${++seq}-${Math.random().toString(36).slice(2, 8)}`;

export class RoundController {
  private ladder: LadderState = initialLadderState();
  private readonly presented: PresentedOption[];
  private readonly attempts: Attempt[] = [];
  private readonly hintEvents: HintEvent[] = [];
  private readonly clock: Clock;
  private readonly idlePolicy: IdlePolicy;
  private optionsReadyAt: number | null = null;
  private lastEventAt: number | null = null;
  private resolvedAt: string | null = null;
  private readonly opts: RoundControllerOptions;

  constructor(opts: RoundControllerOptions) {
    this.opts = opts;
    this.clock = opts.clock ?? systemClock;
    this.idlePolicy = opts.idlePolicy ?? DEFAULT_IDLE_POLICY;

    const random = opts.random ?? Math.random;
    const ids = [opts.task.targetContentId, ...opts.task.distractorContentIds].slice(
      0,
      opts.task.defaultOptionCount,
    );

    // Fisher-Yates. The target must not land in a predictable slot, or a child
    // learns the position rather than the letter.
    const shuffled = [...ids];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
    }

    this.presented = shuffled.map((contentId, index) => ({
      optionId: nextId('opt'),
      contentId,
      isTarget: contentId === opts.task.targetContentId,
      position: index,
      removedAtLadderStep: null,
    }));
  }

  /** The view handed to the mechanic. Carries no skill and no content ids. */
  buildRoundView(): RoundView {
    const { task, resolver } = this.opts;
    const prompt = resolver.copy(task.promptCopyId, task.targetContentId);

    const options: OptionView[] = this.presented
      .filter((p) => p.removedAtLadderStep === null)
      .map((p) => ({
        optionId: p.optionId,
        kind: resolver.optionKind(p.contentId),
        glyph: resolver.glyph(p.contentId),
        imageRef: resolver.imageRef(p.contentId),
        labelHe: resolver.label(p.contentId),
      }));

    return {
      roundId: this.opts.taskInstanceId,
      prompt: { textHe: prompt.textHe },
      options,
    };
  }

  /** Audio filenames stay controller-side; a mechanic asks the host to play. */
  promptAudioRef(): string | null {
    return this.opts.resolver.copy(this.opts.task.promptCopyId, this.opts.task.targetContentId)
      .audioRef;
  }

  optionAudioRef(optionId: string): string | undefined {
    const p = this.presented.find((o) => o.optionId === optionId);
    return p ? this.opts.resolver.audioRef(p.contentId) : undefined;
  }

  /** Called when options are on screen. Starts both clocks. */
  markReady(): void {
    this.optionsReadyAt = this.clock.now();
    this.lastEventAt = this.optionsReadyAt;
  }

  get isResolved(): boolean {
    return this.ladder.step === LADDER_STEPS.RESOLVED;
  }

  get ladderStep(): number {
    return this.ladder.step;
  }

  /** The correct option's id. For the mechanic's demonstrate/highlight steps. */
  get targetOptionId(): string {
    return this.presented.find((p) => p.isTarget)!.optionId;
  }

  private ladderContext(): LadderContext {
    return {
      capabilities: this.opts.capabilities,
      idlePolicy: this.idlePolicy,
      targetOptionId: this.targetOptionId,
      remainingDistractorIds: this.presented
        .filter((p) => !p.isTarget && p.removedAtLadderStep === null)
        .map((p) => p.optionId),
    };
  }

  /**
   * The child touched an option. Records the attempt first, then returns what
   * the mechanic should render. The mechanic is never told "right" or "wrong"
   * directly — only what to show.
   */
  select(optionId: string): readonly PresentationDirective[] {
    if (this.isResolved) return [];

    const option = this.presented.find((p) => p.optionId === optionId);
    if (!option) {
      // Not a real option — a stray tap. Never an attempt, never punished.
      return [];
    }

    const now = this.clock.now();
    const since = this.lastEventAt ?? this.optionsReadyAt ?? now;

    // APPEND BEFORE ANIMATE. If the tab dies mid-celebration, this survives.
    this.attempts.push({
      attemptId: nextId('att'),
      taskInstanceId: this.opts.taskInstanceId,
      attemptNumber: this.attempts.length + 1,
      selectedOptionId: optionId,
      selectedContentId: option.contentId,
      isCorrect: option.isTarget,
      responseTimeMs: Math.max(0, now - since),
      ladderStepAtAttempt: this.ladder.step,
      occurredAt: this.clock.isoNow(),
    });
    this.lastEventAt = now;

    const transition = ladderReducer(
      this.ladder,
      option.isTarget
        ? { kind: 'correct_selection', optionId }
        : { kind: 'wrong_selection', optionId },
      this.ladderContext(),
    );

    return this.applyTransition(transition);
  }

  requestHint(): readonly PresentationDirective[] {
    if (this.isResolved) return [];
    this.lastEventAt = this.clock.now();
    return this.applyTransition(
      ladderReducer(this.ladder, { kind: 'help_requested' }, this.ladderContext()),
    );
  }

  answerHintOffer(accepted: boolean): readonly PresentationDirective[] {
    if (this.isResolved) return [];
    this.lastEventAt = this.clock.now();
    return this.applyTransition(
      ladderReducer(this.ladder, { kind: 'hint_offer_answered', accepted }, this.ladderContext()),
    );
  }

  /** Called by a timer. Elapsed is measured from the last interaction. */
  tickIdle(): readonly PresentationDirective[] {
    if (this.isResolved || this.lastEventAt === null) return [];
    const elapsed = this.clock.now() - this.lastEventAt;
    return this.applyTransition(
      ladderReducer(this.ladder, { kind: 'idle', elapsedMs: elapsed }, this.ladderContext()),
    );
  }

  /** Marks the round abandoned — the child navigated away mid-task. */
  abandon(): void {
    if (this.isResolved) return;
    this.resolvedAt = this.clock.isoNow();
  }

  private applyTransition(
    t: ReturnType<typeof ladderReducer>,
  ): readonly PresentationDirective[] {
    this.ladder = t.state;

    if (t.hintEvent) {
      this.hintEvents.push({
        hintEventId: nextId('hint'),
        taskInstanceId: this.opts.taskInstanceId,
        ladderStep: t.state.step,
        hintType: t.hintEvent.type,
        trigger: t.hintEvent.trigger,
        acceptedByChild: null,
        occurredAt: this.clock.isoNow(),
      });
    }

    // Record which distractor the ladder culled, so the round can be replayed.
    for (const d of t.directives) {
      if (d.kind === 'remove_options') {
        for (const id of d.optionIds) {
          const p = this.presented.find((o) => o.optionId === id);
          if (p) (p as { removedAtLadderStep: number | null }).removedAtLadderStep = t.state.step;
        }
      }
    }

    if (t.state.step === LADDER_STEPS.RESOLVED) {
      this.resolvedAt = this.clock.isoNow();
    }

    return t.directives;
  }

  get outcome(): TaskOutcome | null {
    if (!this.resolvedAt) return null;
    return this.isResolved ? outcomeFor(this.ladder) : 'abandoned';
  }

  /** Everything spec 17 requires, derived rather than asserted by a mechanic. */
  telemetry(): RoundTelemetry {
    const { task, opts } = { task: this.opts.task, opts: this.opts };
    const taskInstance: TaskInstance = {
      taskInstanceId: opts.taskInstanceId,
      taskId: task.taskId,
      sessionId: opts.sessionId,
      childId: opts.childId,
      skillId: task.skillId,
      mechanicId: task.mechanicId,
      targetContentId: task.targetContentId,
      optionsPresented: this.presented,
      optionCount: this.presented.length,
      derivedFromTaskInstanceId: null,
      isScaffolded: opts.isScaffolded ?? false,
      adventureRunId: null,
      presentedAt: this.clock.isoNow(),
      optionsReadyAt: this.optionsReadyAt ? new Date(this.optionsReadyAt).toISOString() : null,
      resolvedAt: this.resolvedAt,
      outcome: this.outcome,
    };
    return { taskInstance, attempts: this.attempts, hintEvents: this.hintEvents };
  }
}
