# Choose Sit-Outs: pin who sits out, by round

## Context

Hosts know some sit-outs in advance: someone arriving late sits Round 1, someone leaving early sits the last round. Today the rotation decides every sit-out and the host can only swap afterwards, and the next Reshuffle undoes those swaps. This feature lets the host pin sit-outs before generating, and lock or unlock them on the Schedule tab, so a Reshuffle keeps them. Everything else stays fair around the pins.

The hard rule is not to break the scheduler. The design keeps that safe in three ways:
- **A pin is just a sit-out recorded early.** The existing fairness rules (most games played sits first, no back-to-back sit-outs, then the order of the sit-out cycle in `lib/sitout.ts`) already produce what Jeff described once a pinned sit-out is in the history. A player who sat Round 1 has played one game fewer, so they play until everyone else has sat. They are first in `sitOutOrder`, so they sit first when the cycle comes round again (round N+1). Pin them in Rounds 1 and 2 and they won't sit again until everyone else has sat twice.
- **With no pins, every code path is unchanged:** the same comparator, the same `Math.random` draws in the same order. This is proved by a golden comparison (see Verification).
- **The one new rule** is lookahead (Jeff chose it): when choosing who sits now, a player who has a pinned sit-out coming later counts as already owed that rest.

## Decisions (from Jeff)
- The chooser is a **full page** that takes over the Setup content, with Back and Generate Schedule buttons.
- The toggle's label is **"Choose Sit-Outs?"**.
- **Later pins count ahead.** Lookahead is applied as described above.
- **Too many pins after a change** (a removal, or a court added) means the pins chosen first are kept and the rest are unlocked.

## Decisions I made (flag if wrong)
- **Sit-out locks persist with the schedule.** Pair padlocks don't: they are page state and go when you leave the tab. Sit-out locks have to survive, because the Setup → Schedule hop is a tab switch and Jeff wants the Setup choices to arrive locked. Toggling one doesn't mark the schedule edited, so it goes quietly, like a padlock.
- **Partner Play nights.** A round with a pin steps outside the fixture list for that round only, the same way a padlock already does (`buildRound`, pairing.ts:195). The pinned player's partner plays unlinked that round.
- **The chooser starts from the current schedule's locks**, filtered to the players still ticked and capped at the number of seats. If nothing changed since the parked schedule and the pins are the same, Continue hands that schedule back. This follows the existing "Generate hands back the parked schedule" rule (`parkedIsCurrent`, App.tsx:868).
- **The toggle keeps its on/off state while it's hidden.** A stored value, like Keep Score.

## Data model
- `types/index.ts` gets `Round.lockedSitOutIds?: string[]`: ids in the order they were chosen, absent when there are none. It lives on the round, so it travels with the schedule through storage, parked group sessions, sync and sharing for free.
- `stores.ts` gets `chooseSitOuts = createStoredValue<boolean>('pb-choose-sit-outs', false)`.

## Scheduler changes (lib)

**`lib/sitout.ts`**
- New export: `sitOutSeats(numPlayers, numCourts)` returns `max(0, numPlayers − numCourts·4)`. SpotsFilled, the toggle, the chooser and `buildRound` all use it, so the label and the engine can never disagree. A test asserts it equals what `generateSchedule` actually benches.
- `determineSitOuts` gets an optional last parameter, `owedRests?: Record<string, number>`. When present, `games(p)` reads `gamesPlayed − owedRests[p]` in both the per-player comparator and the unit `avgGames`. When absent, the logic is identical to today.
- `replacePlayerInRounds` also rekeys `lockedSitOutIds`.

**`lib/pairing.ts`**
- `buildRound` gets `opts.pinnedSitOutIds?` and `opts.owedRests?`. The steps:
  1. The pinned players are the ones present in `players`, taken in order and capped at `sitOutSeats(players.length, effectiveCourts)`.
  2. If any are pinned: Partner Play stands down for the round. Drop every partnership, and every `roundLock`, that names a pinned player from `keepTogether`/`sitOutUnits`/`roundLocks`. Then call `determineSitOuts` on `players` minus the pinned. Its seat count falls by exactly the number pinned, because `numSitOuts = total − maxActive`.
  3. `sitOuts = [...pinned, ...rest]`. The round type is **not** cancelled. The returned round carries `lockedSitOutIds` when the list isn't empty.
- `generateSchedule(..., sitOutPins: Record<number /*roundNumber*/, string[]> = {})`: each round gets its own pins, plus `owedRests` = the count of pins in later rounds.
- `regenerateRemaining` reads pins from `allRounds[i].lockedSitOutIds` for rounds that aren't complete. `owedRests` comes from pins in later rounds that aren't complete. Every rebuild then honours them with no change at the call sites: Reshuffle, Remove Player, `repairWithout`, round-plan commit. `extendSchedule` is unchanged, because its stubs have no pins.

**`lib/syncMerge.ts:198`** remaps the ids in `lockedSitOutIds` alongside `sitOuts`.

