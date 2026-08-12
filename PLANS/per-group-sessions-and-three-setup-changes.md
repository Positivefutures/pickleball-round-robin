# Four Setup and group changes, with per-group state

## Context

Four things Jeff wants, three small and one structural.

The structural one: today the app has exactly **one** session slot. Every session
key in `lib/stores.ts` (`pb-schedule`, `pb-selected-ids`, `pb-partnerships`, and
the rest) is a single global value, and switching groups throws it away. From the
Players tab, `handleSelectRoster` either silently wipes the selection and partner
links, or, if a schedule exists, raises a red "Switch groups?" dialog that clears
the session outright. There is no way to switch groups at all from Setup or
Schedule.

Jeff wants a host to move between groups the way they move between tabs: pick a
different group and land exactly where they left that group last time, with its
session, its setup and its settings intact. Per his answers, **everything except
large text and default player rating is per group** now: courts, rounds, special
round types, keep score, the whole session, and the tab they were on.

The other three are contained: an Unlink All link on the Partners panel, "Members"
in the roster title, and moving the M/F marker next to the rating.

---

## The mechanism: park and resume

Do **not** re-key the existing stores. `liveSession.ts` subscribes to seven of them
by reference (`WATCHED`, liveSession.ts:197-205), `sync.ts` reads and writes them
in three places, and `ErrorBoundary.tsx:44` reads the schedule. Re-keying means
touching all of it.

Instead keep the existing stores as **the live slot** (always the active group's
state) and add one new store holding **everyone else's**:

`src/lib/groupSessions.ts` (new)

```ts
/** One group's saved state, restored whole when the host comes back to it. */
export interface GroupSession {
  step: Step;
  setupSeen: boolean;
  selectedIds: string[];
  partnerships: Partnership[];
  schedule: Schedule | null;
  completedRounds: number[];
  removedIds: string[];
  guests: Player[];
  scheduleEdited: boolean;
  sessionId: string | null;
  numCourts: number;
  numRounds: number;
  specialTypes: SpecialGameTypes;
  scoringEnabled: boolean;
}
```

Stored as `Record<rosterId, GroupSession>` under a new key `pb-group-sessions` in
`lib/stores.ts`, in the device half beside `schedule`. `scheduleRosterId` is not
in the record: the map key already is it, so resume derives it as
`schedule ? rosterId : null`.

Three exported functions, all operating on the stores directly so any caller can
use them, React or not:

- `park(rosterId)` — read the live slot into the record.
- `resume(rosterId)` — write the record into the live slot. **No record means
  leave the settings alone and clear the session**: a group never set up before
  inherits the courts, rounds and round types currently in use, which is what a
  host would expect, and needs no migration for existing installs.
- `switchToGroup(id)` — `park(current)`, `stores.activeRosterId.set(id)`,
  `resume(id)`. The single door. Also `forget(rosterId)` for a deleted group.

`step` becomes a persisted store (`pb-step` in `lib/stores.ts`) rather than
`useState`, so it rides in the live slot with everything else and `switchToGroup`
needs no help from React. Guard on read: if it says `schedule` and there is no
schedule, fall back to `roster`. This also means a relaunch returns to the tab
the host was on, which is a deliberate improvement on today's "Players unless a
schedule exists".

### Live sharing

`park()` must call `stopSharing()` (liveSession.ts:307) first when
`stores.shareKey.get()` is set, before anything else moves. Without it,
`liveSession`'s `onChange` sees the incoming group's schedule land under the
outgoing group's share key and publishes the wrong session to a live QR code.
`shareKey` is deliberately **not** in `GroupSession`: a stopped share does not
come back.

Warn in the Change Groups panel when a share is live. Copy, shown above the group
list only when `liveStatusStore` is live:

> Sharing stops when you change groups. Start it again from the new session.

### Files that must route through `switchToGroup`

Every existing place that sets `activeRosterId` becomes a `switchToGroup` call,
or the live slot ends up describing the wrong group:

| Where | Now |
|---|---|
| `App.tsx:336-356` `handleSelectRoster` / `confirmRosterSwitch` | Replaced by one `switchGroup` callback. Delete `pendingRosterSwitch`, `confirmRosterSwitch`, and the "Switch groups?" dialog at `App.tsx:1064-1089` |
| `App.tsx:358-365` `handleDeleteRoster` | Add `forget(id)`; keep the `clearSession()` guard for the live slot |
| `App.tsx:804-811` group import | Route the roster change through `switchToGroup`; the "session is still running" notice can go |
| `App.tsx:239-245` boot follow of `scheduleRosterId` | Redundant once the live slot always matches the active group. Verify and delete |
| `sync.ts:628` `applyPreferences` | `stores.activeRosterId.set(...)` becomes `switchToGroup(...)`. This path fires on **every ordinary pull**, so it is the one that would silently strand a session under another group's name |
| `sync.ts:597-600` active id repair | Same, plus `forget()` for the vanished group |
| `sync.ts:1005-1017` `adoptAccountCopy` | Clear `pb-group-sessions` alongside the live slot. Every id it referred to has just gone |
| `syncMerge.ts:176` `remapSession` | Parked sessions hold player and roster ids too. `combineWithAccount` (sync.ts:917) must remap each parked record and re-key the map by the adopted roster ids, or partner links in a parked session break invisibly, which is exactly what `SessionRefs`' comment warns about |

### Preferences sync

