# Onboarding: Example Group, splash screen, and guided tutorial

## Context

First-time users currently land on an empty "My First Group" with no guidance. The launch checklist already names an onboarding pass as a goal (a stranger reaching a working schedule in under sixty seconds). This change gives new users three things:

1. A seeded **Example Group** with 24 ready-made players (12 men, 12 women, first name + last initial) so there is something to try immediately. "My First Group" is retired; users create and name their first real group when ready.
2. A **splash screen** at startup: large logo, app title, an invitation to the tutorial, Start Tutorial / Skip Tutorial buttons, and a "Don't show at startup" checkbox.
3. A **step-by-step tutorial**: spotlight style (screen darkened except the target, an arrow pointing at the control, the user performs the real action to advance), walking from adding a player through generating and managing a schedule, ending with a guided path toward creating their own group.

After approval: copy this plan into the project `PLANS/` folder (per convention) named for the work, e.g. `PLANS/onboarding-tutorial.md`.

### Decisions made with Jeff

- Splash shows for **existing users** after this update too (they have no tutorial flags yet). The Example Group itself is seeded only on fresh installs.
- The hourly re-show on the Players tab stops forever once the tutorial is **completed** or the checkbox is **ticked**. Skipping without the checkbox keeps the hourly re-show.
- The tutorial **ends guided**: after the "tutorial complete" card, it spotlights Start New Session (via Actions), then the Manage button, finishing with the "New group name" field highlighted in Manage Groups. No forced group creation; a Finish button ends it there.
- Re-running the tutorial builds a fresh temporary **"Tutorial Group"** with the same 24 players, deleted when the tutorial finishes or stops, restoring the user's previous group and session. A fresh install's first run uses the seeded Example Group directly and leaves its results behind.
- Stopping the tutorial returns to the Players tab, scrolled to top (first-run; see rerun nuance in "Interpretations to flag").

### Key codebase constraints (verified)

- Seeding lives in `src/lib/migrations.ts` `runMigrations()` (L45–52), which runs in `main.tsx` before React mounts, guarded by `if (!sharedKey)` so live-share viewers are never seeded. First-launch signal is `rosters.length === 0` — **but a legacy user (players under `pb-roster`, no `pb-rosters` key) also hits that branch**, so the example seed must additionally require an empty player pool.
- **Sync sentinel**: `onlyTheStarterGroup()` (`src/lib/sync.ts:753`) treats "one empty roster named My First Group" as first-run content; used at sync.ts:853 to silently adopt the account copy on first sign-in. A 24-player Example Group breaks it — redesigned in Part B. `adoptAccountCopy` (~L1021) re-mints the starter roster when the account is empty.
- Stores are hand-rolled over localStorage (`src/lib/store.ts`, registry `src/lib/stores.ts`); once anything subscribes a store's cache is frozen, so all post-mount writes must go through `stores.X.set`. Raw localStorage writes are only safe inside `runMigrations()`.
- No UI element has ids/data attributes; `data-tutorial="…"` anchors must be added. No portals; `.app-panel` (App.tsx:901) creates a stacking context — splash and tutorial overlay must mount in the App-root sibling overlay block (App.tsx ~L1131) to paint above everything, including dialogs trapped in the panel.
- `useScrollLock` double-lock hazard (documented in RosterPage ~L94–105): the tutorial overlay must never hold a body lock while a spotlighted dialog holds one. The overlay uses **no** scroll lock.
- Tests drive the real App headlessly (`src/App.walkthrough.test.ts`, happy-dom, no RTL); `seed()` clears localStorage so it must also write the splash-suppress flag or every walkthrough test breaks. happy-dom returns zero rects, so all advance logic must be state/DOM-presence driven, never geometry driven. Tests are not typechecked. Remount is required to change seeds.
- `startTracking` (sync.ts ~L219) diffs the mirror against the current snapshot when tracking starts, so temp-group deletions performed before tracking starts still reach the server. No outbox suppression needed anywhere.

---

## Part A: Example Group seeding

**New `src/lib/exampleGroup.ts`**
- `EXAMPLE_GROUP_NAME = 'Example Group'`
- `EXAMPLE_ROSTER`: 24 entries `{ name, rating, gender }`, 12 M / 12 F, ratings 3.0–4.5 in 0.25 steps, names shaped "First L." (e.g. Ben T., Carlos R., David K., James L., Kevin B., Mike D., Paul G. … Amy C., Beth R., Carol M., Diane P., Emma J., Grace F., Linda V., Sarah M. …). Draft list in the design; Jeff may edit names.
- `buildExamplePlayers(rosterId, newId): Player[]` — fresh ids, `rosterIds: [rosterId]`.
- `interface ExampleMeta { rosterId: string; playerIds: string[] }`

