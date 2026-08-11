# Clickable step tabs

## Context

The three tabs at the top of every page — "1. Players", "2. Setup", "3. Schedule" — are
decoration. `StepIndicator.tsx` renders plain `<div>`s with no click handler, so the only way
between steps is the button at the foot of each page: Continue to Setup, Generate Schedule,
← Setup, New Session.

Jeff wants the tabs to become the shortcut a host expects them to be, without turning them into
a way to skip work or lose a session in progress. So a tab is only a door once the host has
already been through it, and going back through it asks exactly the question the buttons ask
today.

Three looks, not two:

| Look | Meaning | Clickable |
|---|---|---|
| **Current** — white card, green border, green underline | the step you are on | no |
| **Ready** — near-white card, grey border, no underline | a step you have been through | yes |
| **Locked** — flat, no border (today's inactive look, unchanged) | not reached yet | no |

Rules, decided with Jeff:

- **Schedule is never a door.** The only way onto it is the Generate Schedule button.
- **Setup opens the first time the host reaches it and stays open** for the rest of the visit, so
  a trip back to Players is never a dead end. It shows the locked look again only on a fresh load
  with no schedule.
- **From the schedule, a tab is the same door as the button below it.** Setup shows the "Go back
  to Setup?" dialog; Players shows the "Start a new session?" panel — the same copy, the same
  outcome.
- **With nothing to lose, neither tab asks.** No completed rounds, no swaps, no locks: the tab
  goes straight through. Players still clears the schedule, exactly as confirming New Session
  does, so reopening the app later lands where the host left off.
- **The New Session button is untouched.** It still always asks.

---

## The changes

### 1. `src/components/layout/StepIndicator.tsx` — three looks, one clickable

Props become:

```ts
interface Props {
  current: Step;
  /** Steps the host can jump to from here. Never includes `current`. */
  available: Step[];
  onNavigate: (step: Step) => void;
}
```

- Each tab becomes a single `<button type="button">`, `disabled` unless it is in `available`.
  That covers both non-interactive looks (current and locked) with one element and one class
  expression. Add `aria-current="step"` to the current tab, which the nav lacks today.
- Two new colour constants beside the existing ones (all sampled to sit between the `TRACK`
  `#f4f5f7` and the active card's white):

  ```ts
  const READY_BORDER = '#d3d7de'; // the active card's border with the colour drained out
  const READY_BG = '#fbfbfc';     // lighter than the track, short of the active card's white
  ```

- Ready styling = `READY_BG` background + `1px solid READY_BORDER`, keeping `IDLE_TEXT` /
  `IDLE_ICON` and **no** `shadow-sm` and **no** underline bar, so the current tab still reads as
  the raised one.
- Fix the hairline rule while there: today `divider` hides either side of the active card only.
  A ready tab is also a card, so a hairline would run into it. New rule — a divider appears only
  between two flat neighbours:

  ```ts
  const carded = (s: Step) => s === current || available.includes(s);
  const divider = i > 0 && !carded(step.key) && !carded(steps[i - 1].key);
  ```

The base class string, the icons, the layout and `no-print` are all unchanged.

### 2. `src/App.tsx` — which tabs are open, and what a tab click does

```tsx
// Setup opens the first time the host reaches it and stays open, so a trip back
// to Players is never a dead end. Schedule never opens: the only way onto it is
// Generate, which builds a new one.
const [setupSeen, setSetupSeen] = useState(step !== 'roster');
useEffect(() => {
  if (step !== 'roster') setSetupSeen(true);
}, [step]);

const availableSteps: Step[] = [];
if (step !== 'roster') availableSteps.push('roster');
if (step !== 'setup' && setupSeen) availableSteps.push('setup');
```

`setupSeen` initialises from `step`, which is already `'schedule'` when a stored schedule is
picked up on boot ([App.tsx:90](src/App.tsx#L90)), so a refresh mid-session keeps both doors open.

Navigation:

```tsx
const [pendingLeave, setPendingLeave] = useState<'setup' | 'roster' | null>(null);

// A tab is the same door as the button at the foot of the page, so it asks the
// same question. Off the schedule there is nothing to lose and nothing to ask.
const handleStepNav = useCallback((target: Step) => {
  if (step !== 'schedule') {
    setStep(target);
    return;
  }
  if (target === 'schedule') return;
  if (scheduleHasWork) {
    setPendingLeave(target);
    return;
  }
  if (target === 'setup') setStep('setup');
  else handleStartNewSession();
}, [step, scheduleHasWork, handleStartNewSession]);
```

Off the schedule this is plain navigation and matches what already exists: roster → setup is
[`onContinue`](src/App.tsx#L637), setup → roster is [`onBack`](src/App.tsx#L660).

Render: `<StepIndicator current={step} available={availableSteps} onNavigate={handleStepNav} />`
at [App.tsx:620](src/App.tsx#L620), plus the two dialogs (below) next to the existing
`pendingRosterSwitch` one.

### 3. The two dialogs, moved so both callers share the copy

The Setup and New Session dialogs are inline JSX in
[SchedulePage.tsx:485-539](src/components/schedule/SchedulePage.tsx#L485-L539). The tabs must show
the same words, so extract them verbatim into two components, following the shape of the three
that are already extracted ([RemovePlayerDialog.tsx](src/components/schedule/RemovePlayerDialog.tsx),
`AddPlayerDialog`, `CourtNumberDialog`) — same shell, `{ onConfirm, onCancel }` props:

- `src/components/schedule/BackToSetupDialog.tsx` — "Go back to Setup?" / Keep Schedule / Go to Setup
- `src/components/schedule/NewSessionDialog.tsx` — "Start a new session?" / Cancel / Yes, Start New

SchedulePage renders them for its own buttons (behaviour unchanged); App renders them for
`pendingLeave`. Not one word of copy changes.

### 4. `src/components/schedule/SchedulePage.tsx` — report what is at stake

`hasUnsavedWork` ([SchedulePage.tsx:313](src/components/schedule/SchedulePage.tsx#L313)) is
computed here because `locks` and `brokenPairs` are local to this page. The tabs sit above the
page, so App has to be told:

```tsx
// The step tabs above this page open the same two doors as the buttons below,
// and only this page knows whether there is anything to lose.
useEffect(() => {
  onUnsavedWorkChange(hasUnsavedWork);
}, [hasUnsavedWork, onUnsavedWorkChange]);
```

New prop `onUnsavedWorkChange: (atStake: boolean) => void`, wired as
`onUnsavedWorkChange={setScheduleHasWork}` — the setter is stable, so the effect only fires when
the answer flips. App reads the value only while this page is mounted, and a remount re-reports
before anything can be clicked.

`locks` and `brokenPairs` do not need clearing when App drives the step change: SchedulePage
unmounts and takes them with it, which is what `handleBack` was doing by hand.

Everything else on this page stays: both buttons, both pieces of confirm state, `handleSetupClick`
and its skip-when-clean rule.

---

## Tests — `src/App.walkthrough.test.ts`

**First, a collision to fix.** The tabs become real `<button>`s above the page content, and
`text(b)` for the middle one is `"2. Setup"`. Three existing calls use `/Setup$/`
([lines 559, 564, 571](src/App.walkthrough.test.ts#L559-L571)) and would silently start clicking
the tab instead of the ← Setup button — passing, while testing nothing they were written to test.
Anchor them to `/^← Setup$/` (happy-dom renders `&larr;` as `←`).

Then a new `describe('the step tabs')` with a helper that scopes to the nav:

```ts
function tab(label: RegExp): HTMLButtonElement { /* nav button whose text matches */ }
```

Covering:

1. Fresh roster — Setup and Schedule tabs are `disabled`; Players carries `aria-current="step"`.
2. After Continue to Setup — Players tab enabled, Schedule tab still disabled.
3. Players tab from Setup lands on the roster, and the Setup tab is then enabled and leads
   forward again.
4. After Generate — Players and Setup both enabled, Schedule disabled.
5. Clean schedule, Setup tab — straight through, no dialog.
6. Clean schedule, Players tab — straight through, no dialog, and `storedSchedule()` is `null`.
7. Work to lose (`markComplete(1)`), Setup tab — "Go back to Setup?"; Keep Schedule preserves
   `completedRounds()`; Go to Setup navigates.
8. Work to lose, Players tab — "Start a new session?"; Cancel keeps the schedule; Yes, Start New
   clears it and lands on the roster.
9. New Session button on a clean schedule still asks (the behaviour deliberately left alone).

Assert on the `disabled` property rather than on a click doing nothing, so the test says what it
means. Note that `*.test.ts` is excluded from `tsconfig`, so these are not typechecked.

---

## Verification

1. `npx vitest run` — whole suite green.
2. **Prove each new guard by breaking it.** One deliberate sabotage at a time, each must turn the
   suite red: put `'schedule'` into `availableSteps`; drop the `scheduleHasWork` branch from
   `handleStepNav`; make the Players tab call `setStep('roster')` instead of
   `handleStartNewSession`; make `setupSeen` always `false`.
3. `npx tsc -b --noEmit` and `npx eslint src`.
4. **Look at it.** Render the three tab states to static HTML and screenshot at phone width to
   check the ready look sits between the track and the current card — grey border readable, the
   background clearly lighter than the track and clearly not the current tab's white.
5. **Drive it.** playwright-core from the scratchpad against `npm run dev`: Continue to Setup →
   Players tab → Setup tab → Generate → tick Round 1 → Setup tab (dialog) → Keep Schedule →
   Players tab (panel) → Cancel → clear the tick → Players tab (straight through, schedule gone).
6. Bump `APP_VERSION` in the deploying commit.
