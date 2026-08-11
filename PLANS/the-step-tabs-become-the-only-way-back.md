# The step tabs become the only way back

## Context

A previous session made the three step tabs clickable, so "1. Players" and
"2. Setup" are doors once they have been reached. That left the app with two
routes out of a schedule: the tab at the top and a back button at the foot of
the page. The buttons are now redundant furniture, and the confirmations they
raise say two different things about the same loss.

This change does four things Jeff asked for:

1. The Setup confirmation reads **"Back to Setup?"** with a fuller warning.
2. The Players tab stops borrowing the New Session words and gets its own
   **"Back to Players?"** confirmation, with the same warning.
3. The `← Players` button goes from the Setup page.
4. The `← Setup` button goes from the Schedule page.

Plus three decisions taken with Jeff:

- The **New Session** button stays and keeps its own heading, but inherits the
  fuller warning. Today it says only "This clears the current schedule", which
  undersells the loss wherever it appears.
- The Players confirmation's buttons become **Keep Schedule** / **Go to
  Players**, mirroring the Setup one.
- The Schedule page's top row becomes **right-aligned**, so New Session does
  not jump to the left edge when Reshuffle drops out.

Reachability is safe: `availableSteps` (`src/App.tsx:572-574`) always offers
Players from Setup, and `setupSeen` starts `schedule !== null`
(`src/App.tsx:96`), so a reload straight onto a saved schedule still has a live
Setup tab. Removing the buttons cannot strand anyone.

---

## The words

One sentence, used by all three dialogs:

> This will discard the current schedule including any swaps you've made and
> rounds you've marked complete.

| Raised from | Heading | Cancel | Confirm |
|---|---|---|---|
| "2. Setup" tab | Back to Setup? | Keep Schedule | Go to Setup |
| "1. Players" tab | Back to Players? | Keep Schedule | Go to Players |
| New Session button | Start a new session? | Cancel | Yes, Start New |

---

## 1. One dialog, three doors

`src/components/schedule/BackToSetupDialog.tsx` and
`src/components/schedule/NewSessionDialog.tsx` each existed to hold words shared
by two call sites. After this change every heading is used exactly once, so two
one-use wrappers are ceremony.

**Delete both.** Add `src/components/schedule/DiscardScheduleDialog.tsx`, built
from the markup already in `BackToSetupDialog.tsx` (same overlay, same card, same
`flex-1` button pair — grey cancel, red confirm):

```tsx
interface Props {
  heading: string;
  cancelLabel: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}
```

The warning sentence lives inside the component and is not a prop. That is the
point: the heading names the door, but no route out of a schedule can quietly
undersell what it costs.

Three call sites pass the row from the table above:

- `src/App.tsx:744-752` — `pendingLeave === 'setup'`
- `src/App.tsx:754-762` — `pendingLeave === 'roster'`
- `src/components/schedule/SchedulePage.tsx:507-515` — New Session

Update the imports at `src/App.tsx:46-47` and `SchedulePage.tsx:11-12`.

## 2. Remove `← Players` from Setup

`src/components/setup/SetupPage.tsx:144-152`. Delete the stale comment, the bare
wrapper `<div>` and the button together — leaving the wrapper behind would keep
one `space-y-6` gap above the "Setup Round Robin" card.

`onBack` then has no use: drop it from `Props` (`:29`), from the destructure
(`:49`), and drop `onBack={() => setStep('roster')}` at `src/App.tsx:710`.

## 3. Remove `← Setup` from Schedule

In `src/components/schedule/SchedulePage.tsx`:

- Delete the button at `:381-386`.
- Change the row at `:380` from `justify-between` to `justify-end`. Reshuffle and
  New Session then sit together at the right, matching the second Reshuffle in
  its `flex justify-end` wrapper at `:456-466`, and New Session holds its
  position when `allComplete` removes Reshuffle.
- Rewrite the comments at `:375-379`, which name three buttons and describe them
  sitting "at the edges".
