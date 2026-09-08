---
name: game-screen-transitions
description: Design and implement animated transitions between screens, questions, tasks, or stations in a vanilla HTML/CSS/JavaScript game — no framework, no external animation library. Use this skill whenever writing or modifying navigation/router code, whenever a new screen or question is added, whenever the user asks for a "transition," "animation," "cool effect," "מעבר", "אנימציה" between screens/tasks/questions, or whenever building feedback animations for correct/incorrect answers, rewards, or station unlocks. Always consult this skill before writing screen-switching code, even if the user only asks to "add the next question" — the transition is part of that job.
---

# Game Screen Transitions (Vanilla JS, No Framework)

Guidance for building smooth, playful transitions between screens/questions/tasks in a
plain HTML/CSS/JS game, using the browser's native **View Transitions API** as the
primary tool — no React, no GSAP, no external library required.

## Why View Transitions API (not manual CSS animation)

- It's a native browser API (`document.startViewTransition()`) — zero dependencies,
  works in a `<script>` tag with no build step.
- The browser automatically snapshots the old screen, snapshots the new screen after
  your DOM update, and cross-fades/animates between them — you don't have to manually
  track element positions or write enter/exit animation pairs.
- Same-document transitions (switching screens within one page, which is this
  project's architecture) are Baseline-supported: Chrome/Edge 111+, Firefox 133+,
  Safari 18+ — safe to use as the primary mechanism, not an experimental extra.
- It degrades gracefully: on any browser that doesn't support it, the screen just
  swaps instantly with no animation — never a broken or blank state. Always code the
  fallback check even though modern browser support is now solid.

## Core pattern

```js
function goToScreen(newScreenId) {
  const swap = () => renderScreen(newScreenId); // your existing DOM-swap logic

  if (document.startViewTransition) {
    document.startViewTransition(swap);
  } else {
    swap(); // no animation, but still works
  }
}
```

Style the transition entirely in CSS, using the browser-generated pseudo-elements —
don't hand-roll JS animation loops for this:

```css
::view-transition-old(root),
::view-transition-new(root) {
  animation-duration: 0.35s;
  animation-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
}
```

## Naming transitions per element (for richer effects)

Tag specific elements with `view-transition-name` (via inline style or a class-driven
CSS rule) to animate them distinctly from the rest of the screen — e.g. a station icon
that should visibly "fly" from the map into the question screen:

```css
.station-icon.active-transition {
  view-transition-name: station-hero;
}
```

Only name elements that need a distinct, isolated effect. Naming everything hurts
performance and makes cross-fades look messy — the default root transition already
covers most screen swaps.

## Transition recipes for this game

Pick the style intentionally per context — don't reuse one generic fade everywhere;
that reads as flat rather than playful.

- **Next question / next task (forward progress):** slide + fade, direction matching
  reading flow (see RTL note below). Duration ~300–400ms, gentle overshoot easing
  (`cubic-bezier(0.34, 1.56, 0.64, 1)`) for a bouncy, kid-friendly feel rather than a
  flat linear slide.
- **Correct answer:** scale-up + brief overshoot ("pop") on the answer element itself,
  paired with a name transition on any reward/star icon so it visibly travels toward
  a score/progress indicator. Keep it under 600ms total — kids lose patience fast.
- **Incorrect answer / retry:** small horizontal shake (a few px, 2–3 oscillations,
  ~250ms) — never a red flash or harsh buzzer-style cut. This should read as
  "gentle nudge," not "failure," per the no-punishing-failure principle.
- **Entering a station from the world map:** scale/zoom transition using a named
  `view-transition-name` on the station icon so it visibly expands into the new
  screen, reinforcing spatial continuity (the child understands "I walked into this
  place" rather than "the screen randomly changed").
- **Returning to the world map:** reverse of the above — zoom-out — using the same
  named element so the transition feels symmetric.
- **Reward/celebration screens:** slightly longer and more elaborate (confetti-style
  particle burst is fine here, generated as small absolutely-positioned divs animated
  with CSS `@keyframes`, not the View Transition itself) — this is the one place a
  longer, showier animation is appropriate since it's a payoff moment, not routine
  navigation.

## Distinct visual identity per background/theme (mandatory, do this proactively)

This game has multiple themed backgrounds/stations (per the world-map/station
registry in the spec). **Each distinct background or theme must get its own,
visually distinct transition motif — never reuse the same effect across different
backgrounds.** This is not optional polish; treat "which motif fits this theme" as
part of the task every time a background/station is added, even if the user only
asked for "a transition" generically.

**Maintain a registry so you don't repeat yourself.** Keep a file at
`docs/transition-registry.md` in the project (create it if it doesn't exist) listing,
per background/theme: the theme name, the visual motif chosen, the core CSS/JS
technique behind it, and one line on why it fits the theme. Before designing a new
background's transition:
1. Read `docs/transition-registry.md` first.
2. Pick a motif and technique that is clearly distinct from every entry already
   listed — different visual metaphor, not just a different color of the same slide.
3. Implement it, then append a new entry to the registry file so future additions
   (by you or in a later session) can check against it too.

**Design each motif from the theme itself, don't pick from a fixed list.** Look at
what makes this specific background distinctive (its setting, its dominant shapes,
its mood) and invent a motion metaphor that a child would associate with it. As
starting inspiration only — invent your own beyond these, and never reuse one of
these twice:
- A nature/forest theme might part like leaves or foliage brushing aside.
- A space/night-sky theme might streak like warp-speed stars or a comet trail.
- An underwater theme might ripple, bubble, or wave like water.
- A desert theme might swirl like blown sand.
- A snow/ice theme might crystallize/frost in or shatter like ice.
- A city/indoor theme might swipe like a sliding door or window blind.
- A magic/fantasy theme might sparkle-dissolve or swirl like a spell effect.

Use these only as a spark, not a checklist to assign one-to-one — if two backgrounds
are thematically close (e.g. two different forest stations), still differentiate the
specific motion (one parts vertically, the other diagonally; one uses leaf shapes,
the other pollen/light-particle shapes) so a child who visits both still feels each
place is distinct.

**Technical implementation stays consistent even though the visuals differ**: still
build each themed motif on top of `document.startViewTransition()` and named
`::view-transition-old/new` pseudo-elements or per-element `view-transition-name`
groups — swap the CSS `@keyframes` content per theme (via a theme class on `<html>`
or the screen root), not the underlying mechanism. This keeps performance and
fallback behavior consistent across every theme.

## RTL direction handling (critical for this project)

The game is Hebrew/RTL. "Forward" motion should slide in from the reading-start side,
not a hardcoded screen side.

- Never hardcode `translateX(-100%)` / `translateX(100%)` as "forward" and "back."
  Instead branch on `document.dir` (or check `getComputedStyle(document.documentElement).direction`)
  and pick the sign accordingly, or define the offset as a CSS custom property that
  flips based on a `[dir="rtl"]` selector.
- Concretely: define `--slide-forward: -1` in a `:root` default and
  `--slide-forward: 1` under `[dir="rtl"]` (or vice versa, whichever matches the
  final visual direction you want), then use
  `transform: translateX(calc(var(--slide-forward) * 40px))` in the animation instead
  of a literal signed value. This way the same transition code is correct regardless
  of direction, matching the logical-properties principle from the general UI/UX
  skill for this project.

## Performance and restraint

- Animate `transform` and `opacity` only inside view-transition pseudo-elements and
  any custom keyframes — never `width`/`height`/`top`/`left`, which forces layout
  recalculation and causes jank, especially on lower-end tablets a child might use.
- Respect `prefers-reduced-motion`: wrap non-essential motion (bounce/overshoot,
  particle bursts) in `@media (prefers-reduced-motion: no-preference)` and fall back
  to a plain, fast cross-fade otherwise.
- Keep routine navigation transitions short (250–400ms). Only celebration/reward
  moments should run longer. A child tapping through several questions in a row will
  find a slow transition on every single tap tedious, not delightful.
- Guard against double-triggering: disable the "next" control immediately when a
  transition starts, and only re-enable it once `document.startViewTransition()`'s
  returned `.finished` promise resolves — kids tap rapidly and can queue up broken
  overlapping transitions otherwise.

## Working process for this skill

When implementing or modifying screen/question navigation:
1. State which transition recipe above applies to this specific navigation (forward,
   correct/incorrect, map-to-station, celebration) before writing code — don't default
   to a generic fade without considering which one fits.
2. If this navigation involves a themed background/station, check
   `docs/transition-registry.md`, design a motif distinct from every existing entry,
   and append it to the registry once implemented — do this even if not explicitly
   asked, per the section above.
3. Confirm the RTL-safe direction approach is used, not a hardcoded left/right value.
4. Include the `document.startViewTransition` feature check with a working fallback.
5. Mention in your reply whether/how the transition coordinates with the SoundManager
   (e.g. a whoosh or chime timed to the animation) — don't leave audio out silently if
   the project's audio system is already in place.
