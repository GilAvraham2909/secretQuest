# Transition registry

Tracks the round-to-round transition motif for each station, so a future
addition (by a person or by Claude) can check what already exists and pick
something visually distinct rather than reusing a motif. Read this file
before designing a new station's transition; append an entry after
building one.

**Sound**: `playRoundTransition()` plays a light local "pop"
(`SoundManager.playEffect('pop')` — synthesized client-side, no API call)
at the start of every transition. The user clarified their earlier "don't
generate sound without asking" concern was specifically about the Google
Cloud TTS API (this project's separate narration-manifest work, gated
behind explicit go-ahead) — local `SoundManager` effects are fine to add
freely, same as any other polish.

All transitions are built on `document.startViewTransition()`
(`js/juice/RoundTransition.js`), with a graceful instant-swap fallback for
browsers that don't support it. Each motif's decorative sprite/particle
layer is plain CSS `@keyframes` on absolutely-positioned elements — not
part of the View Transition snapshot itself, per the "confetti stays
outside the view transition" pattern. Every motif respects
`prefers-reduced-motion` (falls back to a quick, plain cross-fade with no
sprite) and uses RTL-safe direction via `html[dir]`-scoped CSS custom
properties, never a hardcoded `translateX` sign.

| Station | Scene theme | Motif | Core technique | Why it fits |
|---|---|---|---|---|
| `station-letters` | Treehouse library, night | An owl swoops in, grips the old question in its talons, and carries it off-screen; the new one drops into place as it exits | `view-transition-old(root)` scales/rotates as if gripped and dragged off along the owl's flight path; owl is a separate decorative sprite choreographed to match | A treehouse library at night suggests a wise night-bird messenger, not a "wipe" or "fade" — carrying something away is a literal library-adjacent action (returning a book) |
| `station-phonology` | Lake | A fish leaps at a point on screen; a circular ripple expands from that point and reveals the new question as it passes | `clip-path: circle()` on `view-transition-new(root)` animated from 0 to full radius, origin at the leap point | Water station → water-native reveal mechanic (a real ripple), not just "a fish flies across like anything else would" |
| `station-syllables-words` | Moonlit village | A soft fog bank rolls across the screen and clears, revealing the new question underneath; a small bat flits through it | Soft-edged `clip-path: inset()` or blurred-mask wipe sliding across `view-transition-new(root)`; bat sprite as decorative overlay | Night village → ground-level fog is the natural atmosphere, distinct from the lake's water-ripple and the treehouse's aerial carry |
| `station-arithmetic` | Candy-cloud path | A diagonal "candy wrapper" peels back across the screen, unwrapping to reveal the new question; a candy sprite bounces along the peel edge | `clip-path: polygon()` animated diagonally (a peeling triangle sweep), not a horizontal/vertical wipe | Candy theme → literal unwrapping is more specific than a generic slide; the diagonal peel-edge is visually distinct from every other wipe direction used elsewhere |
| `station-geometry` | Garden topiary | A fairy spins center-stage and a sparkle-dust burst radiates outward, revealing the new question as the sparkles clear | `clip-path: circle()` expanding from center (not from an edge point like phonology's), plus a radiating sparkle-particle ring | Garden/whimsical theme → magical burst; center-origin (not edge-origin) distinguishes this from phonology's edge-triggered ripple |
| `station-multiplication-prep` | Orchard | A shower of falling leaves/blossom petals swirls across the screen; old and new content cross-fade underneath as the shower passes | Multiple small petal-shaped divs, independently timed `@keyframes` fall+drift+rotate, layered over a plain cross-fade | Orchard → petals/leaves falling is the most orchard-specific visual available, and a multi-particle shower is a distinct technique from every single-sprite motif above |
| `station-reading-comprehension` | Storybook nook | The whole content panel does a literal 3D page-turn (like flipping a book page), old content on the back face, new on the front | Direct CSS 3D transform (`rotateY`, `backface-visibility: hidden`, `transform-style: preserve-3d`) on the round panel — deliberately NOT routed through `startViewTransition`, since a true page-flip needs both faces visible simultaneously mid-rotation, which doesn't compose cleanly with a View Transition cross-fade layer underneath | Storybook theme → turning a page is the single most on-the-nose motif possible; implemented as its own dedicated technique rather than forcing it through the shared clip-path/particle pattern, since the metaphor demands a genuinely different mechanism |

## Adding a new station/theme later

1. Read this table first — the "Core technique" column especially; don't
   reuse a clip-path shape or particle pattern already listed.
2. Design the motif from the theme's own setting/mood, not from a generic
   transition-effects checklist.
3. Implement via `js/juice/RoundTransition.js`'s `STATION_MOTIFS` config
   (or, if the motif genuinely doesn't fit the shared View Transition
   pattern — as reading-comprehension's page-flip didn't — a dedicated
   function, documented as such here).
4. Append a row to the table above.
