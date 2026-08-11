# Add Player to a Running Session

## Context

A host running a session has no way to bring in someone who turns up late. The only routes are Setup (which rebuilds the schedule from scratch) or nothing. Players can already be *removed* mid-session via [RemovePlayerDialog](../../Library/CloudStorage/Dropbox/AI%20PROJECTS%20-%20DROPBOX/pickleball-round-robin/src/components/schedule/RemovePlayerDialog.tsx) — this is the missing other half.

An **Add Player** button goes on the Sitting out line of the first unplayed round. The chosen player is appended to Sitting out for every round not yet marked complete, leaving the existing pairings untouched. From there the host either swaps them onto a court by hand, or hits Reshuffle to have the remaining rounds rebuilt around them.

**Decisions taken:** button on the first unplayed round only; candidates come from the active group including anyone removed earlier; and Reshuffle is fixed to preserve completed rounds (below).

## Two findings that shape this

**1. Reshuffle currently restarts the whole schedule.** [`handleGenerate`](../../Library/CloudStorage/Dropbox/AI%20PROJECTS%20-%20DROPBOX/pickleball-round-robin/src/App.tsx) decides what to do from a heuristic — `isReshuffle` is true only when locks or broken pairs exist — then rebuilds rounds 1..N from a blank history and calls `setCompletedRounds([])` and `setRemovedIds([])`. So Reshuffle wipes played rounds, brings removed players back, and when no locks are set doesn't even take the reshuffle branch. Any note telling hosts to press Reshuffle would be actively harmful. Fixed as part of this work.

**2. The sit-out ordering you described needs no new code.** [`determineSitOuts`](../../Library/CloudStorage/Dropbox/AI%20PROJECTS%20-%20DROPBOX/pickleball-round-robin/src/lib/sitout.ts) sorts by `gamesPlayed` descending and sits the most-played first. Once `regenerateRemaining` replays completed-round history, a newly added player has 0 games and therefore sorts last — your 5 who haven't sat go first, then the 4 who have, then the new player. Exactly the rule you asked for, already emergent. A test will pin this down so it cannot regress.

## Changes

### 1. `src/lib/sitout.ts` — the append, as a pure function

```ts
export function addToRemainingSitOuts(
  rounds: Round[], completedRoundNumbers: number[], player: Player
): Round[]
```

Returns rounds with `player` appended to `sitOuts` on every round **not** in the completed set, completed rounds returned by reference. Kept pure and out of `App.tsx` so it can be tested directly, the way `planImport` was.

### 2. `src/lib/pairing.ts` — Reshuffle onto the tested path

Give `regenerateRemaining` the two arguments Reshuffle needs, both optional and defaulting to empty so existing callers and its seven tests are unaffected:

```ts
locks: Record<number, LockedPair[]> = {},
brokenPairs: Record<number, string[]> = {}
```

Index both by **position in `allRounds`**, matching how `SchedulePage` already keys its `locks` state by `roundIdx`. Apply the broken-couple filter per round exactly as `reshuffleSchedule` does today, and pass `roundLocks` into the existing `buildRound` call.

**Delete `reshuffleSchedule`.** Once `regenerateRemaining` accepts locks it is strictly redundant — with nothing completed it rebuilds every round identically — and it has no test coverage at all, while `regenerateRemaining` has seven cases.

### 3. `src/App.tsx` — split generate from reshuffle

Replace the `isReshuffle` heuristic with two explicit handlers:

- **`handleGenerate()`** — Setup only. Always `generateSchedule`; keeps the current resets (`completedRounds`, `removedIds`, `scheduleEdited`, `scheduleRosterId`, step).
- **`handleReshuffle(locks, brokenPairs)`** — Schedule only. Calls `regenerateRemaining(attendingPlayers, numCourts, schedule.rounds, completedRounds, …, locks, brokenPairs)`. Does **not** clear `completedRounds` or `removedIds`, and stays on the schedule step. Note it passes `attendingPlayers` (selected **and** not removed) rather than today's selected-only list, so a removed player stays gone. Set `scheduleEdited` to `removedIds.length > 0` — the remaining rounds are machine-generated again, but a removal is still work that Setup would discard.

Add **`handleAddPlayer(playerId)`**:

```ts
setSchedule({ rounds: addToRemainingSitOuts(schedule.rounds, completedRounds, player) });
setSelectedIds((prev) => prev.includes(playerId) ? prev : [...prev, playerId]);
setRemovedIds((prev) => prev.filter((id) => id !== playerId));
setScheduleEdited(true);
```

Adding to `selectedIds` is what makes the player survive a later Reshuffle — `attendingPlayers` derives from it. Clearing `removedIds` is what lets someone who left rejoin.

### 4. `src/components/schedule/AddPlayerDialog.tsx` — new