**Modified `src/lib/migrations.ts`**
- Add `exampleMeta: 'pb-example-meta'` to `KEYS`. Retire `DEFAULT_ROSTER_NAME`; add `EMPTY_GROUP_NAME = 'My Group'` for the "need a group, no example to give" cases.
- Read the player pool before the roster branch and split the fresh-install branch:
  - **True fresh install** (`rosters.length === 0 && players.length === 0`): seed `{ id, name: EXAMPLE_GROUP_NAME }`, write the 24 players, write `pb-example-meta = { rosterId, playerIds }`.
  - **Legacy pool, no rosters** (`players.length > 0`): mint `EMPTY_GROUP_NAME`, no example players, no meta; existing re-homing code attaches their players as today.
- Idempotent for free (second run sees a non-empty roster list).

**Modified `src/lib/stores.ts`** — device section, following the `swapHintDismissed` style:
- `exampleMeta` (`pb-example-meta`, `ExampleMeta | null`)
- `tutorialDismissed` (`pb-tutorial-dismissed`, boolean — the checkbox)
- `tutorialCompleted` (`pb-tutorial-completed`, boolean)
- `tutorialSplashAt` (`pb-tutorial-splash-at`, epoch ms — the app's first persisted timestamp; say so in the comment)
- `tutorialState` (`pb-tutorial-state`, rerun bookkeeping for crash cleanup, Part E)
- Update the `rosters` store fallback name to `EMPTY_GROUP_NAME`.
- **None of these join `preferenceStores` in sync.ts** — device-local, never synced.

## Part B: Sync sentinel redesign

**Modified `src/lib/sync.ts`** — replace `onlyTheStarterGroup()` with `untouchedExampleInstall()`:
- If `exampleMeta` exists: true iff exactly one roster, it is the example roster (by id **and** still named `EXAMPLE_GROUP_NAME` — a rename is ownership, same as today), and **every current player id is in the seeded set** (deletions fine; any user-created player asks the question).
- Legacy branch: keep today's exact rule (`players.length === 0 && one roster named 'My First Group'`) so a never-used pre-2.90 install still adopts silently. The literal survives only here, documented as legacy.
- `adoptAccountCopy`: mint `[{ id: 'default', name: EMPTY_GROUP_NAME }]` when the account is empty, and clear `exampleMeta` in the applying block (the example is gone; the sentinel must never match again).
- No outbox/suppression changes. Fresh-install example data is the user's data; on first sign-in to an empty account the existing `seed()` path pushes it, which is correct. Temp-group churn on a signed-in device is create-then-tombstone rows — noisy but correct.

## Part C: Splash screen

**New `src/components/tutorial/SplashScreen.tsx`**
- Universal modal idiom (`no-print fixed inset-0 z-50 … bg-black/40` + card). Large logo from `/icon-512.png` (~`h-36`; logo.png is 96px and goes soft), app title, invitation copy, **Start Tutorial** (teal primary), **Skip Tutorial** (secondary), checkbox bound to `stores.tutorialDismissed` via `useStoredValue`.
- Move `APP_TITLE` from App.tsx:60 into `src/lib/appInfo.ts` (next to `APP_VERSION`) so the splash can share it.
- Add `/icon-512.png` to `PRECACHED_PUBLIC` in `src/lib/precache.ts` (splash may render offline); `precache.test.ts` self-verifies the move.

**Modified `src/App.tsx`** — gating effect watching `[step, tutorialActive]`:
```
if (tutorialActive || showSplash) return;
if (step !== 'roster') return;
if (tutorialCompleted || tutorialDismissed) return;
if (Date.now() - tutorialSplashAt < 3_600_000) return;
setShowSplash(true); stores.tutorialSplashAt.set(Date.now());
```
- Covers startup (effect runs with the initial step) and every later Players-tab landing = exactly the once-per-hour rule. Skip just closes (timestamp already written). Stopping/finishing a tutorial also refreshes `tutorialSplashAt` so a long tutorial doesn't get an instant splash on landing back.
- Add `showSplash` to the `useScrollLock` call (App.tsx ~L187). Render in the root sibling overlay block (~L1131). LiveSessionPage never sees it structurally (separate component in main.tsx). StrictMode-safe (guarded, idempotent write).

## Part D: Instructions panel entry

**Modified `src/components/layout/InstructionsPanel.tsx`** — new prop `onStartTutorial`; in the index view (~L600), between the intro paragraph and the chapter list, a promoted button styled apart from the chapter rows: title "Take the Tutorial", note "A three minute guided tour. You do every step yourself."

**Modified `src/App.tsx`** — handler: close Instructions, close settings drawer, `startTutorial()`.

## Part E: Tutorial engine

**Architecture** — module engine `src/lib/tutorial.ts` (no React; hand-rolled emitter in the store.ts style) + renderer `src/components/tutorial/TutorialOverlay.tsx`. Every advance predicate reads stores directly (players, selectedIds, partnerships, schedule, completedRounds, removedIds, step, numCourts, activeRosterId — all in stores.ts). App-internal state it can't see (ActionsSheet's `view`, PartnerPairing mode, PlayerMenu) is observed via **DOM anchor presence** (`data-tutorial` attributes + one `MutationObserver` on body) — works in happy-dom; ActionsSheet's API untouched.

