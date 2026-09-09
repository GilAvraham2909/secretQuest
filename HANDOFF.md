# Handoff — המסע הסודי / secretQuest

Written 2026-09-09, second rewrite of the day. Replaces the previous handoff
(commit `26a0b0f`), which is still in git history if you want it.

**Working tree is clean and everything is pushed.** There is no interrupted work
this time — start wherever you like.

---

## What this project is

A Hebrew letter-learning game for ages 5-7, built to the client's spec at
`docs/client-spec-mvp.md` (Hebrew, the source of truth). Four mechanics, five
skills, a remedial adventure, a personal world and a parent dashboard.

A ground-up rebuild. The previous 7-station vanilla app is **not** being
ported — it implemented a different spec and violated the extensibility
criteria that are the core of this one. Its art and PowerShell tools were
carried over; nothing else.

**Repo:** https://github.com/GilAvraham2909/secretQuest (public, `main`).

---

## Environment — read before touching anything

**Installed per-user (no admin), all on the User PATH:**

| Tool | Version | Path |
|---|---|---|
| Node | 24.19.0 | `%LOCALAPPDATA%\Programs\nodejs` |
| npm | 11.17.0 | (same) |
| git | 2.55.0 (MinGit) | `%LOCALAPPDATA%\Programs\mingit\cmd` |
| gh | 2.100.0 | `%LOCALAPPDATA%\Programs\ghcli\bin` |

**A shell started before those installs will not see them.** Prepend:

```powershell
$env:Path = "$env:LOCALAPPDATA\Programs\nodejs;$env:Path"
$env:Path = "$env:Path;$env:LOCALAPPDATA\Programs\mingit\cmd"
```

**Git auth:** a classic PAT with `public_repo`, in Windows Credential Manager
via `credential.helper wincred`. Plain `git push` works. `gh` itself refuses
this token (it wants `repo`+`read:org`) — fine, git does not need gh.

**No database is needed to develop or test.** The server tests run PGlite
(PostgreSQL compiled to WASM) in-process from the checked-in migrations. No
Docker, no bash — seam S7 is a hard constraint here, not a preference.

### PowerShell traps that have each cost real time

1. **PS 5.1 splits Hebrew text** passed to a native exe. Write commit messages
   to a UTF-8 file and use `git commit -F <file>`.
2. **`Get-Content` reads Hebrew as CP1255**, so valid UTF-8 looks like mojibake.
   Use `-Encoding UTF8`. This produced a false "the file is corrupt" finding
   once — verify before believing it.
3. **Piping a secret to a native exe's stdin corrupts it.** Write to a temp file
   and use `cmd /c "prog < file"`.
4. **The username contains apostrophes** (`רזיאל חג'ג'`), so its 8.3 short path
   is `C:\Users\''45F4~1\...`. git strips those quotes when invoking a
   credential helper, which is why `gh auth setup-git` produces one that cannot
   run. `wincred` resolves from git's own libexec and sidesteps it.
5. **A `.ps1` with non-ASCII needs a UTF-8 BOM.** Keep tool scripts pure ASCII.
6. **`"${var}%"` parses `%` as modulo.** Use `-f` formatting.
7. **Do not define a PS function named `CP`** — it collides with the `cp` alias.
8. **`git push` "fails" in PowerShell when it hasn't.** git writes progress to
   stderr, and PS 5.1 wraps that in a NativeCommandError. Check the last line
   for `main -> main`, not the exit noise.

---

## Commands

```powershell
npm install
npm run dev            # http://10.0.0.9:5180  (LAN address — see below)
npm run verify         # typecheck + 139 tests + content lint
npm run content:lint   # content rules only; --list-audio prints missing clips
npm test
```

**The dev URL is the LAN address, not localhost.** Testing happens from a Chrome
on a different machine, where `127.0.0.1` is that machine's own loopback. Vite is
bound with `host: true`. If the IP changes, run `Get-NetIPAddress -AddressFamily IPv4`.

