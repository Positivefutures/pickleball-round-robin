# Actions sheet for the schedule page

## Context

The schedule page today offers exactly two things: **Reshuffle** and **New Session**, in a row at the top ([SchedulePage.tsx:465-483](src/components/schedule/SchedulePage.tsx#L465-L483)), with a second Reshuffle at the foot ([SchedulePage.tsx:535-545](src/components/schedule/SchedulePage.tsx#L535-L545)). Everything else a host needs mid-session either doesn't exist or is buried: a latecomer arrives, someone twists an ankle, the club hands over a fourth court at 9:30, the group wants two more rounds. Right now the honest answer to most of those is "start over".

This replaces both button rows with one **Actions** button (design: `INBOX/Actions.PNG`) opening a bottom sheet of nine actions. Six of the nine are new behaviour, not new buttons. The outcome is that a session in progress can absorb the things that actually happen at a pickleball morning without throwing away the rounds already played.

Confirmed decisions from planning:

- **Add a Court** seats the bench automatically, leaving unfillable places as `EMPTY`.
- **Actions button sits at the top only**; the foot-of-page Reshuffle goes.
- **Guests** are marked with a small chip and live for the session only.
- **Edit Player Rating** updates the saved player and the numbers on screen, and moves nobody.
- The sheet **slides up**, dims the background, and closes on X, backdrop tap, Escape, or a downward swipe of the handle.
- Tapping an action **expands the same sheet to near full screen**, retitling it; short actions flash a confirmation and close themselves.

---

## 1. The sheet

New `src/components/schedule/ActionsSheet.tsx`, rendered from `SchedulePage` (it needs the page's local `locks` / `brokenPairs` for Reshuffle). This is the app's first bottom sheet; every existing overlay is a centred card, so the mechanics below are new and belong in this one component.

**Shell**

- Backdrop `fixed inset-0 z-50 bg-black/40`, fading `opacity-0 → opacity-100`. Tap closes.
- Panel `fixed inset-x-0 bottom-0 z-50 rounded-t-2xl bg-white`, mounted at `translate-y-full`, then `translate-y-0` on the next animation frame, `transition-transform duration-300 ease-out`. Closing reverses, then unmounts on `transitionend`.
- Grab handle (grey pill) and an `×` button in the header, both as in the mockup. There is no `×` icon in the app yet, so add one.
- `useScrollLock(open)` from [useScrollLock.ts](src/hooks/useScrollLock.ts) — the iOS-safe body pin. No schedule dialog uses it today; this one must.
- Escape closes. No existing overlay handles Escape; do it here only.
- Bottom padding `pb-[max(1.5rem,env(safe-area-inset-bottom))]`. `index.html` has no `viewport-fit=cover`, so `env()` resolves to 0 and the 1.5rem carries it. **Do not add `viewport-fit=cover`** — it would let the header banner ride under the status bar in the installed PWA. The expression is already correct if that ever changes.
- Wrap the transitions in `@media (prefers-reduced-motion: reduce)` no-ops in [index.css](src/index.css).

**Swipe to dismiss.** Pointer handlers on the handle and header strip only, so they never fight body scroll. Track `pointerdown` Y; on move, translate by `max(0, dy)`; on up, close if `dy > 80px` or the flick is fast, otherwise spring back.

**Height.** Two states, animated via an inline pixel `height` with `transition-[height] duration-260`:

- Menu: measured from the grid's content on open (a `useLayoutEffect` + ref, so large-text mode measures correctly).
- Action view: `Math.round(window.innerHeight * 0.92)`.

The body scrolls with `min-h-0 flex-1 overflow-y-auto overscroll-contain`, the pinned-footer idiom already used by [AddPlayerDialog.tsx:26,47](src/components/schedule/AddPlayerDialog.tsx#L26).

**View state.** One `view` union drives everything: `'menu' | 'add-player' | 'new-player' | 'add-sub' | 'add-guest' | 'edit-rating' | 'reshuffle' | 'new-session' | 'add-round' | 'add-court' | 'remove-court' | 'done'`. Header title and subtitle are a lookup keyed off `view`; menu reads **Actions** / *Quick changes for this session*. A back chevron appears in the header on any non-menu view and returns to the grid. Confirmations are views, never stacked dialogs — the precedent is [ManageRostersModal.tsx:59](src/components/roster/ManageRostersModal.tsx#L59) and the comment at [RosterPage.tsx:256](src/components/roster/RosterPage.tsx#L256) ("two fixed overlays would double-dim the page and trap clicks").

**Done flash.** Actions that need no form (Reshuffle) and the tail of every action that does: swap to `view: 'done'` with a tick and one line ("Rounds 3 to 8 reshuffled."), then close after ~1600ms. Start New Session skips the flash — the page changes underneath it.

---

## 2. The grid

Three columns at every width (`grid-cols-3`), in the order given:

| | | |
|---|---|---|
| Add a Player | Add a Sub | Add a Guest |
| Edit Player Rating | Reshuffle | Start New Session |
| Add a Round | Add a Court | Remove a Court |

Card: white, `rounded-lg border border-[#D8DEE4]`, a tinted rounded-square icon chip, bold label below. **Sample the chip tints, label colour and card metrics from `INBOX/Actions.PNG` rather than eyeballing them.** The tint families in the mockup carry meaning worth keeping: green for the three add-a-person actions and the two go actions, blue for the adjustments, red for Remove a Court, orange for Add a Round.

**Icons.** Add to [icons.tsx](src/components/icons.tsx) following the existing private `Solid` wrapper, which already takes a per-icon `viewBox`. Each source SVG has hard-coded fills (`#231f20`, `rgb(0,0,0)`) that must become `currentColor`.

| Action | Icon |
|---|---|
| Add a Player | existing `AddPlayerSolidIcon` |
| Add a Sub | new: two people with a swap arrow, drawn to match the mockup (no asset supplied) |
| Add a Guest | `INBOX/guest.svg` |
| Edit Player Rating | existing `StarIcon` with a `INBOX/pencil.svg` badge |
| Reshuffle | `INBOX/shuffle.svg` |
| Start New Session | `INBOX/replay.svg` |
| Add a Round | `INBOX/row.svg` |
| Add a Court | `INBOX/court.svg` with a plus badge |
| Remove a Court | `INBOX/court.svg` with a minus badge |

The three badged icons compose in JSX (a `relative` span with the base icon and a small absolutely positioned badge) rather than fighting three different source viewBoxes. Put those in a new `src/components/schedule/actionIcons.tsx`; the plain ones go in `icons.tsx`.

The old stroked `ShuffleIcon` in [schedule/icons.tsx:2](src/components/schedule/icons.tsx#L2) is replaced by the `shuffle.svg` version in `icons.tsx`. Check its call sites before deleting; `TrashIcon` stays in that file.

---

## 3. The Actions button

Replaces the whole top row. Per the mockup: a centred orange gradient rounded-rect with a 2×2 block of white-outlined mini icons above bold white **Actions**, sitting on a halftone dot field (orange left, teal right). Sample the gradient stops, the dot colours and the corner radius from `INBOX/Actions.PNG`; the brand orange already in the app is `#FA5D02` / `#DE5202` ([UpdateBanner.tsx:8](src/components/layout/UpdateBanner.tsx#L8)).

It costs roughly 200px above Round 1, which is the design as drawn. The foot-of-page Reshuffle and the `.session-long` / `.session-short` rule in [index.css:54-65](src/index.css#L54-L65) both go.

The button is always available, including when every round is complete — that is exactly when Add a Round matters. Reshuffle is disabled inside the sheet with a reason when `allComplete`.

---

## 4. Engine work

### `src/lib/courts.ts` (new)

```ts
addCourtToRemaining(rounds, completedRoundNumbers, partnerships): Round[]
removeCourtFromRemaining(rounds, completedRoundNumbers, courtNumber): Round[]
```

**Add.** For each round not marked complete: append a `CourtAssignment` numbered `max(courtNumber in that round) + 1` (capped at `MAX_COURT_NUMBER`, [courtNumbers.ts:18](src/lib/courtNumbers.ts#L18)) — not `length + 1`, which would produce "COURT 4" beside a renamed 7/8/9. Then seat up to four off that round's bench, skipping the seating entirely if fewer than two are waiting (one player on a court is not a game, per the short-court rule at [assign.ts:23-31](src/lib/assign.ts#L23-L31)). Split the seated players for balance and keep any Set-Partners couple on one side; `pickShortSplit` ([assign.ts:61](src/lib/assign.ts#L61)) already does this for two and three. Recompute `ratingDiff` with `courtRatingDiff` ([helpers.ts:27](src/utils/helpers.ts#L27)).

**Remove.** Match by `courtNumber` rather than index, so it stays right if court counts ever differ between rounds; skip any remaining round that doesn't carry that number. Every player on it joins `sitOuts` for that round. Surviving courts keep their own labels, which is why this splices directly instead of going through `carryCourtNumbers` (that matches by position and would shift labels left).

Both leave completed rounds untouched, returned by reference, matching [addToRemainingRounds](src/lib/sitout.ts#L38).

### `src/lib/sitout.ts` — one new primitive

```ts
replacePlayerInRounds(rounds, outgoingId, incoming, skipRoundNumbers): Round[]
```

Swaps one `Player` object for another wherever it appears in `team1`, `team2` or `sitOuts`, recomputing `ratingDiff` on touched courts. It backs two different actions:

- **Add a Sub** — `skipRoundNumbers = completedRounds`, so history stands.
- **Edit Player Rating** — same player id, new rating object, `skipRoundNumbers = []`, so every round on screen shows one number for one person.

This is deliberately not remove-then-add: `handleRemovePlayer` triggers a full `regenerateRemaining` that scrambles the remaining rounds, and `handleAddPlayer` only drops the newcomer on the bench.

### `src/lib/pairing.ts` — `extendSchedule`

```ts
extendSchedule(players, numCourts, rounds, extraRounds, specialTypes, partnerships): Schedule
```

Appends `extraRounds` stub rounds numbered from `last + 1`, then delegates to the existing `regenerateRemaining` with **every pre-existing round number passed as completed**. That gets the requested behaviour for free and touches no private helper:

- Existing rounds return verbatim ([pairing.ts:340](src/lib/pairing.ts#L340)).
- Full partner, opponent, sit-out and short-game history is replayed from them ([pairing.ts:317-324](src/lib/pairing.ts#L317-L324)), so the new rounds are built as if they'd been planned from the start.
- The sit-out rotation carries across from the last existing round ([pairing.ts:328-334](src/lib/pairing.ts#L328-L334)).
- Special round types line up: `planRoundTypes` is forward-only and never revises, so `planRoundTypes(cfg, N + M)` agrees with `planRoundTypes(cfg, N)` on its first N entries, and `regenerateRemaining` indexes it by `roundNumber - 1` ([pairing.ts:349](src/lib/pairing.ts#L349)).

---

## 5. Guests

A guest must never reach `stores.players`. [sync.ts:230-245](src/lib/sync.ts#L230) watches that store and would push them to the account as a permanent player, and [syncMerge.ts:99-137](src/lib/syncMerge.ts#L99) matches by lowercased name with "the account wins", so a guest named Dave would be absorbed by the real Dave. Modelling a guest as `rosterIds: []` is also out: [migrations.ts:63-79](src/lib/migrations.ts#L63-L79) re-homes any such player into the active group at boot.

So:

- Add `guest?: true` to `Player` in [types/index.ts:8](src/types/index.ts#L8). Optional, so nothing else changes, and it is invisible to sync because `playerRow` ([outbox.ts:86](src/lib/outbox.ts#L86)) and `toGroupsCsv` ([groupFile.ts:38](src/lib/groupFile.ts#L38)) are both explicit whitelists.
- New store in the **device** half of [stores.ts](src/lib/stores.ts): `guests = createStoredValue<Player[]>('pb-guests', [])`, beside `selectedIds` / `removedIds`. Nothing in `sync.ts` or `migrations.ts` looks at it.
- In `App.tsx`, derive `sessionPlayers = [...rosterPlayers, ...guests]` and use it for the selectedIds pruning effect ([App.tsx:182-190](src/App.tsx#L182-L190)), `attendingPlayers` ([App.tsx:320](src/App.tsx#L320)) and `addablePlayers` ([App.tsx:439](src/App.tsx#L439)). `RosterPage` and `SetupPage` keep plain `rosterPlayers`, so guests never leak into the group UI.
- `clearSession` ([App.tsx:233](src/App.tsx#L233)) empties the guest store, so guests die with the session on both branches.
- Chip: a quiet `GUEST` pill beside the name in `PlayerButton` ([CourtMatchup.tsx](src/components/schedule/CourtMatchup.tsx)) and [SitOutList.tsx:74](src/components/schedule/SitOutList.tsx#L74) when `player.guest`. Screen only; the printed sheet and PDF just need names.

---

## 6. Wiring in `App.tsx`

New callbacks, passed to `SchedulePage` as one grouped `actions` object rather than nine more flat props (the signature is already sixteen).

| Action | What it does |
|---|---|
| Reshuffle | existing `handleReshuffle`, unchanged |
| Start New Session | existing `handleStartNewSession`, confirm moves into the sheet |
| Add a Player | existing member: `handleAddPlayer`. New member: `addPlayer(name, rating, gender, [activeRosterId])` then the same add-to-session path |
| Add a Sub | `replacePlayerInRounds`; incoming joins `selectedIds`, outgoing **leaves `selectedIds`** |
| Add a Guest | push onto the guest store, add to `selectedIds`, then `addToRemainingRounds` |
| Edit Player Rating | `updatePlayer(id, { rating })` (or the guest store), then `replacePlayerInRounds` over every round |
| Add a Court | `addCourtToRemaining`, then `setNumCourts(numCourts + 1)` |
| Remove a Court | `removeCourtFromRemaining`, then `setNumCourts(max(1, numCourts - 1))` |
| Add a Round | `extendSchedule`, then `setNumRounds(numRounds + n)` |

Two notes on that table:

**Why the sub drops `selectedIds` instead of adding to `removedIds`.** `canUncomplete={removedIds.length === 0}` ([App.tsx:727](src/App.tsx#L727)) locks the Completed checkboxes for good, and the reason is that a removal *rebuilds* the remaining rounds so un-ticking would be incoherent. A sub is an in-place swap and rebuilds nothing, so it has no business locking them. Dropping the outgoing player from `selectedIds` takes them out of `attendingPlayers`, puts them back in `addablePlayers`, and lets the partnership-pruning effect drop their couple, all without touching `removedIds`.

**Why `numCourts` and `numRounds` move.** Both feed the next Reshuffle. Leave `numCourts` alone and the first reshuffle after adding a court would silently delete it. The visible cost is that Setup shows the new count next time, which is the right default for a club that got a fourth court once.

Rating edits call `setSchedule` directly rather than `handleUpdateSchedule`, so they don't set `scheduleEdited` — the rating is saved on the player either way, so there is no unique work at stake.

---

## 7. Copy that has to be honest

`effectiveCourtCount` ([assign.ts:36](src/lib/assign.ts#L36)) silently caps courts against the roster, so a reshuffle can drop a court the host just added. Say so before they tap, the way [SetupPage.tsx:62-68](src/components/setup/SetupPage.tsx#L62-L68) already does:

- Enough players: "Court 4 is added to every round still to be played. Four players come off the bench."
- Not enough: "There are 13 players, which fills 3 courts. The new court stays empty, and a reshuffle will drop it."
- Remove: "The four players on Court 3 sit out every round still to be played."
- Add a Round: "Rounds 9 and 10 are added and planned around the games already scheduled. Rounds 1 to 8 do not change."

Rounds still to be played are described by count, not by listing numbers, because completion is an arbitrary set.

---

## 8. Files

**New:** `src/components/schedule/ActionsSheet.tsx`, `src/components/schedule/ActionsButton.tsx`, `src/components/schedule/actionIcons.tsx`, `src/lib/courts.ts`, `src/lib/courts.test.ts`.

**Changed:** [SchedulePage.tsx](src/components/schedule/SchedulePage.tsx) (both button rows out, sheet in), [App.tsx](src/App.tsx), [types/index.ts](src/types/index.ts), [stores.ts](src/lib/stores.ts), [pairing.ts](src/lib/pairing.ts), [sitout.ts](src/lib/sitout.ts), [icons.tsx](src/components/icons.tsx), [schedule/icons.tsx](src/components/schedule/icons.tsx), [CourtMatchup.tsx](src/components/schedule/CourtMatchup.tsx), [SitOutList.tsx](src/components/schedule/SitOutList.tsx), [index.css](src/index.css), [PlayerForm.tsx](src/components/roster/PlayerForm.tsx) (optional `submitLabel`; extract its −/+ stepper as a shared `RatingStepper` so Edit Player Rating reuses it rather than growing a second one).

**Deleted:** [AddPlayerDialog.tsx](src/components/schedule/AddPlayerDialog.tsx). Its radio list becomes the sheet's Add a Player view, so there is one Add Player UI rather than two. The inline `+ Add Player` button on the sit-out row stays and opens the sheet straight onto that view.

Also bump `APP_VERSION` in [appInfo.ts:8](src/lib/appInfo.ts#L8) from `1.31.0` to `1.40.0` in the deploy commit — the scheme reserves the middle number for a batch of features.

---

## 9. Verification

**Unit.** `src/lib/courts.test.ts` for add and remove (bench seating, the fewer-than-two case, court numbering off a renamed court, completed rounds returned by reference, remove-by-label). Extend `sitout.test.ts` for `replacePlayerInRounds` and `pairing.test.ts` for `extendSchedule` (existing rounds byte-identical, history genuinely carried, special types unchanged). Pairing assertions must measure before asserting and vary the base schedule, not hard-code a lucky seed.

**Walkthrough.** `src/App.walkthrough.test.ts` mounts the real `App` and clicks through it; there is no React Testing Library. Existing `/^Reshuffle$/` and `/^New Session/` clicks (lines 158, 219-220, 254, 306, 646, 663, 677-678, 703) and the `+ Add Player` assertions (179, 187-189, 273, 281, 328, 878-880) all route through the sheet now. New cases: the nine actions render; Add a Court seats the bench in every unplayed round and bumps `pb-num-courts`; Remove a Court benches its players and decrements it; Add a Round appends without touching earlier rounds; Add a Sub swaps one player in place with every other court unchanged; Add a Guest writes `pb-guests` and not `pb-roster`; Edit Player Rating writes `pb-roster` and updates the on-court number and `ratingDiff`. Assert against `localStorage` as well as the DOM, which is the house style. Check `App.print.test.ts` for the same button references.

Every new assertion gets one deliberate sabotage that must turn the suite red before the sabotage is reverted.

**By eye.** Render to static HTML and screenshot for the sheet's look, then drive a real browser (playwright-core in the scratchpad, pointed at the chromium already on disk) for the things a screenshot cannot show: the slide-up, the expand to full screen, swipe-to-close, backdrop and Escape, the done-flash timing, and the sheet at 375px with large-text mode on. Confirm the fixed sheet still positions correctly against the viewport while `.app-panel` carries its slide transform.

Finally `npx tsc --noEmit` (tests are excluded from it, so this proves nothing about them) and `npm run lint` scoped to `src` only. Never run Prettier on this repo.
