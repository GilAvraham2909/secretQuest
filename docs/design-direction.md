# Design direction — המסע הסודי

> Owner: UI/UX. Source of truth for product content is `docs/client-spec-mvp.md`;
> this document decides how it *looks, moves and sounds*. Where the spec supplies
> Hebrew copy, that copy is quoted here verbatim and must not be paraphrased in
> code. Section 21 of the spec is a hard blocklist — nothing in this document may
> be implemented in a way that reintroduces a banned pattern.
>
> Written against: 83 existing images in `assets/images/`, `css/tokens.css`,
> `docs/transition-registry.md`, and the client feedback history in `HANDOFF.md`.

---

## 0. The problem this direction is solving

Three facts from the history drive every decision below.

1. **The client has said "boring" twice, in escalating terms.** Part of that was a
   real bug (the `--transition-*` token carried an embedded `ease`, which silently
   invalidated ~45 animation declarations for months). But part of it is genuine:
   the game was *flat pastel cards floating over a background*, with the letters
   rendered in the operating system's UI font. Nothing on screen was an **object**.
   You could not point at anything and say "that is the thing this game is about."
2. **The letters are already named in the spec, and not as letters.** The spec calls
   them **סימנים** — signs. "כמה סימנים נעלמו מהמפה." / "הסימן חזר למפה." /
   "הסימן מתחיל להאיר!" The client's own language says a letter is a physical,
   findable, *light-emitting* object that can go missing from a map. That is a
   game world, handed to us. The previous build ignored it and drew letters as text.
3. **The audience cannot read.** A five-year-old will never read "מצא את האות מֵם".
   Every instruction has to survive being muted *and* being unreadable. The visual
   system has to do the pointing.

So the direction is not "make it more colourful." It is: **give the letter a body.**

---

## 1. Art & visual direction

### 1.1 The direction: **אור הסימנים / Signlight**

A dusk world built like a **cut-paper lantern theatre**. Layered paper flats with
real parallax; the sky is always evening; the only truly bright thing anywhere on
screen is **light coming out of a letter**.

Three pillars:

**A. Cut paper, not flat vector.**
Every *foreground* object is a sticker: a 2.5px ink outline, a flat fill, and a
**hard, unblurred offset shadow** (`4px 5px 0 rgba(9,14,26,.45)`) so it visibly sits
*on top of* the scene. Every *background* is un-outlined painted paper (this is
exactly what the existing scene art already is). That single rule — outline =
touchable, no outline = scenery — teaches a pre-reader what is interactive without
a word of instruction, and it reconciles the two clashing art styles we already own
(heavy-outlined chibi avatars vs. soft outline-free landscapes) instead of fighting
them.

**B. The Sign-stone — the signature element.**
Every letter in the game, everywhere, is rendered as the same physical object: a
warm stone tablet with the letter *carved into it*, glowing from inside the carving.
Never bare text on a background. Never a coloured circle with a glyph. The
sign-stone is the one thing a child will remember and the one thing that makes three
unrelated mechanics read as one world — the same object shows up tied to a balloon,
hooked on a fishing line, and slotted into a train gate.

The stone has **three light states**, and they are the same three states the spec
already defines for the knowledge map (`חדש / בתרגול / הצלחה עקבית`), so the visual
language and the data model are the same thing:

| State | Spec status | Carving fill | Glow | Where it shows |
|---|---|---|---|---|
| Dim | `חדש` | `--stone-carve` #6E5B44 | none | first meeting with a letter |
| Warm | `בתרגול` | `--lantern-300` #FFE29A | `0 0 18px rgba(255,194,74,.45)` | after any success |
| Lit | `הצלחה עקבית` | `--lantern-400` #FFC24A | `0 0 28px rgba(255,194,74,.75)` + 3.2s breathing | mastered; also the target-letter display |

This is why the spec's line "**הסימן מתחיל להאיר!**" (10.5) works literally instead of
metaphorically, and why the parent screen's status column needs no new vocabulary.

