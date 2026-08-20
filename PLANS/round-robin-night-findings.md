# Seven findings from the 19 Aug round robin

## Context

Jeff ran a live session on 19 Aug 2026 as a watcher, not the host, with set
partners on for every player all night. Seven things came back: five defects,
one gap, one default that should change. Source: `INBOX/New-Requirements.md`.

Three findings from reading the code change the brief before any of it is
written:

1. **The Close button is not a stacking bug.** There is no flashing overlay —
   the strobe is a `backgroundColor` swap on the sheet itself
   (`TimerSheet.tsx:86-99`). Close is a deliberate no-op while alarming:
   `RoundTimerPanel.tsx:46` recomputes `visible = manuallyOpen || phase ===
   'alarming'`, so the sheet snaps straight back open. It is documented as
   intentional in two places. The fix is to change that decision, not to fix a
   z-index.
2. **The wake lock already exists and already works.** `useWakeLock`
   (`src/hooks/useWakeLock.ts`) has the `visibilitychange` re-acquire and the
   quiet failure. The host holds it (`RoundTimerPanel.tsx:53`). The watcher's
   page holds nothing. That is the whole of item 4.
3. **Set partners is confirmed as the cause of the court stickiness, and the
   mechanism is exact.** A fully paired roster short-circuits at
   `pairing.ts:175-194` into `partnerPlay`, which never calls the scorer at all.
   `partnerPlayTeams` sorts teams by `partnerKey` for determinism, `fixtureList`
   is the circle method, `nextMatches` reads fixtures in list order, and
   `matchesToCourts` maps `matches[i]` to court `i+1`. The same pair lands in
   the same fixture slot and therefore on the same court, every round, by
   construction. Ordinary sessions are milder but not clean: the random sampler
   shuffles, the greedy sampler seeds courts in a stable order, and **no term in
   the cost function has ever looked at a court number.**

Also settled: "2. Setup" is the shortest of the three tab labels and all three
tabs are equal width, so if Setup wrapped, all three wrapped. That needs an
effective width near 300px, which no current iPhone has at default settings.
Per Jeff, design for 320px **and** for Safari page zoom, which shrinks the CSS
viewport. A `rem`-based size cannot win that; the label must be sized from its
container.

---

## 1. Step tabs must never wrap

**File:** `src/components/layout/StepIndicator.tsx:62-124`

Today: `text-[1.0125rem]` absolute, no `whitespace-nowrap`, no breakpoints, a
`w-5 h-5` icon plus `gap-1` eating 24px of every tab. The comment at `:94-100`
deliberately chose wrapping over overflow. Keep that intent, remove the need.

- `container-type: inline-size` on the `nav`, so everything below is measured
  against real available width and page zoom is handled for free.
- `whitespace-nowrap` on the label, plus `overflow-hidden` on the `nav` as the
  backstop that honours the original comment: it can never push the page wider.
- Size the label with `clamp(<floor>, <n>cqi, 1.0125rem)` so it holds today's
  size wherever it fits and shrinks only when it must.
- Drop the icon below a container-width threshold (`@container` query). It is
  24px per tab, the single biggest lever, and the labels are what navigate.
- Trim the button's `px-0.5` and keep the `w-px` divider `shrink-0`.

**Do not guess the constants.** Measure the rendered label widths at 320 / 360 /
375 / 390 first (see Verification) and set the floor, the `cqi` coefficient and
the icon threshold from real numbers. Rough budget at 320px: ~68px per label
with the icon, ~92px without; "3. Schedule" wants ~87px. So the icon is the
thing that has to go at the bottom of the range, and the type barely moves.

---

## 2. Names on the schedule wrap, never truncate

**File:** `src/components/schedule/CourtMatchup.tsx`

Jeff's choice: keep the two teams side by side, reclaim space first, then wrap.

Reclaim, in descending order of what it buys per column:

| Change | Where | Per column |
|---|---|---|
| Tighten the `Vs.` gutter: `gap-2` either side → `gap-1`, and let the `Vs.` sit over the gutter rather than in it | `:522`, `:548` | ~13px |
| Seat padding `px-3` → `px-2` on phone | `:175` | ~8px |
| Card `p-4` → `p-3` on phone | `:456` | ~4px |
| Rating `pl-2` → `pl-1` | `:199` | ~4px |
| Round card `px-[0.6rem]` → `px-2` on phone | `RoundCard.tsx:158` | ~2px |

