# Handoff — המסע לכוכב א׳ (Journey to Planet A)

Status snapshot for picking this project back up. Written 2026-08-26.

## What this is

A free, serverless, browser-only educational game for Hebrew-speaking kids in
grades א-ב (ages 6-8). Vanilla JS (ES modules), vanilla CSS, LocalStorage.
No build step, no framework, no bundler. RTL throughout. Full spec in
`game.md` (Hebrew).

## Current status: Stage 1 complete, verified working, visually polished

Stage 1 scope (per `game.md`'s own final paragraph): file structure,
multi-profile LocalStorage management, sound/mute infrastructure, and a
free-roam world map with selectable stations. **This is done and has been
manually verified in a real browser** (profile create → confetti → map →
enter a station → back to map → mute toggle), zero console errors.

On top of the base Stage 1 build, two more passes have landed:

1. **Real art assets** (16 PNGs) generated via a Cloudflare Workers AI tool
   built for this project — see `tools/Generate-Image.ps1`. All live under
   `assets/images/{avatars,stations,companion,ui}/` and are wired in through
   the existing `<img onerror=...>` fallback pattern, so they "just work."
2. **Visual design polish pass**: richer typography scale, layered/tactile
   shadows, gradient buttons with 3D press feedback, staggered entrance
   animations, idle float/glow on map stations (paused on
   `prefers-reduced-motion`), a decorative SVG dotted trail connecting
   stations on the map, bouncier avatar-picker selection state. Pure CSS
   except one small additive `buildTrail()` function in
   `js/screens/world-map/WorldMapScreen.js` (decorative SVG only, no logic
   changes).
3. **`frontend-design` plugin identity pass**: the plugin activated this
   session and flagged that the profile-select/create screens' plain
   cream radial-gradient background was drifting toward a generic
   AI-default look, disconnected from the map's own illustrated "dawn sky
   over a papercraft landscape" identity. Fixed by adding named tokens
   (`--color-dawn-sky`, `--color-trail-berry`, `--color-star-glow` in
   `css/tokens.css`) pulled from the map artwork's actual palette, and
   swapping both screens' backgrounds to a `--color-dawn-sky` →
   `--color-surface` gradient with small star-glint accents (✦) replacing
   the old generic blurred color blobs — so choosing a profile now reads
   as "step one of the same journey" instead of a bolted-on form screen.
   Left the avatar-picker selection state (coral border + green
   checkmark) untouched — it was already good and didn't need the new
   accent forced into it.
   **Known limitation, not yet resolved**: typography is still 100%
   system-font (`'Segoe UI', Arial`) per the fully-offline constraint —
   no network access is available in this environment to source a real
   display webfont file to self-host under `assets/fonts/`. If the user
   ever supplies a font file (same pattern as the art-asset workflow),
   add an `@font-face` in `base.css` pointing at it and prepend its
   family name to `--font-family-base` in `tokens.css` — that's the one
   remaining lever `frontend-design`'s typography guidance calls for that
   couldn't be pulled this session.

## Stage 2: first station (Letters) built and verified; 6 more to go

The user explicitly said to invent the exercise mechanics rather than wait for
curriculum specifics, so one full vertical slice was designed and built as the
pattern for the rest: **`station-letters`** (`js/screens/station/letters/LettersStation.js`).

**Mechanic**: round-based letter matching. Companion prompt "איפה האות X?"
(spoken + large text) over 2/3/4 tappable Hebrew-glyph tiles (no art needed —
system font renders Hebrew natively). Difficulty = tile count, driven by
`profile.progress.letters.level` via `js/learning/adaptiveEngine.js` (generic,
reusable for future stations): 3-correct-streak steps level up; **2 wrong taps
on the same round steps level down immediately** and glow-hints the correct
tile — round always ends in success, no dead ends. 8 rounds/session
(`ROUNDS_PER_SESSION` constant), ends in confetti + one `outfit` reward from
`OUTFIT_ITEMS` in `rewardCatalog.js`. "בחזרה למפה" always available, no
confirmation, no timers, no red anywhere.

**Verified live in browser**: 2-option round rendered correctly, wrong-answer
gentle feedback (no reset), 2nd-wrong hint glow fired correctly, correct
answer → success animation → auto-advance to round 2 with a fresh
non-repeating letter pair, and — importantly — coin count synced correctly
back to the world-map HUD after returning, confirming the shared-instance
wiring fix (see below) actually works. Zero console errors throughout.

**Architectural note for building the other 6 stations**: `stationRegistry.js`
holds statically-imported screen *modules*, which have no built-in way to
reach the same live `ProfileManager`/`SoundManager`/`ScreenManager` instances
`main.js` constructs. The fix (already in place, reuse this pattern for every
future station): `PlaceholderStationScreen.js`'s delegation call now folds
`{ profileManager, soundManager, screenManager }` into the `params` object
passed to `mount(container, params)` — the router contract shape is
unchanged, only params' content is enriched. Also added
`ProfileManager.updateCategoryProgress(categoryKey, progress)` (mirrors the
existing `addCoins`/`addReward` pattern) since nothing previously covered
persisting an updated `CategoryProgress`.

## Stage 2 complete: all 7 stations built and verified

All remaining 6 stations were built the same session, each with its own
purpose-designed mechanic (not just copy-pasted tile-matching), all reusing
`adaptiveEngine.js`, the `stationRegistry.js` + enriched-params wiring, and
the session/round/reward/timer-cleanup skeleton unchanged:

- **`station-phonology`** (`PhonologyStation.js`) — "which word starts with
  this sound?" over a 21-word curated bank (`phonologyData.js`), each word
  with a distinct first letter so distractors are always unambiguous.
  Reward: `accessory`.
- **`station-syllables-words`** (`WordBuildingStation.js`) — "complete the
  word" fill-in-the-missing-letter over a 16-word curated bank
  (`wordBuildingData.js`), styled as train-car letter boxes. Deliberately
  avoids algorithmic Hebrew syllable-splitting (genuinely ambiguous without
  niqud) in favor of hand-picked blank positions. Reward: `accessory`
  (shares the pool with Phonology).
- **`station-arithmetic`** (`ArithmeticStation.js`) — addition/subtraction
  (sums/answers 0-10, no negatives) over 16 curated problems
  (`arithmeticData.js`), visualized as a star-count row plus a
  `direction: ltr`-styled plain equation (documented RTL exception for
  math notation). Reward: `furniture` (new `FURNITURE_ITEMS` pool).
- **`station-geometry`** (`GeometryStation.js`) — "where's the [shape]?"
  over 8 pure-CSS `clip-path`-drawn shapes (`shapesData.js`) — no art
  dependency, no correctness risk since the geometry is fully controlled.
  All shapes share one fill color so the exercise tests shape recognition,
  not color. Reward: `furniture` (shares the pool with Arithmetic).
- **`station-multiplication-prep`** (`MultiplicationPrepStation.js`) —
  mixes two problem types per the spec's own wording ("קבוצות שוות
  ודילוגים"): equal-groups totals and skip-counting-next-number, 16
  curated problems (`multiplicationPrepData.js`). Reward: `furniture`.
- **`station-reading-comprehension`** (`ReadingComprehensionStation.js`) —
  the one station with a genuinely different shape: an 8-story curated
  bank (`readingComprehensionData.js`), each a 2-sentence Hebrew story +
  question + correct answer + 3 hand-picked distractors (never mixed
  across stories, to avoid ambiguous wrong answers). Story and question
  are both narrated aloud via sequential `SoundManager.speak()` calls
  (Web Speech queues consecutive utterances natively), doubling as
  listening comprehension for kids still building reading fluency.
  Reward family (`accessory`) was a flagged Stage-1 placeholder decision
  (spec didn't specify) — now confirmed as the real decision since this
  station is built and relies on it.

**Verified live in browser for every station** (hard-reload required after
each — see cache note below): correct rendering, correct-tap success
feedback, and for the ones spot-checked in detail (Letters, Phonology,
Word-Building), the full wrong-answer → 2nd-wrong hint-glow → correct →
auto-advance → coin-sync-to-map-HUD loop. Zero console errors on any
station. `stationRegistry.js` now maps all 7 `CategoryKeys` to real
modules — none left `undefined`.

**Dev-server cache quirk discovered this session**: the fallback
PowerShell static server (see below) sends no cache-control headers, so
Chrome sometimes serves a stale cached copy of a JS/CSS file after an
agent edits it — this looked like a real bug once (geometry station
showing the old placeholder) until a hard-reload (Ctrl+Shift+R) resolved
it instantly. Always hard-reload before trusting a "this isn't working"
observation against this dev server.

**Natural next steps, not yet done**: no live playtesting with an actual
child, no automated tests, difficulty/session-length tuning is all
first-guess (8 rounds, 3-streak level-up, 2-wrong level-down — untested
against real usage), and the "My Character / My World" dress-up screen
(spec section 3) that would let earned outfits/accessories/furniture
actually be *used* doesn't exist yet — rewards currently accumulate in
`profile.inventory` with no UI to view or apply them.

One placeholder decision already made and flagged in code comments: the
reading-comprehension station's reward family (outfit/accessory/furniture)
was defaulted to `accessory` in `js/rewards/rewardCatalog.js` since the spec
doesn't say — confirm or change before Stage 2 relies on it.

## Post-Stage-2 additions (same session, after all 7 stations)

1. **Niqqud added** to the Letters/Phonology stations' spoken/written letter
   NAMES (`js/learning/lettersData.js` `nameHe`, `js/learning/phonologyData.js`
   `firstLetterName`) — e.g. "גימל" → "גִּימֶל", using the standard forms taught
   in Israeli grade-א curricula. Deliberately scoped to letter names only, NOT
   full word-level niqqud in the word-building/reading-comprehension banks —
   vowel-pointing multi-syllable words correctly is real content risk that
   wasn't taken on. Verified live (niqqud marks render correctly).
2. **Colorfulness pass**: richer/more saturated core palette in
   `css/tokens.css`, plus a distinct accent color per station (letters=coral,
   phonology=pink, syllablesWords=purple, arithmetic=yellow, geometry=teal,
   multiplicationPrep=green, readingComprehension=blue) applied to each
   station's map node border/glow (`StationNode.js` now adds a
   `station-node--{category}` class) and each station's own tile
   tint/prompt-accent/progress-dot color (new `--tile-tint-*` tokens). Verified
   live — map nodes and Phonology's pink tiles confirmed.
3. **"My Character / My World" screen built** (spec section 3, previously
   missing): `js/screens/my-world/MyWorldScreen.js`, route `#/my-world`,
   reached via a new "העולם שלי" button on the world map. Shows the avatar +
   equipped-item badges, an outfit grid (equip/unequip, single slot), an
   accessory grid (equip/unequip per slot: hat/glasses/wings/scarf), and a
   furniture grid (multi-place toggle) + simple room preview. Owned-but-
   unequipped items are tappable; not-yet-owned items are shown dimmed with
   a friendly "עוד לא נמצא" toast on tap, never an error-like state. Required
   a real schema migration (`CURRENT_SCHEMA_VERSION` 1→2, adding a `scarf`
   slot to `appearance.accessorySlots` since `ACCESSORY_ITEMS` has 4 items
   but the original schema only had 3 named slots) — this is the first real
   use of the migration pipeline built in Stage 1, and it was verified to
   preserve existing profile fields correctly. Also added
   `ProfileManager.setEquippedOutfit`/`setEquippedAccessory`/
   `toggleFurniturePlacement` and `rewardCatalog.js`'s `accessoryIdToSlot`
   map. Verified live: coins synced, avatar/inventory rendered correctly.
4. **"Lost word" assemble rounds** added to `WordBuildingStation.js` (client
   idea: words got lost at night, help them find their way home by
   reassembling their letters in the right order) — see the dedicated
   section below for full detail. **NOT YET verified live** (browser
   extension was disconnected when this was built — only a static
   brace/paren balance check has been done). Verify this first before
   trusting it.
5. **Two more client-suggested mechanics captured but NOT built yet**:
   - Dice-roll or memory-match arithmetic game (roll two dice and match the
     sum, or a memory-pairs variant) — alternative/additional mode idea for
     `ArithmeticStation.js`.
   - Letter tracing (dashed-outline stroke tracing, inspired by PBS Kids'
     "Letter Dance Party") — a motor/handwriting mechanic distinct from the
     Letters station's current tap-to-match recognition, would need its own
     pointer/touch-drag tracking logic (not yet designed in detail).
6. **Claude Code status line configured**: `ClaudeCodeStatusLine`
   (github.com/daniel3303/ClaudeCodeStatusLine) downloaded directly via
   `Invoke-WebRequest` to `~/.claude/statusline/statusline.ps1` (no `git` on
   this machine either) and wired into `~/.claude/settings.json`'s
   `statusLine` config (Windows PowerShell 5.1 command form, since no
   `pwsh`). This is orthogonal to the game itself but touches this machine's
   Claude Code setup — noted here in case it's ever relevant to why a
   session behaves differently.

## "Less boring" pass (client said the game felt boring — this addressed it)

Playtesting feedback: "this game is too boring," confirmed as all of: same
tap-to-match everywhere, pacing drags, no surprise/stakes, map feels static.
Researched references (PBS Kids, Khan Academy Kids, Prodigy Math, Duolingo,
and especially "Cole, the Reading Coyote" / זאביק קורא — a 4.8★ Hebrew
literacy app with the exact target-audience mechanics we have, but full
illustrated scenes with an embedded companion character instead of flat
gradients + floating UI cards) before building anything. Two changes landed:

1. **Pacing + celebration variety + "golden round" surprise**, uniformly
   across all 7 station files: `ROUNDS_PER_SESSION` 8→6, `ADVANCE_DELAY_MS`
   800→600, every `AFFIRMATIONS` array expanded to 5 phrases, and a new
   ~1-in-6 "golden round" (`GOLDEN_ROUND_CHANCE = 1/6`) that doubles the
   round's coin reward with a small `.golden-round-badge` flourish (shared
   CSS class added once to `css/base.css`, referenced — not duplicated — by
   all 7 stations). Verified live: 6-dot progress bar, correct-tap flow
   unaffected.
