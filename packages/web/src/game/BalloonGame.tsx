import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  RoundController,
  scoreAll,
  DEFAULT_POLICY,
  SKILL_LABEL_HE,
  LETTERS,
  type PresentationDirective,
  type MechanicHost,
  type Evidence,
  type RoundView,
} from '@secret-journey/shared';
import { BalloonMechanic, balloonDefinition } from '../mechanics/BalloonMechanic.js';
import { loadContentPack } from '../content/pack.js';

/**
 * Wires the round controller to the balloon mechanic and plays the five
 * BAL tasks in order.
 *
 * This is the first thing in the rebuild a child could actually sit in front
 * of. It is not the finished game — the art direction from
 * docs/design-direction.md is not implemented, and narration is silent because
 * no recordings exist yet. What it does prove is the whole spine: content from
 * CSV, a mechanic that knows nothing, the shared hint ladder, and telemetry
 * that flows into the assessment engine.
 */

const pack = loadContentPack();
const BAL_TASKS = pack.tasks.filter(
  (t) => t.mechanicId === 'balloon_game' && !t.taskId.endsWith('-S'),
);

export function BalloonGame() {
  const [taskIndex, setTaskIndex] = useState(0);
  const [directive, setDirective] = useState<PresentationDirective | null>(null);
  const [view, setView] = useState<RoundView | null>(null);
  const [coins, setCoins] = useState(0);
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [log, setLog] = useState<string[]>([]);
  const [sessionDone, setSessionDone] = useState(false);

  const controllerRef = useRef<RoundController | null>(null);
  const task = BAL_TASKS[taskIndex];

  const note = useCallback((line: string) => {
    setLog((l) => [line, ...l].slice(0, 8));
  }, []);

  // Build a controller for the current task.
  useEffect(() => {
    if (!task) return;
    const c = new RoundController({
      task,
      resolver: pack.resolver,
      capabilities: balloonDefinition.capabilities,
      childId: 'demo-child',
      sessionId: 'demo-session',
      taskInstanceId: `ti-${task.taskId}-${Date.now()}`,
    });
    controllerRef.current = c;
    setView(c.buildRoundView());
    setDirective(null);
  }, [task]);

  const apply = useCallback(
    (directives: readonly PresentationDirective[]) => {
      // Directives arrive as a list; the mechanic applies one at a time.
      directives.forEach((d, i) => {
        setTimeout(() => setDirective(d), i * 40);
      });
      const c = controllerRef.current;
      if (c) setView(c.buildRoundView());
    },
    [],
  );

  const host: MechanicHost = useMemo(
    () => ({
      reportReady: () => controllerRef.current?.markReady(),
      reportSelection: (optionId) => {
        const c = controllerRef.current;
        if (!c) return;
        const before = c.ladderStep;
        const directives = c.select(optionId);
        const after = c.ladderStep;
        if (after !== before && !c.isResolved) note(`עלינו לשלב ${after} בסולם הרמזים`);
        apply(directives);
      },
      requestHint: () => {
        const c = controllerRef.current;
        if (!c) return;
        note('הילד ביקש רמז');
        apply(c.requestHint());
      },
      answerHintOffer: (accepted) => {
        const c = controllerRef.current;
        if (c) apply(c.answerHintOffer(accepted));
      },
      reportRoundComplete: () => {
        const c = controllerRef.current;
        // Guard against a late timer from the PREVIOUS round.
        //
        // Live testing caught this: end_round schedules reportRoundComplete()
        // ~900ms out, by which time controllerRef already points at the next
        // round. The stale timer then "completed" a round nobody had played —
        // logged as outcome null with 0 attempts, and it silently granted a
        // coin and skipped a task. A round that has not resolved cannot be
        // completed, so refusing here is correct independently of the timer.
        if (!c || !c.isResolved) return;
        const t = c.telemetry();
        const outcome = t.taskInstance.outcome;

        // Spec 1.7: exactly one resource, and an error never costs anything.
        setCoins((n) => n + 1);

        setEvidence((prev) => [
          ...prev,
          {
            taskInstanceId: t.taskInstance.taskInstanceId,
            skillId: t.taskInstance.skillId,
            contentId: t.taskInstance.targetContentId,
            rootLetterId: t.taskInstance.targetContentId,
            mechanicId: t.taskInstance.mechanicId,
            outcome: outcome ?? 'abandoned',
            isScaffolded: t.taskInstance.isScaffolded,
            sessionId: t.taskInstance.sessionId,
            occurredAt: new Date().toISOString(),
          },
        ]);
        note(`${task?.taskId}: ${outcome} · ${t.attempts.length} ניסיונות`);

        if (taskIndex + 1 < BAL_TASKS.length) setTaskIndex((i) => i + 1);
        else setSessionDone(true);
      },
      // Narration is deliberately silent: no recordings exist yet, and spec 1.5
      // requires uniform pre-recorded audio rather than device TTS.
      playPrompt: () => {},
      playOptionAudio: () => {},
      stopNarration: () => {},
      playEffect: () => {},
      reportInteraction: () => {},
    }),
    [apply, note, task, taskIndex],
  );

  const states = useMemo(
    () => scoreAll({ childId: 'demo-child', evidence, policy: DEFAULT_POLICY }),
    [evidence],
  );
  const perLetter = states.filter((s) => s.contentScopeId !== null);
  const perSkill = states.filter((s) => s.contentScopeId === null);

  const restart = () => {
    setTaskIndex(0);
    setCoins(0);
    setEvidence([]);
    setLog([]);
    setSessionDone(false);
  };

  return (
    <div className="game">
      <header className="game__hud">
        <span className="hud__coins">🪙 {coins}</span>
        <span className="hud__progress">
          {sessionDone ? 'סיימנו' : `סבב ${taskIndex + 1} מתוך ${BAL_TASKS.length}`}
        </span>
      </header>

      {sessionDone ? (
        <section className="ending">
          <h2>היום התקדמת במסע!</h2>
          <p>מצאת סימנים, פתחת דרך ובנית משהו חדש.</p>
          <p className="ending__coins">🪙 {coins}</p>
          <button onClick={restart}>להמשיך לשחק</button>
        </section>
      ) : (
        // key on the round id: a fresh mount per round, so no animation state,
        // no "already popped" flag and no pending timer can bleed across.
        view && (
          <BalloonMechanic key={view.roundId} round={view} host={host} directive={directive} />
        )
      )}

      <aside className="game__debug">
        <h3>מה קורה מאחורי הקלעים</h3>
        <ul className="debug__log">
          {log.length === 0 && <li className="empty">—</li>}
          {log.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>

        {perSkill.length > 0 && (
          <>
            <h3>מפת הידע</h3>
            <table>
              <tbody>
                {perSkill.map((s) => (
                  <tr key={s.skillId}>
                    <td>{SKILL_LABEL_HE[s.skillId]}</td>
                    <td><span className={`badge badge--${statusKey(s.status)}`}>{s.status}</span></td>
                    <td>{s.exposures}</td>
                  </tr>
                ))}
                {perLetter.map((s) => (
                  <tr key={`${s.skillId}-${s.contentScopeId}`}>
                    <td>
                      {LETTERS.find((l) => l.contentId === s.contentScopeId)?.nameHe ?? s.contentScopeId}
                    </td>
                    <td><span className={`badge badge--${statusKey(s.status)}`}>{s.status}</span></td>
                    <td>{s.needsReinforcement ? <strong className="flag">חיזוק</strong> : s.exposures}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </aside>
    </div>
  );
}

function statusKey(s: string) {
  if (s === 'הצלחה עקבית') return 'ok';
  if (s === 'בתרגול') return 'wip';
  return 'new';
}