`npm run verify` takes ~25s now; most of it is the server suite spinning up a
fresh PGlite per test. That is deliberate isolation, not slowness to fix.

---

## Where the thinking lives

| File | What it holds |
|---|---|
| `docs/client-spec-mvp.md` | The client spec. Source of truth. Every rule traces to a numbered clause. |
| `docs/architecture.md` | Domain model, mechanic contract, assessment engine, hint ladder, **§6.0 auth/tenancy**, API surface, milestone plan. |
| `docs/research-findings.md` | Stack, learner-model choice, children's-data privacy, age 5-7 evidence, Hebrew niqqud/TTS findings. |
| `docs/design-direction.md` | Visual direction, per-screen specs, §6.2b sprite pipeline lessons. |

Two standing contracts also live in the project memory folder: the production
stack + security rules, and the dev-environment notes.

---

## What is built and verified — M0-M5, plus M4 parts 1-3

**139 tests green, 0 content errors.** Everything below was checked in a real
browser or against a real Postgres, not only by test run.

### `packages/shared` — the pure domain layer

No DOM, no framework, no I/O: it must run unchanged on client and server,
because the remedial trigger has to fire inside a session, possibly offline,
while the server stays the system of record.

- **`hebrew/`** — the 8 MVP letters, pointed names, a 24-entry niqqud bank.
  Code points are explicit escapes because a combining mark is invisible in
  source and patah-vs-qamats is the whole niqqud skill. **Never call
  `.normalize()`** on these strings: NFC reorders the vowel ahead of the dagesh
  and breaks rendering. A test asserts the reordering still happens.
- **`hints/ladder.ts`** — one shared reducer, spec 11's six steps. `end_round`
  has a single disposition, `'success'` — **failure has no representation in the
  type system**, which is how spec 1.5's "the child can never get stuck" is
  enforced. A test walks all 16 capability profiles.
- **`assessment/`** — windowed counting, deliberately not BKT. Two named tests
  are the client's contractual evidence: `single_error_never_triggers_reinforcement`
  (criterion 3.8) and `scripted_struggle_triggers_reinforcement_for_correct_letter`
  (3.9). **Thresholds are data** in `assessment/policy.ts`.
- **`round/controller.ts`** — owns the answer key, the ladder and the telemetry.
  Appends the attempt **before** returning any directive.
- **`content/lint.ts`** — the content linter. Its most valuable rule is still the
  spec §21 forbidden-phrase scan.
- **`telemetry/events.ts`** — the event envelope, shared so client and server
  cannot drift.

### `content/source/*.csv` — content is data, not code

30 tasks, 8 letters, 8 words, 7 letter-sounds, 83 copy lines. A non-programmer
edits these in Excel.

### `packages/web` — four playable mechanics

`StationGame.tsx` is the generic host; each mechanic is a module plus one
registry row. Balloons, fishing, letter train, and **match** (which hosts
letter-sound, opening-sound and niqqud — spec §7, §8, §9).

A mechanic contains no answer key, no scoring, no ladder and no telemetry. It
draws options and reports touches; every piece of feedback arrives as a
directive.

### `packages/server` — the system of record (NEW)

Parent as auth principal, event ingest, projection, derived skill state, replay
timeline. Details in the next section, because they are the part most likely to
be got wrong by someone continuing.

---

## The auth and tenancy model (architecture §6.0) — read this before touching the server

The editor's note used to say "no auth model, reconcile before implementing §6".
That is now done and §6.0 is the model. In short:

**The parent is the only principal.** A child never has credentials, never holds
a token and never authenticates — so there is no child login screen to design,
which is also the right answer for a five-year-old. The child plays inside the
parent's authenticated session on the parent's device. That is what keeps the
offline outbox working: the cookie outlives the network.