- In-memory run state: `{ mode: 'first-run' | 'rerun', stepIndex 0..12, baseline (counts/object refs captured at step entry), typingStarted }`. Progress does **not** survive reload; the splash cooldown prevents an instant re-prompt.
- Persisted `stores.tutorialState` only for crash cleanup: `{ mode, rerun?: { tempRosterId, tempPlayerIds, prevRosterId } }`.
- Step shape: `{ id, stages: [{ anchor, title, body, arrow?, advanceLabel? }], onEnter?, done(snap, baseline) }`. The active **stage** is never stored — on each `evaluate()` it is derived as the latest stage whose anchor currently exists in the DOM (self-heals if the user closes the Actions sheet mid-step). The **step** advances only on its state predicate. `evaluate()` runs on watched-store changes, MutationObserver batches, and stage-button clicks.
- **Mode rule**: first-run-in-place iff the active roster is the example roster (`exampleMeta.rosterId`), **all 24 seeded player ids still exist**, and `tutorialCompleted` is false. Otherwise rerun with a temp group. (Covers: re-take after completion, example group modified/deleted, existing users with no meta.)
- Engine exports: `startTutorial()`, `stopTutorial()`, `sweepAbandonedTutorial()`, `subscribeTutorial`/`getTutorialView` (for `useSyncExternalStore` in App), `TUTORIAL_STEPS`.

**Step table** (all predicates over-achievement tolerant):