`preferencesRow` (sync.ts:170) sends `num_courts`, `num_rounds`, `special_types`
and `scoring_enabled`. Those four now describe the active group, not the person,
so applying them on an ordinary pull would let one device's group settings
overwrite another's. Give `applyPreferences` a flag: **skip those four on a
routine pull, apply them on merge and adopt**, where the device is starting fresh
and they are the right inherited default. Keep sending them (the columns exist and
old clients still read them). `default_rating`, `large_text`,
`swap_hint_dismissed` and `active_roster_id` are unaffected.

### Known limitation, out of scope

`SchedulePage`'s padlocks and per-round broken couples are local `useState`
(SchedulePage.tsx:156-158) and are lost on switch, exactly as they are lost on a
page refresh today. Lifting them into `GroupSession` means lifting them to `App`
first. Flagging, not doing. No discard dialog for this: the schedule itself now
survives, and a dialog would defeat the point of the feature.

---

## The header dropdown

`Header.tsx` renders `title` as a plain `<h1>`. Add an optional
`onTitleClick?: () => void`. When present, the `<h1>` holds a
`<button type="button" aria-haspopup="dialog">` wrapping the text plus
`ChevronDownIcon` (already exported, `icons.tsx:469`), sized in `em` so it tracks
the clamped title. The whole name is the tap target. `App.tsx:896-903` passes it
only when `step !== 'roster'`, so the Players tab keeps the plain app title and
its own My Groups panel.

**Change Groups panel:** reuse `GroupPicker` (`components/roster/GroupPicker.tsx`)
rather than building a twin. Add an optional `heading` prop defaulting to
`'My Groups'`; App passes `'Change Groups'`. Render it from `App.tsx` behind new
`showGroupPicker` state, with `rosters`, `allPlayers`, `activeRosterId`,
`onSelect={switchGroup}`.

The Players tab's own picker now calls the same `switchGroup`, so the destructive
dialog is gone from every route.

---

## The three small changes

**Unlink All** — `SetupPage.tsx:181-194`. Turn the Partners header `<div>` into
the same `flex justify-between items-center` row `PlayerSelector.tsx:22-41` uses,
h3 left, link button right, the `<p>` below it full width. Style it on the teal
Select All (`text-sm text-brand-teal hover:text-brand-teal-dark font-medium`).
No confirmation. New prop `onClearPartnerships`, and a `useCallback` in `App.tsx`
beside `removePartnership` (line 301) doing `setPartnerships([])` — correct
without filtering, because the effect at `App.tsx:277-283` already prunes any
partnership whose members are not both selected, so the store never holds a pair
the panel is not showing. Both players drop back into the Select Players grid
still selected.

**Roster title** — `RosterPage.tsx:438`, one line:
`{activeRoster?.name ?? 'Player Roster'} ({players.length})` becomes
`{activeRoster ? `${activeRoster.name} Members` : 'Player Roster'} ({players.length})`.
No test asserts this string.

**M/F beside the rating** — move `ml-auto` off the rating span and onto the gender
span, in both `PlayerSelector.tsx:61-64` and `PartnerPairing.tsx:76-80`. The name
then takes the left, and gender and rating sit together on the right with the
container's existing `gap-2` between them.

---

## Verification

Tests are `vitest`, driven headlessly against the real mounted `App` by visible
text and `aria-label` (`src/App.walkthrough.test.ts`). No React Testing Library,
no snapshots. Remember tests are excluded from `tsconfig`, so a green `tsc` proves
nothing about them.

New coverage, each assertion proved by deliberately breaking it once and watching
the suite go red:

1. **The round trip.** Two groups. In A: select players, link a couple, set 4
   courts, generate. Switch to B from the header chevron, land on Players, select
   a different crowd, set 2 courts. Switch back to A: the schedule is still there,
   the tab is Schedule, the couple is still linked, courts read 4. Switch to B
   again: 2 courts, no schedule, still on Setup.
2. **Scores survive.** Write a score in A, switch away and back, the score is
   still on the court.
3. **The dialog is gone.** Switching with a schedule in progress raises no
   "Switch groups?" prompt, from either the header or the Players tab.
4. **A never-visited group inherits.** Switch to a group with no record and the
   current courts and round types carry over rather than resetting to 3 and 8.
5. **Delete drops the record.** Delete a group with a parked session, recreate a
   group, and it starts clean.
6. **Unlink All.** Two couples linked, one tap, the Partners panel is gone and all
   four are back in the grid still ticked.
7. **Roster title.** `Test Group Members (4)`.
8. **M/F.** The gender span in a Select Players row carries `ml-auto` and the
   rating span does not.

Then check the existing suite. `App.walkthrough.test.ts` has three `remount()`
calls (lines 356, 393, 2563), all from the Players tab, so persisting `step` should
not disturb them; line 2567's `clickButton(/^Test Group$/)` matches the Players
tab picker trigger on a step where the header carries no chevron, so no collision.
`ManageRostersModal.test.ts:122` and `GroupPicker.test.ts:176` assert group counts
and are untouched.

Finally drive the real app in a browser (playwright-core in the scratchpad against
the chromium on disk) for the one thing tests cannot show: that the chevron reads
as tappable in the banner at phone width, and that a three-line group name still
sits inside the header with the chevron after it.

Run `npm run lint -- src`, `npx tsc --noEmit`, and the full suite. Stop at the
commit.