Then the guarantee: swap `truncate` for `break-words` on the name span at
`:191`, keeping `min-w-0` and the `title`.

**The alignment problem the `truncate` comment warns about is real and must be
fixed in the same change.** The comment at `:187-190` says a wrapped name "used
to make its court taller than the one beside it". With `items-start` on the team
row, a wrap in team 1 pushes that column out of step with team 2. Fix by making
the two seat rows share a height: `TeamColumn`'s root
(`:337`) becomes `grid grid-rows-2` instead of `flex flex-col`, and the team row
(`:522`) becomes `items-stretch`. Both columns then produce identical row
boundaries whether or not anything wrapped. Every court always draws four
places, so both columns always have exactly two rows.

**Blast radius:** the seat markup is not shared, but `LiveCourt.tsx:97-102` is a
near-identical copy with the same `truncate`. Apply the same change there — a
watcher reading two Vanessas has exactly the problem Jeff had. Leave
`PLAYER_NAME_TEXT` (`roundLook.ts:92`) alone; it is shared with four surfaces
and shrinking type is a lever Jeff did not pick.

**Expected outcome, stated honestly:** this takes the name budget at 320px from
~47px to ~78px. Single first names fit; "Vanessa M." still goes to two lines.
Nothing is ever cut, which is what was asked for.

---

## 3. Court variety, as a reordering pass

Chosen over a cost-function term because it cannot lose an argument against team
balance — it never changes who plays whom — so there is no weight to justify,
and because it fixes the set-partner path, which never reaches the scorer.

**New file:** `src/lib/courtRotation.ts`

**History.** Add `courtCounts: Record<string, Record<number, number>>` to
`PairingHistory` (`src/types/index.ts:102-150`), keyed **by array index, not by
`courtNumber`**. That is the correct answer to Jeff's "key off the underlying
court, not the label": `renumberFrom` and `carryCourtNumbers`
(`src/lib/courtNumbers.ts`) already treat position as the court's identity and
the number as a label the host may rewrite from any round forward. Fold it in
`updateHistory` (`pairing.ts:65-99`) with `courts.forEach((court, idx) => …)`,
which the replay loop at `pairing.ts:352-371` already drives — so it replays out
of the saved rounds with no new stored field, exactly like `shortGameCounts`.

**The pass.** `rotateCourts(courts, history, opts)` returns the same courts in a
new order with `courtNumber` restamped `i + 1`:

- Cost of putting a group at index `i` is the marginal increase in the sum of
  squares: `Σ over the group's players of (2 × courtCounts[p][i] + 1)`.
- Exhaustive over permutations when the number of full courts is ≤ 7 (5040 ×
  4 ≈ 20k operations, nothing); greedy plus a 2-opt swap repair above that,
  matching the idiom already in `buildFreshTeamCourts` (`assign.ts:397-472`).
- Ties keep the solver's original order, so round 1 is byte-identical to today.
- **The short court stays pinned last.** `planCourtSizes` puts the 3 or 2 there
  and `addCourtToRemaining` assumes it; short-game rotation is already handled
  by `shortGameCounts`.
- **Skipped entirely when `fullCourtLocks.length > 0`.** A padlock names a court
  by position and is the host overriding by hand.

**Two call sites in `src/lib/pairing.ts`,** both immediately before
`updateHistory`: the `partnerPlay` early return (`:190`, the reported bug) and
the end of `buildRound` (`:292`, after the short court is appended). Special
rounds arrive through the second one, since `combine()` has already renumbered.

**Known limit to record in the docblock:** `removeCourtFromRemaining`
(`courts.ts:162`) finds a court by number and does not renumber the survivors,
so indices shift for later rounds after a mid-session removal. `carryCourtNumbers`
already has this exact limit; this does not add a new one.

---

## 4. The watcher's screen stays awake

**File:** `src/components/live/LiveSessionPage.tsx`

One hook call. `useWakeLock(timerOpen && timer !== null && (timer.phase ===
'running' || sharedAlarming(timer)))`.

Scoped to "the timer screen is open **and** counting", which is Jeff's wording,
rather than the host's broader `visible || phase === 'running'`. A host who
started a timer asked for their own phone to stay lit; twenty watchers did not
all ask for thirteen minutes of screen-on. Worth revisiting if the alarm turns
out to be missed with the sheet closed — `useSharedAlarm` runs at page level and
a sleeping screen suspends its audio.

