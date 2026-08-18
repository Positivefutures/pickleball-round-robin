# One door into the schedule

## Context

Moving between Setup and Schedule has grown three answers to the same question. The
Schedule tab is sometimes a door and sometimes not, depending on a basis key the host
cannot see. Generate sometimes asks before it rebuilds. Set Round Types asks its own
question about rebuilding. A host has to learn all three to know what a tap will cost.

Jeff's rule, 2026-08-18: **Generate Schedule is the only way onto the Schedule tab.**
Everything else follows from that. While the host is anywhere else the Schedule tab is
drawn shut and a press points at the button instead. Leaving an untouched schedule costs
nothing and parks it. Leaving one they have worked on asks once, plainly, and discards it
on a yes. With the question asked at the door, no warning on Setup is needed any more:
Setup is where a session is built, and a session under way is not built from there.

Decisions Jeff made while planning:

- **Discard on confirm.** Confirming the dialog clears the session there and then, so
  Generate never has to ask a second question.
- **Players behaves like Setup.** Same question, worded for the door they tapped.
- **Keep today's press.** The shut Schedule tab still answers a press by going to Setup
  and bouncing "Tap Generate Schedule". It looks dead, it is not silent.
- **Altered means any host edit**: scores, swaps, padlocks, rounds ticked, players added
  or removed or subbed, courts, added rounds, reshuffles. Not a running timer.
- **Mid-session round types go.** Round types are set before Generate, like courts and
  rounds. The code that rebuilds only the unplayed rounds stays and still runs for an
  untouched schedule.

## The rules, in one place

| Where | Schedule tab | A press on it |
|---|---|---|
| Players or Setup, ever been to Setup | flat, not a card | go to Setup, bounce the bubble |
| Players, never been to Setup | flat, dead | nothing |
| Schedule | the live tab | — |

| Leaving the Schedule tab | What happens |
|---|---|
| nothing touched | park it, go, no question |
| anything touched | "Abandon This Schedule?" → Cancel stays, confirm discards and goes |

| Generate on Setup | What happens |
|---|---|
| parked schedule still matches the setup | go back to it, rebuild nothing |
| anything in the setup moved, or nothing parked | build a new one |

## The work

### 1. `src/App.tsx` — the tab rules

- `availableSteps` (1373-1376): delete the `schedule` arm. Schedule is never a door.
- `answeringSteps` (1383-1384): `step !== 'schedule' && setupSeen ? ['schedule'] : []`.
  Gate on `setupSeen`, not on a schedule existing — "tap Generate" is the true answer
  whether or not one has been built, and a tab that flips between dead and pressable on
  invisible state is worse than one that always answers. Before Setup has been seen it
  stays dead, so it cannot jump the Continue to Setup gate.
- `handleStepNav` (1392-1411): three branches.
  - target is `schedule` → `if (step !== 'setup') setStep('setup')`, then
    `setPromptGenerate(true)`. Note this must run even when target === step is false but
    the host is already on Setup: the bubble is the whole point of the press.
  - leaving `schedule` with `scheduleAltered` → `setPendingLeave(target)` and stop.
  - otherwise → `setStep(target)`.

### 2. `src/App.tsx` — Generate returns or rebuilds

Rename `requestGenerate` (753-759) to `handleGeneratePress`; SetupPage's `onGenerate`
already points at it. `handleGenerate` (648-689) stays the build path, untouched.

```ts
// The basis this press would build from: the open list's draft included, because
// handleGenerate builds from `planDraft ?? roundPlan` for the same reason.
const pressBasis = basisKey({ ...liveBasis, roundPlan: planDraft ?? roundPlan });
const parkedIsCurrent = !!schedule && scheduleBasis !== null && scheduleBasis === pressBasis;
```

On the return path: `setStep('schedule')` and — this one is easy to miss and hangs the
tour — `if (tour?.id === 'select-players') nextCard()`. Nothing else. Specifically **not**
`setSchedule`, `setCompletedRounds([])`, `setRemovedIds([])`, `setSubPartnerships([])`,
`setScheduleEdited(false)`, `clearRoundTimerForNewSchedule()` (a clock may be running on a
live round) or `setSessionId(generateId())` (a live share is keyed on it). Do not commit
`planDraft` either; the walk-off effect at 981-985 already does that.

### 3. The Abandon dialog

State: `const [pendingLeave, setPendingLeave] = useState<Step | null>(null)` — one piece,
which is also where the destination is remembered.

Confirm calls `clearSession(true)` (App 539 → `groupSessions.clearSession`, which already
clears schedule, completedRounds, removedIds, guests, subPartnerships, scheduleEdited,
scheduleBasis, the round timer, scheduleRosterId and sessionId, and keeps the ticked
players and their partners), then `setStep(pendingLeave)`. Cancel clears the state and
touches nothing else.

Rendered in the slot the Replace dialog vacates (1642-1656), reusing
`DiscardScheduleDialog`:

```tsx
heading="Abandon This Schedule?"
body={<>Returning to <strong className="font-bold">{stepName(pendingLeave)}</strong> discards
  the session including any entered scores.</>}
cancelLabel="Cancel"
confirmLabel={`Return to ${stepName(pendingLeave)}`}
confirmIcon={pendingLeave === 'roster' ? StepPlayersIcon : StepSetupIcon}
```

- `DiscardScheduleDialog.tsx`: widen `body` from `string` to `ReactNode` (line 15) and
  make it required, dropping the `DISCARD_WARNING` default. Delete the `tone` prop and its
  teal branch (20-25, 46, 61) — this becomes the only caller and it is red.