- Delete `handleSetupClick` (`:334-337`), `handleBack` (`:318-323`), the
  `confirmingSetup` state (`:126`) and its dialog render (`:503-505`).
- Drop the `onBack` prop (`:56`, `:108`) and `onBack={() => setStep('setup')}` at
  `src/App.tsx:726`.

**Keep** `hasUnsavedWork` (`:328-332`) and its effect (`:341-343`) — the tabs
read it through `onUnsavedWorkChange`.

`handleBack` also did `setLocks({})` and `setBrokenPairs({})`. Nothing is lost:
both are local `useState` in SchedulePage and die when it unmounts on the step
change, which is exactly what the tab path has always relied on (see the comment
at `src/App.tsx:741-743`). Confirm `setLocks` and `setBrokenPairs` still have
other callers before deleting, or `tsc` will flag them as unused.

## 4. Comments that go stale

- `src/App.tsx:576-579` — "A tab is the same door as the button at the foot of
  the page". There is no such button now; the tab is the only door.
- `src/App.tsx:741-743` — "rather than by the button below it".
- `src/App.tsx:592-593` — still true, New Session stays. Leave it.
- `launch-checklist.md` item 15f (~`:839-847`) describes tab and button asking
  the same question. Update to match.

---

## Tests

`src/App.walkthrough.test.ts`:

- **Delete `describe('the Setup confirmation')` (`:582-607`)** — it drives
  `clickButton(/^← Setup$/)`, which no longer exists. No coverage is lost:
  `describe('the step tabs')` already covers straight-through (`:648-654`) and
  the warned path (`:664-679`) through the tab.
- Retarget the strings in `describe('the step tabs')`:
  - `'Go back to Setup?'` → `'Back to Setup?'` (`:653`, `:670`)
  - `'Start a new session?'` → `'Back to Players?'` (`:658`, `:687`)
  - `clickButton(/^Cancel$/)` → `/^Keep Schedule$/` (`:689`)
  - `clickButton(/^Yes, Start New$/)` → `/^Go to Players$/` (`:695`)
  - `:700-706` (the New Session button) keeps `'Start a new session?'`; add an
    assertion that its body now carries the fuller warning, so the two headings
    cannot drift back to two different warnings.
- **Add two assertions pinning the removals**, since nothing else would catch a
  button coming back: no `← Players` on Setup, no `← Setup` on Schedule.

`src/components/schedule/SwapHint.test.ts:71` and
`src/components/schedule/CourtNumber.test.ts:71`, `:248` pass `onBack: () => {}`
to `SchedulePage`. Drop those lines. (Tests are not typechecked, so `tsc` will
not find these — they must be found by hand.)

---

## Verification

1. `npx tsc --noEmit` — the real check on the two dropped `onBack` props and on
   any now-unused state setter.
2. `npm test` — whole suite, not just the walkthrough.
3. `npm run lint src` — src only.
4. **Prove the new guards by breaking them.** One deliberate sabotage per new
   assertion, each turning the suite red on its own: put `← Setup` back and see
   the removal test fail; change the New Session body back to "This clears the
   current schedule." and see the shared-warning assertion fail.
5. **Drive it in a real browser** (playwright-core in the scratchpad, pointed at
   the chromium already on disk), at 390px:
   - Setup page: no `← Players`, page opens on the "Setup Round Robin" card with
     no gap where the button was.
   - Generate, mark a round complete, tap "2. Setup" → screenshot "Back to
     Setup?" and read the sentence. Keep Schedule returns with the round still
     complete.
   - Tap "1. Players" → screenshot "Back to Players?" with Keep Schedule / Go to
     Players.
   - Schedule top row with rounds outstanding, then with every round marked
     complete: New Session must not move.
   - Tap New Session → "Start a new session?" with the fuller warning.
6. Before any deploy, bump `APP_VERSION` in the same commit.