**C. Gold is reserved.**
`--lantern-400` (#FFC24A) and its glow are used for **exactly one thing: the target
sign and its light.** No gold buttons, no gold headings, no gold coins-with-gold-UI.
A pre-reader scanning the screen can always find the goal by finding the brightest
thing. This is a pedagogical mechanism disguised as a palette rule, and it is
non-negotiable — the first time someone makes a "primary CTA" gold, the whole system
stops working.

**The risk I am taking, and why.** A children's app on a **dark dusk ground** is
against convention (kids' apps are near-universally bright white). I am taking it
deliberately because: (a) glow only reads on dark, and glow is the core mechanic;
(b) the target letter becomes the highest-luminance object on screen by construction,
which is free attention-direction for a non-reader; (c) it makes the app feel like an
evening story rather than a worksheet, which is spec requirement 1.1 #1 verbatim
("הילד מבין שהוא נכנס למשחק הרפתקה ולא למסך תרגול"); and (d) **the art we already own
is already dusk** — the map background is a starry twilight, the lake scene is a
sunset, the room scene has a night window. We are not fighting the assets.

Guardrail on the risk: **every piece of text and every letterform sits on a solid
paper or stone plate, never directly on the dark scene or on artwork.** Niqqud marks
are 2–4px features; they cannot be allowed to land on a busy background.

### 1.2 What this is *not*

Checked against the three AI-default looks before committing: this is not
cream + high-contrast serif + terracotta (our ground is #101A2E, the display face is
a rounded geometric, and gold is a reserved semantic, not an accent); not near-black +
one acid accent (four hues carry meaning, and the ground is navy paper, not black);
not a hairline broadsheet. It is also explicitly not the *previous* build's look —
coral-primary `#ff6b4a` on cream `#fff8ee` with 26px radii everywhere was drifting
toward generic friendly-app, and the client told us so.

### 1.3 Colour system (replaces `css/tokens.css` palette wholesale)

```css
:root {
  /* ---- Ground: dusk paper. The world is always evening. ---- */
  --ink-900:    #101A2E;  /* page ground, outlines at 85% */
  --ink-800:    #16243F;  /* scene vignette, modal scrim base */
  --ink-700:    #1D2C4D;  /* dark panels, HUD rail */
  --ink-500:    #33487A;  /* raised element on dark, disabled edge */
  --ink-300:    #6D82B5;  /* dark-ground secondary text (AA only, never body) */

  /* ---- Paper: everything a child reads sits on this ---- */
  --paper-050:  #FFFBF2;
  --paper-100:  #FFF6E6;  /* primary panel */
  --paper-200:  #F4E5C8;  /* panel edge / torn-paper underlayer */
  --paper-300:  #E2CDA6;  /* paper shadow face */

  /* ---- Lantern gold: RESERVED for the target sign + its light ---- */
  --lantern-400:#FFC24A;
  --lantern-300:#FFE29A;
  --lantern-glow: 0 0 28px rgba(255,194,74,.75);

  /* ---- Stone (the sign-stone body) ---- */
  --stone-face: #D9C3A0;
  --stone-edge: #A88B62;
  --stone-carve:#6E5B44;  /* unlit carving */

  /* ---- Mechanic hues: one material each, never mixed ---- */
  --coral-500:  #F2695A;  /* balloons  — rubber, sunset sky */
  --coral-300:  #FF9C86;
  --lagoon-500: #2FB2A8;  /* fishing   — water, reeds */
  --lagoon-300: #6FD8CE;
  --berry-500:  #C8447A;  /* train     — iron, plum canyon */
  --berry-300:  #E884AE;

  /* ---- Semantic ---- */
  --leaf-500:   #4FBF6A;  /* success only. Never used decoratively. */
  --leaf-300:   #97E0A8;
  /* There is no error colour. There is no red in this project. */

  /* ---- Text ---- */
  --text-on-paper:   #22190E;
  --text-on-paper-2: #6B5A45;
  --text-on-ink:     #FFF6E6;
  --text-on-ink-2:   #B9C6E6;
}
```

Measured contrast on the pairs that carry meaning:

| Pair | Ratio | Verdict |
|---|---|---|
| `--paper-100` on `--ink-900` | **16.1:1** | AAA, hero titles on the dark ground |
| `--lantern-400` on `--ink-900` | **10.7:1** | AAA, the lit sign always wins the screen |
| `--text-on-paper` on `--paper-100` | **15.4:1** | AAA, all body copy and all niqqud |
| `--coral-500` on `--ink-900` | 5.9:1 | graphics/large UI only — **never text** |
| `--ink-300` on `--ink-900` | 5.4:1 | decorative labels only — never instructions |

**How the three mechanics stay distinct but read as one world.** Same ground, same
paper, same sign-stone, same outline rule, same three-layer parallax build. What
changes per mechanic is exactly two things — one hue and one *material behaviour*:

| Mechanic | Hue | Material behaviour (idle motion of the answer objects) | Horizon |
|---|---|---|---|
| פיצוץ בלונים | coral | buoyant — objects drift *up* 6px, 2.8s, offset phases | high, open sky |
| דיג אותיות | lagoon | floating — objects bob on a waterline, 3.4s, tilt ±3° | centred waterline |
| רכבת האותיות | berry | rolling — objects sit *still* on a rail; the world moves past them | low, receding rail |

A child who plays all three should be able to tell you where they were without
seeing the letters. A designer should be able to add a fourth mechanic by picking a
new hue and a new material behaviour, changing nothing else.

### 1.4 Typography

The current app is 100% `'Segoe UI', Arial` and that is the single biggest reason it
looks like a form. It also fails the spec: the MVP **requires** rendering `בָּ`, `שַׁ`,
`דָ`, `גִּ` legibly at large size (spec §9), and system-UI Hebrew fonts position
niqqud by luck. `בָּ` needs a dagesh *inside* the bet and a kamatz *below* it,
simultaneously, without collision. That is a GPOS mark-attachment problem, and it
requires a font engineered for it.

All three faces are **SIL OFL 1.1** — free to self-host and redistribute — and must be
downloaded as woff2 into `assets/fonts/` (the app is offline-only; no Google Fonts
link, no CDN).

| Role | Face | Weights | Why this one |
|---|---|---|---|
| **Letterforms — every sign-stone, every niqqud combination** | **Noto Sans Hebrew** (`notofonts/notofonts.github.io`, variable) | 500, 600 | The most rigorously engineered nikud GPOS of any OFL Hebrew font — dagesh, shin-dot and vowel stack without collision at any size. Monolinear, unadorned, closest to the דפוס letterform a child is taught in גן/כיתה א׳. |
| **Display — titles, companion speech, the "big moment" copy** | **Rubik** (Hubert & Fischer; Hebrew by Meir Sadan) | 600, 800 | Rounded geometric with a slight squircle in the counters — friendly without being infantile, and genuinely distinctive next to Noto. Carries the personality so the letterforms don't have to. |
| **Parent dashboard — headings + data** | **Frank Ruhl Libre** (headings) + Noto Sans Hebrew (body/tabular) | 500/700 + 400 | A Hebrew book serif. Reads *adult, editorial, calm* on sight — it is the fastest way to signal "this screen is not the game," which spec 1.9 requires. |

**Hard typography rules**

1. **The target letter never gets a decorative typeface.** Ever. A child learning to
   discriminate ד from ר cannot be shown a stylised ד. Personality lives in the
   stone, the carving, the glow and the display face — never in the letterform.
   This rule is why the direction can be bold without being pedagogically reckless.
2. **Subset carefully.** Keep `U+0590–05FF` (letters *and* all combining marks),
   `U+FB1D–FB4F` (precomposed presentation forms — some content sources emit them),
   `U+0020–007E`, `U+2000–206F`. Do **not** subset by "Hebrew letters only" — that
   strips the marks. Do not strip GPOS.
3. **Never `font-synthesis`.** Load real 600/800 files; synthesised bold destroys
   mark positioning.
4. **`text-rendering: optimizeLegibility`** on sign-stones; `font-feature-settings`
   left at defaults (Noto's Hebrew defaults are correct).

**Type scale** (rem, root 16px; the scale is deliberately gappy — there are only four
sizes a child ever sees, and they are very far apart):

```css
--type-sign-hero:  9.5rem;  /* 152px — the target sign on a mechanic screen */
--type-sign-tile:  5.5rem;  /* 88px  — an answer sign-stone */
--type-sign-inline:2.75rem; /* 44px  — a sign in a rail / speech bubble */
--type-display:    2.5rem;  /* 40px  — screen titles (Rubik 800) */
--type-speech:     1.75rem; /* 28px  — companion speech (Rubik 600) */
--type-body:       1.125rem;/* 18px  — parent screen body, adult-facing only */
--type-label:      0.9375rem;/* 15px — parent screen labels/captions */
--line-sign: 1.35;  /* niqqud needs headroom — never set line-height:1 on a sign */
--tracking-sign: 0.02em;
```

`--line-sign: 1.35` is load-bearing: a tight line-height clips kamatz/patach on the
descender side. Every sign-stone gets `padding-block: .12em` on top of that.

### 1.5 Shape, depth and texture

```css
--radius-pill:   999px;   /* buttons only */
--radius-panel:  28px;    /* paper panels */
--radius-chip:   14px;
--outline-w:     2.5px;
--outline:       var(--outline-w) solid rgba(16,26,46,.85);
--shadow-paper:  4px 5px 0 rgba(9,14,26,.45);   /* hard, no blur — cut paper */
--shadow-lift:   0 14px 28px rgba(9,14,26,.35); /* only for elements in the air */
--parallax-back: 0.15; --parallax-mid: 0.4; --parallax-fore: 0.85;
```

- **The sign-stone silhouette is not a rounded rectangle.** It is an irregular
  hexagonal tablet drawn once as an SVG `clip-path` (`--stone-shape`), with a 1.5°
  rotation that alternates sign (`:nth-child(odd) { rotate: -1.5deg }`). Nothing else
  in the UI uses that silhouette, so a stone is instantly identifiable at any size.
- **Paper texture**: one 240×240 tiling grain PNG at `opacity:.06`, `mix-blend-mode:
  multiply`, applied to paper panels only. Not to the scene (the scene art already has
  its own grain) and not to the dark ground (it turns to noise).
- **Parallax**: each mechanic scene is built from 3 layers (`back` sky/hills,
  `mid` water/rails/horizon props, `fore` reeds/rocks/foreground frame). They shift on
  pointer position and during transitions at the coefficients above. This is where the
  "not flat" impression comes from and it is the cheapest possible win —
  `transform: translate3d()` only, no layout.

---

## 2. Screen-by-screen specs

Conventions used below: `▚` = dark dusk ground, `▒` = paper panel, `◆` = sign-stone,
`★` = star companion, `♪` = the always-present repeat-audio button.
All copy in **bold Hebrew** is verbatim from the spec and must be used exactly.

### 2.0 Global chrome (present on every child-facing screen)

```
┌──────────────────────────────────────────────┐
│  ⚙(long-press)                     ◇◇◆◆◆     │ ← top: parent gate (start), sign rail (end)
│                                              │
│                 [ scene ]                    │
│                                              │
│          [ answer objects, 62% zone ]        │
│  ★ speech                                ♪   │ ← bottom: companion (start), repeat (end)
└──────────────────────────────────────────────┘
```

- **Sign rail (top-inline-end)** replaces the old dot progress bar. It shows the
  sign-stones collected *this session*, dim→lit, filling left-to-right in reading
  order. This is an inventory of found things, not a score — which keeps it clear of
  spec §21 ("ציון מספרי", "אחוזי הצלחה"). A dot-counter reads as "5 questions, you got
  3"; a rail of collected objects reads as "look what I found."
- **Repeat button (bottom-inline-end)**, 64×64, a paper ear/horn icon, never disabled,
  never hidden, replays the current instruction narration. This is the single most
  important control in the app for a non-reader and it must never move between screens.
- **Companion star (bottom-inline-start)**, `companion-idle.png` / `companion-happy.png`,
  96px, idle breathing 4s. Its speech bubble is a torn-paper shape, Rubik 600 28px.
- **No back-out confirmation dialogs. No timers visible to the child. No red. Nowhere.**

### 2.1 Welcome — `screen_id: welcome` (spec §2.1)

```
▚▚▚▚▚▚▚▚ starfield, slow drift ▚▚▚▚▚▚▚▚
        ◆   ◆       ◆              ← 3 dim sign-stones adrift in the sky
              ┌───────────────┐
              │  המסע הסודי   │      ← Rubik 800, 40px, paper on ink
              └───────────────┘
                    ★                ← companion, hops once on load
              ( מתחילים )            ← pill, coral, 72px tall, 240px wide
```

- Copy: title **"המסע הסודי"**, button **"מתחילים"**, narration **"ברוכים הבאים למסע
  הסודי!"**, on-tap feedback **"ההרפתקה מתחילה!"**
- **Load sequence (orchestrated, 1.4s total, one time only):** ground fades in
  (0–200ms) → starfield dots pop in staggered 12ms apart (200–600ms) → three dim
  sign-stones drift in from the top edge and settle (400–900ms, `--ease-out-soft`) →
  title stamps down with a 4% overshoot (700–900ms, `--ease-bounce`) → companion hops
  in (900–1150ms) and narration starts at 950ms → button rises and settles last
  (1100–1400ms). **The button is clickable from 0ms regardless** — staggered reveal
  never gates interaction (existing project rule, keep it).
- The three drifting dim stones are the thesis of the whole game stated before a
  single word: signs are loose in the sky, unlit, and you are going to go get them.
- Data: `screen_id: welcome`, `action: start`, entry time, tap time.

### 2.2 Name — `screen_id: profile_create` (spec §2.2)

```
   ┌────────────────────────────────┐
   │       איך נקרא לך במסע?        │
   │  ┌──────────────────────────┐  │
   │  │  [ name field, 72px ]    │  │
   │  └──────────────────────────┘  │
   │  (שם 1)(שם 2)(שם 3)(שם 4)      │ ← tappable preset names, 64px pills
   │        ( אפשר אחר כך )         │ ← skip, quiet ghost button
   └────────────────────────────────┘
```

- Copy: **"איך נקרא לך במסע?"**, narration **"בחר שם למסע שלך."**
  On name chosen: **"נעים להכיר, [שם הילד]!"** · On skip:
  **"אפשר לבחור שם אחר כך. בוא נתחיל!"**
- Three ways in, per spec: preset list, short typed name, or skip. **Presets first and
  largest** — a 5-year-old cannot type, and a keyboard on screen is a wall. The typed
  field is the secondary path (for a parent sitting alongside).
- Motion: the chosen name is written onto a small paper luggage-tag that then hangs
  itself on the companion — 480ms, `--ease-bounce`. The tag persists into the world as
  the child's HUD chip, so the name is an *object* too.

### 2.3 Character choice — `screen_id: avatar_pick` (spec §2.3)

```
   מי יצטרף אליך למסע?
   ┌────┐ ┌────┐ ┌────┐ ┌────┐
   │ 👧 │ │ 🧒 │ │ 👦 │ │ 🧑 │   ← 4 of the 6 existing avatars, 180px portraits
   └────┘ └────┘ └────┘ └────┘      each on a paper card, outline + hard shadow
              ( יוצאים )
```

- Copy: **"מי יצטרף אליך למסע?"**, narration **"בחר את החבר או החברה שילוו אותך."**
  After choice: **"בחירה מצוינת! [שם הדמות] מוכן או מוכנה לצאת איתך."**
- Spec says **4** characters. We own 6. Show 4 (a 5-year-old choosing from 6 stalls);
  keep all 6 in the catalogue for later.
- Selection state: the chosen card **lifts** (translateY -10px, `--shadow-lift`), its
  outline thickens to 4px, and a lantern-gold rim-light appears behind the character
  — the only place gold appears outside a sign, justified because it is the moment
  the child's own character becomes "lit." Deselection is instant and silent.
- No checkmark badge. A checkmark is assessment vocabulary; a lift is choice vocabulary.

### 2.4 My World — `screen_id: my_world` (spec §3, §1.8, §12)

```
▚▚▚▚▚▚ dusk sky, aurora if earned ▚▚▚▚▚
      ╔═══════╗
      ║ ▐█▌   ║  ← THE GATE: closed, dark, 3 empty sign-sockets in its arch
      ╚═══════╝
   🧒        ▭         ▁▁▁▁▁▁▁       ← avatar · empty chest · the growable plot
   ★ "השער הזה מוביל למקומות סודיים..."
             ( יוצאים למשימה )
```

- Copy: title **"העולם שלך"**, narration **"זה המקום שלך. כאן תוכל לבנות, לגלות ולפתוח
  מקומות חדשים."**, companion **"השער הזה מוביל למקומות סודיים. כדי לפתוח אותו, נצטרך
  למצוא כמה סימנים."**, button **"יוצאים למשימה"**.
- **The gate is the progress bar.** Its arch has sockets; each completed mechanic
  session slots one lit sign-stone into a socket, and the gate's own light rises with
  it (`filter: brightness()` on the gate layer, 1.0 → 1.35 across the run). When the
  last socket fills, the gate opens. This satisfies 1.8 ("שינוי תצוגה בעקבות התקדמות")
  and 1.7 ("קשר ברור בין הצלחה לשינוי בעולם") with **one** object instead of a HUD.
- **The changeable area** is the plot on the inline-end side. It has 4 growth stages
  driven by total coins: bare soil → sprout → the existing `furniture-blooming-plant`
  → plant + `furniture-magic-lamp` lit. Each upgrade animates in-place on entry (the
  new element rises out of the ground with an overshoot, 620ms) so the child sees the
  change happen rather than finding it already there. Copy on upgrade, verbatim §12:
  **"אספת מספיק סימנים כדי לשדרג את המקום שלך!"**
- The chest sits empty until the remedial adventure opens it (§10.6). It should look
  *conspicuously* empty — lid ajar, dark inside, one dust mote. An empty container is
  an invitation, per the writing rules.
- Everything here is tappable and everything answers: tapping the gate → companion
  repeats the gate line; tapping the chest → a small "still empty" shrug animation;
  tapping the avatar → the avatar waves. **Nothing on this screen is inert.** The
  previous build's map had decorative elements that looked clickable and weren't, and
  the client noticed.

### 2.5 פיצוץ בלונים — `mechanic_id: balloon_game` (spec §4)

```
▚▚▚ coral dusk sky, 3 cloud flats ▚▚▚         ◇◇◆ rail
        ┌──────────────┐
        │  מצא את      │   ┌────┐
        │  האות מֵם    │   │ ◆מ │ ← target sign-stone, LIT, 152px, in the prompt panel
        └──────────────┘   └────┘
      ○         ○         ○
     ╱◆ש╲     ╱◆מ╲      ╱◆ג╲      ← balloons, 128px, each carrying a DIM sign-stone
      │        │         │
   ───┴────────┴─────────┴───  ground line
  ★ "הבלונים נושאים סימנים סודיים!"        ♪
```

- Copy: text **"מצא את האות [שם האות]"**, narration **"פוצץ את הבלון עם האות [שם האות]."**,
  companion **"הבלונים נושאים סימנים סודיים!"**
  Success: **"מצאת את מֵם!"** / **"מֵם נמצאה! הבלון נפתח!"**
- **Hierarchy:** the target sign-stone in the prompt panel is the only lit object on
  screen. The three balloon-borne stones are dim. The child's job, stated purely in
  light: *make one of the dim ones look like the bright one.* No reading required.
- Balloons: 128px diameter, ≥24px apart, in the lower 62% band, buoyancy idle
  (translateY -6px, 2.8s ease-in-out, phase-offset per balloon), string drawn as an SVG
  path that follows the balloon's transform.
- Rounds: BAL-001…005 exactly as spec §4.3 (3 options each).
- Correct → §3.1 motif "the pop." Wrong → §3.2 "the bob." Hints → §3.3 ladder.

### 2.6 דיג אותיות — `mechanic_id: fishing_game` (spec §5)

```
▚▚ lagoon dusk, reed flats fore/back ▚▚      ◆◇◆ rail
   ┌───────────┐        🎣  ← rod, held by the avatar on the jetty
   │ דוג את    │  ┌────┐
   │ האות רֵישׁ │  │ ◆ר │  ← target, lit
   └───────────┘  └────┘
~~~~~~~~~~~~ waterline ~~~~~~~~~~~~~~   ← a NAMED view-transition element
     ◆ר        ◆מ        ◆ד             ← stones bobbing half-submerged, tilt ±3°
  ★ "האותיות נפלו לאגם!"                ♪
```

- Copy: narration **"דוג את האות [שם האות]."**, companion **"האותיות נפלו לאגם!"**
  Success: **"תפסת את רֵישׁ!"** / **"רֵישׁ עלתה מהמים!"**
- **Interaction:** tap-to-cast, not drag-to-fish. Drag is a motor-skill tax that has
  nothing to do with letter recognition. Tapping a stone casts the line to it in a
  380ms arc; the outcome resolves when the hook lands. The *cast* is the fun; the
  choice is the learning.
- The waterline is a single element with `view-transition-name: water-line`, so it
  stays put across round transitions and the lake reads as one continuous place.
- Submerged stones get a `filter: saturate(.85) brightness(.92)` + a 2px lagoon
  overlay so "underwater" is legible; a caught stone loses it on the way up.
- Rounds FIS-001…005 per spec §5.3.

### 2.7 רכבת האותיות — `mechanic_id: letter_train_game` (spec §6)

```
▚▚ berry canyon at dusk, receding rail ▚▚     ◆◆◇ rail
                 ╔═══╗
   איזו אות      ║ ◆מ ║  ← the GATE, with the target sign lit on its keystone
   תפתח את השער? ╚═╤═╝
   🚂▭▭▭  ───────  ╧  ─────────────  rails
       ┌────┐ ┌────┐ ┌────┐
       │ ◆מ │ │ ◆ש │ │ ◆ר │  ← three key-stones on the platform
  ★ "הרכבת רוצה להגיע לתחנה הסודית!"          ♪
```

- Copy: text **"איזו אות תפתח את השער?"**, narration **"בחר את האות שתפתח את הדרך."**,
  companion **"הרכבת רוצה להגיע לתחנה הסודית!"**
  Success: **"השער נפתח!"** / **"הרכבת ממשיכה!"**
- The spec explicitly says the gate carries the letter name and the options sit below
  it — so here, uniquely, **the target sign is mounted in the world** (on the gate's
  keystone) rather than in a floating prompt panel. That is the mechanic's identity:
  the answer goes *into* something.
- The train waits at the inline-start edge with a slow idle (a 1px vertical judder +
  a steam puff every 4s) so there is visible impatience without a timer. **No timer,
  no pressure, no countdown** — the train never leaves without you.
- Rounds TRN-001…005 per spec §6.3.

### 2.8 The non-mechanic skills (spec §7, §8, §9)

Letter–sound (§7), opening-sound (§8) and niqqud (§9) are **content, not screens**.
They render through the same three mechanic shells with the prompt panel swapped:

| Skill | Prompt panel contains | Answer objects carry |
|---|---|---|
| `letter_sound` (§7) | a large paper speaker glyph + waveform, auto-plays | sign-stones |
| `initial_sound` (§8) | speaker glyph + the spoken word | picture-tiles (paper cards) |
| `niqqud` (§9) | speaker glyph, plays the syllable | sign-stones showing `מַ` / `מִ` / `מוֹ` |

This is what satisfies spec 1.2 #6 ("ניתן להחליף מכניקה בלי לשנות את הגדרת המיומנות")
and 1.3 ("לפחות חלק מהמיומנויות נבדקות ביותר ממכניקה אחת") at the *design* level, not
just the data level. Copy verbatim: §7 **"איזו אות עושה את הצליל הזה?"** / narration
**"הקשב לצליל ובחר את האות שמתאימה לו."**; §8 **"מצא את המילה שמתחילה בצליל [צליל]."**;
§9 **"איזה צירוף מתאים לצליל?"** / **"הקשב לצירוף ובחר את הסימן ששמעת."**

**Niqqud rendering is the highest-risk item in the whole app.** Rules: `מַ` `שַׁ` `בָּ`
render at `--type-sign-tile` (88px) minimum, in Noto Sans Hebrew 600, on
`--paper-050`, `line-height: 1.35`, never scaled with a transform (transform-scaling a
glyph with marks visibly drifts the marks), never in a rotated container. Every one of
the 14 combinations in §9.3 must be screenshot-checked once at 88px and once at 152px
before release.

### 2.9 תעלומת הסימנים האבודים — the remedial adventure (spec §10)

The whole adventure runs in **one darker, quieter room**: `--ink-800` ground, the scene
parallax reduced to near-zero, a single moving pool of lantern light from the
companion. It must feel like a *secret side-story*, never like a remedial worksheet —
the child must never be able to tell they were routed here for struggling
(spec 10.2: **אין לומר: "אתה מתקשה באות [אות]."**).

**Opening.** Companion: **"קיבלנו הודעה מסתורית!"** · narration: **"כמה סימנים נעלמו
מהמפה. נצטרך למצוא אותם."** · title: **"תעלומת הסימנים האבודים"** ·
then **"הסימן שאנחנו מחפשים הוא [אות היעד]."** The title stamps in letter-by-letter
(60ms stagger) while the lamp sweeps across — the one place in the game where text
gets a showy entrance, because here the text *is* the premise.

**Stage 1 — find it.** **"חפש את הסימן [שם האות]."** Target + 2 distractors as
sign-stones half-buried in the dark; the lamp reveals them as it passes.
Success: **"מצאת רמז ראשון!"**

**Stage 2 — hear it.** **"הקשב לצליל שעוזר לנו למצוא את הסימן."** Sound plays, 2
options. Success: **"הצליל הוביל אותנו למקום הנכון!"**

**Stage 3 — trace it.** **"עזור לדמות לצייר את הסימן."**
```
        ┌─────────────────────────┐
        │      ①                  │   ① pulsing start dot, lantern gold
        │      ╲                  │   dashed guide path, light travelling along it
        │       ╲___              │   finger/pointer drags a bright bead
        │           ╲             │   completed portion fills solid gold
        └─────────────────────────┘
```
- Implementation: one hand-authored SVG `<path>` per letter (8 needed). The guide is
  `stroke-dasharray` with an animated `stroke-dashoffset` "runner" light. The child's
  pointer is projected onto the path with `getPointAtLength` sampling; progress only
  advances forward, and a **28px tolerance corridor** (at 1× density; scale with the
  path's rendered size) keeps it forgiving.
- Out of corridor: the guide light **dims to 40%** and the companion says the spec's own
  line **"בוא נעקוב אחרי האור."** Nothing turns red, nothing resets, the stroke does not
  erase. Struggling (3 corridor exits): the corridor widens to 44px and the guide
  stroke thickens — spec: "המסלול מוצג מודגש יותר."
- Completion: the stroke fills solid gold and the finished letter lifts off the canvas
  into a sign-stone. Copy: **"הסימן מתחיל להאיר!"** — the exact moment the whole
  Signlight metaphor pays off.

**Stage 4 — use it.** **"מצא את האות [שם האות] כדי לפתוח את התיבה."** Target + 2 more.
Success: **"התיבה נפתחה!"** — the chest from My World is here, and it opens.

**Ending.** Narration **"הסימן חזר למפה!"** · text **"המשימה הושלמה"** · reward: coin +
one item for the personal world + a star · and the gate in My World gains light
(spec 10.7: "השער מקבל אור חדש").

**Content-swappable by construction:** the adventure takes `{letter, letterName, sound,
tracePath, distractors[]}` and nothing else. Swapping the letter changes nothing about
the screens — spec 1.6 acceptance criterion.

### 2.10 Session end — `screen_id: session_end` (spec §13)

```
        ╔══════════════════════════════╗
        ║   היום התקדמת במסע!          ║  ← Rubik 800
        ║  מצאת סימנים, פתחת דרך       ║
        ║  ובנית משהו חדש.             ║
        ║                              ║
        ║   ◆ ◆ ◆ ◆ ◆   🪙×7   🌱      ║  ← signs found · coins · what opened
        ║                              ║
        ║ (להמשיך לשחק)(לבקר בעולם שלי)║
        ║        (לסיים להיום)         ║
        ╚══════════════════════════════╝
```
- Copy verbatim: title **"היום התקדמת במסע!"**, message **"מצאת סימנים, פתחת דרך ובנית
  משהו חדש."**, buttons **"להמשיך לשחק"** / **"לבקר בעולם שלי"** / **"לסיים להיום"**,
  and on exit **"העולם שלך יחכה לך בפעם הבאה!"**
- Shows only: coins, the item that opened, the area that opened, tasks completed.
  **Never** success %, error count, score, ranking (spec 13.1 + §21).
- Celebration motif in §3.5.

### 2.11 מסך הורה — the parent dashboard (spec §14)

**Deliberately a different product.** No dusk, no paper, no gold, no companion, no
animation beyond a 160ms cross-fade. Light neutral ground, Frank Ruhl Libre headings,
single 640px column, generous line-height, tabular figures.

```
─────────────────────────────────────────────
  התקדמות במסע של רוני                        ← Frank Ruhl Libre 700, 32px
  במפגש האחרון רוני שיחק ב־3 משחקים,
  פגש 5 אותיות וקיבל עזרה כאשר היה צורך.
─────────────────────────────────────────────
  מיומנות                סטטוס      חשיפות  רמז
  זיהוי חזותי של אותיות  ● בתרגול      5     1
  הכרת שם האות           ● הצלחה עקבית 4     0
  קשר אות–צליל           ● חדש         2     1
  צליל פותח              ● בתרגול      3     1
  אות עם קמץ או פתח      ● חדש         1     0
─────────────────────────────────────────────
  רמזים הם חלק רגיל מהמשחק. המערכת משתמשת
  בהם כדי לאפשר לילד להמשיך, להצליח ולצבור
  ניסיון.
─────────────────────────────────────────────
```

- Palette (its own, small, and intentionally desaturated):
  ground `#F7F7F5`, text `#232323`, rule `#DDDCD7`,
  status dots — `חדש` `#8A93A6` (slate) · `בתרגול` `#C98A2B` (amber) ·
  `הצלחה עקבית` `#3E8E5A` (green). **No red exists in this palette either** — there is
  no status that warrants it, per spec 14.4.
- Copy: title **"התקדמות במסע של [שם הילד]"**; summary sentence template verbatim from
  §14.2; status words drawn only from the allowed set (**חדש · בתרגול · הצלחה עקבית ·
  נבדק במספר משחקים · ממשיך להתבסס**) and never from the forbidden set (**חלש · נכשל ·
  בעייתי · לא יודע · מתקשה מאוד**); the hints explainer §14.5 verbatim, always visible,
  not behind a tooltip.
- **No charts.** A bar chart of a 5-year-old's letter recognition invites exactly the
  comparison the spec forbids. Words and counts only.
- **Access (spec 1.9 — "גישה נפרדת", must not be reachable by the child):** a small,
  low-contrast gear in the **top-inline-start** corner (the hardest corner to reach
  one-handed and outside the child's tap zone), requiring a **1.5s long-press** (a
  child taps, they don't hold), which opens a text-only adult gate: the instruction
  and the answer are written *in Hebrew words, with no audio and no icons* —
  e.g. "הקישו את המספר: ארבע – שתיים – שבע". A non-reader cannot pass it and no PIN
  setup is required. Three wrong entries just re-rolls the number; no lockout.

---

## 3. Feedback & motion design

Global tokens:

```css
--dur-instant: 120ms;  --dur-quick: 200ms;  --dur-beat: 320ms;
--dur-gesture: 480ms;  --dur-reward: 620ms; --dur-celebrate: 2600ms;
--ease-bounce:   cubic-bezier(0.34, 1.56, 0.64, 1);   /* keep — it's good */
--ease-out-soft: cubic-bezier(0.22, 1.00, 0.36, 1);   /* keep */
--ease-settle:   cubic-bezier(0.16, 1.00, 0.30, 1);   /* new: long, heavy landings */
--ease-inout-air:cubic-bezier(0.65, 0.05, 0.36, 1);   /* new: floaty round-trips */
--slide-forward: 1;   /* [dir="rtl"] { --slide-forward: -1 } — never hardcode a sign */
```

**Motion tokens carry duration only.** No embedded easing keyword, ever. That bug cost
this project months of "it's boring" feedback; add a CI/lint grep for
`--transition-[a-z]*:\s*\d+ms\s+\w` to make sure it never comes back.

### 3.1 The correct-answer moment

A shared 3-part spine, then a mechanic-specific verb. Total budget **900ms** from tap
to the next round starting.

**Spine (all mechanics):**
| t | What |
|---|---|
| 0ms | tap registers; **all other options become non-interactive** (no visual change) |
| 0–200ms | chosen object scale 1 → 1.12 → 1, `--ease-bounce` |
| 60ms | `SoundManager.playEffect('chime')` — a rising major third, not a "ding of correctness" |
| 120–420ms | the object's sign-stone carving lights: `--stone-carve` → `--lantern-400`, glow 0 → full, `--ease-out-soft` |
| 300ms | companion swaps to `companion-happy.png`, says the spec's success line |
| 420–1040ms | the lit stone flies to the sign rail on an arc (§3.5 coin/sign flight) |
| 900ms | next round transition begins |

**Mechanic verbs (this is the distinct-motif requirement, applied to feedback):**

- **Balloons — "the pop."** At 180ms the balloon bursts into **8 rubber shards**
  (absolutely-positioned divs, 24° spread, `rotate` + `translate` + fade, 380ms,
  `--ease-out-soft`); the freed sign-stone drops 12px then floats up. The companion
  does a **2-hop jump** with squash/stretch (scaleY .88 → 1.1 → 1 per hop). Spec §4.2
  asks for exactly this: "הבלון מתפוצץ · מופיע כוכב · הדמות קופצת · צליל הצלחה."
- **Fishing — "the catch."** The line goes taut (rod bends 8°, 120ms), the stone
  breaks the surface with a **splash crown** (6 droplet divs on a parabolic arc) and
  **3 expanding ellipse ripples** (scale 0.2→1.6, opacity .7→0, 700ms, 90ms apart).
  Companion **claps** (two hands meeting, 3 cycles, 160ms each) per spec §5.2.
- **Train — "the opening."** The gate's two leaves swing on hinges (`rotateY` ±78°,
  `transform-origin` at each outer edge, 420ms `--ease-settle`), a steam puff at the
  base, and the train **rolls through and off-frame** (760ms) carrying the lit sign on
  its first car. Per spec §6.2.

### 3.2 The wrong-answer moment

**Design law: nothing is removed, nothing turns red, nothing shakes like a "no".**
Instead, each mechanic gives the object its *own diegetic reason* for not working —
which the spec already wrote for us. This is much stronger than a shake: a shake says
"you were wrong", a bob says "that one just isn't it."

| Mechanic | Motion | Duration | Spec copy (first wrong) |
|---|---|---|---|
| Balloons | tapped balloon drifts **10px away** on its string and wobbles `rotate ±4°`, 3 oscillations, `--ease-inout-air`; it does **not** pop and does **not** vanish | 420ms | **"בוא נסתכל שוב על הסימנים."** |
| Fishing | the stone **swims off 16px** and turns 8° away; **2 bubbles** rise from it | 480ms | **"האות הזאת שוחה לה. נסה לדוג סימן אחר."** |
| Train | the gate **rattles**: 2 knocks of 3px on the block axis, plus a small dust puff at its base; it stays shut | 300ms | **"השער הזה עדיין סגור. בוא ננסה דרך אחרת."** |
| Tracing | guide light dims to 40%, nothing erases | 200ms | **"בוא נעקוב אחרי האור."** |

Shared: a soft **descending two-note wood block** (never a buzzer, never a low horn);
the tapped object desaturates 6% for 200ms and returns; the companion stays *happy*,
never disappointed — its expression must not change on a wrong answer, because a
disappointed mascot is the single most efficient way to make a child feel judged.

Second wrong, all mechanics: **"הקשב לשם האות: [שם האות]."** + re-narration.

### 3.3 The hint escalation ladder (spec §11 — all six steps)

Escalation is expressed as **more light**, not more talking. The companion's lantern
brightens one step at a time, so the child perceives help arriving rather than
pressure mounting. No step ever shows a counter, an attempt number, or a timer.

| # | Trigger | Copy (verbatim §11) | Visual | Timing |
|---|---|---|---|---|
| 1 | round start | **"נסה למצוא את הסימן המתאים."** | none — deliberate silence | — |
| 2 | 1st wrong, or 8s idle (§16.1 **"הסימנים מחכים לך."**) | **"בוא נקשיב שוב."** | prompt panel pulses once, scale 1→1.06→1 | 260ms |
| 3 | 2nd wrong, or 16s idle | **"רוצה רמז קטן?"** + pills **"כן"** / **"לא עכשיו"** | offer card rises from the bottom edge; **if no answer in 6s the hint fires anyway** (spec requires) | card 320ms; auto-fire at +6s |
| 3b | hint fires | — | correct object's stone gets a **breathing gold halo** (opacity .35↔.9, 1.2s loop) **plus** a diegetic light: balloon inner glow / rising bubbles + shaft of light / a lit trackside signpost (§6.4.3) | loop until answered |
| 4 | 3rd wrong | **"עכשיו נשארו רק שתי אפשרויות."** | one distractor **leaves under its own logic** — a balloon slips its string and rises off-frame; a fish-stone swims off; a rail car uncouples and rolls back. It is never deleted, never faded out. | 500ms `--ease-inout-air` |
| 5 | 4th wrong | **"תראה איך זה עובד, ואז נסה אתה."** | companion's star-tip travels to the correct stone, taps it, it lights, then **resets to dim** and the child does it | 1400ms |
| 6 | 5th wrong | **"בוא נתחיל מצעד קטן."** | mechanic's own transition motif into a 2-option round of the same skill | per §3.4 |

Data (spec §17): `hint_used`, `hint_type` (one of `repeat_instruction`, `glow`,
`reduce_options`, `demo`, `simpler_task`), `success_after_hint`. Success after a hint
uses the **identical** success feedback as an independent success — spec §4.4.6:
**"אין לציין שההצלחה הייתה לאחר רמז."**

### 3.4 Screen/round transitions — new registry entries

`docs/transition-registry.md` stays, and its discipline stays. But its seven existing
rows describe seven stations (letters/phonology/arithmetic/geometry/…) that are **out
of scope for this MVP** — mark those rows `RETIRED (pre-MVP build)` rather than
deleting them, so future work still checks against their techniques and doesn't
accidentally re-invent the owl-carry or the page-flip. The new motifs below are each
checked against all seven: no clip-path circle reveal, no soft-edge wipe, no diagonal
peel, no particle shower, no `rotateY` page flip.

All are built on `document.startViewTransition()` with the instant-swap fallback,
RTL-safe via `--slide-forward`, `transform`/`opacity` only.

| Screen / theme | Motif | Technique | Why it fits | Duration |
|---|---|---|---|---|
| **Balloons — round to round** | **Lift-off.** The old round bunches onto a string and rises off the top edge, squashing horizontally as it goes; the new round is simply already underneath. | `::view-transition-old(root)`: `translateY(-115%) scaleX(.86) scaleY(1.08) rotate(2deg)`; `new(root)` holds still at opacity 1. Decorative string SVG drawn outside the snapshot. | Helium is the mechanic. The screen leaves the way a balloon leaves. Vertical exit with no reveal-shape — distinct from every registry entry. | **320ms** `--ease-inout-air` |
| **Fishing — round to round** | **Reel-in.** The old round tilts and shrinks toward the rod tip in the top corner as if pulled up the line; the new round rises 24px from below the waterline. | `old(root)`: `scale(.05) rotate(9deg)` with `transform-origin` at the rod tip; `new(root)`: `translateY(24px)` → 0. `water-line` is a named element and **does not animate**. | The waterline staying put while everything else moves is what makes the lake read as one place. Reel-in is a point-convergence, not the ripple already in the registry. | **340ms** `--ease-settle` |
| **Train — round to round** | **Carriage pass.** New round rides in on the rail from the reading-start side; old exits the other way; a foreground gate-post sweeps across at **1.6× the speed** and hides the seam. | Two named groups: `rail-bed` (static, never animates) and `round-car` (translates on X by `calc(var(--slide-forward) * 100%)`). The post is a plain div at higher velocity, outside the transition. | Parallax-cut: the world moves past the train. The static rail is the visual proof you are still on the same journey. | **300ms** `--ease-out-soft` |
| **Lost Signs adventure — stage to stage** | **Lamplight sweep.** The screen is dark; a soft pool of lantern light travels across it and everything the pool passes is revealed behind it. | `mask-image: radial-gradient()` on `new(root)`, translating across — a *moving soft mask*, deliberately not an expanding `clip-path: circle()` (phonology and geometry already own those). | The adventure's premise is searching in the dark with a lamp. The motion is the story. | **420ms** `--ease-inout-air` |
| **My World — entering / returning** | **Pop-up book.** The world unfolds upward from a hinge at the ground line: `rotateX(72deg) → 0` with the horizon as `transform-origin`, plus a 6% scale settle. | 3D transform on the screen root, `perspective: 1200px`. Different axis and different hinge from the registry's `rotateY` page-flip. | A personal world that literally builds itself is the reward loop made visible. | **450ms** `--ease-settle` |
| **Onboarding — screen to screen** | **The companion carries you.** No themed motif; instead the star companion is a named element (`view-transition-name: companion`) that persists and flies between its old and new positions while a plain 260ms push happens behind it. | Per-element named transition + a `translateX(calc(var(--slide-forward)*32px))` push. | Continuity of *the character*, not of the place — the onboarding has no place yet. | **260ms** `--ease-out-soft` |
| **Parent dashboard — in / out** | **Restraint.** A plain 160ms cross-dissolve, nothing else. | Default root cross-fade. | Its motif is that it has no motif. Motion here would undermine "this is the adult screen." | **160ms** linear |

**Audio pairing (required by the transitions skill).** Every transition fires
`SoundManager.playEffect()` at t=0 with a mechanic-appropriate cue — balloons: a short
`whoosh-up`; fishing: `reel` (a 3-click ratchet); train: `clack` (two rail joints);
adventure: a low `lamp-hum` swell; My World: `unfold` (a paper flap). All synthesised
locally. **No Google Cloud TTS call is made for any of this** — narration is a separate,
explicitly gated workstream.

**Double-tap guard:** disable the option layer the instant a transition starts, re-enable
on `.finished` (with `.catch(() => {})`, since a superseded transition rejects by spec).

### 3.5 The reward and celebration beat

**Per-round reward (spec §12: "קיבלת מטבע!").** The coin flies from the answered object
to the HUD rail on a 2-keyframe arc (`--dur-reward` 620ms, `--ease-settle`), scaling
1 → 1.25 → 0.8 across the flight; the rail bumps on arrival (scale 1.18 → 1, 180ms) and
the number rolls up with a `requestAnimationFrame` counter. **Note:** that JS counter is
not covered by the CSS reduced-motion neutralisation — it needs its own explicit
`prefers-reduced-motion` check (this bit the project before).

**Session celebration (spec §13) — "lantern release", `--dur-celebrate` 2600ms.**

| t | Beat |
|---|---|
| 0ms | confetti fires — plain absolutely-positioned divs, **outside** the view transition |
| 0–400ms | the session's collected sign-stones lift off the rail like sky lanterns |
| 300ms | **the child's own avatar jumps** — 3 hops, real squash/stretch (scaleY .82/1.14), 220ms each, and the companion jumps on the offbeat |
| 400–1200ms | the lanterns rise and settle into the gate's sockets; the gate's brightness climbs 1.0 → 1.35 |
| 800ms | title stamps in, 6% overshoot |
| 1000–1800ms | coin count rolls up; the unlocked item flies in and lands |
| 1400ms | a slow rotating conic-gradient glow ring behind the panel (keep this from the current build — it was a good idea) |
| 1600ms | buttons settle in — **already clickable since 0ms** |

The client asked, verbatim, for "jumping faries or elieans that enounce that the player
won." The answer is **not** emoji fairies (this project already learned that emoji
props "didn't look good" against real art). The answer is that **the child's own
chosen character** — for which we have 42 dressed portraits — jumps up and down,
alongside the star mascot. That is more personal, more on-brand, and costs no new art.

### 3.6 `prefers-reduced-motion`

Under `reduce`: every transition above collapses to a **120ms cross-fade**; no particle
ever spawns (no confetti, no shards, no droplets, no ripples, no dust); parallax is
off; idle float/bob/breathing loops are off; the JS coin counter sets its final value
immediately.

**What survives, because it is information rather than decoration:**
- the sign lighting up (applied as an instantaneous state change, not a fade),
- the wrong-answer positional offset (the balloon still ends up 10px away — the child
  still needs to see that something responded to their tap; it just gets there in 0ms),
- **all audio, unchanged.** Reduced motion is not reduced feedback.

---

## 4. Accessibility & age fit

**Touch targets.** Ages 5–7 have coarser motor control than the 44pt guidance assumes.

| Element | Size | Note |
|---|---|---|
| Any answer object (balloon, stone, picture tile) | **≥96×96**, target 120px | balloons 128px |
| Primary button | **72px** tall, **≥240px** wide | |
| Repeat-audio button | **64×64** | fixed position, always present |
| Any other tappable | **≥64×64** | |
| Gap between adjacent targets | **≥24px** | mis-tap prevention matters more than density |
| Parent gear | 32×32, low contrast, long-press | deliberately hard — it is not for the child |

Hit areas may exceed the visual bounds via padding or `::after`, but **never overlap**.

**Contrast.** All child-facing text ≥ **7:1** (AAA) against its own plate. Instruction
text and every letterform sit on a solid paper/stone plate — never on artwork.
`--coral-500`, `--lagoon-500` and `--berry-500` are graphics-only: at 5.9:1, 4.4:1 and
5.1:1 on the dark ground they clear the 3:1 non-text requirement but are never used
for words. Focus ring: `outline: 4px solid var(--lantern-300); outline-offset: 3px` —
visible on both grounds, and the only other sanctioned use of the gold family.

**Audio-first, for a child who cannot read.** The load-bearing requirement.
1. Every screen narrates within **400ms** of becoming interactive.
2. The **repeat button never moves, never disables, never hides** — same corner, same
   icon, every screen, including the celebration and the adventure.
3. Every instruction is carried by **three redundant channels**: audio narration, an
   icon/object (a lit stone, a speaker horn, a picture), and text. Remove any two and
   the screen still works. Text is the *least* important of the three — it is there for
   the adult and the emerging reader.
4. Icons are **nouns a 5-year-old already knows**: balloon, rod, train, gate, chest,
   coin, star, ear. No abstract glyphs, no hamburger, no gear in the child's flow, no
   arrow-only affordances.
5. Nothing is gated behind reading. The adult gate on the parent screen is the only
   deliberately text-only surface in the app — that is its security model.

**One-handed reach on a tablet (assume 10", held in landscape, both thumbs at the
lower corners).**
- All answer objects live in the **lower 62%** of the viewport and within the middle
  **80%** horizontally.
- Nothing tappable within **44px of the top edge** — the top strip is for the sign rail
  (read-only) and the parent gear (deliberately out of reach).
- The repeat button sits **bottom-inline-end**; in RTL that is bottom-right, under the
  dominant thumb of a right-handed child. The companion takes bottom-inline-start.
- Use logical properties throughout (`inset-inline-start`, `padding-inline`,
  `margin-block`) — never `left`/`right`. The `--slide-forward` custom property is the
  only sanctioned way to express direction in animation.

**Session length and fatigue.** 5 rounds per mechanic (the spec's own tables), 3
mechanics, ≈8–11 minutes total. No timers, no countdowns, no streak pressure, and
nothing on any child-facing screen that counts down or counts errors.

---

## 5. Keep vs. discard

### Keep

| Thing | Why |
|---|---|
| Custom-property token architecture in `css/tokens.css` | The structure is right; only the values change. Re-theming from one file is exactly what we want. |
| **Duration-only motion tokens** (the `ease`-stripping fix) | This was the root-cause bug behind months of "boring." Keep it, and add the lint rule in §3. |
| `--ease-bounce`, `--ease-out-soft` | Both are genuinely well-chosen. Two more join them. |
| `js/juice/RoundTransition.js` + `document.startViewTransition()` + fallback + `.catch()` on superseded transitions | Correct architecture. Only the motif config changes. |
| `docs/transition-registry.md` and its discipline | Keep the file, retire (don't delete) the seven pre-MVP station rows, append the seven new ones. |
| Local `SoundManager` effects, mute toggle | Works, costs nothing, and the boundary around TTS is already established. |
| **All 42 avatar images** (6 base + 36 dressed) | The most expensive asset we own, on-brief, and the celebration beat is built on them. Their heavy ink outline becomes the *system-wide* outline rule rather than an inconsistency. |
| **Companion star**, both frames, now with real alpha | Excellent mascot art, already threaded through the app. |
| The 4 furniture pieces | Repurposed as the growth stages of the My World plot. |
| `map-background.png` / `-alt` / `-aurora` | Reused as My World skies and as a reward (the existing MAP_THEME prize idea is good and stays). |
| `phonology-scene.png` (dusk lake) | Closest existing scene to the fishing mechanic; usable as the back layer with a new mid/fore. |
| The reward → world-change loop, one resource | Spec 1.7 mandates exactly one resource; the current model already complies. |
| `prefers-reduced-motion` handling and the RTL `--slide-forward` pattern | Both already correct. Do not regress them. |
| "Staggered reveal never gates interactivity" | The project's own best rule. Keep it written down. |

### Discard

| Thing | Why |
|---|---|
| The 7-station free-roam world map | Four of the seven stations are arithmetic/geometry/multiplication/reading — outside the MVP scope entirely (spec: "אין להוסיף אותיות אחרות", MVP = letters only). And the spec's flow (§19) is a **linear** journey, not free roam. My World's gate replaces the map. |
| The 7 station scene backgrounds and their `-alt` variants | Same reason. Retain the two most reusable (dusk lake, starlit) and let the rest go rather than bending the MVP around sunk art. |
| The coral-on-cream palette (`#ff6b4a` / `#fff8ee`) and the 7 per-station tile tints | This *is* the generic friendly-app default the client reacted to. The tints in particular produced seven near-identical pastel screens. |
| The system-font stack | Fails the niqqud requirement outright, and is the single largest contributor to "this looks like a form." |
| **All emoji used as UI or art** — the ✨ fallbacks, the golden-round badge, the map critters, the furniture decorations, and especially the 🧚👽⭐🎉 victory cast | The client already said emoji props "didn't look good" next to real art. The victory cast is replaced by the child's own avatar (§3.5). |
| The "golden round" 1-in-6 coin doubling | Not in the spec, and it teaches *luck* rather than *progress* — it actively muddies acceptance criterion 3.4 ("the child identifies the connection between success and change in the world"). |
| The green checkmark badges on visited stations | Checkmark = assessment vocabulary. Spec 1.1 #6 is explicit about not signalling being tested. Replaced by lit sign-stones — an inventory, not a score. |
| The 6-dot round progress bar | Same reason; replaced by the sign rail. |
| `adaptiveEngine.js`'s "3-streak up / 2-wrong down" difficulty model | Superseded by the spec's own mandated 6-step hint ladder (§11) and 3-tier option count (§1.3: 2/3/4 options). A silent level-down on 2 wrongs is also a form of feedback the child can perceive. |
| Accessories (already removed) and `buildAccessoryOverlays()` | Dead code; finish the removal. |
| Flat panels floating over a background with no depth | The specific thing that made it look like a website instead of a game. Replaced by 3-layer parallax + hard-offset cut-paper shadows. |

---

## 6. New art required

The generator is **text-to-image only** (`@cf/black-forest-labs/flux-1-schnell` via
`tools/Generate-Image.ps1`) — no image-to-image, no inpainting, no video. Two hard
constraints, both learned the hard way on this project:

1. **The model cannot render Hebrew.** Every prompt must end with the negative clause
   and no asset may ever be relied on to contain readable text.
2. **Cutout sprites must be generated on flat magenta** and chroma-keyed with the
   existing `tools/Remove-MagentaBackground.ps1`. Scenes (which fill the frame) don't
   need this.

Suffix required on **every** prompt below:
`, no text, no letters, no numbers, no writing, no symbols, no signage, no watermark`

### 6.1 Scenes (full-frame, 1024×1024, no chroma key)

| File | Prompt |
|---|---|
| `assets/images/scenes/balloon-sky.png` | `flat cut-paper illustration of a wide dusk sky over soft rolling hills, deep navy blue at the top fading to warm coral and gold at the horizon, three simple layered paper clouds, a few small stars, the lower third empty and uncluttered, children's picture-book style, no outlines on the background shapes, soft grain texture` + suffix |
| `assets/images/scenes/fishing-lake.png` | `flat cut-paper illustration of a calm lake at dusk, deep teal water filling the lower half with a clean unbroken horizontal water surface across the middle, dark navy and plum hills behind, tall reeds only at the far left and right edges, centre of the water completely empty, children's picture-book style, soft grain texture` + suffix |
| `assets/images/scenes/train-canyon.png` | `flat cut-paper illustration of a plum and berry coloured canyon at dusk, a straight railway track running horizontally across the lower third toward a distant arch in the rock, layered flat rock shapes in three depths, deep navy sky with a few stars, children's picture-book style, soft grain texture` + suffix |
| `assets/images/scenes/lost-signs-night.png` | `flat cut-paper illustration of a dark night landscape, deep navy and indigo, scattered flat stone shapes half buried in the ground, a mysterious quiet mood, almost no light except a faint warm glow near the ground, children's picture-book style, soft grain texture` + suffix |
| `assets/images/my-world/world-clearing.png` | `flat cut-paper illustration of a small grassy clearing at dusk with a tall closed stone archway gate in the centre background, a low wooden fence, bare soil patch on the right, deep navy starry sky, warm and inviting, children's picture-book style, soft grain texture` + suffix |

### 6.2 Sprites (generate on magenta, then `Remove-MagentaBackground.ps1`)

| File | Prompt |
|---|---|
| `assets/images/props/balloon-coral.png` (×3 hues: coral / lagoon / gold) | `a single simple cartoon party balloon, flat colour, thick dark ink outline, glossy highlight, short curled string, centred, on a solid flat magenta background, children's sticker illustration style` + suffix |
| `assets/images/props/sign-stone-blank.png` | `a small blank carved stone tablet, irregular hexagonal shape, warm sandy beige stone with a darker chiselled bevelled edge, completely blank flat face with nothing carved on it, thick dark ink outline, centred, on a solid flat magenta background, children's sticker illustration style` + suffix |
| `assets/images/props/gate-closed.png` + `gate-open.png` | `a stone archway gate with two heavy wooden doors [closed / standing open], three small empty round sockets set into the arch above the doors, warm grey stone, thick dark ink outline, centred, on a solid flat magenta background, children's sticker illustration style` + suffix |
| `assets/images/props/chest-closed.png` + `chest-open.png` | `a small wooden treasure chest with iron bands, [lid closed / lid open and empty inside], thick dark ink outline, centred, on a solid flat magenta background, children's sticker illustration style` + suffix |
| `assets/images/props/train-engine.png` + `train-car.png` | `a small friendly cartoon steam [locomotive / open flatbed rail car], side view facing left, flat colours in plum and warm brass, thick dark ink outline, centred, on a solid flat magenta background, children's sticker illustration style` + suffix |
| `assets/images/props/fishing-rod.png` | `a simple wooden fishing rod held at an angle with a taut line and a small hook, flat colours, thick dark ink outline, centred, on a solid flat magenta background, children's sticker illustration style` + suffix |
| `assets/images/props/lantern.png` | `a small warm glowing paper lantern with a handle, soft golden light inside, flat colours, thick dark ink outline, centred, on a solid flat magenta background, children's sticker illustration style` + suffix |
| `assets/images/props/sprout.png` | `a single small green sprout with two leaves growing from a mound of soil, flat colours, thick dark ink outline, centred, on a solid flat magenta background, children's sticker illustration style` + suffix |

### 6.3 Not generatable — must be hand-authored

- **The 8 letter stroke paths** for the tracing stage (`א מ ש ר ד ל ב ג`) as SVG
  `<path>` data with correct stroke *order* and *direction* per Israeli handwriting
  instruction, plus a numbered start point per stroke. This is content, not art; an
  image model cannot produce it and getting the stroke order wrong teaches a child
  the wrong motor pattern. Author it against a כיתה א׳ handwriting chart and have the
  client's educator sign it off.
- **The sign-stone carving** is CSS/SVG type set live in Noto Sans Hebrew (inset shadow
  + gold fill), never baked into an image — the letter has to be swappable per spec
  §18 ("ניתן להחליף אות/תוכן בלי לשנות את קוד המכניקה").
- **The paper grain tile** (240×240 seamless, subtle) — grab an OFL/CC0 paper texture
  rather than generating one; a generated "texture" will not tile.

---

## 7. Build order (so the direction survives contact)

1. Fonts self-hosted + the sign-stone component, in isolation. **Screenshot all 14
   niqqud combinations from §9.3 at 88px and 152px before anything else is built.**
   If niqqud positioning fails, everything downstream is wasted work.
2. Tokens replaced; the outline/paper-shadow/parallax primitives; the global chrome
   (sign rail, repeat button, companion).
3. One mechanic end-to-end — **balloons** — with its correct/wrong/hint/transition
   motifs complete. Get this in front of a real child before building the other two.
4. Fishing and train, reusing the shell.
5. My World + the gate progression.
6. Lost Signs, with the tracing stage last (highest technical risk).
7. Parent dashboard.
8. Onboarding polish and the load sequence.

And a standing rule, from this project's own hardest lesson: **nothing in this document
is done until it has been watched running in a real browser.** Four features once
shipped on static review alone and the client's next word was "boring."