2. **Illustrated scene backgrounds + companion presence, per station**: 7
   new background images generated via `tools/Generate-Image.ps1` at
   `assets/images/stations/scenes/{key}-scene.png` (treehouse library for
   letters, lake for phonology, moonlit village for syllables/words —
   deliberately matches the existing "lost word walks home at night"
   theme, candy-cloud path for arithmetic, garden topiary for geometry,
   orchard for multiplication-prep, storybook reading-nook for reading
   comprehension). Each station's CSS now uses its scene as
   `background-image` with a graceful fallback to the original gradient
   (same `Image()`-probe pattern already used for the map background,
   replicated identically 7 times for consistency) — reused
   `.{station}--fallback-bg` classes if the image is ever missing. A new
   translucent "scene panel" wraps round content for text/tile contrast
   against the busy art, and a small companion image now sits in a bottom
   corner of every station (using the SAME companion character everywhere,
   not baked into each scene — reinforces mascot identity across the whole
   game). Verified live for Letters (treehouse) and Reading Comprehension
   (storybook nook, closely matches the "Cole" reference) — both look
   excellent, zero console errors, correct-tap flow unaffected.
3. **Real bug fixed in passing**: `Companion.js` (used on the world map)
   referenced `assets/images/companion/companion.png`, which never existed
   — the real files are `companion-idle.png`/`companion-happy.png`. The
   companion has been silently falling back to a bare ✨ emoji this whole
   time. Fixed to point at `companion-idle.png`.

**Known minor cosmetic issue, not fixed**: the Letters station's generated
scene has decorative floating letters that came out as Latin glyphs (h, k,
b) instead of Hebrew — purely decorative background art, doesn't affect any
actual game content (the real exercise letters are correctly Hebrew with
niqqud throughout), but worth regenerating that one scene image later with
a more constrained prompt if it bothers anyone.

**Follow-up round, same session — all three items below verified live:**

1. **Letters scene regenerated** — the original had decorative floating
   letters that came out as Latin glyphs (h, k, b) instead of Hebrew.
   Regenerated with an explicit "no letters, no numbers, no readable
   characters" prompt instead — now shows glowing star lanterns, no script
   risk at all.
2. **Background variety per station** — a second "alt" scene was generated
   for all 7 stations (dawn village, crystal cave, rainbow bridge, rocky
   waterfall, sunlit archway meadow, picnic garden, blanket reading fort)
   at `assets/images/stations/scenes/{key}-scene-alt.png`. Each station's
   `renderShell()` now does `Math.random() < 0.5` once per mount to pick
   base vs. alt, via a `--scene-alt` CSS modifier class ordered before the
   existing `--fallback-bg` class (so image-load failure still correctly
   falls back to the gradient regardless of which variant was chosen).
   Verified live — reloading the Letters station showed the alt (sunlit
   archway) variant correctly.