No new hook, no fallback. `useWakeLock` already swallows unsupported, denied and
battery-saver, and already re-acquires on `visibilitychange`. Screen Wake Lock
is supported in iOS Safari 16.4+ including standalone PWAs; confirm on the
device rather than in the changelog.

---

## 5. Close, while the alarm is firing

**Files:** `src/lib/roundTimer.ts`, `src/components/schedule/RoundTimerPanel.tsx`

New export beside `closeRoundTimerPanel` (`roundTimer.ts:95-97`):

```ts
export function dismissRoundTimer(): void {
  if (stores.roundTimer.get().phase === 'alarming') resetTimer();
  setPanelOpen(false);
}
```

Wire it as both the Close tile's `onClick` (`RoundTimerPanel.tsx:93`) and the
sheet's `onClose` (`:72`). That one substitution also fixes the scrim (which
carries `aria-label="Close Round Timer"`) and drag-to-dismiss, which are no-ops
in the alarm state for the same reason. Everything that says "close" then means
the same thing.

**Rewrite the two comments that document the old behaviour**, or the next
reader will trust them: `RoundTimerPanel.tsx:34-37` and `roundTimer.ts:89-94`.

**The other two buttons are fine** — Pause (`stopTimer`) leaves the alarm for
`paused`, Reset (`resetTimer`) returns to idle. Both already work in the alarm
state; the plan adds assertions pinning that, per Jeff's request to check them.

Side effect worth knowing: a host who dismisses this way publishes a null
`roundTimer`, so the countdown leaves every watcher's phone. That is already
what Reset does.

---

## 6. A timer that is always reachable from player view

**Files:** `src/components/live/LiveSessionPage.tsx`,
`src/components/live/LiveRoundTimer.tsx`,
`src/components/schedule/TimerSheet.tsx`, `src/lib/watchAlerts.ts`

**The chip goes on every round, mirroring the host exactly.**
`RoundTimerChip.tsx:34-46` is already the pattern: clock always, digits only on
the round holding the timer. Give `LiveTimerChip` the same `mine` test and drop
the `timer?.roundNumber === round.roundNumber` gate at
`LiveSessionPage.tsx:606-611`. This reuses a shape the app already has rather
than inventing a header button, and it answers "has it started?" the same way on
both phones: digits mean yes.

**The sheet opens with or without a timer.** Change the gate at `:731` from
`timerOpen && timer && alerts` to `timerOpen && alerts`, and let
`LiveRoundTimer` take `timer: SharedRoundTimer | null`.

- `TimerSheet` gains an optional `waiting?: ReactNode` that replaces the digits
  and TIME'S UP block (`:216-233`). One presentational component stays the one
  source for both phones.
- `roundNumber` becomes `number | null`; the heading reads "Round Timer" with no
  number until the host starts, "Round 3 Timer" after.
- The copy, verbatim from the brief: **"The host hasn't started the timer yet.
  The time will appear here when they do."**
- It switches to the countdown on its own because `snapshot.roundTimer` arrives
  on the next poll and the sheet is already mounted. No tap, no reload.

**Let the alert switches work while waiting.** `alertsFor`
(`watchAlerts.ts:54-67`) takes `SharedRoundTimer | null` and falls back to the
host's own defaults from `roundTimerState.ts` when there is no timer yet. Then
`alerts` is never null, `LiveSessionPage.tsx:534` simplifies, the
`useSharedAlarm` guard at `:537` drops its `alerts !== null` clause, and a
watcher can turn their sound off *before* the host starts rather than after the
alarm has already gone. Anything untouched keeps following the host, because
`mine.soundOn ?? timer.soundOn` still resolves that way once a timer lands.

**On the lag Jeff put out of scope:** most of it is now explained without
measuring. `PROBE_MS = 3_000` (`LiveSessionPage.tsx:55`) bounds it, and the host
publishes a timer change with zero debounce (`liveSession.ts:467-481`). So the
budget is 0–3s plus network. Leave it. If it still reads badly with the icon in
place, the targeted fix is a shorter probe while the timer sheet is open.

---

## 7. Share Live Session defaults

**Files:** `src/lib/stores.ts`, `src/lib/liveSession.ts`

Neither toggle is currently derived from Keep Score — it is only a render gate
(`LiveShareView.tsx:285`, `:317`). Both are real toggles, not forced values, so
that half of the check already passes.

