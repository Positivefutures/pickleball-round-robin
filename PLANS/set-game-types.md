# Set Game Types: a per-round plan the host builds by hand

## Context

Today a host cannot say *which* round is a gendered round. They say "gendered every 4
rounds" and `planRoundTypes()` works out where those land, resolving collisions by
rarity and a hand-ordered priority list. It is clever, and it is indirect: the panel that
explains it needs a paragraph beginning "Every 4 rounds means round 4, then round 8", and
the host still cannot put a mixed round third because they feel like it.

This replaces the whole frequency machine with the thing it was approximating. The host
sees one row per round and taps a pill on the row to set what that round is played as.
Dragging a row moves the game type into a different round. No arithmetic, no tie-breaks,
no explanation needed.

The second half is that the plan stays useful once the session is running. Come back to
Setup mid-afternoon, move the gendered round from round 6 to round 5, press Done, and the
rounds already played keep their scores while everything still to come is rebuilt. The
Schedule tab never shuts.

### Decisions taken

- **The round number stays with the position.** The list always reads ROUND 1..N top to
  bottom. Dragging moves the *type* into a different slot; it is a permutation of the plan.
- **Done rebuilds only unplayed rounds.** Completed rounds are locked in the list and kept
  verbatim. No "Replace the current schedule?" dialog on this path.
- **No "every N" shortcut.** One tap per round.
- **Collapsed, the title shows chips** naming the special rounds read off the plan.

---

## 1. Data model

New type in [src/types/index.ts](src/types/index.ts) beside `RoundType` (:56):

```ts
/** What each round is played as, indexed from 0 for round 1. null is ordinary round robin. */
export type RoundPlan = (RoundType | null)[];
```

A plain array. The drag is a permutation over positions and an array *is* a permutation.