| # | id | anchors (stage order) | advances when |
|---|---|---|---|
| 1 | add-player | `roster-add-panel`, arrow at `player-name-input` | active-roster player count > baseline |
| 2 | to-setup | `continue-setup` | step === 'setup' |
| 3 | courts-rounds | `session-config` + Next button | Next; **Next warns and refuses if `minPlayersForCourts(numCourts)` exceeds the group's player count** (prevents stranding at step 4) |
| 4 | select-players | `player-selector` (whole panel; its scrolling lives in the hole) | selectedIds ≥ `minPlayersForCourts(numCourts)`; body computes N live |
| 5 | link-couple | `set-partners` → `partner-pairing` | partnerships > baseline |
| 6 | generate | ("Tap Done Pairing" while pairing open) → `generate-schedule` | step === 'schedule' && schedule exists |
| 7 | mark-complete | `open-round` | completedRounds non-empty |
| 8 | swap | `open-round` (first open card; completed rounds pin collapsed to the top and their taps are already guarded) | schedule object identity changed vs baseline (+ scheduleEdited as belt-and-braces; verify the padlock doesn't false-trigger during implementation) |
| 9 | actions-add | `actions-button` → `card-add-player` → `someone-new` → `player-name-input` | player count > baseline |
| 10 | remove-player | `open-round` → `edit-player` → `remove-remaining` → `remove-confirm` | removedIds non-empty |
| 11 | reshuffle | `actions-button` → `card-reshuffle` → `rebuild-rounds` | schedule identity changed vs baseline |
| 12 | complete-card | none (centered card, full dim) + Next | Next |
| 13 | guided-ending | `actions-button` → `card-new-session` → `confirm-new-session` → (once schedule is null & step 'roster') `manage-groups` → `new-group-name` + Finish | Finish → completion |

- Steps 7→8 ordering verified safe: completed round 1 collapses to the top; `open-round` anchors only non-completed cards; the reshuffle score-loss warning can't appear (no scores). Step 9's 1600ms "done" flash then sheet auto-close self-heals via stage derivation.
- **Typing detection (step 1, step 9 form stage)**: capture-phase `input` listener on document while active; when the target matches `player-name-input` with a non-empty value, set `typingStarted` — the arrow unmounts, the card stays. Presentation only; no advance logic.
- **Stop** (visible "Stop tutorial" link on every card): first-run → `stores.step.set('roster')`, `window.scrollTo(0,0)`, refresh `tutorialSplashAt`; artifacts stay. Rerun → `endRerun()` (below). Finish (both modes) → `tutorialCompleted.set(true)` + timestamp refresh.
- **Rerun lifecycle** (`beginRerun`): append `{ id, name: 'Tutorial Group' }` via `stores.rosters.set`; build the 24 players with `buildExamplePlayers` and one bulk `stores.players.set` — **never `importGroups`/`planImport`** (its case-insensitive name matching would link a user's real "Sarah M." into the temp group and cleanup would delete her); persist `tutorialState` **before** `switchToGroup(tempRosterId)` (crash-safe ordering). `endRerun()` (finish/stop/sweep; idempotent, defensive): `switchToGroup(prevRosterId)` (restores their parked session exactly, including its saved tab), `forget(tempRosterId)`, filter temp players out of `stores.players`, filter the temp roster out of `stores.rosters` (module-level set, not the hook's `deleteRoster`), clear `tutorialState`.
- **Reload/crash sweep**: `sweepAbandonedTutorial()` called from App in `useLayoutEffect(() => …, [])` (before paint — no temp-group flash; runs before the splash effect). Non-null `tutorialState` on fresh mount: rerun → `endRerun()`; first-run → clear + refresh timestamp. Sync-safe in either ordering vs `startSync()` via the mirror diff. StrictMode-idempotent.

**New `src/components/tutorial/TutorialOverlay.tsx`**
- Rendered in the App-root sibling overlay block (before `<PrintSchedule>`), gated on engine active, class `no-print`, **no `useScrollLock`**.
- Spotlight: `querySelector('[data-tutorial="…"]')`, guarded `scrollIntoView?.({ block: 'center' })` on stage change, `getBoundingClientRect()`, four `bg-black/60 pointer-events-auto` rects around an 8px-padded transparent hole (real clicks pass through), `pointer-events-none` brand-orange ring outlining the hole. Re-measure: rAF loop while active + capture-phase scroll + resize listeners (ResizeObserver feature-detected; rAF is the baseline so happy-dom never breaks). Anchor missing → full dim + centered card.
- Arrow: small animated SVG in brand orange, bobbing toward the anchor; keyframe in `src/index.css`, frozen under the existing `prefers-reduced-motion` block.
- Card: fixed, above/below the hole by available space; title, body, "Step n of 13", optional Next/Finish, Stop link.

**Anchor inventory** (one-line `data-tutorial` additions): RosterPage (`roster-add-panel`, `continue-setup`, `manage-groups`), PlayerForm (`player-name-input` — serves both instances, never on-screen in the same step), SetupPage (`session-config`, `player-selector`, `set-partners`, `generate-schedule` — rendered twice; duplicates fine, querySelector takes the top one and the bottom sits under the dark rects), PartnerPairing (`partner-pairing`), ActionsButton (`actions-button`), ActionsSheet (`card-${view}` on each CARDS button, `someone-new`, `rebuild-rounds`, `confirm-new-session`), RoundCard (`open-round` only when `!isComplete`, `edit-player` on EditPlayerButton), PlayerMenu (`remove-remaining`), RemovePlayerDialog (`remove-confirm`), ManageRostersModal (`new-group-name`).

## Part F: Copy (draft — Jeff edits closely; short sentences, no em dashes)

- **Splash**: "New here? Take the tour. You will build a real schedule with a practice group, doing every step yourself. It takes about three minutes." Buttons **Start Tutorial** / **Skip Tutorial**; checkbox "Don't show at startup".
- Card bodies drafted per step (gender wording must match the app's actual M/F toggle). Highlights: step 11 rationale — "a reshuffle weaves your new player into every remaining round. Sit outs stay fair, games stay balanced, and everyone gets a turn with everyone else." Step 12 — "That is the whole loop. There is more when you want it: keeping score, special game types, and an account that keeps your groups safe. It is all in Instructions." Step 13 final stage — "When you are ready, type a name here to make your own group. That is the tour. Have a great session."

## Part G: Tests

- `App.walkthrough.test.ts` and `App.print.test.ts`: `seed()` additionally writes `pb-tutorial-dismissed: true` (one flag suppresses the splash everywhere). Tutorial/splash suites un-suppress deliberately.
- **`src/lib/migrations.test.ts`**: replace the "My First Group" pin with "Example Group" + 24 players (12/12, ratings in 3.0–4.5, names shaped "First L."), meta recorded; new legacy-pool test (players, no rosters → 'My Group', no example, no meta); idempotency (still 24 after second run).
- **`src/lib/sync.test.ts`** (rework L521–629): silent adoption when untouched; silent even after sample-player deletions; asks on any user-made player / rename / second group / updated install with no meta; legacy never-used install still silent; empty-account mint is 'My Group'; meta cleared on adoption; bare-account seed test counts updated (24 players push).
- **New `src/lib/exampleGroup.test.ts`**: data shape, unique ids/names.
- **New `src/App.splash.test.ts`** (walkthrough-style, fake timers): fresh install greeted; skip stays away an hour then returns on roster landing; checkbox ends it for good; completion ends it for good; waits for the Players tab when a saved session opens on 'schedule'.
- **New `src/App.tutorial.test.ts`**: full first-run walk to completion (assert each card title, `pb-tutorial-completed` at Finish); Next advances informational steps; stop mid-way → Players tab, overlay gone; over-achievement tolerated (Select All, two couples); rerun runs in 'Tutorial Group' and cleans up (previous group + schedule fingerprint restored, `pb-tutorial-state` null); rerun never touches a real player sharing an example name (seed a real "Sarah M.", assert she survives with her id); reload mid-rerun sweeps; guided ending parks at the new-group field.
- **`InstructionsPanel.test.ts`**: tutorial entry above the chapter list.
- Per project convention, prove guards by sabotage where cheap (e.g. sentinel: flip one player id and watch the dialog test fire).

## Part H: File inventory and sequencing

New: `src/lib/exampleGroup.ts`, `src/lib/tutorial.ts`, `src/components/tutorial/TutorialOverlay.tsx`, `src/components/tutorial/SplashScreen.tsx`, plus the three new test files.

Modified: `src/lib/migrations.ts`, `src/lib/stores.ts`, `src/lib/sync.ts`, `src/lib/appInfo.ts` (APP_TITLE moves here), `src/lib/precache.ts`, `src/App.tsx`, `src/components/layout/InstructionsPanel.tsx`, `src/index.css`, the ten anchor files listed in Part E, and the five test files listed in Part G.

Sequence: (1) exampleGroup + migrations + stores + sync sentinel + their tests (shippable alone); (2) splash + instructions entry + seed-flag updates; (3) anchors + engine + overlay + first-run walk; (4) rerun lifecycle + sweep + remaining tests.

`APP_VERSION` (currently '2.80') steps to **'2.90' in the deploy commit only**. No deploy without Jeff's say-so.

## Interpretations to flag for Jeff

1. **Rerun stop restores the user's saved tab**, not always Players: forcing 'roster' would strand a real schedule (the Schedule tab is never a clickable door). "Stop goes to Players, top" is applied literally on first-run only.
2. The **legacy `'My First Group'` literal survives** in one documented sync branch so a never-used pre-2.90 install still signs in silently. Removing it is one deletion if unwanted (those users would get the safe dialog instead).
3. Temp rerun group is named **"Tutorial Group"** so it never collides with a kept "Example Group".
4. The group is named **"Example Group"** (singular); the request wrote "Example Groups" once but used the singular elsewhere.
5. An existing user whose saved session opens on the Schedule tab sees the splash on their next **Players-tab landing**, not mid-session.
6. A user who adds a real player to the Example Group and later signs into an account holding data gets the merge dialog (safe, slightly noisy). Accepted; future mitigation is offering to delete the Example Group at tutorial completion.

## Verification

1. `npm test` — full vitest suite (existing walkthrough/print/sync/migrations suites green with the seed-flag change; new splash/tutorial/exampleGroup suites green).
2. `npm run lint` scoped to `src/` only, plus `tsc` (remember tests are excluded from typecheck; keep new engine types exercised by app code).
3. Visual pass without a browser: render the splash and a spotlight step to static HTML and screenshot (per the project's established headless-screenshot approach); check the hole, ring, arrow, and card in both normal and large-text modes.
4. Real-browser drive (playwright-core against the local chromium, per project convention): fresh profile → splash appears → full tutorial to Finish; reload mid-rerun → sweep restores the previous group; hour-rule spot-check with a shifted clock.
5. Sabotage checks: break the sentinel player-id check and the rerun cleanup filter one at a time; confirm the corresponding tests go red.