## Setup UI
- **Extract** the Keep Score row (`SessionConfig.tsx:220-223`) into `ToggleRow({ label, checked, onChange })` in `components/Toggle.tsx`. Keep Score and the new toggle both use it, so they are identical by construction.
- **`PlayerSelector`/`SpotsFilled`:** render `<ToggleRow label="Choose Sit-Outs?">` directly under the red "N players will sit out each round" line, only when `sitOutSeats > 0`. Thread `chooseSitOuts` and its setter from App → SetupPage → PlayerSelector.
- **`SetupPage`** gets local state, `choosing: boolean` plus a draft `Record<roundNumber, string[]>`. `handleGenerate`: if `canGenerate && chooseSitOuts && seats > 0`, open the chooser seeded from the schedule's locks. Otherwise it behaves as today. Leaving the tab unmounts the page, which drops the chooser, as it does the round-types list.
- **New `components/setup/SitOutChooser.tsx`** (the full page):
  - A page card per round: "Round N" and `seats` rectangular slots.
  - An empty slot is a dashed box reading "Tap to choose".
  - A filled slot is the Select Players box: the name on the left, and a `TrashIcon` (`components/icons.tsx`) where the gender and rating sit. Tapping the trash clears it.
  - Tapping an empty slot opens a picker panel (`panelCard` edge) titled "Round N: Who Sits Out?". It lists the selected players not already in that round, in the Select Players box style (name, gender, rating). Tapping one fills the slot and closes the panel.
  - The panel's Cancel uses the grey cancel string. Per the CLAUDE.md rule, it is **extracted to `accountStyles.ts` as `account.cancel`** and imported here. The other 22 sites are left for a separate sweep.
  - Footer: "← Back" (the secondary button) and "Generate Schedule →" (the same teal as Setup's). The first returns to Setup with the draft kept. The second calls `onGenerate(pins)`.
- **`App.handleGenerate(pins?)`** passes the pins to `generateSchedule`. `handleGeneratePress(pins?)` hands back the parked schedule only if `parkedIsCurrent` and the pins equal the parked schedule's locks. The tour's `nextCard()` stays where it is.

## Schedule UI
- **Move** `LockIcon` out of `CourtMatchup.tsx:58`, the one between partners, into `schedule/PadlockIcon.tsx`. CourtMatchup and SitOutList share it.
- **`SitOutList`/`SitOutBox`:** the box becomes a column with the name row and a lock button centred at the bottom. It isn't shown when `readOnly`, which covers completed rounds and the live viewer. New props: `lockedIds` and `onToggleSitOutLock(roundIdx, playerId)`. A locked box's tap calls `onLockedTap` with a `SitOutSlot`. The box shows its pencil when it is the `pencilSlot`, the way `CourtMatchup.PlayerButton` does.
- **`SchedulePage`:**
  - Widen `pencilSlot` to `CourtSlot | SitOutSlot`.
  - New handler `handleToggleSitOutLock`: it adds the id to the round's `lockedSitOutIds` or removes it, through a new App prop `onSetSchedule`. That prop calls `setSchedule` without `setScheduleEdited`. It then clears the taps.
  - `handlePlayerTap` sends a tap on a locked sit-out to `handleLockedTap`, as a guard.
  - Below the round, the pencil message reads "Tap the pencil for more. Unlock the player to swap." when `pencilSlot.kind === 'sitout'`, and keeps the existing pair message otherwise.
- **`RoundCard`** passes `round.lockedSitOutIds` and the handler through.

## Docs and housekeeping
- **Style guide:** add `ToggleRow`, a chooser slot in both states, and the sit-out box locked and unlocked. All are imported, not copied.
- **CLAUDE.md vocabulary table:** add "the **sit-out lock**", "a **sit-out slot**", `ToggleRow` and `account.cancel`.
- **`docs/ui-audit.md`:** note that the grey cancel is extracted.
- Copy this plan to `PLANS/choose-sit-outs.md` the moment plan mode exits.
- No deploy, and no version bump unless Jeff says to ship.

## Verification
1. **Golden "nothing changed" check, done first, before any code is edited.** In the scratchpad, seed `Math.random`. Run `generateSchedule` and `regenerateRemaining` over a matrix: 5–21 players, 1–4 courts, partnerships, all players partnered, round plans, padlocks, completed rounds. Save the JSON. After the change, run the same matrix with no pins and require byte-identical output. Re-run the `MEASURE=1` harness before and after, and require identical numbers.
2. **New `lib/sitOutPins.test.ts`:**
   - Pins are kept in their rounds across plain rounds, partnerships, Partner Play, special round types and padlocks.
   - Jeff's case: 9 players on 2 courts, P pinned in Round 1. P sits again exactly when the cycle returns (Round 10), and in no round between. Pinned in Rounds 1 and 2, P doesn't sit again until every other player has sat twice.
   - A later pin (Round 10) isn't doubled by the rotation in the rounds before it.
   - A pinned player's partner plays that round.
   - The spread of sit-outs stays within 1 for unpinned players.
   - `regenerateRemaining` keeps pins, drops a removed player's, and caps at the seat count keeping the earliest chosen.
   - `replacePlayerInRounds` and `syncMerge` rekey the ids.
   - `sitOutSeats` matches the engine.
   - Plus Jeff's "probabilistic" rule: repeat across seeds and base schedules.
3. **Prove each guard by breaking it,** reversing the sabotage edit in Python and never with git.
4. **Walkthrough test (`App.walkthrough.test.ts` style):**
   - The toggle is hidden at or below the spots, and appears above them.
   - It hides again when a player is unticked.
   - Toggle on → Generate shows the chooser.
   - Fill a slot, then delete it.
   - Continue: Round 1 shows the player sitting out, with the lock closed.
   - Tapping a locked sit-out shows the new message and no swap selection.
   - Unlock → an ordinary swap works.
   - Reshuffle keeps a locked sit-out.
5. Run `npm run lint`, `npx tsc -b` and `npx vitest run`.
6. **Visual check:** drive a real browser (playwright-core plus the local chromium) through Setup → chooser → Schedule at phone width, and screenshot the toggle beside Keep Score, the chooser, the picker and a locked sit-out.