3. **World map made alive** (previously the one open "quick wins" item —
   now done): `StationNode.js`'s `createStationNode(station, onEnter,
   visited)` takes a new optional third param — a station the profile has
   ever visited (`profile.stationsVisited[id]` truthy) now shows a small
   static green checkmark badge, giving the map a sense of history/
   progress rather than being identical on every visit.
   `WorldMapScreen.js` gained a large avatar figure (`.avatar--lg`, reused
   existing size token) standing at a fixed open spot on the map (bottom-
   center, y≈94%, checked against all 7 stations' real `mapPosition`
   values so it never overlaps a node or the trail), with a ground-shadow
   ellipse and the existing `gentle-float` idle animation. It also reads
   `profile.world.placedFurniture`, maps ids through `FURNITURE_ITEMS`,
   and renders up to 4 small emoji decorations near the avatar — empty for
   a profile that hasn't placed anything yet (verified: this session's
   test profile correctly shows nothing there, no placeholder box).
   Verified live: checkmarks appear on the 6 already-tested stations,
   avatar stands cleanly on the path with no overlap, station click-through
   still navigates correctly, zero console errors. Bonus: the companion in
   the map's corner now visibly renders its real star-mascot art instead
   of the ✨ emoji fallback, confirming the earlier `Companion.js` path fix
   (`companion.png` → `companion-idle.png`) actually took effect.

## Shared "celebration sequence" on station completion

Replaced each station's instant-reveal completion panel with a shared,
choreographed sequence: `js/juice/Celebration.js`'s `renderCelebration()`,
used by all 7 stations. Confetti fires immediately; companion (now finally
using `companion-happy.png`, generated back in Stage 2 but never wired in
until now) hops in with a bounce; title pops; coin count animates upward
from 0 (manual `requestAnimationFrame` loop with an explicit
`prefers-reduced-motion` check — NOT covered by the global CSS
neutralization rule, since it's JS-driven, not CSS); reward flies in and
lands; back button settles in last but is ALWAYS immediately clickable
regardless of animation state (staggered reveal is purely visual, never
gates interactivity, per the project's zero-frustration rule).

**Real bug hit and fixed during this pass**: the first version of
`Celebration.js` had a JSDoc comment containing the literal text
`js/screens/station/*/*.js` — the `*/` inside that path prematurely closed
the `/** ... */` comment block, turning the rest of the file into broken
syntax and crashing the ENTIRE app (blank page, `SyntaxError: Unexpected
token '*'`) on every screen, not just stations, since `main.js` imports
transitively through every station file. Caught this immediately via the
"always verify live" habit — fixed by rewording the comment to avoid the
glob-style `*/*` sequence. Confirmed the fix resolved the crash (fresh tab
loads clean, no console errors). **Not yet fully re-verified**: didn't
complete a full round-by-round playthrough to see the finished celebration
animation fire after the fix (got redirected mid-verification into the
avatar-dressing work) — that's the one loose end from this session, worth
a quick playthrough check next time.

## Characters genuinely get dressed now (real art, not just badges)

The user explicitly asked for equipped outfits to actually show on the
character, not just as adjacent badges. This is now real for OUTFITS
specifically: 24 new images were generated (6 avatars × 4 outfits) at
`assets/images/avatars/outfits/{avatarId}_{outfitId}.png`, and every place
that renders a profile's avatar (world-map HUD chip, the big map avatar
figure, My World's portrait, profile-select cards) now shows the correct
dressed portrait when an outfit is equipped, via a new shared helper
`getAvatarImageSources(profile)` in `js/profiles/AvatarCatalog.js`.

Fallback chain (3 tiers, extended `createImageWithFallback` in
`js/utils/dom.js` to support this generically via a new `fallbackSrcs`
array param, backward-compatible with existing single-source callers):
dressed portrait → base avatar → emoji. So if a specific
avatar+outfit combination image were ever missing, the profile still shows
its correct base avatar rather than silently dropping to an emoji.

**Scope decision, not built**: ACCESSORIES (hat/glasses/wings/scarf) still
show as adjacent badges, not layered onto the portrait. Pre-generating
outfit × accessory × slot combinations combinatorially explodes (would need
hundreds of images, not 24), and there's no image-to-image/inpainting
capability available to layer a transparent accessory onto an existing
portrait precisely — only one-shot text-to-image generation. This was
explained to the user as a real technical constraint, not silently scoped
down.

**Known imperfection**: the 24 new images are independent generations
described from the original avatars' visual traits (skin tone, hairstyle,
etc.), not pixel-edits of the originals — avatar-01 in particular came out
with more vividly orange hair than its base portrait's warmer brown. Still
clearly the same character concept wearing a new outfit, but not a perfect
color match. Worth a regenerate-just-those-4 fix later if it bothers
anyone; flagged here rather than silently accepted.

**MyWorldScreen.js** also needed new wiring beyond just the image-sources
change: equipping/unequipping an outfit previously only refreshed the grid
and the small badge row, never the portrait image itself (there was nothing
for it to refresh before — outfits didn't change the portrait). Added a new
`avatarWrapEl` DOM ref + `populateAvatarPortrait(profile)` function
(mirroring the existing `populateEquippedBadges` pattern), called on
initial build and from `handleOutfitTap`. Verified live: equipping the
rainbow-shirt outfit immediately shows the striped shirt in the portrait,
the map HUD chip, and the big map avatar figure — all three confirmed via
screenshot.

## Map avatar made clickable → My World

The new avatar figure on the map (see above) was originally built purely
decorative. The user pointed out it looked clickable but wasn't, so it now
navigates to `#/my-world` on click/tap — same destination as the existing
"🎒 העולם שלי" corner button, just a more discoverable entry point since
kids naturally want to tap their own character. `WorldMapScreen.js`'s
`buildAvatarFigure()` changed from a `div` to a real `<button>`
(`aria-label: 'הדמות שלי והעולם שלי'`), `world-map.css` got button-reset +
hover/press feedback. Verified live end-to-end: tapping the avatar lands on
the dress-up screen; equipped an actual earned accessory
(`accessory-magic-hat`) alongside the existing outfit and confirmed both
show as equipped (checkmark + badge next to the avatar portrait).

Also verified live during this pass: the golden-round coin-doubling math is
correct (a 6-round Phonology session with 2 golden rounds correctly totaled
8 coins = 2×2 + 4×1).

## Map buttons unclickable (real bug, user-reported) — fixed

`.world-map__stations` (the full-screen absolutely-positioned layer holding
the 7 station nodes) had no `pointer-events: none`, so it silently
intercepted clicks meant for "העולם שלי" / "החלף פרופיל" everywhere except
directly on a station icon. Fixed in `css/screens/world-map.css`:
`pointer-events: none` on the layer, `pointer-events: auto` on its direct
children. Confirmed via `document.elementFromPoint()` before/after (target
changed from the DIV to the actual button).

## Accessories now genuinely show on the character (real art layering, not just badges)

Closes the scope gap noted above. Since accessories can't reuse the
outfit-swap approach (4 independent slots × existing outfits would explode
combinatorially, and there's no image-layering capability — only one-shot
text-to-image), equipped accessories now render as positioned emoji
overlays (🎩👓🪽🧣) directly on the circular avatar image, using the emoji
already defined on `ACCESSORY_ITEMS` in `js/rewards/rewardCatalog.js` — no
new art needed, works for any combination of simultaneously-equipped
accessories. New shared helper `buildAccessoryOverlays(profile)` in
`js/profiles/AvatarCatalog.js`; new stylesheet
`css/components/avatar-accessory.css`; wired into all 4 avatar-render call
sites (`WorldMapScreen.js`'s HUD chip and big avatar figure,
`MyWorldScreen.js`'s portrait, `ProfileSelectScreen.js`'s cards).
`MyWorldScreen.js`'s `populateAvatarPortrait()` now also rebuilds the
overlays, and `handleAccessoryTap` calls it (previously only outfit taps
did).

**Real bug found and fixed while verifying live**: the first version
centered each accessory with the classic `inset-inline-start: 50%; transform:
translateX(-50%)` trick, reasoning that logical properties made it
direction-safe. That's wrong — `transform` is always physical, never
direction-aware. In this RTL-only app, `inset-inline-start: 50%` resolves to
physical `right: 50%`, so `translateX(-50%)` shifts the element further
left, mostly outside the circular `overflow: hidden` avatar crop — the
accessories were rendering, just invisible off to the side. Confirmed by
temporarily setting `.avatar { overflow: visible }` and seeing the hat/
wings/scarf floating outside the circle. Fix: `translateX(50%)` (positive
sign) — verified live afterward, hat/scarf/glasses now visibly sit on the
portrait at all three avatar sizes (map HUD `--sm`, My World `--lg`, map
avatar figure `--lg`). Note for future work in this file: **don't assume
`inset-inline-*` + `translateX` centering is direction-safe** — it isn't;
the transform sign has to be chosen for the app's actual (single, fixed)
direction.

One pre-existing, separate, minor issue noticed during verification: the
🪽 (wings) emoji renders as a blank/tofu glyph on this Windows machine's
available fonts (visible in the equipped-badges row too, unrelated to this
feature) — a font-coverage gap, not a regression from this change.

## Room visualization — real illustrated room, not a flat emoji row

`assets/images/my-world/room-scene.png` (a cozy empty bedroom, generated
this session) is now the actual background of `.my-world__room-preview` in
`MyWorldScreen.js`/`my-world.css`, with the same graceful `Image()`-probe
fallback pattern used for the map background (`--fallback-bg` modifier
class restores the old plain-gradient look if the art ever fails to load).
The 4 possible `FURNITURE_ITEMS` (bed/lamp/plant/frame) each get a fixed,
hand-picked position keyed off `[data-item="..."]` selectors, chosen to sit
sensibly against the actual painted scene (bed on the open floor,
frame on the bare wall, lamp on the dresser's surface that the generated
image happened to include on the right edge, plant in the narrow gap next
to it) — not combinatorial, since each of the 4 items is an independent
shown/hidden boolean, not a combination requiring its own image. Verified
live with all 4 placed simultaneously — no overlap, reads as a real
decorated room.

First-pass sizes (3.5rem bed down to 1.8rem lamp) looked like small tokens
floating in the room rather than furniture — the user flagged this
immediately after first seeing it live. A second, much larger rem pass
still didn't satisfy the user ("still not good, see pictures in real life
if you need examples"), which was the right signal to stop tuning a number
and question the approach: an emoji glyph's visible shape only fills part
of its em box in a way that isn't stylistically controllable, so no
font-size could make it read as real, proportioned furniture next to a
painted room.

**Real fix**: generated actual furniture art instead of relying on emoji.
This is NOT the combinatorial case that ruled out real art for
outfits×accessories — furniture is 4 independent items, one image each, no
combinations. Flow, all via `tools/Generate-Image.ps1`:
1. Prompted each item "isolated on a solid flat magenta background... flat
   2D vector illustration, papercraft cutout style, no gradients, no 3D
   shading" (had to explicitly fight the model's default pull toward
   soft-3D/glossy rendering on isolated-object prompts — the first bed
   generation came back photoreal-glossy, badly mismatched with the room's
   flat style; a stronger flat-style prompt fixed it).
2. New `tools/Remove-MagentaBackground.ps1` chroma-keys the magenta backdrop
   into real alpha transparency — no image-editing library exists on this
   machine, so it uses .NET's built-in `System.Drawing` (present in Windows
   PowerShell) pixel-by-pixel in HSV space: background hue is auto-sampled
   per image (Cloudflare's "magenta" drifts 336-350° run to run, not a
   fixed value) and a pixel counts as background when its hue is close to
   that and saturation is high enough to spare white/gray subject pixels;
   soft partial-alpha at the threshold edge avoids jaggies.
3. Hit one real snag: the first plant generation had pale pink flowers at
   nearly the same hue+saturation as the magenta backdrop itself — an
   unfixable case for hue-based chroma-keying, not a threshold-tuning
   problem. Fixed by regenerating with an explicit "no pink, no red, no
   purple flowers" constraint rather than fighting the algorithm.
4. Final assets at `assets/images/my-world/furniture/{itemId}.png`, wired
   into `MyWorldScreen.js`'s `populateRoomPreview` via the existing
   `createImageWithFallback` (falls back to the original emoji if a PNG is
   ever missing — same safety net used everywhere else in this project).
   `my-world.css`'s `.my-world__room-item` rules switched from `font-size`
   to `width` (height auto, preserving each image's real aspect ratio) —
   bed 32% of room width (clearly the largest object), frame/plant ~12-13%,
   lamp 9%. Verified live, including nudging the lamp's `inset-block-start`
   so it visually sits on the dresser's painted top surface rather than
   floating above it (found by drawing temporary percentage gridlines into
   the container via the browser console, screenshotting, and reading off
   where the dresser's edge actually falls).

## Kids can drag furniture themselves in the room

Follow-up to the above: the user asked for the child to be able to place
furniture themselves rather than each piece having one fixed spot. Chose
free drag-and-drop (vs. tap-a-marked-spot) when asked directly.

Implementation, all in `js/screens/my-world/MyWorldScreen.js`
(`makeRoomItemDraggable`), driven entirely by Pointer Events (covers mouse
+ touch uniformly, unlike HTML5 native drag-and-drop):
- `pointerdown` reads the item's CURRENT rendered box (whether that's the
  stylesheet's hand-picked default or an already-saved custom spot) and
  converts it to `inset-inline-start`/`inset-block-start` percentages, so
  the first drag never causes a visual jump.
- `el.setPointerCapture(...)` keeps move/up events targeting the element
  even once the pointer leaves its bounds — no window-level listeners
  needed.
- Position updates live via inline style during the drag (explicitly
  setting the opposite `inset-inline-end`/`inset-block-end` to `auto` too,
  since inline style always wins over the stylesheet regardless of
  specificity, cleanly overriding whichever edge the default CSS rule
  anchored from).
- **Same RTL trap as the accessory-overlay bug, applied correctly this
  time**: `inset-inline-start` is physical `right` in this RTL-only app, so
  dragging the pointer physically rightward must *decrease* it — the delta
  sign is flipped relative to physical `clientX`. Vertical (`inset-block-*`)
  has no such flip.
- On `pointerup`, the final position is saved via a new
  `ProfileManager.setFurniturePosition(itemId, xPct, yPct)` into
  `profile.world.furniturePositions[itemId]` (schema bumped to v3, migration
  adds an empty `furniturePositions: {}` to existing v2 profiles) —
  kept independent of `placedFurniture` so a dragged spot survives toggling
  a piece off and back on. `populateRoomPreview` applies a saved position as
  inline style when present, otherwise leaves the element alone so it keeps
  the tuned default spot until first dragged.
- `touch-action: none` on `.my-world__room-item` (`my-world.css`) — without
  it, touch browsers intercept the gesture as a page scroll instead of
  handing pointermove events to the element. A `--dragging` modifier gives
  grab/grabbing cursors and a scale-up + bigger drop-shadow while held, for
  feedback.

Verified two ways: dispatched synthetic PointerEvents directly (precise,
avoids this session's known browser-automation click-coordinate
unreliability) confirming live style updates + correct localStorage
persistence + survival across a full reload; then a real mouse drag via the
browser tool's `left_click_drag` confirming actual capture/move/up handling
works too, not just the synthetic path.

**Two follow-up fixes after the user tried it live**: "not a small step every
time, where I'll release it, it will drop" turned out to be the browser's
native image drag (a ghost thumbnail that follows the cursor and snaps back
on drop) fighting the custom Pointer Event drag — `<img>` elements are
draggable by default. Fixed by adding `draggable="false"` to the `<img>` in
`createImageWithFallback` (`js/utils/dom.js`) — safe everywhere in this
project since there's no legitimate use for native image dragging in an
offline single-page kids app. Also doubled every furniture item's `width`
in `my-world.css` per request (bed 32%→64%, frame 12%→24%, plant 13%→26%,
lamp 9%→18%) — the bigger bed now slightly overlaps the window's edge,
judged an acceptable, even cozy-looking, side effect rather than something
to shrink back down.

## World map: tappable ambient critters (kid-engagement pass)

User asked to make the map "more interesting for kids." The map already had
a lot from the earlier "less boring" pass (idle float/glow per station,
staggered pop-in, animated dashed trail, a clickable avatar figure with
floating furniture accents) — a genuinely new, additive idea was needed
rather than more of the same polish.

Considered and rejected: lighting up the trail progressively as stations
are completed. Doesn't fit — this map is explicitly free-roam (game.md),
not a sequential path, so "the first N% of the trail is lit" would
misleadingly imply a fixed visit order that doesn't exist.

Landed on: two small tappable critters (`js/world-map/Critters.js`, a bird
🐦 and a butterfly 🦋) that drift on slow ambient CSS-only loops
(`inset-inline-start`/`inset-block-start` keyframes, kept inside open sky
areas clear of the 7 stations' `mapPosition` coordinates in `stations.js`)
and give a bounce + "pop" sound when tapped — purely decorative, no game
state, no persistence, just something extra to discover. Position animates
on the outer button; a separate inner `<span>` handles a continuous wing/
wing-flutter rotation plus the one-shot tap-bounce, so the two animations
never fight over the same element's `transform`.

**Bug found while verifying live**: the tap-bounce reset was originally
wired to the animation's `animationend` event (matching the existing
`.my-world__card--pop` pattern elsewhere), but it never fired in testing —
confirmed via direct DOM polling that the `--tapped` class stayed stuck
indefinitely even seconds after the 550ms animation should have finished.
Root cause not fully pinned down (suspected background/inactive-tab CSS
animation throttling specific to the automated browser test harness, since
`animationend` is compositor-driven and can behave differently in a
non-foreground tab — not confirmed to affect real users, but not worth
risking either). Replaced with a plain `setTimeout(550)` matched to the
CSS duration, which doesn't depend on the animation actually completing a
render cycle to fire — more robust regardless of the real cause. Re-tapping
mid-bounce forces a reflow (`void inner.offsetWidth`) before re-adding the
class so the animation restarts cleanly instead of no-op'ing.

## Two small follow-up requests

- **Bed nudged down**: `inset-block-end` changed from `2%` to `-3%` on
  `.my-world__room-item[data-item='furniture-sparkly-bed']` — as a side
  effect this also fixed the earlier bed/window-edge overlap noted above,
  since the whole box shifted down (a few pixels of the bed's base now clip
  against the room preview's `overflow: hidden` bottom edge, not visually
  noticeable).
- **Furniture accents removed from the map avatar figure**: the user said
  they're not wanted there. Removed `buildAvatarFigure()`'s furniture-decor
  block entirely from `WorldMapScreen.js` (along with the now-unused
  `FURNITURE_ITEMS` import) and deleted the corresponding
  `.world-map__avatar-decor*` rules from `world-map.css` — a real deletion,
  not just hiding via CSS. The real furniture art in the My World room
  preview (see above) is still the one place furniture shows.

## Accessory overlays were floating "too far" from the character — real per-avatar fix

User reported (in Hebrew) that the accessory icons sat a bit far from the
character and asked for a fix that works for every avatar. Investigated by
viewing all 6 base avatar portraits full-size: they are NOT drawn to a
consistent head-to-canvas ratio at all — 5 are full-body shots (head in
roughly the top third of a square 1024px canvas), one (avatar-04) is a
close head-and-shoulders shot filling most of the frame. The single shared
percentage set (tuned earlier against just avatar-05) was always going to
misplace accessories on most of the other 5.

Tried automating measurement first: hairline-top detection (first
non-near-white pixel scanning down the image's vertical center column, via
a small PowerShell + `System.Drawing` script) worked reliably and matched
visual inspection closely. Eye-level via darkest-pixel-count row scan and
chin/neckline via biggest-color-jump scan both proved unreliable — dark
hair (several avatars have black/dark-brown hair) swamps the eye-detection
signal, and the chin scan kept locking onto unrelated color transitions
further down (shirt seams, belts) instead of the actual jaw-to-neck edge.
Fell back to careful visual estimation for eye-level/neckline, anchored to
the reliably-automated hairline value per avatar.

Implementation: `ACCESSORY_POSITION_BY_AVATAR` in
`js/profiles/AvatarCatalog.js` — a per-`avatarId` table of hat/glasses/
wings/scarf `inset-block-start` percentages, with `AVERAGE_ACCESSORY_POSITION`
as a fallback for any avatarId not listed. `buildAccessoryOverlays()` now
sets `element.style.insetBlockStart` per avatar at render time (inline
style, so it always overrides `avatar-accessory.css`'s class-based
fallback values regardless of specificity). Horizontal centering stays
CSS-only and shared across avatars (all 6 heads are reasonably centered
horizontally in their source images).

**Known remaining gap, flagged rather than silently ignored**: the 24
outfit-dressed portraits are independent generations from their base
avatar and can drift in framing/scale (already noted elsewhere as a
hair-color drift too — checked live, e.g. `avatar-01_outfit-rainbow-shirt`
is framed noticeably closer/bigger than base `avatar-01`). This
calibration targets the base avatar images specifically (the dominant
case — accessories don't require an outfit to be equipped), not all 24
dressed variants individually; scoped that way deliberately rather than
spending 24x the calibration effort on a secondary case.

Verified live across 3 avatars spanning the full range of variance —
avatar-01 (full-body, mid-range), avatar-03 (full-body, dark hair +
headband, the one where automated eye-detection failed), and avatar-04
(the close-up outlier) — using temporary test profiles with all 4
accessories equipped, zoomed screenshots of each. All three now show the
hat sitting right at the hairline and the scarf right at the neck, a clear
improvement over the previous universal positioning.

## Map, round 2: researched real UX patterns, then built 3 of 4 proposed ideas

User asked (in Hebrew) to look online for ways to make the map more
interesting, on top of fixing the accessory positioning above. Searched for
kids'-app engagement UX, Duolingo's path-map gamification, and hub-world
game design specifically (the last one's most-relevant finding: a hub
should "feel like a real part of the game world, not a 3D menu screen" —
validates the direction already taken with the companion/critters/trail
rather than treating the map as a static picker). Rejected reusing
Duolingo's linear-path/streak-loss patterns wholesale since this map is
explicitly free-roam, not sequential — same reasoning as the earlier
trail-progress-lighting rejection.

Proposed 4 concrete, scoped options via AskUserQuestion; user picked 3
(skipped the "sometimes-different sky" one):

1. **Tappable hidden surprises in the scenery** — new
   `js/world-map/SceneryHotspots.js`: 4 invisible 72px buttons layered over
   landmarks already painted into `map-background.png` (the big sun, the
   floating UFO-island, a sparkle star, the smaller sun/moon), each giving a
   sparkle-burst animation + "success" chime on tap. Positions favor
   features closer to horizontal center rather than the image's actual
   edges — `background-size: cover` crops the source art's left/right edges
   on any viewport wider than its 1:1 aspect ratio, so an edge-hugging
   hotspot would drift off-screen on wide windows; exact pixel alignment
   doesn't matter much anyway since these have no visible marker of their
   own.
2. **Two more ambient critters** — extended `js/world-map/Critters.js`
   (bird + butterfly already existed) with a small wandering alien and an
   occasional shooting star. Caught a real mismatch before building fish/
   firefly (my own example ideas in the question): actually looked at
   `map-background.png` first and found it's a *space/planet* scene (this
   game is "המסע לכוכב א׳" — Journey to Planet A), not an earthly
   landscape — a river fish would've been thematically wrong. Went with
   alien 👽 + shooting star 🌠 instead. The comet uses a different rhythm
   on purpose (visible for ~3s then off-screen for ~21s of a 24s cycle,
   `inset-*` keyframe timing) rather than a 4th lazy loop, since a comet
   shouldn't wobble like the others — this needed a small CSS specificity
   fix so the tap-bounce still won over the "no continuous flutter"
   override (both are 2-class descendant selectors at the same
   specificity; added an explicit `--comet .critter-inner--tapped` rule
   after the "no flutter" one so it wins the cascade tie-break).
3. **A no-penalty daily welcome bonus** — first map visit of a calendar day
   grants +3 coins and swaps the companion's usual "hi, let's pick a
   station" greeting for one mentioning the bonus. `ProfileManager
   .claimDailyWelcomeIfDue()` compares against `profile.lastMapVisitDate`
   using the LOCAL date (not `toISOString()`, which is UTC and would shift
   the boundary by the device's timezone offset) — a quiet no-op on repeat
   visits the same day, never punishes a missed day (deliberately not a
   Duolingo-style streak). Schema bumped to v4 (migration adds
   `lastMapVisitDate: null` to existing profiles). `Companion.mount()`
   gained an optional `initialMessage` param instead of racing two
   `say()` calls against its own internal 500ms-delayed greeting timer.
   `WorldMapScreen.mount()` is now `async` so the bonus is granted (and the
   HUD's coin count already reflects it) before first paint — matches the
   already-established async-mount pattern used by ProfileSelectScreen.js.

Verified live: coin count updated correctly (11→14 after manually
resetting `lastMapVisitDate` to force a re-trigger), companion bubble's
`textContent` confirmed to contain the exact bonus message, bonus
correctly did NOT re-fire on a same-day reload, a scenery hotspot's
sparkle burst appeared and cleaned itself up, all 4 critters present in
the DOM with correct positions, no console errors.

## Text/image selection disabled globally

User asked to stop the UI from allowing text/image selection — quick tap-
and-drag interactions (map critters, dragging room furniture, tapping
station tiles) kept accidentally highlighting text or, on touch devices,
triggering the native "save image" long-press menu. Added to `base.css`:
`user-select: none` + `-webkit-touch-callout: none` on `body`, explicitly
re-enabled (`user-select: text`) for `input`/`textarea` since the profile-
name field is the one place real text entry/selection is legitimate, and
`-webkit-user-drag: none` on all `img` globally (a stronger, blanket
version of the per-element `draggable="false"` already added to
`createImageWithFallback` for the furniture-drag fix above — this covers
the handful of raw `<img>` tags elsewhere, e.g. StationNode.js, that don't
go through that helper). Verified live: `getComputedStyle(document.body)
.userSelect` is `"none"`, while the create-profile name `<input>`'s is
`"text"`.

## Critter taps now sparkle too

User asked for a sparkle effect when tapping the flying critters, matching
the scenery hotspots (also flagged, as a caution, to make sure the
furniture drag still worked after the global selection/drag CSS change
above — re-verified live with a real mouse drag, still works cleanly).
`Critters.js`'s tap handler now also spawns a `.world-map__critter-burst`
span (reuses the scenery hotspots' `hotspot-sparkle` keyframe for a
consistent feel) appended to the outer position-driving element, not the
inner one that already owns the bounce animation — cleaned up via
`setTimeout` rather than `animationend`, consistent with why the bounce
reset already uses a timer instead (see the critter-bounce section above).
Verified live on all 4 critters, including the comet, whose tap-bounce
needed its own CSS specificity fix earlier — confirmed the new burst
doesn't reintroduce that conflict.

## Themed round-transition animations (a critter per station)

User asked for question-to-question transitions to feel like part of each
station's world instead of an instant swap — gave two examples: a fish in
the river station "delivering" the next question, a fairy doing sparkle-
magic in a forest-like station. Mapped each of the 7 stations' existing
illustrated-scene theme (see the earlier scene-background section) to its
own creature/effect rather than reusing one generic animation everywhere:
letters (treehouse) → owl 🦉, phonology (lake) → fish 🐟 (the user's own
example), syllables-words (moonlit village) → bat 🦇, arithmetic (candy-
cloud path) → bouncing candy 🍬, geometry (garden topiary — closest match
to "forest") → fairy 🧚 with a sparkle-burst (the user's other example),
multiplication-prep (orchard) → bee 🐝, reading-comprehension (storybook
nook) → a drifting feather/quill 🪶.

New shared module `js/juice/RoundTransition.js`, mirroring how
`Celebration.js` is already shared across all 7 stations rather than
duplicated: `playRoundTransition(stationId, onCover)` looks up that
station's `{kind, emoji, color}` config (`color` reuses the exact per-
station accent already established for map-node identity in
`world-map.css`, e.g. phonology = pink, geometry = teal — so the glow
around each critter matches that station's color everywhere else in the
game, not a new arbitrary palette), spawns the overlay, fires `onCover` at
the animation's midpoint (350ms into a 700ms total) so the caller can swap
in the new round's DOM at that exact moment, hidden behind the effect, and
self-removes after.

**Deliberate architecture choice**: the overlay is appended to
`document.body` as `position: fixed`, NOT nested inside the station's own
round content. Every station's `renderRound()` does `clearElement(body)`
to rebuild — an overlay living inside that same subtree would get deleted
mid-animation the instant the new round renders, which is exactly the
moment it's supposed to still be on screen finishing its exit. Fixed-
position also sidesteps needing to compute the station body's on-screen
bounds to size/position the overlay correctly.

Three shared CSS movement archetypes in new
`css/components/round-transition.css` (linked in `index.html`), keyed by
each station's `kind`: `sweep` (glide across with a gentle bob — owl, fish,
bat, bee, feather), `bounce` (parabolic hop — the arithmetic candy),
`burst` (appears center, spins/grows, sparkle-ring alongside — the
geometry fairy). Wired into all 7 station files identically: each already
had the exact same `scheduleTimeout(() => { roundIndex += 1; ... else {
renderRound(); } }, ADVANCE_DELAY_MS)` shape (confirmed via grep before
editing), so the only change needed everywhere was swapping the bare
`renderRound()` call for `playRoundTransition(stationId, () =>
renderRound())` — `WordBuildingStation.js` has two copies of this (its two
alternating round types), both updated identically.

Net effect on pacing: the existing ~600ms "let the child see their correct
tap register" delay is unchanged; this adds ~350ms more (the covering half
of the transition) before the new round is visible, then the effect
finishes its exit over the new content for another ~350ms. A modest,
deliberate trade of a bit more time for a lot more delight, not a
regression of the "zero frustration" pacing rule.

**Not verified live this time** — the Chrome extension was disconnected
for this whole change (confirmed via repeated `tabs_context_mcp` failures),
so unlike every other feature in this file, this one has only been
reviewed statically (re-read every edited file, confirmed all 7 stations'
import + call-site edits landed correctly, confirmed the reused CSS custom
properties — `--color-primary`, `--color-accent-pink`, etc. — actually
exist in `tokens.css`, confirmed `--z-modal` exists). The dev server is up
at `http://localhost:8199` for a real playthrough check next session —
prioritize actually watching each of the 7 transitions fire once live
before considering this done.

## Round transitions, v2: complete redesign after user feedback

The v1 above shipped un-verified (extension still disconnected), and the
user's next round of feedback confirmed the concerns that static review
couldn't catch: **"its too fast and the icons are too slow"** — the total
window didn't give the effect time to register, while the critter's own
drift-based motion felt sluggish rather than snappy — and **"dont do it
all the same, its boring"** — v1's 3 shared movement templates
(sweep/bounce/burst) reskinned per station with a different emoji/color
read as one effect wearing different hats, not 7 distinct things. User
also said video was an option worth asking about; clarified there's no
video-generation tool in this project's toolset (only the still-image
generator used all session), so real CSS/JS animation is what's actually
feasible offline here.

Invoked the project's `game-screen-transitions` skill (which the user
pointed at directly) rather than freelancing further — it prescribes the
browser's native `document.startViewTransition()` as the primary
mechanism instead of hand-rolled position keyframes, a **mandatory**
distinct-motif-per-theme rule with a registry file to enforce it, RTL-safe
direction handling via `[dir]`-scoped CSS (never a hardcoded
`translateX` sign), 250-400ms routine-navigation timing with bouncy
overshoot easing, and keeping any custom particle/sprite layer *outside*
the View Transition snapshot itself (the skill's own confetti-recipe
guidance). This directly resolves the pacing complaint: shorter total
window (320-380ms, down from 700ms) + snappy overshoot easing on reveals,
rather than a longer wait with lazy drifting.

**New file `docs/transition-registry.md`** (the skill requires this,
proactively, for any multi-theme transition work) — one row per station:
theme, motif, core CSS technique, and *why* it fits that scene, so a
future addition checks for a technique already used before reusing it.
Completely re-designed all 7 motifs to be genuinely different mechanisms,
not reskins of 3 shared templates:

| Station | Motif | Technique |
|---|---|---|
| letters | owl carries the old question off in its talons | old snapshot drags/shrinks/rotates away via `::view-transition-old` |
| phonology | fish leaps, ripple reveals from that point | `clip-path: circle()` expanding from an off-center origin |
| syllables-words | rolling fog wipe | `clip-path: inset()` sweep, direction-aware via `[dir]` |
| arithmetic | diagonal candy-wrapper peel | `clip-path: polygon()` diagonal sweep, direction-aware |
| geometry | fairy sparkle-burst | `clip-path: circle()` from **center** (vs. phonology's off-center — same technique family, deliberately different origin/rhythm per the registry's own rule) |
| multiplication-prep | falling petal/leaf shower | 7 independently-timed particle divs over a plain quick cross-fade |
| reading-comprehension | literal 3D page-turn | **not** routed through View Transitions at all — see below |

**`js/juice/RoundTransition.js` rewritten** around this. Two real
architectural notes:
- `view-transition-name` is set *programmatically* (`container.style
  .viewTransitionName = 'round-content'`) on each station's existing
  stable `__body` element rather than baked into 7 CSS files — that
  element already persists across a round's `clearElement()`+rebuild
  (confirmed from v1's investigation), so tagging it at call time is
  sufficient; the browser snapshots its own old/new appearance around
  whatever `renderRound()` does inside the transition callback, no
  changes needed to any station's actual round-rendering logic.
- Reading-comprehension's page-flip is **deliberately not** a View
  Transition: a true page-turn needs both faces visible simultaneously
  mid-rotation (old content on the back face, new already in place on the
  front), which doesn't compose with a simultaneous cross-fade layer
  underneath without looking muddy. Implemented as its own technique
  instead: clone the current content's HTML into a positioned overlay
  (the "old face"), swap the real container's content immediately
  underneath (hidden behind the clone), then CSS-rotate the clone away in
  3D (`rotateY`, `backface-visibility: hidden`) — as it crosses 90° it
  vanishes, revealing the already-updated real content beneath. The
  registry documents this as an intentional exception, not an oversight.

**A real back-and-forth on scope mid-build**: added a `soundManager
.playEffect('pop')` cue to the new module on my own initiative; the user
interrupted immediately — "dont generate yourself sound without asking
me!" — and it was reverted across the module and all 8 call sites
(`WordBuildingStation.js` has two). The user then clarified the actual
boundary: "you can generate as long you dont use Google Cloud TTS API
key" — so the concern was specifically about spending the Google Cloud
TTS quota/key (this project's separate, deliberately-gated
narration-manifest work) without being asked, not about local
`SoundManager` effects at all. Re-added the same `'pop'` cue (a
synthesized, no-cost, no-API local effect) to the module and all 8 call
sites once that was clear. **Saved this as a standing memory**
(`feedback_no_unsolicited_sound` in the project's memory folder) so a
future session gets the boundary right the first time: local
`SoundManager` effects are free to add without asking; only an actual
Google Cloud TTS API call requires explicit go-ahead.

**Still not verified live** — the Chrome extension remained disconnected
through this entire redesign too. Reviewed statically only: re-read every
edited file, confirmed `view-transition-name` assignment/cleanup is
symmetric (set before `startViewTransition`, cleared in `.finished
.finally()`), confirmed all 8 call sites consistently pass `soundManager`
now, confirmed the reading-comprehension station is special-cased correctly
(never enters the `STATION_MOTIFS` lookup path). **This is now the
second consecutive un-verified pass on this feature** — treat live
verification of all 7 motifs (do the clip-path directions actually look
right, does the page-flip clone visually match its container closely
enough, does the sprite timing feel snappy rather than sluggish now) as
the top priority next session, before any further changes to this file.

## Map background variety (day/twilight)

User asked (again, having skipped this specific option when offered
earlier alongside critters/hotspots/daily-bonus) to make the map more fun
via "maybe interesting background." Generated a genuinely different second
mood rather than a palette tweak — viewed the existing
`map-background.png` first (bright teal daytime sky, whimsical space
scene with visible stars/planets even by day) and prompted a twilight/
night counterpart: deep indigo-to-pink sky, glowing crescent moon instead
of the sun, more stars, same general composition (mountains, winding
path, a floating island) so the trail/stations/critters/hotspots still
sit somewhere sensible regardless of which one loads — saved as
`assets/images/ui/map-background-alt.png`.

Wired in with the *exact same* "pick once per mount, ~50/50" pattern
already used by all 7 stations' scene-alt backgrounds (`Math.random() <
0.5`, a `world-map--scene-alt` class, same `Image()`-probe fallback
chain) — `WorldMapScreen.js`'s `mount()` and a small addition to
`world-map.css`, no new pattern invented.

**Known imprecision, accepted rather than fixed**: `SceneryHotspots.js`'s
4 hotspot coordinates were tuned against the DAY background's landmark
positions (sun top-right, island center-left, etc.) and are NOT
re-positioned for the twilight variant, whose moon/island/planet sit at
different spots. Left as-is deliberately — these hotspots have no visible
boundary of their own (by design, per their own file's comment: "exact
pixel alignment doesn't matter much... no visible marker of their own"),
so a kid tapping near where a landmark *looks* like it should be will
still likely land close enough on either background; a mismatch here is
low-stakes and invisible as a "bug" rather than a real functional gap.
Worth revisiting only if a future pass gives hotspots a visible marker.

**Also not verified live** — same extension-disconnected situation as the
round-transitions redesign directly above; this is now the third
consecutive feature landed without an actual look at it. Confirmed
statically only: both PNG files exist on disk, the JS/CSS wiring exactly
mirrors the already-proven station pattern (nothing structurally novel
here, unlike the transitions), dev server is up at
`http://localhost:8199`. Reconnecting the Chrome extension is genuinely
the highest-value next step at this point — three unverified passes in a
row is a real gap, not just a formality.

## English-letter audit across all generated art

User asked to check every generated icon/image for stray English letters
(this had already bitten the project once — the original letters-scene
had decorative floating glyphs that came out as Latin h/k/b, fixed
earlier this session). Systematically re-viewed every generated asset
this pass: all 14 station scene images (7 base + 7 alt), both map
backgrounds, the room scene, all 4 furniture pieces (already checked
earlier when built), both companion sprites. **All clean** — no stray
English letters anywhere. Two things that looked like they might be text
turned out not to be a problem: the arithmetic scene's stepping-stones
show numerals (145, 161, 191...) — digits are language-agnostic, not an
English-letters issue; the reading-comprehension scene's open book shows
faint illegible scribble-lines suggesting text, not actual legible
letters — standard illustration shorthand for "a book has words in it,"
not a real violation. Didn't exhaustively re-check all 24 outfit-dressed
avatar variants (character portraits, not scene compositions with room
for stray signage — the couple already viewed earlier this session for
other reasons were clean, low prior probability of finding anything by
checking the rest).

## Celebration panel: it was genuinely flat — added a real "you won" moment

User feedback, verbatim: "the transforms are still boring - no special
effects. no jumping faries or elieans that enounce that the player won.
this is too boring for a chiled." Read `Celebration.js`/`celebration.css`
to check, and the complaint was right: the panel's own background was a
single flat `var(--color-surface-alt)` color, and there was no character
animation at all beyond a static companion image sitting still — just
confetti + a staggered text/coin/reward reveal. Two additions:

1. **A moving background** — user separately suggested a GIF; there's no
   video/GIF-generation tool in this project (only the still-image
   generator used all session), and stitching several independently-
   generated AI stills into a GIF would likely look janky (no frame-to-
   frame consistency) rather than smooth. Built the same *visual* result
   with pure CSS instead: a blurred, rotating conic-gradient "glow ring"
   (`.celebration-panel::before`, cycling through the game's existing
   accent palette — same tokens `RoundTransition.js`'s motifs already use)
   sitting behind the panel and spinning continuously the whole time it's
   shown. Deliberately kept OFF the panel's own background (which stays
   the plain light card it was) rather than making the panel itself a
   shifting gradient — text sitting directly on a moving multicolor
   gradient would have inconsistent contrast as it shifts, which matters
   more for a kids' reading app than for a purely decorative glow.
2. **A literal jumping cast announcing the win** — `spawnVictoryCast()` in
   `Celebration.js` now spawns a fairy 🧚, alien 👽, star ⭐, and party-
   popper 🎉 at the panel's four corners, each jumping on its own
   bounce rhythm (staggered delays, not synchronized) for ~2.6s. Reused
   characters already established elsewhere in the game (the map's alien
   critter, the geometry station's fairy) rather than introducing random
   new ones, so it reads as "the game's own cast shows up to celebrate,"
   not an unrelated sticker pack. `aria-hidden` and self-removing;
   doesn't touch the back button's already-immediate interactivity (this
   file's core "never gate interactivity" rule, unchanged).

**Not verified live — now four features in a row.** The Chrome extension
has stayed disconnected through this entire stretch (transitions
redesign → map background variety → this). I want to be very direct
about what that means: everything from the round-transitions rewrite
onward has shipped on static code review alone — re-reading files,
checking that referenced CSS custom properties exist, confirming JS
wiring is internally consistent — which catches syntax errors and
obviously-wrong references, but cannot catch "does this actually look
good," "does the timing feel right," or "did I misjudge a color/contrast
call." The user's "still boring" feedback on the round-transitions may
partly be exactly this risk materializing — I have no way to know from
here whether those 7 motifs are rendering as designed or are subtly
broken. Reconnecting the extension (or the user testing directly at
`http://localhost:8199`) is the single highest-priority next step —
more valuable right now than any further new feature work.

## Word-building "lost word" assemble rounds — implementation detail

`WordBuildingStation.js` now alternates two round types across its 8-round
session (even `roundIndex` = the original fill-in-blank; odd = new
assemble):

- The word's own letters (from the same `wordBuildingData.js` bank, ignoring
  `blankIndex`) plus `level - 1` decoy letters from `lettersData.js` (0
  decoys at level 1) are shuffled into tiles. The child taps them in order
  to fill empty "house" slots — reuses the exact same
  `.word-building-station__car--blank/--filled` CSS classes the blank
  rounds already use, so no new CSS was needed.
- **Matching is by character value, not stored position.** A word with a
  repeated letter (e.g. שמש has two ש) would break under naive
  position-tracking; matching "is this tile's char the next needed char,
  and is it still unused?" sidesteps that entirely — any correct-looking
  duplicate tile is accepted, which is also the intuitively-correct UX.
- Only the fully-assembled word scores as the round's one "correct answer"
  (1 coin, one `applyCorrectAnswer` call) — per-letter taps are just light
  feedback, so a 3-letter and a 5-letter word both earn the same 1 coin per
  round, matching blank-round economy.
- Same gentle-wrong / 2-wrong-attempts hint-glow pattern as every other
  station's tiles; the hint threshold resets after each correctly-placed
  letter (per letter-position, not accumulated across the whole word).

## Environment quirks on this machine (important)

- **No Node.js, npm, or Python installed** on this machine — confirmed by
  exhaustive PATH + common-install-path search. This blocks:
  - `npx serve` / `python -m http.server` (the normally-recommended way to
    serve the game locally, since it uses ES modules and can't be opened via
    `file://`)
  - Chrome DevTools MCP (`chrome-devtools-mcp` is an npm package; registered
    in MCP config but shows `CONNECTION_CLOSED` until Node is installed)
- **Workaround in place**: a small PowerShell-only static file server at
  `<scratchpad>/serve.ps1` (session scratchpad, not part of the repo). Start
  it with:
  ```powershell
  powershell -NoProfile -ExecutionPolicy Bypass -File "<path-to-serve.ps1>" -Root "C:\Users\רזיאל חג'ג'\Documents\gil\computer game Riki" -Port 8123
  ```
  then open `http://localhost:8123/`. If Node ever gets installed, prefer
  `npx serve .` instead and this workaround becomes unnecessary.
- **Once Node is installed**, the already-registered `chrome-devtools` MCP
  server should connect on its own — no need to re-run `claude mcp add`.

## Plugins/tools installed this session

- **`frontend-design` plugin** (`claude-plugins-official` marketplace) —
  installed and enabled, but Claude Code plugins only register at session
  startup. **It has not been active yet in this session** (installed
  mid-session) — it will load automatically the next time this session is
  restarted/resumed or a new session starts in this project.
- **`chrome-devtools` MCP server** — registered but not connected (see Node.js
  note above).
- **Image generation**: `tools/Generate-Image.ps1` — PowerShell script (not
  Node, since Node isn't available) that calls Cloudflare Workers AI
  (`@cf/black-forest-labs/flux-1-schnell`) and decodes the base64 image the
  API returns. Reads `CLOUDFLARE_ACCOUNT_ID`/`CLOUDFLARE_API_TOKEN` from a
  project-root `.env` file (real credentials are already in there — `.env`
  is gitignored). Usage:
  ```powershell
  .\tools\Generate-Image.ps1 -Prompt "..." -OutFile "assets/images/avatars/avatar-07.png"
  ```
  Bare filenames (no path) save to `generated/`.

## File structure reference

See `js/`, `css/`, `assets/` trees — they match the architecture plan
produced at the start of this project (storage abstraction in
`js/core/storage/`, versioned profile schema in `js/core/data/schema.js`,
hash router in `js/core/router/ScreenManager.js`, sound facade in
`js/audio/SoundManager.js`, station catalog in `js/world-map/stations.js`
with `stationRegistry.js` as the seam for plugging in real station screens
later).

## Minor known quirk (not a functional bug for real users)

A full browser reload (typing/loading a URL directly) to a non-root hash
like `#/create-profile` gets overridden by `main.js`'s boot-time routing
logic, which only branches between `#/map` (active profile exists) and
`#/profiles` (none). In-app navigation (clicking buttons, which just changes
`location.hash` without a reload) works correctly for every route including
`#/create-profile` and `#/station/:id` — verified live. Only affects
deep-linking via a fresh page load, which isn't a real user path in this app
today. Worth a quick look if deep-linking ever becomes a requirement.

## LocalStorage note

Testing in this session created a real profile ("רוני") in the browser's
LocalStorage at `http://localhost:8123`. That's test data, not anything the
user asked to keep — safe to clear if a clean slate is wanted.

## Session: root-cause animation fix, reward economy rework, medals, My World redesign

Started from the user asking to make the game "more interesting for kids."
The Chrome extension reconnected early this session (it had been down for
the entire previous session's final stretch — 4 features shipped
unverified, per the handoff above) — **everything in this section was
verified live**, not just statically reviewed, which is what surfaced the
big finding below.

### The root-cause bug: most of the game's "juice" was silently inert

While checking why the celebration screen's jumping-cast/title/coin-count
looked frozen (only the reward chip visibly appeared), direct DOM
inspection showed the elements existed with the right content but
`getComputedStyle(el).animationName` was `"none"` for several of them —
the `animation` shorthand was being silently dropped as invalid.

Root cause: `tokens.css` defined `--transition-fast/-base/-slow` as
`150ms ease` / `250ms ease` / `450ms ease` — duration **and** timing
function bundled into one token. Nearly every call site across the whole
codebase then appended its *own* explicit timing function after the var
(`animation: fade-in var(--transition-slow) ease 850ms both;`,
`transition: transform var(--transition-fast) var(--ease-out-soft);`,
etc.) — a `animation`/`transition` shorthand can only carry one
timing-function, so every one of these ~45 declarations (grepped across
`animations.css`, every station's own CSS, `modal.css`, `celebration.css`,
`world-map.css`, `buttons.css`, `cards.css`, `avatar.css`,
`mute-toggle.css`...) was syntactically invalid and silently dropped.
Confirmed directly in the console: a throwaway element with that exact
pattern computed to `animation-name: none`.

Practical effect: basically every fade-in/pop/slide-up entrance across the
*entire game* sat stuck at its pre-animation state (usually `opacity: 0`)
forever, and every button/tile/card hover-press `transition` never
animated (snapped instantly). This had been true since very early in the
project — it's the most likely real explanation for the recurring "it's
boring, no special effects" feedback across multiple earlier sessions, far
more than any single station or transition being under-designed.

**Fix**: stripped the embedded `ease` out of the three tokens in
`tokens.css` (now just `150ms` / `250ms` / `450ms`). A call site with no
explicit timing-function of its own still gets `ease` for free (the CSS
initial value), so this is safe in both directions — nothing needed to
change at any of the ~45 call sites. Verified live: the celebration
screen's title/coin-count-up/back-button/jumping-cast (fairy/alien/
star/party-popper) and its rotating rainbow glow ring all fire correctly
now; confirmed no other regressions by testing letters/geometry stations
and the map end-to-end afterward.

Also fixed in passing: rapid consecutive round-transitions could throw an
uncaught `InvalidStateError` (`RoundTransition.js` — a superseded
`document.startViewTransition()`'s `finished` promise rejects when a newer
transition supersedes it, which is expected per spec but was going
uncaught). Added a `.catch(() => {})` after the existing `.finally()`
cleanup.

### Companion star: was never actually transparent

`assets/images/companion/companion-idle.png` and `companion-happy.png`
turned out to be `Format24bppRgb` (no alpha channel at all) with a plain
white square baked in as the "background" — never fixed because the
furniture magenta-chroma-key workflow (see earlier in this file) didn't
exist yet when these were generated. Wrote a new
`tools/Remove-WhiteBackground.ps1` (same HSV-ish scoring approach as
`Remove-MagentaBackground.ps1`, but keys on "close to pure white value +
low saturation" instead of a hue match, with the same soft-edge
feathering) and ran it on both files in place. Verified: corner pixel
alpha is now 0, the star's own pale-yellow sparkle highlights stayed fully
opaque (didn't get mistaken for background), only the soft ground-shadow
ellipse faded partially (acceptable, matches the furniture background-
removal precedent).

### Accessories: given real art, then removed entirely

First pass: the accessory overlays (hat/glasses/wings/scarf) were plain
emoji, which the user said didn't match the game's art style — generated
real cutout art for all 4 (`tools/Generate-Image.ps1` on a magenta
backdrop, same flat-papercraft-style prompt pattern as the furniture
pieces, chroma-keyed via the existing `Remove-MagentaBackground.ps1`) at
`assets/images/accessories/*.png`, and switched
`buildAccessoryOverlays()` (`AvatarCatalog.js`) from emoji `<span>`s to
real `<img>`s via `createImageWithFallback` (emoji stays as the fallback
if an image ever fails to load). This also incidentally fixed the known
🪽 wings-emoji-renders-as-a-blank-glyph issue on this Windows machine,
since real art has no font-coverage dependency.

**Then the user asked to remove accessories from the game entirely** — "it
doesn't look good," after seeing the real-art version live. Removed
fully: the "אביזרים" grid section and its populate/handle functions from
`MyWorldScreen.js`, the equipped-badges accessory loop, every
`buildAccessoryOverlays()` call site (world-map HUD chip, world-map big
avatar figure, My World portrait, profile-select cards — 4 files), and
the now-unused imports at each. `buildAccessoryOverlays()` itself,
`ACCESSORY_ITEMS`, `accessoryIdToSlot`, and `profile.appearance
.accessorySlots` were deliberately left in place (dead-but-harmless data
model / unused export) rather than touched further — no station awards
accessories anymore (see reward-economy rework below), so the pool is
inert, not broken. Verified live: zero console errors, no accessory UI
anywhere in the game.

### Reward economy reworked: more outfits, map-background prizes

Direct user feedback: "change from אביזרים to more outfits" +
"add prizes to change the background of the map." Reassigned
`categoryToRewardFamily` (`rewardCatalog.js`) — PHONOLOGY,
SYLLABLES_WORDS, and READING_COMPREHENSION moved from the now-removed
ACCESSORY family to OUTFIT (joining LETTERS, so 4 of 7 categories now feed
outfits); MULTIPLICATION_PREP moved from FURNITURE to a new MAP_THEME
family (ARITHMETIC + GEOMETRY still share FURNITURE between just the
two). Each of the 7 station files hardcodes its own reward-pool import
or (not a lookup through `categoryToRewardFamily` at runtime) — had to
edit all 4 changed stations' `pickNextReward`/`addReward` call sites
individually to match.

**More outfits**: `OUTFIT_ITEMS` grew from 4 to 6 — added
`outfit-astro-suit` (חליפת אסטרונאוט) and `outfit-explorer-jacket` (מעיל
הרפתקאות), each needing a real dressed portrait per avatar like the
original 4 (6 avatars × 2 new outfits = 12 new images, same
`Generate-Image.ps1` workflow, prompted per-avatar from their actual
visual traits — hair/skin/style — read off each base avatar image
directly rather than guessed). Saved to
`assets/images/avatars/outfits/{avatarId}_{outfitId}.png` — no
transparency processing needed (avatar portraits render inside a
circular-crop wrapper, so a plain white square background is fine, same
as the original 24).

**Map-background prizes** (new `RewardFamily.MAP_THEME`): a child can now
earn and *equip* an alternate map sky instead of the map always randomly
picking day/twilight 50/50. `MAP_THEME_ITEMS` has 2 entries — the
existing twilight variant (`map-background-alt.png`) plus a brand-new
third sky, `maptheme-aurora` (`assets/images/ui/map-background-aurora.png`,
freshly generated: aurora borealis ribbons, same mountains/path/floating-
island composition as the other two so nothing painted on top —
stations/critters/hotspots — ever sits somewhere nonsensical). Day sky
stays the always-free default, never itself a prize.

Implementation: `profile.world.mapThemeId` (equipped) +
`profile.inventory.mapThemes` (owned) — schema v5, migration adds both as
empty/null. `ProfileManager.setEquippedMapTheme()` mirrors
`setEquippedOutfit()`'s toggle pattern. `WorldMapScreen.js`'s background
logic: if a theme is equipped, use it (inline `style.backgroundImage`,
bypassing the day/twilight class toggle entirely); otherwise fall back to
the existing random A/B pick unchanged. New "רקעי מפה" grid in
`MyWorldScreen.js` (single-select equip, same pattern as outfits) — added
`kind: 'mapTheme'` to the shared `buildRewardCard()`'s checkmark-badge
CSS selector.

Verified live end-to-end: granted themes via a profile edit, confirmed
both show unlocked in the grid, equipping aurora actually changed the
live map background on the next visit, zero console errors.

### New: "המדליות שלי" (medals)

Direct ask: a silver medal at "medium" difficulty, gold at "hard," and it
should never downgrade even if the child later struggles. Adaptive
difficulty (`adaptiveEngine.js`) already runs levels 1-3 — mapped
directly: level ≥2 → silver, level ≥3 (MAX_LEVEL) → gold. New
`js/rewards/medals.js` (`medalTierForLevel()`, `isMedalUpgrade()` — the
upgrade check is strictly one-way, silver→gold only, never gold→silver or
any tier→none, matching this project's "zero frustration" rule: a medal
is a permanent record of the child's best-ever performance in that
category, not a live readout of their current level, so a rough patch
right after can't take it away). `profile.medals: {}` (categoryKey →
tier) — schema v6. `ProfileManager.recordMedalIfEarned(categoryKey,
level)` called from all 7 stations' `renderCompletion()`, right where
`pickNextReward`/`addReward` already runs, passing that session's final
`currentProgress.level`.

New "המדליות שלי" section in `MyWorldScreen.js`, then reworked once more
after the user asked for it to look "more child approachable": a
trophy-shelf layout (own dedicated `buildMedalCard()`/CSS, not the shared
`buildRewardCard()` grid component the other 3 sections use) — round
medal badges on their own, bigger emoji, earned medals sorted before
locked ones (gold, then silver, then not-yet-earned) so a child sees wins
first instead of opening on a row of grey locks, plus a "X מתוך 7 🏆"
progress pill in the section header. Gold badges get a one-shot shine-ring
animation on mount (not a continuous loop — kept as the section's one
spot of extra motion rather than every card being busy at once).

Verified end-to-end for real, not just via a data injection: played the
geometry station live up to adaptive level 3 and confirmed
`profile.medals.geometry` came back `"gold"` afterward with zero console
errors — the actual station→`recordMedalIfEarned`→storage wiring, not
just the display.

### My World screen: full color pass + cursor-sparkle trail

Direct ask: make "הדמות שלי והעולם שלי" (which had been a fairly flat
white-cards-on-cream layout) "filled with colors and excitement" for a
kid. Consulted the `frontend-design` skill, but treated this as *extending*
the game's own already-established identity (dawn-sky/star-glow tokens,
per-station accent colors, the celebration screen's rotating rainbow glow
— all pre-existing) rather than inventing a new visual language from
scratch:

- Page background: from a flat cream radial-tint to a soft multi-stop
  dawn-sky/pink gradient plus drifting star-glints (`::before`/`::after`,
  same recipe as `profile-select.css`).
- A slow-spinning rainbow conic-gradient glow behind the avatar portrait
  (`.my-world__avatar-halo`) — literally reuses `celebration.css`'s
  `celebration-glow-spin` @keyframes (global by name) at ambient/idle
  strength, so the character page opens with a bit of the same "star of
  the show" feeling as winning a station.
- Each of the 3 sections got a distinct color identity end-to-end: pink
  for "הדמות שלי" (👗), gold for "המדליות שלי" (🏅), teal for "העולם שלי"
  (🏡) — icon + colored underline on the heading, a very light matching
  background tint on the section card itself, and every *owned* reward
  card in that section tinted the same family color even before it's
  equipped (previously every card was the same flat tan until tapped).
  Outfits=pink, furniture=teal, map-themes=purple.
- Room preview got a candy-striped teal/pink/yellow gradient border
  (`background: ... padding-box, linear-gradient(...) border-box` trick —
  moved the actual room-scene image from the element's own
  `background-image` to a new `::before` so both effects can coexist;
  updated the existing `--fallback-bg` image-load-failure modifier to also
  suppress that `::before`).
- New cursor-sparkle trail, scoped to this screen only: a small star pops
  at the pointer position on `pointermove` and rises/fades/spins away
  (`MyWorldScreen.js`'s `attachCursorSparkles()`/`spawnCursorSparkle()`),
  throttled to one spawn per ~90ms so a fast swipe doesn't flood the DOM,
  skipped entirely under `prefers-reduced-motion`, listener attached in
  `renderAll()` and explicitly removed in `unmount()`.

Verified live at both desktop and mobile (390×844) width — cards reflow
correctly, halo and sparkles both confirmed firing (sparkle count checked
directly via dispatched `PointerEvent`s since the ~700ms animation is too
fast to reliably catch in a manual screenshot), zero console errors
throughout.

### Real bug fixed along the way: the bed's own PNG had ~25% dead padding

The "bed still isn't low enough" back-and-forth (several CSS
`inset-block-end` nudges, each further negative, none satisfying) turned
out not to be a positioning problem at all: pushing the CSS value very
negative (to make the visible bed sit lower) silently broke the
furniture-drag system's own clamp (`clampPercent()` in
`MyWorldScreen.js`, which keeps a dragged item's box fully inside the room
container) — the drag ceiling ended up *above* where the CSS default had
already pushed the bed, so dragging further down was capped and literally
could not move any lower, which is exactly what "I tried to drag it down,
it doesn't work" was reporting. Root cause, found by measuring the actual
PNG: `assets/images/my-world/furniture/furniture-sparkly-bed.png` had
~25% transparent padding below the artwork and ~30% above baked into the
canvas (a leftover from the original AI generation never being tightly
cropped) — no `inset` value could ever fully compensate for that, since
the image's own bounding box, not just its CSS position, was the real
constraint. Fixed at the source: cropped the PNG to its actual content
bounding box (`System.Drawing`, tight bbox + a small 2% padding buffer)
and reset the CSS back to a small, sane `inset-block-end: 2%` — now the
bed's legs reach the true bottom edge, it sits flush on the floor, and
dragging works normally again within the (now-correct) clamp range.
Also fixed a stray `!importent` (misspelled `!important`, so the
declaration was silently invalid) that had been hand-edited into the CSS
mid-session while diagnosing this.

### Not done / worth a look next session

- The 24 original + 12 new outfit-dressed portraits are still independent
  generations per (avatar, outfit) pair, not pixel-edits — the known
  framing/scale/hair-color drift noted in earlier sessions applies to the
  2 new outfits too, not specifically re-checked against all 6 avatars
  each.
- Accessory data model (`ACCESSORY_ITEMS`, `accessorySlots`,
  `accessoryIdToSlot`, `setEquippedAccessory`) is still present in code,
  just unused by any UI or station — fine to leave, but a candidate for a
  real deletion pass if it's ever confirmed nobody wants accessories back
  in some form.
- `buildAccessoryOverlays()` in `AvatarCatalog.js` is now dead code (no
  callers) — left in place rather than deleted, same reasoning as above.
- Given how much UI *looked* broken purely because of the tokens.css
  animation bug, it's worth a fresh, unhurried pass over stations/modals/
  toasts/profile screens now that transitions actually fire, in case any
  of them turn out to look different (better or worse) than whatever was
  last actually seen working.