- `src/lib/steps.ts`: add `stepName()` returning `Players` / `Setup` / `Schedule`; the
  `STEPS` labels carry "1. " prefixes and are wrong in a sentence. Delete `stepLabel`,
  which has no callers.
- The confirm tile wears the destination's own glyph, so the button and the tab it lands
  on are the same shape.

### 4. Padlocks count as work

Padlocks and couples broken for one round are `SchedulePage` state (239, `handleToggleLock`
456) and die with the page. Report them up, do not write them to the `scheduleEdited`
store: that store is persisted, parked per group and synced, and a padlock written there
would outlive the padlock.

- `SchedulePage`: one optional prop `onLocksChange?: (any: boolean) => void`, called from
  an effect on `[locks, brokenPairs]` with whether either holds anything. A boolean rather
  than a fire-once callback, so locking and unlocking again leaves nothing behind.
- `App`: `const [liveLocks, setLiveLocks] = useState(false)`, reset by an effect on
  `[step, activeRosterId]` — the roster id matters because two groups can both be parked
  on the Schedule tab, and one group's padlocks must not count as the other's.

Then, replacing `workAtStake` (741):

```ts
const scheduleAltered = !!schedule && (scheduleEdited || completedRounds.length > 0 || liveLocks);
```

### 5. `scheduleEdited` sites

- `handleReshuffle` (914): `setScheduleEdited(true)` rather than `removedIds.length > 0`.
- `handleAddRound` (1205-1226): add `setScheduleEdited(true)`.
- `handlePlanCommit` (966): delete the line. It runs while the host is on **Setup**, and
  under the new rules a Setup edit must never mark the schedule dirty. Its reset arm is
  the one line that could clear a genuine mark.

### 6. Deletions

`App.tsx`: `pendingGenerate` (145) and the Replace dialog (1642-1656); `workAtStake` (741)
and the prop at 1591; the `EditPageIcon` import if nothing else uses it.

`SetupPage.tsx`: the `workAtStake` prop (53, 85), `confirmPlanning` (102), the warning
branch in `togglePlanner` (109-113), the dialog (327-344), and the imports that fall out
(`DiscardScheduleDialog`, `PLAN_REBUILD_WARNING`, `CheckIcon`).

`steps.ts`: `PLAN_REBUILD_WARNING`, `DISCARD_WARNING`, `stepLabel`.

Staying, with their comments rewritten to say why: `StepIndicator`'s `answering` prop and
its argument for not marking the tab `disabled` (now permanent rather than conditional);
`promptGenerate` and `GeneratePrompt`; the whole basis machinery, which stops feeding the
tab and starts feeding return-versus-rebuild; New Round Robin's own confirm and the
Reshuffle warning, both untouched.

### 7. Migration, considered and dropped

A host upgrading mid-afternoon can be parked on Setup with a live schedule behind them —
`pb-step === 'setup'`, scores in `pb-schedule`. A mount-only effect that moved them to the
Schedule tab was written and then taken out again: it protects one narrow case, it yanks
the tab under anybody who reaches that state legitimately (delete a player from Players,
walk to Setup, close the app), and it makes the mid-session round types tests unreachable.

What happens instead is safe enough. On the first launch nothing has changed, so Generate
hands the parked schedule straight back, scores and all. The afternoon is only lost if the
host then changes a setting and presses Generate — which is a deliberate ask for a
different schedule.

## Known and accepted

- A running round timer is not "altered". A host who starts a clock, enters nothing, walks
  to Setup and changes the courts will lose it to the rebuild without being asked. Jeff's
  call; worth revisiting if it bites.
- Abandoning a live-shared session tears the share down for every watching phone, exactly
  as New Round Robin already does. The dialog does not mention it.
- Guests added mid-session go with the discard, like every other part of the afternoon.

## Verification

1. `npx tsc -b`, `npx eslint src`, `npx vitest run` — all green.
2. Sabotage each new guard once, per the house rule: put the Schedule tab back in
   `availableSteps`, drop `liveLocks` from `scheduleAltered`, make the return path call
   `handleGenerate`. Each must turn the suite red.
3. Tests rewritten, all in `src/App.walkthrough.test.ts` — two new helpers carry it:
   `leaveSchedule(tab)` walks out and answers the dialog if it appears, and `parkOnSetup()`
   / `parkOnPlayers()` relaunch onto a tab that can no longer be walked to with an
   afternoon in play. The blocks touched: `describe('the step tabs')`
   (2172-2568), the round-types warning block (1708-1795, deleted with the confirm), the
   two Set Round Types tests that assert the tab stays open (1869-1930), the five Players
   tab tests that click through to the schedule (2394-2479), and `openPlanner()` (1192).
   Roughly twenty other tests reach Setup with a schedule in play; decide up front whether
   they seed `pb-step` directly or drop the edit that now blocks the door.
4. New tests worth having: the tab is flat and pressable from Setup and navigates nowhere;
   an unaltered leave asks nothing and Generate hands back the same rounds, session id and
   timer; a real Setup change rebuilds with a new session id and no ticks; the dialog's
   heading, bold destination and both button labels; Cancel changes nothing; confirm clears
   the session but keeps the ticked players; a padlock alone is enough to be asked and
   unlocking it again is enough not to be; Add Round and Reshuffle both count; the tour's
   Back from the congrats card asks nothing and its next Generate lands on the same
   schedule; a relaunch parked on Setup returns the schedule rather than rebuilding.
5. On the phone, over the LAN server already running on port 4180: generate, tap Setup,
   confirm the tab is flat and a press bounces the bubble, press Generate and confirm the
   same schedule comes back; then enter a score, tap Setup, read the dialog, cancel, tap
   Players, confirm, and check the session is gone and the ticked players are not.