**Fixed 16 slots, never truncated.** The Rounds stepper maxes at 16
([SessionConfig.tsx:148](src/components/setup/SessionConfig.tsx#L148)); the UI renders
`plan.slice(0, numRounds)`. Dropping to 4 rounds and back to 8 restores rounds 5-8 exactly,
because the tail was never thrown away. `handleAddRounds` ([App.tsx:1092](src/App.tsx#L1092))
can push past 16, so the array grows on demand and every reader goes through
`planAt(plan, n)`, which returns `null` off the end.

New module **`src/lib/roundPlan.ts`**:

```ts
export const PLAN_SLOTS = 16;
export function emptyPlan(): RoundPlan;
export function normalizeRoundPlan(raw: unknown, minLength?: number): RoundPlan;
export function planAt(plan: RoundPlan, roundNumber: number): RoundType | null;
export function setPlanType(plan: RoundPlan, roundNumber: number, type: RoundType | null): RoundPlan;
export function moveRound(plan: RoundPlan, from: number, to: number,
                          numRounds: number, locked: ReadonlySet<number>): RoundPlan;
export function planChips(plan: RoundPlan, numRounds: number):
  { roundNumber: number; type: RoundType; label: string }[];   // label: "R4 Gendered"
export function planKey(plan: RoundPlan, numRounds: number): string;
export function unplayedChanged(before: RoundPlan, after: RoundPlan,
                                numRounds: number, completed: number[]): boolean;
```

`normalizeRoundPlan` maps anything outside `ROUND_TYPES` to `null`, the same defence
`roundTypeOf` documents at [roundTypes.ts:221-225](src/lib/roundTypes.ts#L221-L225). It
matters more now: a plan arrives over sync.

`moveRound` is the load-bearing one. It reorders **only the unlocked slots among
themselves**: take `open = [1..numRounds].filter(n => !locked.has(n))`, splice the values at
those positions, write them back into those same slots. Played rounds keep their type and
their position, slots past `numRounds` are untouched, and the multiset of types is
unchanged. That is what makes "the number stays with the position" true mid-session.

**Store** — [src/lib/stores.ts](src/lib/stores.ts), replacing `specialTypes` (:70-73) in the
same "The group in front" section, since `groupSessions.ts` parks it per group:

```ts
export const roundPlan = createStoredValue<RoundPlan>(KEYS.roundPlan, emptyPlan());
```

Add `roundPlan: 'pb-round-plan'` and `numRounds: 'pb-num-rounds'` to `KEYS`
([migrations.ts:6](src/lib/migrations.ts#L6)); the migration needs to read numRounds, and
`stores.ts:56` should then point at `KEYS.numRounds`.

---

## 2. Migration

Appended to `runMigrations()` after the existing special-types block
([migrations.ts:117-136](src/lib/migrations.ts#L117-L136)), which stays exactly as it is
because it is now this one's input:

```ts
if (window.localStorage.getItem(KEYS.roundPlan) === null) {
  const cfg = normalizeSpecialTypes({ ...DEFAULT_SPECIAL_TYPES,
    ...read<SpecialGameTypes>(KEYS.specialTypes, DEFAULT_SPECIAL_TYPES) });
  const rounds = read<number>(KEYS.numRounds, 8);
  write(KEYS.roundPlan, normalizeRoundPlan(planRoundTypes(cfg, Math.max(PLAN_SLOTS, rounds))));
}
```

Nobody's session changes shape on upgrade. Planning for 16 and showing the first
`numRounds` is safe because `planRoundTypes` only looks forward, which
[pairing.ts:418-421](src/lib/pairing.ts#L418-L421) already relies on.

**Parked groups need the same pass.** `GroupSession.specialTypes`
([groupSessions.ts:49](src/lib/groupSessions.ts#L49)) lives inside `pb-group-sessions`, and a
group restored without a plan would quietly become all-ordinary. Map over that array too,
deriving each group's plan from its own `specialTypes` and its own `numRounds`.

**Fate of the old machinery**

- `pb-special-types` stays in localStorage, read only by the two migration guards. Not
  deleted: a rollback keeps the host's settings.
- Move `SpecialTypeSetting`, `SpecialGameTypes`, `DEFAULT_SPECIAL_TYPES`, `orderedTypes`,
  `enabledTypes`, `rankOf`, `normalizeSpecialTypes` and `planRoundTypes` into
  **`src/lib/legacySpecialTypes.ts`**, doc-commented "the only caller is runMigrations()".
  A greppable boundary beats a scattering of `@deprecated`.
- Delete outright: `moveType` ([roundTypes.ts:102](src/lib/roundTypes.ts#L102)),
  `specialSummary` + `SpecialSummary` (:187-214), `MAX_FREQUENCY` (:7). No callers survive.
- `roundTypes.ts` keeps `ROUND_TYPES`, `ROUND_TYPE_META`, `roundTypeOf`, `courtMissReason`,
  `courtMatchesType`, and gains the neutral pill the picker needs:

```ts
export const NORMAL_ROUND_META = {
  badge: 'Normal Round', shortName: 'Normal',
  badgeClass: 'bg-gray-100 text-gray-700', badgeEdgeClass: 'border-gray-400',
} as const;
export function pillMeta(type: RoundType | null): { badge; badgeClass; badgeEdgeClass };
```

Grey at 100 fill / 700 ink / 400 edge, the same ramp the three coloured ones use.

---

## 3. Signature changes

**[src/lib/pairing.ts](src/lib/pairing.ts)** — positional order kept, so call sites barely move:

| line | from | to |
|---|---|---|
| :311 | `specialTypes: SpecialGameTypes` | `plan: RoundPlan = []` |
| :316 | `const plan = planRoundTypes(...)` | deleted |
| :322 | `plan[r - 1]` | `planAt(plan, r)` |
| :349, :386, :398 | same shape in `regenerateRemaining` | `planAt(plan, r.roundNumber)` |
| :428 | same in `extendSchedule`, passed straight through | |

Rewrite the comment at :418-421. With an explicit plan there is nothing to reconcile;
added rounds read the slots at their own numbers.

**[src/lib/scheduleBasis.ts](src/lib/scheduleBasis.ts)** — `BasisInput.specialTypes` (:30)
becomes `roundPlan: RoundPlan`; delete `formats()` (:61-69); `basisKey` (:124) folds in
`planKey(input.roundPlan, input.numRounds)`.

**Truncating to `numRounds` inside `planKey` is not cosmetic.** Without it, a type sitting
in a slot past the visible list changes the key and the Schedule tab shuts for a round
nobody can see.

**[src/App.tsx](src/App.tsx)** — `specialTypes` state (:110) becomes `roundPlan`;
`updateSpecialType` (:545) and `moveSpecialType` (:556) are deleted; `specialTypes` swaps
for `roundPlan` at the five rebuild call sites (:632, :787, :832, :872, :1100), in
`liveBasis` (:667), and in six dep arrays. `handleAddRounds` also grows the plan:
`setRoundPlan(prev => normalizeRoundPlan(prev, numRounds + count))`.

**[src/lib/groupSessions.ts](src/lib/groupSessions.ts)** — `specialTypes` (:49, :83, :140)
becomes `roundPlan?: RoundPlan`, read back through `normalizeRoundPlan`.

**[src/lib/sync.ts](src/lib/sync.ts)** — `special_types` (:181, :266, :670) becomes
`round_plan`, guarded on `Array.isArray` when pulling.

> **Ordering hazard.** `supabase/migrations/0008_round_plan.sql` adding the column must be
> deployed **before any client ships**. This is the PGRST204 trap already written down at
> [sync.ts:182-187](src/lib/sync.ts#L182-L187): PostgREST rejects the whole row for one
> unknown column, and every preference stops syncing for everyone signed in. Follow
> `0001_accounts.sql:160` for the column (`jsonb not null default '[]'::jsonb`) and
> `0003_row_caps.sql:156` for a size check. Keep *sending* `special_types` for this one
> release so a rollback still finds its config.

---

## 4. Components

**Rename `SpecialTypesPanel.tsx` → `GameTypesInfoPanel.tsx`**, props down to
`{ onClose: () => void }`. Keep the `PanelGlyph` court on its side (:86 —
`PanelGlyph.test.ts:127` asserts the `rotate-90`), the three `<section>`s with heading,
icons and `meta.description` (:95-122), and the Done button (:168-174). Delete
`FREQUENCIES` (:22), `MoveButton` (:26-45) and both calls (:105-120), the Toggle/select
block (:124-151), and the first `<p>` of the grey box (:157-161). Heading becomes
"Game Types".

**Keep the second paragraph** (:162-165, a pair from Set Partners being split for one
round). It is still true, it is the only place the app says it, and it is the one thing
about game types a host cannot work out by looking.

**New `src/components/setup/GameTypePlanner.tsx`** — the inline expander.

```ts
interface Props {
  numRounds: number;
  plan: RoundPlan;                       // committed plan, seeds the draft
  lockedRounds: number[];                // completedRounds, filtered to <= numRounds
  onCommit: (next: RoundPlan) => void;   // Done
}
```

It holds a **draft** plan in `useState`, seeded on mount. Pills and drags touch the draft
only; Done calls `onCommit`. Section 6 is why. It also owns an `aria-live="polite"` line
that announces each move.

**New `src/components/setup/RoundPlanRow.tsx`** — one row, painted the way
[RoundCard.tsx:157-168](src/components/schedule/RoundCard.tsx#L157-L168) paints a card,
from `ROUND_FILL`, `ROUND_EDGE` and `ROUND_HEADING_TEXT` in
[roundLook.ts](src/components/schedule/roundLook.ts):

```
┌────────────────────────────────────────────┐
│ ⠿  ROUND 1                [ Normal Round ] │   #7CAED0 fill, #2B76A9 2px edge
└────────────────────────────────────────────┘
```

A locked row renders **no handle at all** and a `<span>` rather than a `<button>` for the
pill. The lock is in the markup, not only in a disabled attribute.

**New `src/components/setup/RoundTypePicker.tsx`** — the popup, same shape as the modal
that exists today ([SpecialTypesPanel.tsx:74-81](src/components/setup/SpecialTypesPanel.tsx#L74-L81)):
`fixed inset-0 z-50 bg-black/40`, a `panelCard` child that stops propagation,
`role="dialog" aria-modal="true"`. Four large pills from `pillMeta`, `aria-current` on the
one in force. No portal needed: it lives in the same place the current panel does, which
already clears `.app-panel`'s z-10.

**New `src/components/setup/typeGlyphs.tsx`** — `TYPE_ICONS`
([SpecialTypesPanel.tsx:58-68](src/components/setup/SpecialTypesPanel.tsx#L58-L68), 26/34/27px)
and `TYPE_GLYPHS` ([RoundTypeBadge.tsx:37-45](src/components/schedule/RoundTypeBadge.tsx#L37-L45),
18/23/19px) are one table at two sizes and the picker wants a third. One
`<TypeGlyphs type size="panel"|"badge"|"picker" />` with three literal Record tables,
literal because Tailwind only generates a class it can see spelled out — the reason
already given at RoundTypeBadge.tsx:33-35.

**New `InfoIcon`** in [src/components/icons.tsx](src/components/icons.tsx). There is no
circled-i today; `TipIcon` is a lightbulb and would say the wrong thing.

**[SessionConfig.tsx](src/components/setup/SessionConfig.tsx)** — the new order:

1. steppers (:134-153, `data-tutorial="setup-steppers"` untouched)
2. `<hr>` (:156)
3. Spots Filled (:158-178)
4. **Keep Score?** — moved up from :216-219
5. **Set Game Types** — replacing :180-214

```
Set Game Types  ⓘ                                  ▾
[R4 Gendered] [R6 Mixed]
```

The title row reuses the existing teal button (:186-195) with its `BallIcon`, relabelled,
its chevron rotating on expand, `aria-expanded`. The ⓘ is a separate button beside it,
`aria-label="About game types"`, 44px target. Keep the shape
`App.walkthrough.test.ts:1803-1812` asserts (not `w-full`, inner span not `flex-1`) and
retarget the regex. The chips keep the classes from :207, with words from `planChips`.

Props delta: drop `specialTypes` and `onOpenSpecialTypes`; add `roundPlan`, `lockedRounds`,
`expanded`, `onToggleExpanded`, `onOpenInfo`, `onPlanCommit`.

**[SetupPage.tsx](src/components/setup/SetupPage.tsx)** — `specialTypesOpen` (:69) becomes
`infoOpen` plus `plannerOpen`. `useScrollLock(infoOpen || pickerOpen)` but **not** for the
expander, which is inline and must scroll with the page.

Requirement 7 ("collapsed again when they come back") is free:
[App.tsx:1439](src/App.tsx#L1439) mounts SetupPage only for `step === 'setup'`, so leaving
the tab unmounts it and `plannerOpen` resets.

---

## 5. The drag

New hook **`src/hooks/useListReorder.ts`**. Two rows of pointer bookkeeping plus a keyboard
path is more than a component should carry.

```ts
useListReorder({ count, disabled?: (i) => boolean, onMove: (from, to) => void })
  → { dragging, handleProps(i), rowProps(i) }
```

Pointer path, mirroring the working gesture at
[ActionsSheet.tsx:467-498](src/components/schedule/ActionsSheet.tsx#L467-L498):

- `onPointerDown` records `startY` and the index. **No capture yet** — capturing on the way
  down redirects the click and the button under the finger never hears it (the reason is
  written at :471-474).
- `onPointerMove`: return while `|dy| < 4`, the same threshold as :484, which is what lets a
  tap on the handle stay a tap. Past it, `setPointerCapture` once, `preventDefault`, and set
  `dragging`. The handle needs `touch-none`: iOS Safari will not let `preventDefault` stop a
  scroll already under way.
- Target is the row whose midpoint the dragged row's centre has crossed, **skipping locked
  indices**. Geometry is measured once at drag start. Only transforms move during the drag;
  the DOM reorders on drop.
- `onPointerUp` **and `onPointerCancel`** both commit and reset. Cancel is not optional: iOS
  fires it on a system gesture and without it the list stays stuck mid-drag.
- Edge auto-scroll in `onPointerMove` — 16 rows is taller than a phone. This is the fiddliest
  part of the change.

**The keyboard path is not optional.**
[SpecialTypesPanel.tsx:24-25](src/components/setup/SpecialTypesPanel.tsx#L24-L25) chose arrows
over drag on purpose, and that reasoning does not evaporate because a handle appeared:

- The handle is a real `<button type="button">` with `aria-label={`Move Round ${n}`}` and an
  `aria-describedby` pointing at a visually-hidden "Press the up and down arrow keys to move
  this round".
- ArrowUp / ArrowDown call `onMove` and `preventDefault()`.
- **Focus follows the type, not the slot**: `requestAnimationFrame(() => handleRefs[to]?.focus())`.
  React keeps the same DOM node at the same index, so without this focus stays on the row the
  host just moved away from.
- The planner announces every move, pointer or keyboard: "Gendered moved to Round 3."

There is a second reason: **happy-dom has no layout, so the pointer drag is untestable and
the keyboard path is the only one an App-level test can drive.**

---

## 6. Done, mid-session

`scheduleStale` ([App.tsx:694](src/App.tsx#L694)) is recomputed every render from
`liveBasis`. Once `roundPlan` is in that basis, **writing the store on every pill tap would
drop the Schedule tab out of `availableSteps` (:1254) and into `answeringSteps` (:1262)
mid-edit, then put it back on Done.** The host would watch their tab blink.

So the planner never writes the store until Done. `onCommit` does everything at once, in a
new `handlePlanCommit` in App.tsx beside the other rebuild paths:

```ts
setRoundPlan(next);
if (!schedule) return;                                              // feeds the next Generate
if (!unplayedChanged(roundPlan, next, numRounds, completedRounds)) return;
if (attendingPlayers.length < 4) return;

const rebuilt = { rounds: carryCourtNumbers(schedule.rounds,
  regenerateRemaining(attendingPlayers, numCourts, schedule.rounds,
                      completedRounds, next, activePartnerships).rounds) };
setSchedule(rebuilt);
setScheduleBasis(basisKey({ ...liveBasis, roundPlan: next, schedule: rebuilt }));
setScheduleEdited(removedIds.length > 0);
```

Four things to get right:

1. **`basisKey` is handed `next`, not the closed-over `roundPlan`** — `setRoundPlan` has not
   re-rendered yet. Exactly the trick `handleRosterDeletePlayer` plays with
   `attending: remaining` at [App.tsx:842](src/App.tsx#L842), and the easiest bug to write here.
2. **The `unplayedChanged` gate.** Open the planner, look, press Done: the afternoon must not
   reshuffle.
3. **Nothing at :1254 changes.** After the commit `scheduleBasis === basisKey(liveBasis)`, so
   the tab stays a door. It never shut, because the plan was never in the store before the
   rebuild landed.
4. **The effect at :681 needs only its dep array widened.** It is inert on Setup and finds the
   key already equal on return.

Done does **not** navigate to the Schedule. "Return to the Schedule" is the host tapping the
tab, which is now open to them.

`regenerateRemaining` already keeps completed rounds verbatim
([pairing.ts:389](src/lib/pairing.ts#L389)) and replays their history (:365-373), so scores
survive untouched. `requestGenerate` / `workAtStake` (:705-723) are not on this path and no
dialog appears.

---

## 7. Edge cases

| case | answer |
|---|---|
| numRounds changed while expanded | Steppers sit above the expander and stay live. Rows render `1..numRounds` off a 16-slot draft: growing reveals the tail, shrinking hides it without losing it. Recompute `lockedRounds` against the new count. |
| every round the same type | Already exercised: `specialRounds.test.ts:10` `everyRound()` is frequency 1, the same thing. `buildRound` marks courts the roster cannot fill. No new code. |
| plan shorter than the schedule | `planAt` returns `null`, an ordinary round. Correct default. |
| `extendSchedule` past the plan | New rounds are Normal until the host says otherwise. **Behaviour change worth naming:** today `planRoundTypes` would carry the cadence forward and could make round 9 gendered on its own. An explicit plan cannot, and should not. |
| the tour | Touches only courts and rounds; `tour.ts` anchors `setup-steppers` and `setup-title` only. An all-null plan builds ordinary rounds exactly as all-disabled defaults do. No tour changes, but re-run `App.tourAnchors.test.ts` since Keep Score now sits between the steppers and the game types. |
| live session and viewer | **Nothing to change.** Round types travel baked into `Round.roundType` and are read through `roundTypeOf`; neither `liveSession.ts` nor `share.ts` mentions `special*`. |
| sync pull mid-edit | The draft is local, so a pull cannot yank the list out from under the host. Done then wins, last write as every other preference. |
| every round complete | Every row locked, `unplayedChanged` makes Done a no-op. |

---

## 8. Verification

**Changed tests**

- `roundTypes.test.ts` — the `planRoundTypes` / `normalizeSpecialTypes` blocks (:31-153)
  **move** to a new `legacySpecialTypes.test.ts`, where they now pin the migration's input.
  `moveType` (:155) and `specialSummary` (:180) delete with the functions. Add `pillMeta`
  cases (a `null` gives the grey Normal pill).
- `scheduleBasis.test.ts` — `types` (:21-25) becomes a `RoundPlan`; :114-122 become "a round
  given a format" and "two rounds' formats swapped", both stale. **New and load-bearing:** a
  type in slot 10 with `numRounds: 1` is **not** stale. That is the truncation guarantee.
- `pairing.test.ts`, `partnerships.test.ts`, `shortCourts.test.ts`, `specialRounds.test.ts`,
  `scheduleQuality.measure.test.ts` — mechanical: `DEFAULT_SPECIAL_TYPES` → `[]`,
  `everyRound(t)` → `Array(16).fill(t)`.
- `migrations.test.ts` — keep :157-203, add a round-plan block: gendered-every-2 with
  `pb-num-rounds` 8 gives `[null,'gendered',null,'gendered',…]`; a first-time user gets 16
  nulls; an existing `pb-round-plan` is left alone; **a parked group gets a plan off its own
  numRounds**.
- `PanelGlyph.test.ts` — :105-129, :215-243 point at `GameTypesInfoPanel` with
  `{ onClose }`. The `rotate-90` and glyph-size assertions survive.
- `App.walkthrough.test.ts` — the `describe('Special Game Types')` block (:988-1240) is
  rewritten. New helpers `openPlanner()`, `planRow(n)`, `setRoundType(n, 'Mixed Round')`.
  One assertion per requirement:
  - title to badge: set R2 Mixed, Done, chip reads `R2 Mixed`, Generate, round 2's card shows
    "Mixed Round", `rounds[1].roundType === 'mixed'`, `rounds[0].roundType` undefined
  - the ⓘ is info only: no `button[role="switch"]`, no `[aria-label^="Move "]`, no "Every 4
    rounds means", but "Equal Skill Games" and the Set Partners paragraph both present
  - one row per round, numbered 1..N top to bottom
  - **the number stays with the position**: ArrowUp on row 2's handle leaves the rows reading
    ROUND 1..8, with R1 now Mixed and R2 Normal
  - Done collapses; a trip to Players and back comes back collapsed
  - completed rounds are locked: no handle and no pill button on rows 1-2
  - **the headline**: generate, mark round 1 complete, back to Setup, set R4 Gendered, Done →
    round 1's fingerprint unchanged, `rounds[3].roundType === 'gendered'`, `completedRounds()`
    still `[1]`, no dialog, and the Schedule tab still lands on the schedule
  - Done with nothing changed leaves every round's fingerprint identical
  - the "court the format cannot fill" block (:1120-1240) keeps every assertion; only its
    three setup lines change

**New tests**

- `src/lib/roundPlan.test.ts` — `normalizeRoundPlan` (pads to 16, unknown strings to null),
  `planAt` past the end, `setPlanType`, `moveRound` (both directions, no-op at the ends,
  **skips locked slots**, is a permutation, leaves slots past numRounds alone), `planChips`,
  `planKey` truncation, `unplayedChanged`.
- `src/components/setup/GameTypePlanner.test.ts` (happy-dom, component alone) — the
  accessibility contract: every handle is a labelled `<button>`, arrow keys move the row, the
  live region announces, focus lands on the moved row's handle, a locked row has no handle,
  the picker is `role="dialog" aria-modal` with four named options and closes on pick.
- `src/hooks/useListReorder.test.ts` — **deliberately not written.** happy-dom has no layout,
  so a pointer-drag test would prove only the mock.

**Gates**

- `tsc -b` — the real command here, and the only thing that will catch a missed call site
  across eight files. Tests are excluded from typechecking, so it proves nothing about them.
- `npm test`
- `npm run lint -- src`
- Drive the real app in a browser for the drag: it is the one part no test covers. Reorder by
  finger, reorder by keyboard, and check the auto-scroll at 16 rounds.
- Prove the mid-session guard by breaking it: make `handlePlanCommit` pass the stale
  `roundPlan` to `basisKey` and confirm the Schedule tab shuts.

**Follow-up Jeff owns**

[InstructionsPanel.tsx:255, 274-291](src/components/layout/InstructionsPanel.tsx#L274-L291)
still describes the old panel in prose and in two screenshot `alt` texts, and the
`special-types` and `setup` images in `public/` show the retired UI. Copy and screenshots
both need replacing.

---

## 9. Order of work

1. `supabase/migrations/0008_round_plan.sql`, **deployed before any client ships**
2. `types/index.ts`, `lib/roundPlan.ts`, `lib/legacySpecialTypes.ts`, trim `lib/roundTypes.ts`
3. `lib/stores.ts`, `lib/migrations.ts`, `migrations.test.ts`
4. `lib/pairing.ts`, `lib/scheduleBasis.ts` and their tests
5. `lib/groupSessions.ts`, `lib/sync.ts`
6. `App.tsx` state and handlers — compiles green here, before any UI exists
7. `GameTypesInfoPanel.tsx` rename and strip, `PanelGlyph.test.ts`
8. `icons.tsx`, `typeGlyphs.tsx`, `useListReorder.ts`, `RoundTypePicker.tsx`,
   `RoundPlanRow.tsx`, `GameTypePlanner.tsx`
9. `SessionConfig.tsx` reorder, title and chips; `SetupPage.tsx` state
10. `handlePlanCommit` and the basis write
11. Walkthrough tests

---

## Handoff prompt for a fresh session

> Copy everything below into a new Claude Code session in this repo.

```
Build the "Set Game Types" feature. The plan is approved and complete — read it first:

  /Users/jeffbaker/.claude/plans/i-d-like-to-make-moonlit-torvalds.md

Before you touch anything else, copy that plan into the project as
PLANS/set-game-types.md. Plans belong in the repo, not in the ~/.claude scratch path.

WHAT IT IS
The Setup Round Robin panel loses the "Special Game Types" button and the whole
"every N rounds" frequency machine. In its place: a "Set Game Types" title with an
info icon, which expands inline to one row per round. Each row has a drag handle, a
"ROUND N" label in the Schedule tab's card colours, and a pill on the right reading
Normal / Gendered / Mixed / Equal Skill. Tapping the pill opens a picker; dragging a
row moves the game type into a different round. Done collapses it. Keep Score? moves
above the title. The info icon opens the old panel stripped to descriptions only.

DECISIONS ALREADY TAKEN — do not relitigate these
- The round number stays with the position. The list always reads ROUND 1..N; dragging
  permutes the types, not the rounds.
- Mid-session, Done rebuilds only unplayed rounds via regenerateRemaining. Completed
  rounds are locked in the list and keep their scores. No "Replace the schedule?"
  dialog on that path, and the Schedule tab must not shut.
- No "every N" shortcut in the picker. One tap per round.
- Collapsed, chips under the title name the special rounds ("R4 Gendered").

WORK IN THE ORDER GIVEN IN SECTION 9 OF THE PLAN. Two things in it will bite:

1. supabase/migrations/0008_round_plan.sql must be deployed BEFORE any client ships.
   One unknown column and PostgREST rejects the whole preferences row, which stops
   every preference syncing for everyone signed in. The hazard is written up at
   src/lib/sync.ts:182-187. Ask Jeff to run it; do not assume it is done.

2. In handlePlanCommit, basisKey must be handed the NEW plan, not the closed-over
   state — setRoundPlan has not re-rendered yet. handleRosterDeletePlayer at
   App.tsx:842 does the same thing with `attending: remaining`. Get this wrong and
   the Schedule tab shuts on the host mid-session.

GATES
- `tsc -b` (NOT `tsc --noEmit`, the root tsconfig is empty). It is the only thing that
  catches a missed call site across eight files.
- `npm test`
- `npm run lint -- src` (lint the src dir only)
- Drive the real app in a browser for the drag. No test covers it: happy-dom has no
  layout. Check finger-drag, keyboard arrows on the handle, and auto-scroll at 16 rounds.
- Prove the mid-session guard by breaking it: pass the stale plan to basisKey and
  confirm the Schedule tab shuts, then put it back.

Do not deploy. Stop at the commit and wait for Jeff to say ship it.
```
