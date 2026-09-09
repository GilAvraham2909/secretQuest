import { useMemo, useState } from 'react';
import {
  ladderReducer,
  initialLadderState,
  outcomeFor,
  LADDER_STEPS,
  FULL_CAPABILITIES,
  DEFAULT_IDLE_POLICY,
  scoreAll,
  DEFAULT_POLICY,
  SKILL_LABEL_HE,
  MECHANIC_LABEL_HE,
  LETTERS,
  type LadderState,
  type PresentationDirective,
  type Evidence,
  type MechanicId,
} from '@secret-journey/shared';

/**
 * A window onto the two headless pieces built in M1: the hint ladder and the
 * assessment engine. Nothing here ships — it exists so the rules can be
 * checked by hand instead of taken on trust from a green test run.
 *
 * The architecture's own M1 demo is "a simulated play sequence printing the
 * resulting knowledge map". This is that, made clickable.
 */

const STEP_LABEL: Record<number, string> = {
  [LADDER_STEPS.INDEPENDENT]: '0 · ניסיון עצמאי',
  [LADDER_STEPS.RETRY_INVITE]: '1 · הזמנה לנסות שוב',
  [LADDER_STEPS.REPEAT_PROMPT]: '2 · חזרה על ההוראה',
  [LADDER_STEPS.HINT_OFFER]: '3 · הצעת רמז',
  [LADDER_STEPS.HINT_GIVEN]: '4 · רמז ניתן',
  [LADDER_STEPS.REDUCE_OPTIONS]: '5 · צמצום אפשרויות',
  [LADDER_STEPS.DEMONSTRATE]: '6 · הדגמה',
  [LADDER_STEPS.SIMPLER_TASK]: '7 · משימה פשוטה יותר',
  [LADDER_STEPS.GUIDED]: '8 · מודרך — הסבב ייסגר בהצלחה',
  [LADDER_STEPS.RESOLVED]: '9 · הסתיים',
};

const DIRECTIVE_LABEL: Record<PresentationDirective['kind'], string> = {
  affirm_success: 'חגיגת הצלחה',
  encourage_retry: 'עידוד לנסות שוב',
  repeat_prompt: 'השמעת ההוראה שוב',
  highlight_option: 'הארת האפשרות הנכונה',
  remove_options: 'הסרת מסיח',
  demonstrate: 'הדגמה',
  offer_hint: 'שאלה: רוצה רמז קטן?',
  nudge: 'נדנוד עדין (לא מקדם את הסולם)',
  swap_to_simpler_task: 'החלפה למשימה פשוטה יותר',
  end_round: 'סיום הסבב — בהצלחה',
};

const MECHANICS: MechanicId[] = ['balloon_game', 'fishing_game', 'letter_train_game'];

let evSeq = 0;

