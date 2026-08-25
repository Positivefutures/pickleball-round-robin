# Richard's report: unselected players in the generated schedule — diagnosis and fix

## Context

Richard Sherback: selected 24 players from a larger group, generated, and the schedule contained players he did not select; reproduced 3×, evening of 2026-08-24, almost certainly on 3.84 (3.85/3.86 shipped 19:49–20:09 MT that night and are alibied — both can only narrow, never add).

**The bug is real.** The generator library is clean (600-schedule containment harness: zero foreign ids; every `src/lib` entry point filters unknown ids). The faults are in App.tsx wiring — three mechanisms, all fitting his exact symptom, all sharing one root: **competing definitions of "who is attending" plus session state that survives into Setup invisibly.**

1. **Generate doesn't always generate.** `handleGeneratePress` (App.tsx:861-871) replays the parked schedule when the basis key matches. The key subtracts `removedIds` (App.tsx:798-800), so unticking an already-removed player is a no-op on it — the press replays last session's schedule, whose completed rounds keep departed players verbatim (pairing.ts:409). The button always says "Generate Schedule →"; a replay is indistinguishable from a build. Fits "tried three times, same extras" precisely.
2. **The sneak path.** RosterPage "Continue to Setup" (App.tsx:1901-1912) calls `setStep('setup')` directly, bypassing `handleStepNav`'s discard question (App.tsx:1628-1631). Schedule → Players → Continue to Setup lands on Setup with old schedule, basis, removedIds, guests, selectedIds all live. The walkthrough suite documents the rule this violates ("no way to walk onto that page and keep the afternoon").
3. **Two attending sets.** Fresh Generate builds from `rosterPlayers ∩ selectedIds` (App.tsx:755 — guests out, removedIds ignored); the basis key, the Schedule-page lists (StandingsPanel — standings.ts:107-111 makes a row for every player passed; PartnerSummary "Games Played"; ActionsSheet), and every rebuild path use `attendingPlayers` (guests in, removed out). A lingering invisible guest is dropped from courts yet named in standings on every regenerate. Paired players are absent from the checkbox grid while selected (SetupPage.tsx:111-118, Partners card only) — a host counting checkboxes ships 24 + every standing couple.

Ruled out: the padlock/sit-out commits, the generator, index/name-resolution bugs (courts render embedded Player objects), the 24 boundary. Sync can wholesale-replace the live slot but never unions ids, needs an account (~2%) + a second larger parked group, and would visibly change group/courts/rounds — low plausibility for Richard; real defects filed as follow-ups.

Decisions made with Jeff (2026-08-25):
- **Pairs in the grid**: paired players return to the checkbox grid — at the top, adjacent, link icon between them, indigo pair styling (`border-indigo-300 bg-indigo-50`, icon `text-indigo-500` — same recipe as PairList.tsx). Both checked. **Unchecking one member unlinks the pair and returns both to the normal alphabetical grid; only the tapped one is unchecked.** The select-mode Partners card is **kept** (duplication accepted).
- **Semantics confirmed**: Generate builds exactly the ticked set. A removed-but-still-ticked player returns on the next real Generate (visible on Setup). A still-ticked guest is included in a fresh Generate (today: silently dropped from courts while counted and named in standings).

## The fix

### 1. One attending set (src/App.tsx)
Above `handleGenerate` (~:754):
```ts
const generatePlayers = sessionPlayers.filter((p) => selectedIds.includes(p.id));
```
- `handleGenerate` :755 → `const attending = generatePlayers;` (guests now built in; deps per eslint).
- `attendingPlayers` :798-800 → `generatePlayers.filter((p) => !removedIds.includes(p.id))` (set-identical refactor; every rebuild path untouched).
- `pressBasis` :840 → `{ ...liveBasis, attending: generatePlayers, roundPlan: planDraft ?? roundPlan }` — the press key now mirrors exactly what the build will do after it clears `removedIds`. Pending removals ⇒ press really rebuilds; unchanged ticks ⇒ replay stays (correct). `liveBasis`/`scheduleIsDoor`/basis effect (:823-830) untouched.
- `handleGenerate` does NOT clear guests (clearSession stays the only guest clearer); removal keeps players ticked (keep-the-crowd design, App.tsx:1409-1414).

### 2. Close the sneak path (src/App.tsx:1901-1912)
`onContinue` gets the same door as `handleStepNav`, same order (schedule check before the four-player check, per the :1633-1641 comment):
```ts
if (schedule) { setPendingLeave('setup'); return; }
if (rosterPlayers.length < 4) { setTooFewPlayers(true); return; }
setStep('setup');
if (tour?.id === 'players') nextCard();
```
Reuses the existing dialog + `confirmLeave` → `clearSession(true)` unchanged. Plus one inert-outside-tour line in `confirmLeave` (:1661-1666): `if (tour?.id === 'players' && pendingLeave === 'setup') nextCard();`.