**Ownership is a column, checked at the data layer.** Every child-scoped read
and write goes through `requireOwnedChild`, which returns a branded
`OwnedChildId`. Repository functions take an `OwnedChild`, so **a handler that
skipped the check would not compile**. This is deliberate: broken object-level
authorization always has the same shape — fifteen endpoints check and the
sixteenth forgets.

**The failure is 404, never 403.** A 403 on someone else's child confirms that
child exists, which turns id-guessing into a membership oracle over other
families. "Not yours" and "does not exist" return an identical status *and* an
identical message; there is a test for both halves.

**Client-generated ids are also an authorization problem.** `childId` is
generated on the client so the first session can run before the network ever
succeeds. That means an attacker chooses the value. So child creation is
idempotent *within* a parent and a hard 409 across parents, and **never an
upsert** — `ON CONFLICT DO UPDATE` there would let anyone who learns a child id
overwrite and reparent that child. It reads exactly like ordinary idempotency in
a diff, which is why there is a test named for it.

**`childId` is in the path, not the event body.** One id in one place is one
check. Any event whose own childId disagrees rejects the whole batch.

`POST /v1/parent/auth { childId, parentSecret }` was **deleted** from the design.
It was a homegrown shared-secret scheme scoped to a child rather than a person.

### The offline outbox (§6.3)

`packages/web/src/telemetry/`. IndexedDB queue, backoff flusher, and a client
whose only method resolves when the event is **durable** — "append before
animate", with no fire-and-forget variant to reach for on a busy afternoon.

The flusher is **invisible by design**: no `isOnline`, no `pendingCount`, no
error state to bind to, and a drain never rejects. Spec 1.5 says a child can
never get stuck, and an offline banner in front of a five-year-old is being
stuck. The only thing that surfaces is an expired session, and it surfaces to
the parent.

Two failures are not retried, and both are judgement calls rather than status
codes: **401** stops (retrying cannot fix it; the queue is kept), **400** drops
the batch (retrying would block every event behind it forever). Everything else
— 5xx, 429, a thrown fetch — is "not now, try later".

Its test suite injects failures at every step of the flush cycle against the
**real router over real Postgres**, including the case that decides whether the
design is right: a failure *after* the server committed, response lost on the
way back.

---

## Open decisions for the client

1. **47 audio recordings.** Deferred by the client, and confirmed on 2026-09-09
   as "only at the end, not now". The linter's missing-audio list is the work
   order: `npm run content:lint -- --list-audio`.
2. **Which content is free and which is paid.** Nobody has said. The MVP has 8
   letters, 4 mechanics and 27 tasks and there is no defensible way to pick the
   free tier from the architecture. The *enforcement point* is built (entitlement
   resolved server-side, checked when serving a pack and when bootstrapping) and
   the *policy* is a table (`entitlement_rules`) so the answer can arrive late
   without a rebuild. **Do not guess this in code.**
3. **A gap in the spec itself.** §15 lists 27 tasks, but §7.3 and §8.4 describe
   **5 rounds** each while the table gives 4 and 3. SND-005, PHO-004 and PHO-005
   were added to satisfy the "5 per mechanic" rule — **their content is a
   reasonable completion, not the client's.** Worth confirming.
4. **A research finding that contradicts the spec.** §4.4/§5.4/§6.4 allow a round
   to end without the child ever being shown which letter was correct. Evidence
   supports removing *evaluative* feedback but keeping *informational* feedback.
   Recommended: every round closes by highlighting and voicing the correct
   answer, positively framed. **This is a spec change and needs approval.**
5. **8 letter stroke paths** for the tracing stage cannot be generated. They need
   hand-authored SVG with correct stroke order, signed off by an educator.