Modelled on [AddToGroupDialog](../../Library/CloudStorage/Dropbox/AI%20PROJECTS%20-%20DROPBOX/pickleball-round-robin/src/components/roster/AddToGroupDialog.tsx): same overlay, scrollable list, Cancel/confirm pair. Single-select (radio or highlight), confirm disabled until something is picked. Candidates are passed in already filtered.

Note at the top — your copy, tightened. It drops "Sitting out section" for the shorter "Sitting out", names both routes onto a court, and only promises what the fixed Reshuffle actually does:

> They'll start out sitting out every round you haven't played yet.
> To get them on a court, swap them with another player — or tap Reshuffle to rebuild the remaining rounds with them mixed in.

Empty state when everyone is already playing: say so, and point at My Groups for adding new people.

### 5. Sit-out line and round card

- **[SitOutList.tsx](../../Library/CloudStorage/Dropbox/AI%20PROJECTS%20-%20DROPBOX/pickleball-round-robin/src/components/schedule/SitOutList.tsx)** — takes an optional `action?: ReactNode` rendered right-aligned on the "Sitting out" line (`flex items-center justify-between`). Its current `if (players.length === 0) return null` must become "return null only when there is no action either", otherwise the button vanishes in the 8-players/2-courts case where nobody sits out — precisely when a host wants a 9th.
- **[RoundCard.tsx](../../Library/CloudStorage/Dropbox/AI%20PROJECTS%20-%20DROPBOX/pickleball-round-robin/src/components/schedule/RoundCard.tsx)** — passes a `sitOutAction` prop straight through.
- **[SchedulePage.tsx](../../Library/CloudStorage/Dropbox/AI%20PROJECTS%20-%20DROPBOX/pickleball-round-robin/src/components/schedule/SchedulePage.tsx)** — owns the dialog state and computes the target round:

```ts
const firstOpenIdx = schedule.rounds.findIndex((r) => !completedSet.has(r.roundNumber));
```

Render the button only for `roundIdx === firstOpenIdx`. Note `orderedRounds` re-sorts completed rounds to the top for display but each entry keeps its original `roundIdx`, so compare against that, not display position. Hide the button when every round is complete, matching how Reshuffle already disappears.

Candidates come from the App as `rosterPlayers` minus `attendingPlayers`; hide the button when that list is empty.

## Known edge case

`canUncomplete` is derived as `removedIds.length === 0`. Removing a player and then re-adding them empties `removedIds` and so re-enables the Completed checkboxes, even though those rounds were rebuilt around the removal. Narrow enough to accept rather than introduce a second flag — worth a comment at the derivation site.

## Tests

`src/lib/sitout.test.ts` (new):
- appends the player to unplayed rounds only, completed ones untouched
- appends to a round that currently has no sit-outs
- leaves courts and round numbers alone

`src/lib/pairing.test.ts` (extend):
- **the ordering scenario from the request**: 9 players over several completed rounds where 4 have sat out, add a 10th, regenerate, and assert the new player is not among the first sit-outs while the never-sat players are
- `regenerateRemaining` honours `locks` on a rebuilt round and leaves completed rounds verbatim
- a broken pair in `brokenPairs` is not kept together in the rebuilt round

## Verification

1. `npm test` and `npx eslint src` (full `npm run lint` is unusable — see below)
2. `npm run dev`, then:
   - 9 players, 2 courts. Generate. Mark rounds 1–3 complete
   - Confirm Add Player sits on the Sitting out line of round 4, not on 1–3
   - Add a player; they appear in Sitting out on rounds 4+ only, and rounds 1–3 are untouched and still complete
   - Swap them onto a court; confirm the swap holds
   - Press Reshuffle: **rounds 1–3 must remain complete and unchanged** — this is the regression the fix exists for — and the new player is spread through rounds 4+
   - With 8 players and 2 courts (nobody sitting out), confirm the button is still reachable
   - Remove a player, then re-add them from the dialog
   - Confirm the button disappears when everyone in the group is already playing, and when all rounds are complete
3. Bump `APP_VERSION` in [appInfo.ts](../../Library/CloudStorage/Dropbox/AI%20PROJECTS%20-%20DROPBOX/pickleball-round-robin/src/lib/appInfo.ts) — currently `1.20.2`, uncommitted along with the export/import work
4. Deploy is a push to `main`; Vercel builds from git

## Still outstanding from previous work

The all-groups export/import feature is implemented and green but **uncommitted and undeployed**, and its manual round-trip check has not been done. This work builds on that same working tree.

`npm run lint` takes 5+ minutes and reports ~9,565 errors, all from `node_modules_OLD_BACKUP`. `globalIgnores(['dist'])` → `globalIgnores(['dist', 'node_modules*'])` in [eslint.config.js](../../Library/CloudStorage/Dropbox/AI%20PROJECTS%20-%20DROPBOX/pickleball-round-robin/eslint.config.js) fixes it. Not part of this work.