### 3. Pairs in the grid (src/components/setup/SetupPage.tsx, PlayerSelector.tsx)
- SetupPage: drop the `selectablePlayers` exclusion (:111-118); pass `players` plus the resolved `pairs` to PlayerSelector. Partners card (:256-279) stays as today.
- PlayerSelector: render pair cells first — one double-width grid cell per pair (`col-span-2`, `border-indigo-300 bg-indigo-50`), checkbox+name each side of the link glyph (names only, like the Partners rows; gender/rating stay on single cells — flag at review), pairs ordered by first member's name; then unpaired players alphabetically as today. Unchecking a pair member calls a new composed handler in SetupPage: `onRemovePartnership(p1, p2)` then `onToggle(tappedId)`.
- `Select All` / `Deselect All` semantics unchanged. SpotsFilled unchanged (grid ticks now visibly include pairs; guests remain the only invisible count — follow-up).

## Tests (red-first; house style: prove each by breaking it during development)

- **New `src/lib/pairing.containment.test.ts`**: `generateSchedule` / `regenerateRemaining` / `extendSchedule` / sitout helpers — every output id ⊆ input players; ghost-partnership ids never appear; completed rounds verbatim. (Locks the layer that is currently clean.)
- **New describe in `src/App.walkthrough.test.ts`** ("Generate builds what Setup shows"), using the existing harness (`seed`, `generate`, `takeOff`, `parkOnSetup`, `storedSchedule`…), Continue-to-Setup presses written dialog-tolerant so they run red today and green after:
  1. The reported bug (red): complete round 1, remove a player, Players → Continue to Setup, untick them, Generate ⇒ they are nowhere in the schedule and `completedRounds` is `[]`.
  2. Stale guest (red): add guest mid-session, sneak to Setup, Generate ⇒ guest cleared via the dialog, never named anywhere (kills the standings/"Games Played" ghost row).
  3. Relaunch honesty (red): `parkOnSetup` with pending removal, Generate ⇒ real rebuild; still-ticked removed player visibly returns.
  4. Park-and-return preserved (green, guards the fix): nothing changed ⇒ press replays, completed rounds intact.
  5. Sneak-path guard (red): with a schedule, Continue to Setup asks "Return to Setup?"; Keep Schedule stays; confirm clears schedule, keeps ticks.
  6. Pairs in grid: pair cell at top, both checked; uncheck one ⇒ pair dissolves, both alphabetical, only tapped unchecked; Generate includes pairs; grid ∪ card set == schedule set.
- Harden the walkthrough `generate()` helper (~:240-243) with the same dialog-tolerant guard `leaveSchedule` has; audit the ~45 `Continue to Setup` call sites.

## Commit order (each green; STOP at commit — no deploy, no APP_VERSION bump until Jeff says)
1. Lib containment test (pure addition).
2. Unified set (§1) + tests 3, 4, 6-precursor consistency assertions. Re-verify by hand: Reshuffle, Remove Player, Add Round, plan commit, PDF export, live share snapshot (all read `attendingPlayers`, set-identical by construction).
3. Sneak-path guard (§2) + tests 1, 5, full 2 + helper hardening.
4. Pairs in the grid (§3) + test 6. Any new copy: Jeff to word.

Verification per commit: `npx vitest run`, `npm run build` (`tsc -b`), lint src only.

## Critical files
- src/App.tsx (generatePlayers, attendingPlayers, pressBasis, onContinue, confirmLeave)
- src/components/setup/SetupPage.tsx, src/components/setup/PlayerSelector.tsx (pairs in grid)
- src/App.walkthrough.test.ts, new src/lib/pairing.containment.test.ts
- Read-only reference: src/lib/scheduleBasis.ts, src/lib/groupSessions.ts, src/lib/pairing.ts, src/components/setup/PairList.tsx

## Follow-ups (backlog, not this change)
- liveSession.ts:144-147 resolves selectedIds against the global pool (cross-group leak into the watcher doc).
- Sync: pull can switch groups mid-Setup with no recency guard (sync.ts:655-674); orphan branch discards the live session without parking (sync.ts:613-620); signed-out preference changes never catch up (sync.ts:229-236); store.ts has no `storage` listener (two tabs clobber).
- syncMerge.ts:115 name-matching can fold two same-named real people.
- Guests still invisible on Setup via legitimate parked-on-Setup entrances (count skew only, post-fix).
- Dead `SessionConfig` type (types/index.ts:23-27).
- Reply to Richard: draft available on request (ask his version footer + whether extras were partnered/removed players — would confirm which mechanism bit him).