- **Share Standings → off by default.** Flip `standingsShared`
  (`stores.ts:188`) from `true` to `false` and rewrite the docblock above it,
  which currently argues for `true`.
- **Both sticky.** Remove `forgetScoreEditing()` from `stopSharing()`
  (`liveSession.ts:688`) and `stopAllSharing()` (`:713`). **Keep it at `:852`**
  — signing in as somebody else is a different person, not the same host sharing
  again. The switch and its four-digit code travel together, so the code
  persists with it and a restarted share reuses it rather than sitting on with
  no code.
- **Leave `groupSessions` alone.** It already parks and restores the pair per
  group (`groupSessions.ts:123-124`, `:190-191`) and starts a never-opened group
  at off (`:249-250`), so each group still gets its own answer.

**Two consequences to state plainly, both accepted:**

1. `createStoredValue` never writes a default to storage (`store.ts:56-62`) and
   `migrations.ts` does not seed `pb-standings-shared`. So flipping the default
   turns standings sharing **off for every existing host who never touched the
   switch**. Hosts who deliberately turned it off are unaffected. This is the
   "on by choice" outcome Jeff asked for, arrived at silently.
2. Score editing now survives Stop and restart, so a host who allowed it once
   keeps allowing it — with the same code — until they turn it off. This
   reverses the reasoning recorded at `stores.ts:162-173`, which must be
   rewritten rather than left contradicting the code.

---

## Verification

**Layout (items 1 and 2), measured not eyeballed.** Render at 320 / 360 / 375 /
390 and screenshot each; `--window-size` does not set the viewport, so set it
properly. Read the rendered label and name widths out of the DOM
(`getBoundingClientRect`) to pick the tab constants, then assert visually:
no tab on two lines, no `…` on any name, both team columns in step when one name
wraps. Repeat with Safari page zoom simulated by a narrower viewport. Then check
on Jeff's actual small phone — the brief says the narrowest realistic device,
not the narrowest breakpoint.

**Scheduler (item 3).**
- New `src/lib/courtRotation.test.ts`: a player twice on court 1 is moved off
  it; the short court stays last; a padlocked round is untouched; ties preserve
  order.
- `src/lib/scheduleQuality.measure.test.ts`: add a court-spread metric (max−min
  court occupancy per player, and the share of players who never left one
  court), run `MEASURE=1 MEASURE_OUT=… npx vitest run` **before and after**, and
  record BASELINE/AFTER in the file docblock as that file already does for the
  14 Aug overhaul. Cover both a full set-partner roster and an ordinary one, and
  vary the base schedule — these are probabilistic.
- Same run proves the non-regression: partner and opponent variety numbers must
  not move, because the pass cannot change who plays whom.
- Then assert a bound in `pairing.test.ts` in the house style, with the measured
  numbers written into the comment above it.

**Timer (items 4, 5, 6).** Extend `src/App.roundTimer.test.ts` (alarm fires →
tap Close → panel gone, phase idle, clock back to full minutes; Pause and Reset
still reachable while alarming) and `LiveSessionPage.test.ts` (chip on every
round with no timer; sheet opens to the waiting copy; a poll carrying a timer
switches it to a countdown with no re-open). Existing case at
`App.roundTimer.test.ts:389` taps Close while *running* and must stay green.
Drive a real browser for the wake lock — it cannot be asserted headlessly — and
confirm on an installed PWA on iOS, which is where hosts will hit it.

**Share defaults (item 7).** Test both the fresh install (both off) and the
restart (turn one on, stop sharing, share again, still on). Sign-in-as-someone-
else must still clear.

**Prove every new guard by breaking it** — one deliberate sabotage per
assertion, each must turn the suite red.

**Before committing:** `tsc -b` (the root tsconfig is empty, `--noEmit` checks
nothing), `npm test`, `npm run lint` on `src` only. Tests are excluded from
tsconfig, so a green build says nothing about them. Never run Prettier here.

**Bump `APP_VERSION`** in `src/lib/appInfo.ts` in the same commit. **Stop at the
commit** — do not deploy.

---

## Order

1. **5 and 4** — both small, both self-contained, both in the same file pair.
2. **6** — same area, worth doing while it is open.
3. **1 and 2** — layout, measured at real widths.
4. **7** — three lines and two rewritten docblocks.
5. **3** — the largest, and the only one wanting its own before/after
   measurement in both set-partner and ordinary modes.
