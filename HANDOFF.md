# Handoff — המסע הסודי / secretQuest

Written 2026-09-09. Replaces the previous handoff, which described the
superseded vanilla-JS app; that document is preserved in git history at the
initial commit (`dd5ba84`) if you need it.

---

## ⚠️ FIRST: there is uncommitted work

A commit was interrupted mid-flight. Before anything else:

```powershell
$env:Path = "$env:Path;$env:LOCALAPPDATA\Programs\mingit\cmd"
cd "C:\Users\רזיאל חג'ג'\Documents\gil\computer game Riki"
git status
```

Expect changes to `packages/web/src/mechanics/BalloonMechanic.tsx`,
`packages/web/src/mechanics/FishingMechanic.tsx`,
`packages/web/src/game/mechanics.css` and
`assets/images/props/fishing-rod.png`. They are **finished and verified live** —
the fishing rod rework and the end-screen contrast fix (see "Recent client
feedback" below). A ready-made commit message is at
`<scratchpad>/commitmsg9.txt`; if that scratchpad is gone, write a fresh one.

`npm run verify` was green at the point of interruption.

---

## What this project is now

A ground-up rebuild. The client delivered a new spec (`docs/client-spec-mvp.md`,
Hebrew, the source of truth) for a Hebrew letter-learning game for ages 5-7,
built around **three mechanics** — balloons, letter fishing, letter train — plus
a remedial adventure, a personal world, and a parent dashboard.

The previous 7-station vanilla app is **not** being ported. It implemented a
different spec and violated the extensibility criteria that are the core of this
one. Its art assets and PowerShell tools were carried over; nothing else was.

**Repo:** https://github.com/GilAvraham2909/secretQuest (public, `main`).

---

## Environment — read this before touching anything

Everything below was established this session and is easy to lose.

**Installed per-user (no admin), all on the User PATH:**

| Tool | Version | Path |
|---|---|---|
| Node | 24.19.0 | `%LOCALAPPDATA%\Programs\nodejs` |
| npm | 11.17.0 | (same) |
| git | 2.55.0 (MinGit) | `%LOCALAPPDATA%\Programs\mingit\cmd` |
| gh | 2.100.0 | `%LOCALAPPDATA%\Programs\ghcli\bin` |

Earlier sessions believed no build step was possible here. **That was never
true** — it just had not been tried. `winget` needs an elevation prompt that
never surfaces in this environment, so the official ZIP is the route that works.

**A shell started before those installs will not see them.** Prepend the path:

```powershell
$env:Path = "$env:LOCALAPPDATA\Programs\nodejs;$env:Path"
$env:Path = "$env:Path;$env:LOCALAPPDATA\Programs\mingit\cmd"
```

**Git auth:** a classic PAT with `public_repo` scope, stored in Windows
Credential Manager via `credential.helper wincred`. Plain `git push` works with
no inline token. Note `gh` itself will refuse this token (it demands
`repo`+`read:org`) — that is fine, git does not need gh.

### PowerShell traps that have each cost real time

1. **PS 5.1 splits Hebrew text** passed to a native exe. A here-string commit
   message broke into words git read as pathspecs.
   → Write the message to a UTF-8 file and use `git commit -F <file>`.
2. **`Get-Content` reads Hebrew as CP1255**, so valid UTF-8 looks like mojibake
   (`׳׳™ ׳׳©׳—׳§`). Use `-Encoding UTF8`. This produced a false "the file is
   corrupt" finding once — verify before believing it.
3. **Piping a secret to a native exe's stdin corrupts it.** A valid 40-char
   token arrived as "Bad credentials".
   → Write to a temp file and use `cmd /c "prog < file"`; PS 5.1 has no `<`.
4. **The username contains apostrophes** (`רזיאל חג'ג'`), so its 8.3 short path
   is `C:\Users\''45F4~1\...`. git strips those quotes when invoking a
   credential helper, which is why `gh auth setup-git` produces one that cannot
   run. `wincred` resolves from git's own libexec and sidesteps it.
5. **A `.ps1` with non-ASCII needs a UTF-8 BOM**, or PowerShell reads it as ANSI
   and fails to parse. Keep tool scripts pure ASCII.
6. **`"${var}%"` parses `%` as modulo.** Use `-f` formatting.
7. **Do not define a PS function named `CP`** — it collides with the built-in
   `cp` alias for Copy-Item and silently runs that instead.

---

## Commands

```powershell
npm install
npm run dev            # http://10.0.0.9:5180  (see note below)
npm run verify         # typecheck + 90 tests + content lint
npm run content:lint   # content rules only; --list-audio prints missing clips
npm test
```

**The dev URL is the LAN address, not localhost.** Testing happens from a Chrome
on a different machine, where `127.0.0.1` means that machine's own loopback.
Vite is bound with `host: true`. If the IP changes, run
`Get-NetIPAddress -AddressFamily IPv4`.

---

## Where the thinking lives

| File | What it holds |
|---|---|
| `docs/client-spec-mvp.md` | The client spec. Source of truth. Every rule traces to a numbered clause here. |
| `docs/architecture.md` | Domain model, mechanic contract, assessment engine, hint ladder, client/server split, salvage table, milestone plan. |
| `docs/research-findings.md` | Stack, learner-model choice, children's-data privacy, age 5-7 evidence, Hebrew niqqud/TTS findings. |
| `docs/design-direction.md` | Visual direction, per-screen specs, and §6.2b — the sprite pipeline lessons. |

Two standing contracts also live in the project memory folder: the production
stack + security rules, and the dev-environment notes.

---

## What is built and verified

Milestones M0-M3 of the plan in `docs/architecture.md`. **90 tests green.**
Everything below was checked in a real browser, not only by test run.

### `packages/shared` — the pure domain layer

No DOM, no framework, no I/O: it must run unchanged on client and server,
because the remedial trigger has to fire inside a session, possibly offline,
while the server stays the system of record.

- **`hebrew/`** — the 8 MVP letters, their pointed names, and a 24-entry niqqud
  bank. Code points are written as explicit escapes because a combining mark is
  invisible in source and patah-vs-qamats is the whole niqqud skill.
  **Never call `.normalize()`** on these strings: NFC reorders the vowel ahead
  of the dagesh and breaks rendering. A test asserts that reordering still
  happens, so if a future ICU changes we find out rather than silently rotting.
- **`hints/ladder.ts`** — one shared reducer, not seven copies. Spec 11's six
  steps. `end_round` has a single disposition, `'success'` — **failure has no
  representation in the type system**, which is how spec 1.5's "the child can
  never get stuck" is enforced. A test walks all 16 capability profiles.
- **`assessment/`** — windowed counting, deliberately not BKT (four parameters
  per skill calibrated from a population; this MVP has five children). Two
  named tests are the client's contractual evidence:
  `single_error_never_triggers_reinforcement` (criterion 3.8, exhaustive over
  every skill × letter) and
  `scripted_struggle_triggers_reinforcement_for_correct_letter` (3.9).
  **Thresholds are data** in `assessment/policy.ts`, never constants.
- **`round/controller.ts`** — owns the answer key, the ladder and the
  telemetry. Appends the attempt **before** returning any directive, so a tab
  that dies mid-animation has already recorded it.
- **`content/lint.ts`** — the content linter. Its most valuable rule is the
  spec §21 forbidden-phrase scan: "never tell a child they were wrong" is
  untestable prose that degrades the moment someone writes a well-meaning error
  message, and it is now a build failure.

### `content/source/*.csv` — content is data, not code

30 tasks, 8 letters, 8 words, 7 letter-sounds, 83 copy lines. A non-programmer
edits these in Excel. `copy.csv` has a `voiced` column that implements the
client's audio rule (below).

### `packages/web` — three playable mechanics

`StationGame.tsx` is the generic host; each mechanic is a module plus one
registry row. Adding fishing and train touched **nothing** in
`packages/shared` and nothing in `content/source` — verified mechanically, which
is acceptance criterion 3.12.

A mechanic contains no answer key, no scoring, no ladder and no telemetry. It
draws options and reports touches; every piece of feedback arrives as a
directive.

---

## Client decisions made this session

1. **Fishing is TAP, not drag.** Research found children aged 3-6 reliably fail
   to keep a target selected while dragging, which would measure motor control
   rather than letter recognition.
2. **All audio is pre-recorded; no runtime TTS.** Recording is deferred — the
   client asked to continue with design and functionality first. Two rules
   follow and are enforced by the linter:
   - A spoken line may interpolate only **closed-set** values (letter name,
     sound, word, combo — one whole-sentence recording per value). It may
     **never** speak the child's name. The name in on-screen text is fine.
   - **No narration queue.** One speech channel; a new line cancels the current
     one. `playNarration` rejects with `NarrationInterrupted` so a caller cannot
     chain onto stale speech.
3. **Art is generated**, using the Cloudflare Workers AI tool.

---

## The sprite pipeline

`tools/New-Sprite.ps1` wraps generate → chroma key → crop → normalise. Use it
rather than the individual scripts. Full notes in `docs/design-direction.md`
§6.2b; the four lessons in short:

1. **The key colour must be the complement of the sprite.** Keying works on hue
   distance, so a sprite near the key colour gets eaten — a coral balloon on
   magenta came back with alpha 0 through its middle. warm→green, gold→violet,
   cool→magenta.
2. **Always crop to the content bounding box.** The generator centres art on
   1024×1024 and leaves 50-70% empty, so CSS sizes the canvas, not the artwork:
   a 184px element rendered a ~50px balloon, under the 80px touch floor.
3. **Normalise a sprite SET onto one canvas**, or no single rule can size them
   alike.
4. **Generate props without attached extras** (strings, lines) and draw those in
   CSS, so they can span real distances.

Also: the content filter false-positives constantly. "fishing **rod**" is
rejected, "fishing **pole**" passes; "blank flat face with nothing carved on it"
rejected, "a small beige stone tablet with a carved border" passes. Shorten and
simplify rather than arguing. And the model sometimes **ignores the requested
background** — the sign-stone came back on a magenta card on a white background,
so removing white left a pink rectangle behind every stone.

**When the generator refuses a composition twice, change the design to match
what it does produce.** Two attempts to force a side-on railway scene both came
back in perspective; redesigning the train as a rear view took minutes.

---

## Recent client feedback and how it was resolved

- *"the train looks like unrelated images pasted together"* — correct. Two
  causes: a side-view locomotive on a receding-perspective track (two
  viewpoints on one screen), and the gate being small behind a large train when
  spec 6 makes the **gate** the thing the child acts on. Recomposed: rear-view
  train, front-on gate as the hero, real `gate-closed`/`gate-open` art replacing
  a CSS rectangle.
- *"the rod looks small, has no line, looks poor"* — the sprite was bright green
  bamboo clashing with the dusk palette, with the line baked in at a fixed
  length that could never reach the water. Regenerated without a line; line,
  bobber and ripple are CSS now.
- *"the letters on the end screen are grey and invisible"* — a real contrast
  bug. The panel set no colour and inherited the dark body ink against a night
  sky. It is a cream card now.

**RTL rule learned twice, worth stating plainly:** `transform` is always
physical, never direction-aware. And when positioning against a **fixed image**
(a rod tip, a balloon body), use **physical** properties — the tip does not move
when text direction changes. Logical properties are for things that should
mirror with the text.

---

## Open decisions for the client

1. **47 audio recordings.** Deferred by the client. The linter's missing-audio
   list is the work order: `npm run content:lint -- --list-audio`.
2. **A gap in the spec itself.** §15 lists 27 tasks, but §7.3 and §8.4 describe
   **5 rounds** each for letter-sound and opening-sound while the table gives 4
   and 3. I added the missing ones (SND-005, PHO-004, PHO-005) to satisfy the
   "5 per mechanic" rule — **their content is my reasonable completion, not the
   client's.** Worth confirming.
3. **A research finding that contradicts the spec.** §4.4/§5.4/§6.4 allow a
   round to end without the child ever being shown which letter was correct.
   Evidence strongly supports removing *evaluative* feedback (red X, scores) but
   keeping *informational* feedback. Recommended: every round closes by
   highlighting and voicing the correct answer, positively framed. **This is a
   spec change and needs client approval.**
4. **8 letter stroke paths** for the tracing stage cannot be generated. They
   need hand-authored SVG with correct stroke order, signed off by the client's
   educator.

---

## Next steps

Per the milestone plan, either:

- **M4 — server, telemetry, durability.** The DB, `POST /v1/events` with a
  unique index for idempotency, and an IndexedDB outbox so a mid-round quit
  loses nothing. This is also where the client's production brief lands: the
  **parent** is the auth principal and Stripe customer, the **child** is a
  profile underneath, and every parent-dashboard read must be scoped by the
  authenticated parent at the data layer. `docs/architecture.md` §6 predates
  that brief and has no auth model — reconcile before implementing it.
- **M5 — the match mechanic**, which unlocks the three remaining skills
  (letter-sound, opening sound, niqqud) and brings the content to all 27 tasks.

**Live verification is a gate, not a habit.** The previous project shipped four
features in a row on static review alone. This session found a self-completing
round bug, a content-identity leak through audio filenames, a pink rectangle
behind every sign-stone, an invisible end screen and an RTL line hanging off the
wrong side of a rod — **every one of them with all tests green**.