6. **"The map" — unresolved as of this handoff.** The client asked when the map
   is being done. There is **no navigation map in this spec**: §19 is a fixed
   linear sequence, and the `map-background*.png` assets are salvage from the
   previous app. Three things get called "map": מפת ידע (the parent screen's
   skill table, M7), "הסימן חזר למפה" (narrative flavour in the §10 adventure,
   M6), and העולם האישי §3 (the closest thing visually, M7). **Ask which they
   meant before building anything.** If they want a real hub screen it is a spec
   change, and the age-fit concern is worth raising: a hub asks a child to choose
   before they know what the choices mean.

---

## Next steps

**Finish M4 (small):** the outbox exists but `StationGame` does not call it yet —
it still holds telemetry in React state. Wiring it needs a real `childId` and
`sessionId`, which belong to the onboarding flow (§2) that M7 owns. Wire it
behind a dev-harness identity so append-before-animate is exercised end to end,
and leave real profile creation to M7 rather than half-building onboarding here.

Also still open in M4: `GET /v1/parent/{childId}/summary`, `skill-by-mechanic`
(criterion 3.11 verbatim) and `data-quality` (criterion 3.7's measurement
instrument), plus the Stripe endpoints. The schema and the guard for all of them
already exist.

**Then M6** (the remedial adventure + `TraceMechanic`) **or M7** (world,
rewards, session end, parent screen). M7 unblocks two of the open questions
above, so if the client is waiting on the map or the parent screen, do M7 first.

### One known gap in the projection

`rootLetterOf` in `packages/server/src/repo/project.ts` derives a letter for
`letter:` and `niqqud_combo:` ids but not for `word:` or `letter_sound:` — those
need the content pack, which the server does not load yet. They contribute
skill-level evidence but not per-letter evidence, so it is **correct-but-partial
rather than wrong**. It matters for the remedial trigger (spec 10.1 targets a
letter), so close it when the pack is loaded server-side.

---

## Things this project has learned the hard way

**Live verification is a gate, not a habit.** Every one of these was found on
screen with all tests green:

- a self-completing round bug
- a content-identity leak through audio filenames
- a pink rectangle behind every sign-stone
- an invisible end screen
- an RTL line hanging off the wrong side of a rod
- a fishing line that never touched the letter it was "catching"
- word pictures rendering 26px inside a 210px card
- niqqud vowels landing on the sign-stone's rim

**RTL:** `transform` is always physical, never direction-aware. When positioning
against a **fixed image** (a rod tip, a balloon body), use **physical**
properties — the tip does not move when text direction changes. Logical
properties are for things that should mirror with the text.

**Percentages resolve against the containing block's inline size.** `padding: 8%`
on a card resolved against the 1100px card row, not the 210px card. Nothing in
the rule looks wrong until you measure it.

**Measure sprite geometry, do not estimate it.** The rod's painted tip is at
95.9% / 2.9% of its PNG; the guess was 91% / 7%. Worse, those were percentages of
two different rectangles, so no amount of nudging would have held at a different
viewport height. Find the first opaque row and take its x.

**Never hand-type pointed Hebrew in a test.** A hand-typed מַטָּרָה fails against
the CSV's, printing identically — the same invisible mark-ordering difference the
niqqud-order lint rule exists for. Compose expectations from the source data.

**A linter over the CSVs cannot catch a bug in the code that reads them.** Three
copy lines were broken for weeks: an empty `{{sound}}`, a literal
`{{stretched_sound}}`, and `{{word}}` returning a stretched sound. All linted
clean, all typechecked, none was on a screen. There are now two guards — a lint
rule *and* a test that renders every line of every task.

**The sprite pipeline** (`tools/New-Sprite.ps1`, notes in design-direction §6.2b):
key colour must be the complement of the sprite; always crop to the content
bounding box; normalise a sprite *set* onto one canvas; generate props without
attached extras and draw those in CSS. The content filter false-positives
constantly — shorten and simplify rather than arguing. And **when the generator
refuses a composition twice, change the design to match what it does produce.**
Ask for colour explicitly: "a camel" came back as an uncoloured line drawing,
"a golden brown camel, fully coloured" did not.
