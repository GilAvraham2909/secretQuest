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
  type MechanicId,
} from '@secret-journey/shared';
import { MECHANIC_REGISTRY } from '../mechanics/registry.js';
import { loadContentPack } from '../content/pack.js';

/**
 * The generic round host. Written once; every mechanic plugs into it.
 *
 * This is the piece that makes acceptance criterion 3.12 real — adding the
 * fishing and train mechanics required one registry row and one module each,
 * and touched nothing here, nothing in the engine, nothing in the hint ladder
 * and nothing in the content schema.
 */

const pack = loadContentPack();

export interface StationGameProps {
  readonly mechanicId: MechanicId;
}

export function StationGame({ mechanicId }: StationGameProps) {
  const entry = MECHANIC_REGISTRY[mechanicId];

  const tasks = useMemo(
    () => pack.tasks.filter((t) => t.mechanicId === mechanicId && !t.taskId.endsWith('-S')),
    [mechanicId],
  );

  const [taskIndex, setTaskIndex] = useState(0);
  const [directive, setDirective] = useState<PresentationDirective | null>(null);
  const [view, setView] = useState<RoundView | null>(null);
  const [coins, setCoins] = useState(0);
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [log, setLog] = useState<string[]>([]);
  const [sessionDone, setSessionDone] = useState(false);

  const controllerRef = useRef<RoundController | null>(null);
  const task = tasks[taskIndex];

  // Reset when switching mechanics.
  useEffect(() => {
    setTaskIndex(0);
    setCoins(0);
    setEvidence([]);
    setLog([]);
    setSessionDone(false);
  }, [mechanicId]);

  const note = useCallback((line: string) => setLog((l) => [line, ...l].slice(0, 8)), []);

  useEffect(() => {
    if (!task || !entry) return;
    const c = new RoundController({
      task,
      resolver: pack.resolver,
      capabilities: entry.definition.capabilities,
      childId: 'demo-child',
      sessionId: 'demo-session',
      taskInstanceId: `ti-${task.taskId}-${Date.now()}`,
    });
    controllerRef.current = c;
    setView(c.buildRoundView());
    setDirective(null);
  }, [task, entry]);

  const apply = useCallback((directives: readonly PresentationDirective[]) => {
    directives.forEach((d, i) => setTimeout(() => setDirective(d), i * 40));
    const c = controllerRef.current;
    if (c) setView(c.buildRoundView());
  }, []);

  const host: MechanicHost = useMemo(
    () => ({
      reportReady: () => controllerRef.current?.markReady(),
      reportSelection: (optionId) => {
        const c = controllerRef.current;
        if (!c) return;
        const before = c.ladderStep;
        const directives = c.select(optionId);
        if (c.ladderStep !== before && !c.isResolved) {
          note(`עלינו לשלב ${c.ladderStep} בסולם הרמזים`);
        }
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
        // Refuse a late timer from the previous round — see the M2 commit.
        if (!c || !c.isResolved) return;
        const t = c.telemetry();

        // Spec 1.7: one resource, and an error never costs anything.
        setCoins((n) => n + 1);
        setEvidence((prev) => [
          ...prev,
          {
            taskInstanceId: t.taskInstance.taskInstanceId,
            skillId: t.taskInstance.skillId,
            contentId: t.taskInstance.targetContentId,
            rootLetterId: t.taskInstance.targetContentId,
            mechanicId: t.taskInstance.mechanicId,
            outcome: t.taskInstance.outcome ?? 'abandoned',
            isScaffolded: t.taskInstance.isScaffolded,
            sessionId: t.taskInstance.sessionId,
            occurredAt: new Date().toISOString(),
          },
        ]);
        note(`${task?.taskId}: ${t.taskInstance.outcome} · ${t.attempts.length} ניסיונות`);

        if (taskIndex + 1 < tasks.length) setTaskIndex((i) => i + 1);
        else setSessionDone(true);
      },
      // Silent until recordings exist. Spec 1.5 requires uniform pre-recorded
      // audio, so device TTS is deliberately not used as a stand-in.
      playPrompt: () => {},
      playOptionAudio: () => {},
      stopNarration: () => {},
      playEffect: () => {},
      reportInteraction: () => {},
    }),
    [apply, note, task, taskIndex, tasks.length],
  );

  const states = useMemo(
    () => scoreAll({ childId: 'demo-child', evidence, policy: DEFAULT_POLICY }),
    [evidence],
  );
  const perLetter = states.filter((s) => s.contentScopeId !== null);
  const perSkill = states.filter((s) => s.contentScopeId === null);

  if (!entry) return <p className="page">מכניקה לא רשומה: {mechanicId}</p>;
  const Mechanic = entry.component;

  const restart = () => {
    setTaskIndex(0);
    setCoins(0);
    setEvidence([]);
    setLog([]);
    setSessionDone(false);
  };

  return (
    <div className={`game ${entry.sceneClass}`}>
      <header className="game__hud">
        <span className="hud__coins">🪙 {coins}</span>
        <span className="hud__progress">
          {sessionDone ? 'סיימנו' : `סבב ${taskIndex + 1} מתוך ${tasks.length}`}
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
        view && (
          // Fresh mount per round: no animation state, no "already resolved"
          // flag and no pending timer can bleed into the next round.
          <Mechanic key={view.roundId} round={view} host={host} directive={directive} />
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
