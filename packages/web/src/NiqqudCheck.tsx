import { useState } from 'react';
import { LETTERS, NIQQUD_COMBOS } from '@secret-journey/shared';

/**
 * M0 deliverable: the niqqud rendering gate.
 *
 * The design review named this step 1 of the build order — if combining marks
 * position wrongly, every screen built on top is wasted. Automated tests can
 * prove code-point ORDER is right (see letters.test.ts); only human eyes on a
 * real device can prove the marks actually LAND right.
 *
 * So this page puts the candidate webfont next to the system font and asks a
 * person to compare. Nothing here ships.
 */

type FontChoice = 'noto' | 'system';

const FONT_STACKS: Record<FontChoice, string> = {
  noto: "'Noto Sans Hebrew', sans-serif",
  system: "'Segoe UI', Arial, sans-serif",
};

export function NiqqudCheck() {
  const [font, setFont] = useState<FontChoice>('noto');
  const [size, setSize] = useState(72);

  const taught = NIQQUD_COMBOS.filter((c) => c.isTargetEligible);
  const distractors = NIQQUD_COMBOS.filter((c) => !c.isTargetEligible);

  return (
    <div className="page" style={{ fontFamily: FONT_STACKS[font] }}>
      <header className="head">
        <h1>המסע הסודי</h1>
        <p className="sub">בדיקת רינדור ניקוד — שלב 0</p>
      </header>

      <div className="controls">
        <fieldset>
          <legend>גופן</legend>
          {(['noto', 'system'] as const).map((f) => (
            <label key={f}>
              <input
                type="radio"
                name="font"
                checked={font === f}
                onChange={() => setFont(f)}
              />
              {f === 'noto' ? 'Noto Sans Hebrew' : 'גופן מערכת'}
            </label>
          ))}
        </fieldset>
        <label className="size">
          גודל: {size}px
          <input
            type="range"
            min={24}
            max={160}
            value={size}
            onChange={(e) => setSize(Number(e.target.value))}
          />
        </label>
      </div>

      <section>
        <h2>שמות האותיות <span className="ref">(אפיון 1.5)</span></h2>
        <p className="hint">
          כל שם צריך להיראות תקין: הדגש והנקודות לא מתנגשים, והקמץ לא נחתך.
        </p>
        <div className="grid">
          {LETTERS.map((l) => (
            <figure key={l.contentId} className="cell">
              <div className="glyph" style={{ fontSize: size }}>{l.nameHe}</div>
              <figcaption>
                <span className="bare">{l.glyph}</span>
                <code>{l.letterId}</code>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section>
        <h2>צירופים נלמדים — פתח וקמץ <span className="ref">(אפיון 9.3)</span></h2>
        <p className="hint">
          הבדיקה החשובה ביותר: <strong>פתח</strong> (קו אופקי) חייב להיראות שונה
          בבירור מ<strong>קמץ</strong> (קו עם זנב). אם הם נראים זהים — המיומנות
          כולה לא ניתנת לבדיקה.
        </p>
        <div className="grid">
          {taught.map((c) => (
            <figure key={c.contentId} className="cell">
              <div className="glyph" style={{ fontSize: size }}>{c.glyph}</div>
              <figcaption><code>{c.mark}</code></figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section>
        <h2>מסיחים בלבד <span className="ref">(אפיון 9.4)</span></h2>
        <p className="hint">
          אלה אף פעם לא תשובה נכונה — הם קיימים רק כאפשרויות שגויות. עדיין
          צריכים רינדור תקין והקלטה משלהם.
        </p>
        <div className="grid">
          {distractors.map((c) => (
            <figure key={c.contentId} className="cell muted">
              <div className="glyph" style={{ fontSize: size }}>{c.glyph}</div>
              <figcaption><code>{c.mark}</code></figcaption>
            </figure>
          ))}
        </div>
      </section>

      <footer className="foot">
        <p>
          {LETTERS.length} אותיות · {taught.length} צירופים נלמדים ·{' '}
          {distractors.length} מסיחים
        </p>
      </footer>
    </div>
  );
}
