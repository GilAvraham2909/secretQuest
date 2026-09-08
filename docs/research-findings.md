# Research findings — המסע הסודי rebuild

> Prepared for the rebuild kickoff. Source of truth for product/content remains
> `docs/client-spec-mvp.md`; this document only answers "how should we build it and
> what does the evidence say."
>
> Date: September 2026. All claims are cited. Where I am guessing, I say so.

---

## A. Stealth assessment / learner-model data design

### Bottom line

Use **Evidence-Centered Design (ECD) as the data architecture** — it maps almost
one-to-one onto what the client already asked for in §1.10 — but use a **plain,
auditable mastery heuristic**, not BKT and not Elo, to compute the
`חדש` / `בתרגול` / `הצלחה עקבית` status. With 25 tasks, 5 skills and 8 letters,
BKT and Elo have nothing to estimate from and would be pure over-engineering.
The single most important architectural rule: **store raw evidence, derive status
as a pure function** — never persist the status as ground truth.

### Why ECD is the right framing (and is free)

ECD splits an assessment into a *competency model* (what we claim the learner
knows), an *evidence model* (which observables support which claim, and how they
are scored), and a *task model* (what situations elicit those observables). Stealth
assessment — Shute's term for assessment woven invisibly into gameplay — is built
on exactly this framework, precisely so that game actions can be scored and
inferences drawn without the learner perceiving a test
([Shute, Lu & Rahimi, *Stealth Assessment*](https://files.eric.ed.gov/fulltext/ED612156.pdf);
[Shute, *Lessons Learned and Best Practices of Stealth Assessment*](https://myweb.fsu.edu/vshute/pdf/IJGCMS.PDF)).

The client's §1.10 already demands ECD's separation in different words:

| ECD layer | Spec's term | Concrete table |
|---|---|---|
| Competency model | מיומנות | `skills` (5 rows, fixed) |
| Task model | מכניקה + תוכן | `mechanics` (6 rows) × `content_items` (8 letters, 14 niqqud combos, 7 words) |
| Task instances | משימה | `tasks` (25 rows, the §15 table, authored as data) |
| Evidence model | תיעוד + סטטוס | `observations` (the §17 field list) + a derived status function |
| Claims | מפת ידע | `skill_status` — **computed, never stored as truth** |

That mapping is the deliverable. It satisfies §1.10's "add a mechanic without
touching the skill definitions" (`tasks` references `skill_id` and `mechanic_id`
as separate foreign keys) and §3.11's cross-tab report (group `observations` by
`skill_id` × `mechanic_id`).

### Why NOT BKT for this MVP

BKT models mastery as a binary latent state with four per-skill parameters
(prior, learn, slip, guess) and is the standard in intelligent tutoring systems
([Wikipedia: Bayesian knowledge tracing](https://en.wikipedia.org/wiki/Bayesian_knowledge_tracing);
[BKT overview](https://www.emergentmind.com/topics/bayesian-knowledge-tracing-bkt)).
Three concrete reasons it does not fit here:

1. **The parameters have to come from somewhere.** Fitting slip/guess/learn per
   skill needs hundreds of learners' response sequences. On day one you would be
   inventing four numbers per skill and then presenting their output to a parent
   as fact. That is worse than a threshold rule, because it *looks* principled.
2. **The observation budget is ~5 per skill per session.** BKT's posterior barely
   moves in five opportunities from a hand-set prior.
3. **It buys nothing the client asked for.** The spec wants three named statuses
   and an exposure count, not a continuous probability.

The honest version: BKT's own optimal policy, under common parameter regimes,
*reduces to* the simple heuristics anyway. The "N-consecutive-correct-in-a-row"
rule and a simplified ALEKS rule have been shown to be optimal policies for
variants of the BKT model
([Käser et al. / Mastery Learning Heuristics and Their Hidden Models, AIED 2020](https://link.springer.com/chapter/10.1007/978-3-030-52240-7_16)).
So the heuristic is not a cheap substitute for BKT — for this data volume it *is*
BKT, without the unfittable parameters.

### Why NOT Elo for this MVP

Elo-based learner modeling is genuinely excellent for adaptive practice of *facts*
and is the pragmatic default in large systems, because it estimates learner skill
and item difficulty on the same scale online and self-corrects
([Pelánek, *Applications of the Elo rating system in adaptive educational systems*](https://www.fi.muni.cz/~xpelanek/publications/CAE-elo.pdf);
[Pelánek & Papoušek, *Elo-based learner modeling for the adaptive practice of facts*](https://link.springer.com/article/10.1007/s11257-016-9185-7)).
It is also the algorithm with the best predictive power in at least one
game-based competency study
([Adapting Knowledge Inference Algorithms … through a Puzzle Game, TKDD 2023](https://dl.acm.org/doi/10.1145/3614436)).

But Elo needs volume on both axes. With 25 fixed items and ~5 observations per
skill, item difficulties never converge, and the output is a continuous rating
that is meaningless on a parent screen. Notably, a direct comparison found that
with **small numbers of items**, Bayesian IRT-1PL gave the most accurate skill
estimates, with Elo close behind
([Comparing Elo, Glicko, IRT, and Bayesian IRT, Univ. of Arkansas](https://scholarworks.uark.edu/etd/3201/))
— but "close behind on a rating you will never show anyone" is not a reason to
build it.

**Keep Elo as the documented v2 path.** The `observations` table below is exactly
the input Elo (or BKT) needs, so this is a one-file swap later, not a rewrite.

### Recommended rule — concrete, with parameters

A **scored exposure** = one task round that reached a terminal outcome. Response
time and hint state are recorded on it. Statuses are recomputed from the log on
every read.

```
For each (child_id, skill_id):
  n = count of scored exposures

  clean_success = is_correct
                  AND attempt_number == 1
                  AND hint_used == false
                  AND options_presented >= 3      <-- see "guessing" below

  status =
    "חדש"            if n < 3
    "הצלחה עקבית"    if n >= 3
                        AND last 3 scored exposures are all clean_success
                        AND (skill is covered by >=2 mechanics
                             -> those 3 span >=2 distinct mechanic_ids)
    "בתרגול"         otherwise
```

**Why 3, and why `options_presented >= 3`.** This is the guessing correction, and
it matters more than the choice of algorithm. With 3 options, chance is 33%; three
consecutive lucky guesses is 3.7% — acceptable. With 2 options (the spec's
difficulty reduction, §1.3), chance is 50% and three in a row is 12.5% — too weak
to certify mastery. So **successes on reduced 2-option rounds are logged and shown
in the exposure count, but never promote a skill to `הצלחה עקבית`.** They can
still clear a difficulty flag (see below), because the goal there is to end on a
positive experience, not to certify.

The `>=2 mechanics` clause directly implements §1.4.7 / §1.3 acceptance ("the
same skill is tested in more than one mechanic") and §3.11.

### The "consistent difficulty" flag (trigger for תעלומת הסימנים האבודים)

The spec is emphatic (§1.4.6, §1.6.1, §3.8, §10.1): one error must never conclude
anything. Recommended trigger, per `(child_id, skill_id, content_item_id)` — note
it is keyed on the **letter**, not just the skill, because §10.2 requires naming a
specific target letter:

```
needs_reinforcement =
      exposures_for_this_letter >= 3
  AND count(not clean_success) >= 2
  AND those >=2 struggles span (>=2 distinct mechanic_ids OR >=2 distinct session_ids)
  AND no reinforcement adventure already run for this letter in the last 7 days
```

Plus two guardrails I strongly recommend:

- **At most one adventure per session.** Otherwise a tired or distracted child
  gets three consecutive "mystery" adventures and the special-ness evaporates.
- **Tie-break by count, then recency.** If several letters qualify, pick the one
  with the most struggles; ties go to the most recent. Deterministic, so it is
  testable — which §3.9 requires ("can be triggered in at least one test scenario,
  for the correct skill").

### Response time — log it, do not act on it

§1.4.4 requires recording time from options-shown to selection. Record it. Do
**not** feed it into status. With 5–7 year olds, response time is dominated by
noise the system cannot see: a parent talking, the child looking away, a sibling.
Recommendations:

- Clock starts when the instruction audio *finishes*, not when the round mounts —
  otherwise you are measuring narration length.
- Winsorize at 30 s when displaying (anything longer is "no response", handled by
  the §16.1 idle ladder anyway).
- Surface it to the parent screen at most as a soft descriptor ("ענה במהירות" /
  "לקח לו זמן לחשוב"), or not at all in MVP. §14.4's forbidden-word list means it
  must never read as slowness = weakness.

### What real products do

| Product | Model | What the grown-up sees |
|---|---|---|
| **Khan Academy Kids** | Adaptive learning path, mastery-based progression; more practice on unmastered components; grown-up can manually override the level | Skill mastery, time spent, areas needing reinforcement — explicitly *not* grades or test scores ([KA Kids: learning path](https://khankids.zendesk.com/hc/en-us/articles/360048828572-Learn-more-about-the-Learning-Path), [level adjustment & progress](https://khankids.zendesk.com/hc/en-us/articles/360041615571-How-does-the-learning-level-adjust-and-how-do-I-view-my-child-s-progress)) |
| **Lalilo** (Renaissance) | Continuous performance-driven selection of the next exercise *and the right level of support* — support level is adapted, not just difficulty | Teacher dashboard with per-skill analytics; children earn rewards for **effort as well as mastery** ([Lalilo](https://www.lalilo.com/en), [Renaissance](https://www.renaissance.com/products/practice-instruction/lalilo/)) |
| **Duolingo ABC** | Fixed structured path (700+ lessons) over phonics/sight words; far less adaptive than the marketing suggests | Minimal grown-up reporting ([Duolingo ABC](https://www.academicschoice.com/apps/duolingo-abc.php)) |
| **Prodigy / mCLASS** | Prodigy is a placement + curriculum-map engine; mCLASS is a genuine benchmark assessment (DIBELS) — a different product category, explicitly a test | mCLASS shows risk tiers to *teachers*; that framing is exactly what §14.4 forbids for parents here |

Two transferable lessons: **Lalilo's "adapt the support, not only the difficulty"**
is precisely the spec's §1.5 help ladder — good sign the client's instinct is
mainstream. And **Khan Academy Kids lets the grown-up override the level manually**
— cheap, and it is the escape hatch for when the model is wrong about a real
child. Worth adding to the parent screen in v1.1.

### Recommended tables (minimum viable, matches §17)

```
children       (id, parent_id, display_name, avatar_id, companion_id, created_at)
sessions       (id, child_id, started_at, ended_at_or_null)
skills         (id, name_he)                                        -- 5 rows, seeded
mechanics      (id, name_he)                                        -- 6 rows, seeded
content_items  (id, kind, glyph, codepoints, name_he, audio_id)     -- letters/combos/words
tasks          (id, skill_id, mechanic_id, target_content_id,
                options[], correct_option, hint1, hint2, easier_task_id)
observations   (id, child_id, session_id, task_id, skill_id, mechanic_id,
                target_content_id, options_presented, selected_option,
                is_correct, attempt_number, response_time_ms,
                hint_used, hint_type, success_after_hint,
                reward_granted, created_at)
rewards        (id, child_id, kind, item_id, granted_at)
```

`observations` is append-only. Every attempt is a row, including wrong ones — that
is what makes §1.4 "reconstruct the child's sequence of actions" and §16.4 "save
immediately on exit" trivially true rather than a feature to build.

---

## B. Tech stack recommendation

### Bottom line

**Primary: React 19 + TypeScript + Vite for the client, with the three game
mechanics built in DOM/CSS — no game engine — plus a Hono + Drizzle API on
Cloudflare Workers and Cloudflare D1 created with the `eu` jurisdiction.**
Staying inside Cloudflare is a **genuine advantage here, not a trap**, because D1
now supports a hard EU jurisdiction constraint (not a soft "location hint"), which
resolves section C's residency question for free, and the account and credentials
already exist. **Fallback: the same client, a plain Node + Hono server, and
Supabase Postgres in `eu-central-1`** — choose it if the client wants a database
GUI and SQL their future hires will recognise.

### Client framework

| Option | Verdict for this project |
|---|---|
| **React + TS + Vite** ✅ | Largest hiring pool in Israel; the richest animation ecosystem (Motion, Lottie); Vite dev server is instant; zero server-rendering complexity to fight when the whole product is one stateful SPA. **Recommended.** |
| **SvelteKit** | Genuinely the best *technical* fit — smaller bundles, built-in transitions, less ceremony. Rejected only on team risk: a solo maintainer plus a client who may hire later is better served by React's labour market. If the team is and stays one person who likes Svelte, this is a defensible swap. |
| **Next.js** | Over-engineering. SSR/RSC/ISR buy nothing for an authenticated, stateful, offline-tolerant game; they actively complicate offline behaviour and the service worker. The only Next-shaped part of the product is the parent dashboard, and that does not justify the framework. |
| **Astro** | Wrong tool. Astro optimises content sites with islands. This is a single long-lived app session. |

### Game rendering — the contrarian call

The generic advice is "use Phaser for a game"
([Phaser vs PixiJS 2025](https://generalistprogrammer.com/comparisons/phaser-vs-pixijs)).
**Do not.** For *these three mechanics*, DOM + CSS is the better engine:

- **The content is Hebrew text with niqqud.** In the DOM you get the browser's
  text shaper, font fallback, and combining-mark positioning for free. In a canvas
  you are one `fillText` call away from the section-E niqqud bugs with no CSS
  escape hatch, and no way to inspect what went wrong.
- **The mechanics are tap-a-target, not physics.** Balloons, fishing and the train
  are 3–4 elements, a tween, and a hit test. Phaser's scene graph, arcade physics,
  and 1.2 MB bundle solve problems this game does not have.
- **The existing art is 83 raster assets**, already sized for CSS layout.
- **Accessibility, RTL and DevTools inspection** all keep working.

Use **Motion (framer-motion)** for the juice, plus the CSS View Transitions API for
screen changes — the current vanilla app already uses `document.startViewTransition()`
successfully (per `HANDOFF.md`). Note the handoff's hard-won lesson: the previous
codebase silently killed ~45 animations by putting a timing function inside a
duration token. Keep duration tokens duration-only.

**Escalation path (document it, don't build it):** if a future mechanic needs
hundreds of particles or real physics, mount a Phaser or PixiJS canvas *inside a
single React component* for that one station. The station registry seam already
present in the old codebase (`stationRegistry.js`) is the right shape for this.

### Server

**Hono + TypeScript + Drizzle ORM.** Hono runs identically on Workers and on Node,
which is what makes the primary/fallback swap cheap. Drizzle generates SQL
migrations as plain files and works against both D1 (SQLite dialect) and Postgres,
so the ORM choice does not lock the database choice. Prisma is heavier and its
Workers story is more awkward; skip it.

### Database / backing service

| Option | Cost | Residency | Ops burden | Honest verdict |
|---|---|---|---|---|
| **Cloudflare D1** ✅ | Free tier covers this entirely; 10 GB/db on Workers Paid ([D1 limits](https://tanstackship.com/blog/cloudflare-d1-production-guide)) | **Hard `eu` jurisdiction constraint** — explicitly for GDPR, unlike Durable Object *location hints* which Cloudflare says are best-effort and not appropriate for GDPR ([D1 data location](https://developers.cloudflare.com/d1/learning/data-location), [DO data location](https://developers.cloudflare.com/durable-objects/reference/data-location/)) | Lowest — one vendor, one deploy | Single-writer, ~500–2000 writes/s, eventual consistency on replicas. For a few hundred children writing ~30 rows each, that is three orders of magnitude of headroom. Real cons are tooling lock-in and no DB GUI, not scale. |
| **Supabase Postgres** ✅ (fallback) | Free tier 500 MB, but **free projects sleep after 1 week idle and need manual restore** — a real trap for a slow-moving MVP demo. Pro ≈ $25–31/mo ([Supabase pricing](https://makerkit.dev/blog/saas/supabase-pricing)) | `eu-central-1` (Frankfurt) | Low; you get auth, RLS and a table editor | The best fallback: real Postgres, a GUI the client can look at, RLS gives per-parent isolation almost free. Note the CLOUD Act caveat that applies to any US-incorporated provider ([analysis](https://danubedata.ro/blog/supabase-alternatives-europe-gdpr-2026)). |
| **Neon Postgres** | Cheaper at low usage (~$15–26/mo), best-in-class idle behaviour ([Neon vs Supabase](https://designrevision.com/blog/supabase-vs-neon)) | EU regions available | Low, but it is *only* a database | Great DB, no auth/storage. Fine if you are happy adding Better Auth yourself. |
| **Local SQLite + Drizzle** | Free | Wherever the box is | You now own backups | Correct only if the client insists on self-hosting in Israel. Then it is genuinely simple and fine. |
| **Firebase** ❌ | Free tier generous | Region selectable but Google-owned end to end | Lowest of all | **Avoid.** Firestore's data model fights the relational entity separation §1.10 explicitly demands, and a children's-data product is the worst place to adopt a Google SDK that phones home from the client. |

### Is staying on Cloudflare a trap?

Honest answer: **no, for three specific reasons, and the usual objection does not apply here.**

1. The credentials, account and image-generation pipeline (`tools/Generate-Image.ps1`,
   Workers AI flux-1-schnell) already exist. That is real, already-paid-for setup.
2. D1's `eu` jurisdiction is a *hard* constraint created at database-creation time,
   not a hint. This is the cheapest correct answer to section C. Note the trap
   *within* the trap: if you ever reach for Durable Objects, location hints are
   explicitly **not** GDPR-appropriate — you must use a jurisdiction-restricted
   namespace there too.
3. Cloudflare now recommends Workers-with-static-assets over Pages for new projects,
   static asset requests are free, and it collapses frontend+backend into one deploy
   ([Pages vs Workers 2026](https://mecanik.dev/en/posts/cloudflare-pages-vs-workers-which-to-use-in-2026/),
   [Cloudflare migration guide](https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/)).
   Use Workers static assets, not Pages.

Where it *would* be a trap, and is not here: if you needed heavy write throughput,
long-running server processes, Postgres extensions (PostGIS, pgvector), or a
database your client's future DBA can open in pgAdmin. None of that applies. The
one genuine cost is lock-in: D1 is not portable Postgres. Drizzle mitigates most
of it, but a migration would be real work. **Accept that consciously**; it is
worth roughly 12 months of zero-ops and zero-cost.

### Two things the stack must handle that are easy to miss

1. **Offline tolerance is a data-integrity requirement, not a nicety.** §1.4
   ("data saved even if the child leaves mid-session") and §16.4 ("save
   immediately on exit; never reset progress") mean the client must be the
   session's source of truth. Pattern: append every `observation` to an
   **IndexedDB outbox** synchronously, then flush to the API in batches; flush
   again on `visibilitychange`/`pagehide` via `navigator.sendBeacon`. The server
   deduplicates on a client-generated observation UUID. This makes §3.7's
   "≥95% of tasks produce a valid record" achievable instead of aspirational.
2. **25.5 MB of PNGs will not survive a first load on an Israeli mobile
   connection.** Convert to WebP (and AVIF where worthwhile) at build time —
   typically a 60–80% reduction on this kind of flat illustration art — and
   precache via a service worker with a versioned manifest. Do this before the
   child-testing round, not after; a slow first load will contaminate the §3.1
   and §3.6 acceptance measurements.

---

## C. Children's data privacy & compliance

> Not legal advice. This is the practical shape; have an Israeli privacy lawyer
> review the consent text and the privacy notice before real children use it.

### Bottom line

**Israeli law is the binding regime, and its practical effect is one design
decision: the parent is the account holder and the child is a profile underneath
them.** Amendment 13 (תיקון 13) has been in force since **14 August 2025** and
demands explicit, granular, documented consent; minors cannot give it themselves.
**No law forbids any particular hosting region for this product** — Israel holds a
renewed EU adequacy decision — so hosting in the EU (Frankfurt) is clean under both
regimes and is what I recommend. Skip GDPR and COPPA exposure entirely for the MVP
by not marketing outside Israel.

### Israeli Privacy Protection Law + Amendment 13

- **In force 14 Aug 2025.** It expands "personal data" to include online
  identifiers, IP addresses and geolocation; redefines "especially sensitive data";
  requires **explicit, documented and granular** consent; and lets individuals sue
  without proving damage ([IAPP](https://iapp.org/news/a/israel-marks-a-new-era-in-privacy-law-amendment-13-ushers-in-sweeping-reform),
  [Pearl Cohen](https://www.pearlcohen.com/israel-significant-amendment-to-the-privacy-law-takes-effect/),
  [Library of Congress](https://www.loc.gov/item/global-legal-monitor/2025-11-17/israel-amendment-to-privacy-protection-law-goes-into-effect/)).
- **Extraterritorial.** Processing data on Israeli residents triggers it with or
  without a local office ([overview](https://safetica.com/resources/guides/israel-s-amendment-13-what-the-new-data-protection-law-means-for-your-business)).
- **Minors.** Israel has no COPPA-equivalent age gate. Instead the Legal Capacity
  and Guardianship Law 5722-1962 makes a minor's legal acts voidable without
  guardian consent, and infringement of a minor's privacy is subject to the
  parents' consent ([Baker McKenzie, Israel](https://resourcehub.bakermckenzie.com/en/resources/global-data-and-cyber-handbook/emea/israel/topics/legal-bases-for-processing-of-personal-data),
  [Winston & Strawn](https://www.winston.com/en/blogs-and-podcasts/privacy-law-corner/israeli-site-needs-parental-consent-under-local-law-to-collect-information)).
  **→ The child never creates the account. The parent does.**
- **DPO:** required for public bodies, data brokers, entities whose *core activity*
  is processing especially sensitive data, or those doing **systematic monitoring**
  ([EuroCloud](https://eurocloud.org/news/article/new-amendment-to-israeli-privacy-protection-law-and-mandatory-dpo-appointment/)).
  My read: an MVP with a few dozen children does not trigger this. **But** flag it
  honestly — "systematic monitoring" is the hook a regulator could reach for in a
  product whose entire premise is continuously observing a child's behaviour. Ask
  counsel; do not decide this internally.
- **Database notification** to the PPA applies at **100,000+ data subjects** with
  especially sensitive data ([Baker McKenzie](https://resourcehub.bakermckenzie.com/en/resources/global-data-and-cyber-handbook/emea/israel/topics/dpos-and-notification-requirements)).
  Not applicable.
- **Sector precedent, and a warning:** the PPA has already audited Israeli
  educational apps collecting data on minors and found **serious security defects
  in most of them** ([Calcalist](https://www.calcalist.co.il/internet/articles/0,7340,L-3779710,00.html)).
  This is a watched category. Treat basic security hygiene as compliance work, not
  engineering polish.

### GDPR and COPPA — scope them out deliberately

- **GDPR** only bites if you offer the service to people in the EU. For the MVP,
  **do not**. If the client later wants EU users, the good news is that Israel's
  adequacy decision was **renewed on 15 January 2024**, so EU→Israel transfers
  remain lawful ([Israeli PPA](https://www.gov.il/en/pages/adequacy),
  [Pearl Cohen](https://www.pearlcohen.com/eu-renews-israels-data-protection-adequacy-recognition/)).
  Caveat worth knowing: civil-society groups are actively pressing the Commission
  to reassess that status ([EDRi](https://edri.org/our-work/data-flows-and-digital-repression-civil-society-urges-eu-to-reassess-israels-adequacy-status/)) —
  so do not build a business model that *depends* on adequacy persisting.
- **COPPA** only bites if the service is directed to US children or you knowingly
  collect from them. The 2025 amendments took effect 23 June 2025 with a
  compliance deadline of 22 April 2026, and added explicit retention limits and a
  mandatory **written security programme for children's information**
  ([FTC amendments summary](https://usercentrics.com/us/knowledge-hub/coppa-compliance/),
  [practical guide](https://blog.promise.legal/startup-central/coppa-compliance-in-2025-a-practical-guide-for-tech-edtech-and-kids-apps/)).
  Even though it does not apply, **adopt the retention limit and the written
  security note anyway** — both are ~half a day of work and both are things
  Amendment 13 makes you want regardless.

### What to actually build

**Parent consent flow (first run, before any child data exists):**

1. Parent email + password. No social login (avoids third-party identifiers).
2. A consent screen in plain Hebrew that names, in a bulleted list, exactly what
   is collected: the child's chosen display name, chosen avatar, and a record of
   each game round (which task, what was chosen, how long it took, whether a hint
   was used). Say plainly that **no photos, no voice, no location and no contact
   details are collected from the child**.
3. **Granular** toggles — Amendment 13's word. One required checkbox for the
   service itself; a *separate, default-off* checkbox for anything optional
   (e.g. "use anonymised data to improve the game"). Never bundle them.
4. Store consent as a row: version of the consent text, timestamp, IP,
   parent id. "Documented" is a literal requirement.
5. *Then* create the child profile. §2.2 already offers "pick a name from a list /
   type a short name / skip" — good. Add a one-line nudge to use a nickname.

**Data minimisation, concretely:**

- Do not collect date of birth. If an age band is needed for content, ask for it
  as a band (5 / 6 / 7) on the child profile — it is not identifying.
- No third-party analytics SDK. Roll your own event count into your own database
  or use nothing. A Google Analytics tag on a children's product is the single
  fastest way to fail an audit.
- **Self-host the Hebrew webfont.** A `fonts.googleapis.com` link leaks every
  child's IP to Google on every page load, and Amendment 13 now explicitly counts
  IP addresses as personal data. This also happens to be the right call for
  section E's rendering reliability. One change, two problems solved.
- Truncate or short-retain server access logs (7–30 days).

**Retention:**

- Default: **delete or irreversibly anonymise 24 months after last activity.**
  Anonymise = drop `child_id`/`display_name`, keep the observation rows under an
  opaque cohort id if the client wants aggregate research data. Run it as a
  scheduled job (Cloudflare Cron Trigger), not a manual promise.
- A parent-facing **"מחיקת הפרופיל"** button that performs a real cascade delete.
  Amendment 13 strengthened data-subject rights and removed the need to prove harm
  to sue; a delete button that does not delete is now a genuinely expensive bug.

**Hosting region:** nothing forbids any region. EU (Frankfurt) is the low-friction
choice under both PPL and any future GDPR exposure, and costs nothing extra —
D1 `eu` jurisdiction or Supabase `eu-central-1`. Israeli hosting is equally fine
legally and slightly better latency; it is a worse operational story for a solo
maintainer. **Recommend EU.**

---

## D. Age 5–7 interaction constraints

### Bottom line

**The client's "no visible test, no red X, no penalty" stance is well supported by
the evidence — keep it exactly as written.** But there is a real failure mode
inside it, and the spec currently has that gap: removing *evaluative* feedback is
correct; removing *informational* feedback would be a serious pedagogical mistake.
The child must always end a round having seen and heard the correct answer. Also:
**make everything tap-only — do not require dragging** — and size the game objects
at ~80 CSS px minimum, roughly double the adult guideline.

### Touch targets and motor constraints

The standard adult recommendation is 7–10 mm (Android's 48dp). That is **not
sufficient** here: children aged 7–10 miss 7 mm targets **almost 30% of the time**,
and miss rates rise sharply as targets shrink from 12.7 mm to 3.2 mm
([research summary](https://medium.com/@zacdicko/size-matters-accessibility-and-touch-targets-56e942adc0cc);
[Touchscreen Prompts for Preschoolers, Univ. of Washington](http://faculty.washington.edu/alexisr/TouchscreenPrompts.pdf)).

Recommended, in CSS pixels (1 CSS px ≈ 0.265 mm at 1× density):

| Element | Minimum | ≈ physical |
|---|---|---|
| Primary game objects (balloon, letter tile, fish, train car) | **80 × 80 px** | ≈ 21 mm |
| Any other tappable control (replay audio, back, "כן/לא עכשיו") | **64 × 64 px** | ≈ 17 mm |
| Gap between adjacent targets | **≥ 24 px** | ≈ 6 mm |
| Dead zone at screen bottom/edges | **≥ 15% of height, no interactive elements** | — |

**Do not require dragging.** Direct observation of 3–6 year olds found they
struggle to point with one finger, **tend to rest the forearm on the surface
causing incorrect selections**, and **fail at keeping a target selected while
dragging it** ([Touch Interaction for Children Aged 3 to 6 Years, IJHCS 2015](https://mintviz.usv.ro/publications/ijhcs2015.pdf)).

Concrete spec implication: **דיג אותיות (§5) must be tap-the-letter, with the rod
animating automatically to it — not "drag the rod to the letter."** Same for §9.5's
matching task ("חבר את הצירוף לצליל שלו"): implement as tap-then-tap, not
drag-and-drop. And §10.5's letter-tracing ("עקוב באצבע אחר מסלול האות") is
unavoidably a drag — so it needs a wide tolerance corridor and must **never be a
gate**; the spec already says "מתקשה: המסלול מוצג מודגש יותר", which is right.

Also: **listen to the primary pointer only, ignore extra simultaneous touches.**
That single line of code is the palm-rejection fix for the forearm problem.

### Reading load and audio-first design

NN/g segments children as pre-readers (3–5), **beginner readers (6–8)**, and
moderately skilled readers (9–12), and recommends **a few seconds of clearly
recorded audio in age-appropriate language for non-readers**
([NN/g, UX Design for Children](https://www.nngroup.com/reports/children-on-the-web/),
[Children's UX: Usability Issues](https://www.nngroup.com/articles/childrens-websites-usability-issues/)).
The target band straddles pre- and beginner-reading, which means the on-screen
text can never carry the instruction.

Rules for this build:

- **Audio is the instruction; text is a redundant support.** Max one line, ~5–7
  words. §4/§5/§6 already do this correctly.
- A **persistent, always-available replay control** — not one that appears only
  after a delay. §11.2 already has "בוא נקשיב שוב" in the ladder; make it a
  standing button as well.
- **Never auto-advance while audio is playing**, and never overlap two clips.
  Queue, or cancel-then-play.
- Large, real-world-referential icons; the existing art already does this.

### Session length

Screen-time guidance for 5–12 is ≤2 h/day of mixed use
([AACAP](https://www.aacap.org/AACAP/Families_and_Youth/Facts_for_Families/FFF-Guide/Children-And-Watching-TV-054.aspx)),
but the relevant number is *sustained attention on one task*: roughly **15 minutes**
for a 5–7 year old on a hands-on task with a clear goal and an adult nearby. There
is no single validated figure; treat 15 min as a design target, not a fact.

§19's full sequence is 25 tasks. At ~20 s per round plus transitions, celebrations
and the reinforcement adventure, that is realistically **12–18 minutes** — at or
just past the ceiling. Recommendations:

- Target **10–15 minutes** for the complete first session.
- Make **every station boundary a clean stopping point** that saves and can resume
  (§16.4 already requires this) — so a child who stops after two mechanics still
  produced a valid record and a positive ending.
- Consider making the §7/§8/§9 blocks (sound-matching, initial-sound, niqqud) a
  *second* session rather than a continuation. Nine consecutive rounds of
  audio-discrimination after three game stations is where a 5-year-old checks out,
  and it would depress the §3.6 completion metric for reasons that have nothing to
  do with the design being wrong.

### The "no red X, no penalty" question — the evidence, honestly

**Backing the client's instinct:**

- In the most directly relevant study I found — **150 children aged 6–8** playing a
  maths game with trial-by-trial feedback — children who received a higher
  proportion of negative feedback **stopped the game earlier**, and the effect was
  stronger for children with high maths anxiety *and*, surprisingly, for those with
  high maths self-concept (interpreted as identity threat)
  ([Should I stay or should I go?, 2025](https://pmc.ncbi.nlm.nih.gov/articles/PMC12338047/)).
  This is close to a direct experimental validation of §1.1.6–7 and §21 for exactly
  this age band.
- Self-determination theory says the same thing mechanistically: **competence** is
  a basic psychological need, and negative feedback framed by social comparison
  thwarts it, reducing motivation and internalisation
  ([SDT in digital games](https://link.springer.com/chapter/10.1007/978-3-319-29904-4_8),
  [The Sunny Side of Negative Feedback](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8388853/)).
  That is a strong argument specifically against **scores, percentages, rankings
  and comparison** — all of which §21 already bans.
- Errorless learning is not a soft option. A 2024 study across a corpus analysis
  (N = 227) and two preregistered experiments (N = 56, N = 99) with 3–4 year olds
  found that **error-based learning was not always effective, and where it was, it
  was not superior to errorless learning** — and that naturalistic corrective
  feedback was infrequent, low in informational value, and rarely used by children
  to self-correct
  ([Waller, Yurovsky & Nozari, *Of Mouses and Mans*, Cognitive Science 2024](https://pubmed.ncbi.nlm.nih.gov/39467041/)).
  Critically, that study's setting was **non-pedagogical/incidental** — which is
  exactly the frame this game adopts by design.

**Where it could backfire, and the fix:**

The phonics literature is unambiguous that systematic, explicit instruction **with
immediate corrective feedback** is what produces letter-sound gains — modelling,
then guided practice, then immediate corrective feedback
([National Reading Panel](https://www.nichd.nih.gov/publications/pubs/nrp/findings);
[Put Reading First, NICHD](https://www.nichd.nih.gov/sites/default/files/publications/pubs/Documents/PRFbooklet.pdf);
[evidence snapshot](https://www.kyreadingresearch.org/resource/evidence-snapshot-for-educators-effective-phonics-instruction/)).
Note too that in the 150-child study above, even the "negative feedback" condition
**showed the correct response** — the harm came from the evaluative framing, not
from the information.

So the distinction that resolves the tension:

| Feedback type | Example | Verdict |
|---|---|---|
| **Evaluative** | "טעית", red X, score, %, ranking, losing coins | **Remove — the client is right, and the evidence supports it.** |
| **Informational** | Playing the right letter's name/sound, highlighting the correct answer, modelling the action | **Essential. Removing this would break the learning.** |

**Two concrete gaps in the current spec:**

1. **§4.4 / §5.4 / §6.4 never guarantee the child ends the round having seen and
   heard the correct pairing.** The ladder can terminate at "משימה פשוטה יותר"
   with the child still never having been shown which letter was מֵם. **Add an
   explicit closing rule**: when any round ends — success, hinted success, or an
   easier substitute — the correct letter is highlighted and its name/sound plays
   once, framed positively ("זאת מֵם!"). This is the single highest-value
   learning-science change to the spec, and it costs one function.
2. **§16.2 (repeated taps on the same distractor: no penalty, no blocking) invites
   button-mashing** — with 3 options, brute force succeeds in ≤3 taps, which both
   corrupts the assessment data and risks the child rehearsing the wrong pairing.
   Fix without adding punishment: after the **second** wrong tap, (a) require the
   instruction audio to replay before the next attempt is accepted, and (b) invoke
   the spec's own step 4 — quietly deactivate one distractor (dimmed, non-reactive;
   not red, not removed abruptly). Both are already in the spec's vocabulary; they
   just need to be mandatory rather than optional.

---

## E. Hebrew-specific technical pitfalls

### Bottom line

The niqqud problem is real, it is a **code-point ordering** problem more than a
font problem, and it is completely solvable with three rules: store the combos in
`[letter][dagesh/shin-dot][vowel]` order, **never call `.normalize()` on them**,
and **self-host one font that covers base letters and all marks**. For audio,
**use pre-recorded human recordings for everything and ship no TTS at all** — the
content is 25 fixed tasks, TTS cannot produce the elongated phonemes ("ממממ") or
isolated niqqud syllables the spec requires, and `he-IL` voice availability is not
guaranteed on any platform. For RTL, the one trap that will actually bite is that
`transform` is **not** direction-aware.

### Niqqud rendering

**The core bug.** Unicode's canonical ordering places the vowel *before* the
dagesh/shin-dot, but many renderers expect **`[base letter][dagesh or sin/shin dot][vowel]`**.
For the dagesh to reliably appear *inside* the letter rather than floating outside
it, that is the order you must emit
([Wikimedia T4399](https://phabricator.wikimedia.org/T4399);
[Unicode Hebrew composition model thread](https://unicode.org/mail-arch/unicode-ml/y2003-m10/0693.html);
[Hebrew/Unicode reference](https://grokipedia.com/page/Unicode_and_HTML_for_the_Hebrew_alphabet)).

The §9.3 combo table is exactly where this bites. The correct sequences:

| Combo | Code points | Note |
|---|---|---|
| `מַ` | U+05DE, U+05B7 | patah |
| `מָ` | U+05DE, U+05B8 | qamats |
| `שַׁ` | U+05E9, **U+05C1**, U+05B7 | shin dot **before** vowel |
| `שָׁ` | U+05E9, U+05C1, U+05B8 | |
| `בַּ` | U+05D1, **U+05BC**, U+05B7 | dagesh **before** vowel |
| `בָּ` | U+05D1, U+05BC, U+05B8 | the classic failure case |
| `גַּ` / `גָּ` | U+05D2, U+05BC, U+05B7/U+05B8 | |
| `דַ` / `דָ`, `רַ` / `רָ`, `לַ` / `לָ` | letter + vowel | no dagesh needed for the MVP |

**Action items:**

1. Put every combo in a **TypeScript constants file as explicit `בָּ`
   escapes**, not as literal glyphs pasted into JSX. Editors, formatters, git
   filters and copy-paste all silently reorder combining marks.
2. **Add a unit test asserting `[...combo].map(c => c.codePointAt(0))` for all 14
   combos.** This is ~20 lines and it permanently prevents an entire class of
   invisible content bug.
3. **Never call `String.prototype.normalize()`** on this content, anywhere. NFC
   will reorder it. Also check that no build tool or DB collation does it for you.
4. Store `codepoints` alongside `glyph` in `content_items` so a corrupted glyph is
   detectable in the database.

**Fonts.** Self-host, do not use the Google Fonts CDN (see section C).
Niqqud-capable options, all open-licensed: **Noto Sans Hebrew** (explicitly
supports niqqud; designed for cross-platform consistency),
**Frank Ruhl Libre**, **Heebo**, **Alef**, **Rubik** (niqqud added, weight coverage
has historically been uneven), and for a heavier typographic look the
**Culmus** family (Taamey Frank CLM, Keter YG)
([Noto Sans Hebrew](https://fonts.google.com/noto/specimen/Noto+Sans+Hebrew);
[Google Fonts Hebrew niqqud issue thread](https://github.com/google/fonts/issues/7553);
[open Hebrew font collection](https://github.com/aharonium/fonts)).

Recommendation: **Noto Sans Hebrew for everything, self-hosted as WOFF2, subset to
the Hebrew block + niqqud.** One family, one file. The reason to use *one* family
is subtle and important: per-character font fallback can place the base letter in
one font and its combining marks in another, which destroys mark positioning. A
single family that covers base + all marks makes fallback impossible.

**Testing.** Build a niqqud smoke-test page rendering all 14 combos at 24 px and at
120 px, and screenshot it on **Windows Chrome, iOS Safari, and Android Chrome**.
Historic renderer problems are largely fixed on modern browsers, but iOS/WebKit
fallback positioning has been the persistent weak spot, and the published browser
test suites exist precisely because this varies
([browser test for the Hebrew Unicode range](https://aharon.varady.net/browser-test/);
[how-to on @font-face, BIDI and diacritics](https://aharon.varady.net/browser-test/how-to.html)).
One helpful accident of this design: the game shows letters **huge**, where
misplaced marks are obvious. At 16 px they are invisible-but-wrong.

### Hebrew audio — recommendation: no TTS in the product

**Ship ~100 pre-recorded human clips. Do not call a TTS API at runtime, and do not
use the Web Speech API.** Five reasons, in order of weight:

1. **TTS cannot produce what the spec asks for.** §7 requires elongated phonemes
   ("ממממ", "שששש", "רררר"); §9 requires isolated niqqud syllables ("מַ", "שַׁ",
   "בָּ"). TTS engines normalise or strip niqqud unpredictably and have no notion
   of "hold this consonant for 1.5 seconds." A human reader does this in one take.
2. **The content is closed.** 8 letter names + ~8 phonemes + 14 niqqud combos +
   7 words + ~60 instruction/feedback lines ≈ **100 clips**. That is one afternoon
   in a studio, and §1.5 already specifies the delivery ("אחידות, ברורות, איטיות").
3. **`he-IL` voice availability is not guaranteed and has no fallback.** Apple
   platforms ship exactly one Hebrew voice (Carmit); Windows needs the Hebrew
   language pack for Asaf; Android/Chrome depends on Google TTS Hebrew data being
   downloaded. `speechSynthesis.getVoices()` can legitimately return nothing for
   `he-IL`, and Android is known to under-report which voices are actually usable
   ([AppleVis on Hebrew voices](https://applevis.com/forum/other-apple-chat/studying-biblical-hebrew-it-possible-apple-products);
   [Microsoft Narrator supported voices](https://support.microsoft.com/en-US/accessibility/windows/narrator/appendix-a-supported-languages-and-voices);
   [lessons learned using speechSynthesis](https://talkrapp.com/speechSynthesis.html)).
   For a product whose instructions are *entirely* audio, a silent device is a
   total failure, not a degraded experience.
4. **Offline tolerance.** Pre-recorded clips are precached by the service worker.
   TTS is not reliably offline.
5. **Cost and the standing rule.** Zero recurring cost, and it respects the
   project's rule about not calling Google Cloud TTS without explicit go-ahead —
   permanently, not just during development.

**Rejected alternatives, for the record:** open-source offline Hebrew TTS is not
viable — Piper has no Hebrew voice, and the community's assessment of the only open
Hebrew model, `mms-tts-heb`, is that quality is poor
([Piper Hebrew request thread](https://github.com/rhasspy/piper/issues/538)).

**Recording spec:** mono, 44.1 kHz; encode to AAC/M4A with an Opus/WebM fallback;
normalise to about −16 LUFS so no clip is louder than another; trim leading
silence to ~100 ms. One JSON manifest mapping `audio_id → file`. Roughly 3 MB
total. Keep raw WAVs — you will re-cut some.

**Escalation path:** if a later version needs dynamic Hebrew speech (e.g. reading
back a child's typed name), evaluate a paid API then — Google Cloud TTS `he-IL`,
Azure (Avri/Hila), or ElevenLabs — and get explicit permission first. It is not an
MVP need. For §2.2's typed name specifically, sidestep it: only speak names chosen
from the predefined list, and use a generic line for typed names.

### RTL traps

Set `dir="rtl"` and `lang="he"` on `<html>`, and use CSS logical properties
throughout (`margin-inline-start`, `inset-inline-start`, `padding-block`,
`border-inline-end`). Flexbox and grid flip automatically. What does **not**:

| Trap | Why | Fix |
|---|---|---|
| **`transform: translateX()` / `scaleX()`** | Transforms are defined purely on physical axes and have **no logical longhands** — this is a known, unresolved CSS gap ([w3c/fxtf-drafts#311](https://github.com/w3c/fxtf-drafts/issues/311)) | Define `--dir: 1` on `[dir=ltr]`, `--dir: -1` on `[dir=rtl]`, and write `translateX(calc(var(--dir) * 100%))`. Do this **from day one** — retrofitting it across a finished animation layer is miserable. |
| Linear gradients (`to right`) | Physical | `[dir="rtl"]` override |
| `box-shadow` / `text-shadow` X offsets | Physical | multiply by `--dir` |
| `background-position: left` | Physical | logical keywords or override |
| Icon direction (arrows, the fishing rod, the train) | Art has a baked-in direction | `[dir="rtl"] .icon { transform: scaleX(-1); }` — but beware double-flipping something already drawn RTL |
| Numbers inside Hebrew text | Digits are LTR runs inside an RTL paragraph; "5 מטבעות" can reorder oddly around punctuation | wrap counters in `<bdi>` or `unicode-bidi: isolate` |
| Canvas / Phaser coordinates | No `dir` concept at all | another reason to keep the mechanics in the DOM (section B) |

([RTL styling reference](https://rtlstyling.com/posts/rtl-styling/);
[RTL design guide for developers](https://simplelocalize.io/blog/posts/rtl-design-guide-developers/))

**Framework notes.** React itself has no RTL logic — this is entirely CSS.
If using Tailwind, prefer the logical utilities (`ps-*`, `pe-*`, `ms-*`, `me-*`)
as the default and reserve the `rtl:` variant for transforms, gradients and
cursors, which have no logical form. **Motion/Framer Motion animates transforms**,
so every `x:` prop inherits the trap above — wrap it in a helper that multiplies
by direction.

**One product decision to make once:** the train in §6 travels along an axis.
Pick **right → left**, matching Hebrew reading direction, and **hardcode it** rather
than deriving it from `dir`. It is more intuitive for the child, it subtly
reinforces reading directionality, and hardcoding removes a whole category of
"which way is forward" bugs.

---

## Top 5 decisions this unblocks

1. **Learner model — decided.** ECD as the data architecture; a derived mastery
   heuristic, not BKT and not Elo. `הצלחה עקבית` = 3 consecutive first-attempt,
   unhinted successes on ≥3-option rounds, spanning ≥2 mechanics. Reinforcement
   fires only at ≥3 exposures on a letter with ≥2 struggles across ≥2 mechanics or
   sessions, capped at one adventure per session. Status is **computed from an
   append-only `observations` log, never stored**. → Unblocks the schema and the
   parent screen simultaneously.
2. **Stack — decided.** React 19 + TypeScript + Vite; the three mechanics in
   DOM/CSS with Motion, **no game engine**; Hono + Drizzle on Cloudflare Workers;
   Cloudflare D1 created with the **`eu` jurisdiction**. Fallback: same client,
   Node + Hono, Supabase `eu-central-1`. → Unblocks `winget install OpenJS.NodeJS.LTS`,
   repo scaffolding, and the client/server split the client asked for.
3. **Account and privacy model — decided.** The **parent is the account holder**;
   child profiles nest underneath. Versioned, granular, logged consent before any
   child data exists. No DOB, no third-party analytics, self-hosted fonts,
   24-month retention with a real delete button. → Unblocks onboarding screens
   (§2), which currently assume the child starts the flow.
4. **Audio — decided, and it is a parallel workstream that can start now.**
   ~100 pre-recorded Hebrew clips, no TTS anywhere in the runtime. → The recording
   script can be written straight off spec §1.5, §4–§10 and §20 today, independent
   of any code.
5. **Interaction contract — decided.** Tap-only (fishing and matching are **not**
   drag); ≥80 px game objects, ≥64 px controls, ≥24 px gaps; primary-pointer only;
   audio-first with a standing replay button; 10–15 min sessions with a clean exit
   at every station boundary; and **every round closes by modelling the correct
   answer** — the one substantive addition this research recommends to the spec.

---

## Where I am uncertain (flagged deliberately)

- **The DPO question under Amendment 13.** "Systematic monitoring" is the trigger
  I cannot rule out from the outside for a product built on continuous behavioural
  observation of children. My read is that an MVP does not trigger it. Get counsel
  to confirm before real children use it — this is the one item here I would not
  decide internally.
- **Session length.** The "15 minutes" figure is a reasonable design target, not a
  validated constant; the literature is explicit that no single validated number
  exists. Treat §19's full sequence as a hypothesis to measure during the child
  testing, and be prepared to split it into two sessions.
- **iOS niqqud rendering.** I did not have a device to test on. The historic
  problems are reportedly fixed on modern WebKit, but I would not ship without the
  three-platform screenshot test described in section E.
- **Elo's later value.** If the content grows past ~100 items and the user base
  past ~100 children, Elo becomes genuinely worth adding for item-difficulty
  calibration. I am confident it is wrong *now*; I am not claiming it is wrong
  forever.