export function EngineDemo() {
  const [ladder, setLadder] = useState<LadderState>(initialLadderState);
  const [directives, setDirectives] = useState<PresentationDirective[]>([]);
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [mechanic, setMechanic] = useState<MechanicId>('balloon_game');
  const [letter, setLetter] = useState('letter:mem');

  const ctx = {
    capabilities: FULL_CAPABILITIES,
    idlePolicy: DEFAULT_IDLE_POLICY,
    targetOptionId: 'target',
    remainingDistractorIds: ['d1', 'd2'],
  };

  const send = (event: Parameters<typeof ladderReducer>[1]) => {
    const t = ladderReducer(ladder, event, ctx);
    setLadder(t.state);
    setDirectives([...t.directives]);

    if (t.state.step === LADDER_STEPS.RESOLVED) {
      evSeq += 1;
      setEvidence((prev) => [
        ...prev,
        {
          taskInstanceId: `ti-${evSeq}`,
          skillId: 'visual_letter_recognition',
          contentId: letter,
          rootLetterId: letter,
          mechanicId: mechanic,
          outcome: outcomeFor(t.state),
          isScaffolded: t.state.step === LADDER_STEPS.GUIDED,
          sessionId: 'demo',
          occurredAt: new Date(Date.now() + evSeq * 1000).toISOString(),
        },
      ]);
    }
  };

  const startRound = () => {
    setLadder(initialLadderState());
    setDirectives([]);
  };

  const states = useMemo(
    () =>
      scoreAll({
        childId: 'demo-child',
        evidence,
        policy: DEFAULT_POLICY,
      }),
    [evidence],
  );

  const perLetter = states.filter((s) => s.contentScopeId !== null);
  const perSkill = states.filter((s) => s.contentScopeId === null);
  const done = ladder.step === LADDER_STEPS.RESOLVED;

  return (
    <div className="demo">
      <section className="panel">
        <h2>סבב אחד — סולם הרמזים</h2>
        <p className="hint">
          לחץ "בחירה שגויה" שוב ושוב וראה את הסולם מטפס. הוא לעולם לא נתקע:
          בשלב 8 הסבב נסגר בהצלחה בכל מקרה.
        </p>

        <div className="row">
          <label>
            מכניקה
            <select value={mechanic} onChange={(e) => setMechanic(e.target.value as MechanicId)}>
              {MECHANICS.map((m) => (
                <option key={m} value={m}>{MECHANIC_LABEL_HE[m]}</option>
              ))}
            </select>
          </label>
          <label>
            אות
            <select value={letter} onChange={(e) => setLetter(e.target.value)}>
              {LETTERS.map((l) => (
                <option key={l.contentId} value={l.contentId}>{l.nameHe}</option>
              ))}
            </select>
          </label>
        </div>

        <div className={`step ${done ? 'step--done' : ''}`}>
          {STEP_LABEL[ladder.step] ?? ladder.step}
        </div>

        <div className="btns">
          <button onClick={() => send({ kind: 'wrong_selection', optionId: 'd1' })} disabled={done}>
            בחירה שגויה
          </button>
          <button onClick={() => send({ kind: 'correct_selection', optionId: 't' })} disabled={done}>
            בחירה נכונה
          </button>
          <button onClick={() => send({ kind: 'idle', elapsedMs: 9000 })} disabled={done}>
            שקט 9 שניות
          </button>
          <button onClick={() => send({ kind: 'help_requested' })} disabled={done}>
            ביקש רמז
          </button>
          <button onClick={startRound} className="primary">
            {done ? 'סבב חדש' : 'אתחול'}
          </button>
        </div>

        <h3>מה המכניקה מתבקשת להציג</h3>
        <ul className="directives">
          {directives.length === 0 && <li className="empty">—</li>}
          {directives.map((d, i) => (
            <li key={i}>{DIRECTIVE_LABEL[d.kind]}</li>
          ))}
        </ul>

        <dl className="facts">
          <div><dt>ניסיונות שגויים</dt><dd>{ladder.wrongAttempts}</dd></div>
          <div><dt>רמזים שניתנו</dt><dd>{ladder.hintsGiven.length}</dd></div>
          {done && <div><dt>תוצאה שנרשמה</dt><dd><code>{outcomeFor(ladder)}</code></dd></div>}
        </dl>
      </section>

      <section className="panel">
        <h2>מפת הידע — מנוע ההערכה</h2>
        <p className="hint">
          נבנית מ־{evidence.length} סבבים שסיימת. שים לב: <strong>הצלחה עקבית</strong>{' '}
          דורשת הצלחות נקיות בשתי מכניקות שונות — נסה לשחק את אותה אות בשתיים.
        </p>

        {evidence.length === 0 ? (
          <p className="empty">עדיין אין נתונים. סיים סבב אחד לפחות.</p>
        ) : (
          <>
            <h3>לפי מיומנות <span className="ref">(מה שההורה רואה)</span></h3>
            <table>
              <thead>
                <tr><th>מיומנות</th><th>סטטוס</th><th>חשיפות</th><th>ניסיון ראשון</th><th>רמזים</th></tr>
              </thead>
              <tbody>
                {perSkill.map((s) => (
                  <tr key={s.skillId}>
                    <td>{SKILL_LABEL_HE[s.skillId]}</td>
                    <td><span className={`badge badge--${statusKey(s.status)}`}>{s.status}</span></td>
                    <td>{s.exposures}</td>
                    <td>{s.firstTryCorrect}</td>
                    <td>{s.hintAssisted}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <h3>לפי אות <span className="ref">(מה שמפעיל את ההרפתקה)</span></h3>
            <table>
              <thead>
                <tr><th>אות</th><th>סטטוס</th><th>חשיפות</th><th>מכניקות</th><th>חיזוק?</th></tr>
              </thead>
              <tbody>
                {perLetter.map((s) => (
                  <tr key={`${s.skillId}-${s.contentScopeId}`}>
                    <td>{LETTERS.find((l) => l.contentId === s.contentScopeId)?.nameHe ?? s.contentScopeId}</td>
                    <td><span className={`badge badge--${statusKey(s.status)}`}>{s.status}</span></td>
                    <td>{s.exposures}</td>
                    <td>{s.distinctMechanics.length}</td>
                    <td>
                      {s.needsReinforcement
                        ? <strong className="flag">תעלומת הסימנים האבודים</strong>
                        : <span className="muted">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        <button onClick={() => { setEvidence([]); evSeq = 0; }} className="ghost">
          נקה נתונים
        </button>
      </section>
    </div>
  );
}

function statusKey(s: string) {
  if (s === 'הצלחה עקבית') return 'ok';
  if (s === 'בתרגול') return 'wip';
  return 'new';
}
