# First-run tour, second cut

## Context

The tour built on 2026-08-13 shipped nowhere — it has been running on Jeff's phone off a
local preview. Testing it produced a long list of changes, and together they are a redesign
rather than a tidy-up: the splash screen becomes a bottom sheet, the fixed button bar is
deleted and its controls move inside the message bubbles, and the tour stops handing control
away and taking it back. Every card now leaves the real control it is talking about alive.

Two bugs came out of the same session:

- **Continue to Setup does nothing.** `TutorialOverlay`'s root is `fixed inset-0 z-50` with no
  `pointer-events-none`. Children paint above the parent, so the shields work — but over the
  one place with no child, the live button, the root itself is the hit target and swallows the
  click. One class fixes it, and the tour cannot be tested without it.
- **The tour appears to shut off after Generate.** By design: Act 1 ended, the stage went to
  `await-schedule`, and nothing was on screen until the host reached the Schedule tab. Jeff
  read that as a crash. The two-act structure goes; the deck becomes one continuous run of
  eight cards.

Outcome: a new host opens on the Players tab, is offered the tutorial two seconds later, and
is walked through building a real round robin — setting the courts, picking the players,
generating, swapping, and starting the next one — doing each of those things themselves.

## Decided with Jeff

| | |
|---|---|
| Landing after Done | The Players tab. That is where New Round Robin already goes. |
| The COMPLETED tip | Dropped. Step 4 is congratulations only. |
| The pre-selected seat | Dropped. Seats are live now, so a fake selection would make their first real tap complete a swap. |
| Rename scope | Everywhere: the Actions card, its confirm heading, and the Instructions manual. |
| Step count | Eight, derived from the deck, so the counter reads "Step 1 of 8". (Jeff wrote "of 6" once and then numbered eight steps.) |

---

## Part A — two app changes, independent of the tour

1. **`ActionsSheet.tsx`** — swap the order of Share Live Session and Start New Session in
   `CARDS` (L92 and L94), and rename Start New Session to **New Round Robin**: the card label,
   `HEADINGS['new-session'].title` ("Start a new session?" → "New round robin?"), and the
   `<Item term="Start New Session">` entry in `InstructionsPanel.tsx:376`.
2. **`ActionsSheet.tsx`** gains `confirmNewSession?: boolean` (default `true`). When false the
   card calls `onStartNewSession()` straight away instead of opening its confirm view. App
   passes false only while the tour is on card 8.

## Part B — the shape of the tour

**Stage** (`stores.ts`) collapses to `'none' | 'running' | 'done'`. Anything else in storage —
the old `act1`, `await-schedule`, `act2` — is normalised to `'done'` on read, so a device part
way through the old tour is not stranded on a stage nothing understands.

**`tour.ts`** emits one cached snapshot covering all four things that can be on screen:

```ts
type Phase = 'off' | 'opener' | 'card' | 'complete';
interface TourSnapshot { phase: Phase; card: TourView | null }
```

- `armOpener()` — App calls it 2s after mount on a fresh install. Phase `'opener'`.
- `startTour()` — Continue on the sheet. Stage `'running'`, phase `'card'`, index 0.
- `nextCard()` / `backCard()` / `skipTour()`
- `completeTour()` — New Round Robin on card 8. Stage `'done'`, phase `'complete'`.
- `dismissComplete()` — Done on the sheet. Phase `'off'`.

`resumeTour(stage, tab)` still re-derives the card from the tab on relaunch. Gone entirely:
`act`, `ACT2_FIRST`, `startAct2`, `banner`, `nextLabel`, `TOUR_PREVIEW_SLOT`.

**The step table** gains what the new cards need:

```ts
interface Region {
  anchors: AnchorSpec[];
  endAt?: string;
  /** Undimmed, unringed, still shielded. The live tab button. */
  plain?: boolean;
  /** Clicks reach the page inside this box. */
  live?: boolean;
}
interface BubbleSpec {
  at?: string; text: string; prefer?: 'above' | 'below';
  /** Narrower than the standard 336, to leave what is beside it readable. */
  maxWidth?: number;
}
interface TourStep {
  id: TourId; tab: Step;
  regions: Region[]; bubbles: BubbleSpec[];
  /** No Next link: the only way on is the real control. */
  hideNext?: boolean;
  /** No Back link. Cards 1 and 4. */
  noBack?: boolean;
  /** Above the app's own modals rather than below them. Card 8 only. */
  overModal?: boolean;
  scrollTo?: boolean;
}
```

`build()` prepends a `plain` region for `active-tab` to every card, so no card has to remember
it and a test can assert it once.

**Handing over is App's job, not a listener's.** The old capture listener on the live anchor is
deleted. The four cards that hand over a real control advance from inside the handler that
already exists, which means the tour cannot advance on a click that did not work:

| card | advances from |
|---|---|
| 1 | `onContinue` (RosterPage's Continue to Setup) |
| 3 | `handleGenerate`, **success branch only** — a selection below the floor shows the error and stays put |
| 7 | the ActionsButton's `onClick` |
| 8 | `handleStartNewSession` → `completeTour()` |

Card 2's Next sets `numCourts` to 3 on the way through, so the overlay takes `onNext` from App
rather than calling `nextCard` itself.

## Part C — the eight cards

Copy is Jeff's, verbatim. Every card's controls live in its **last** bubble.

| # | Tab | Orange box | Live | Bubble | Forward |
|---|---|---|---|---|---|
| 1 | Players | group name; Continue to Setup | both | "I've created a sample group for you with 14 players" (above) · "Click here to setup your first round robin." (**narrow**, so Add Players / Rating / Gender stay readable underneath) | Continue to Setup only, **no Next** |
| 2 | Setup | title + both steppers | steppers | `You've booked 3 courts so set "Number of Courts" to 3 and click "Next"` | Next, which forces courts to 3 |
| 3 | Setup | Select Players panel + the button row below it | both | "Select all the players and then click Generate Schedule." | Generate Schedule only, **no Next** |
| 4 | Schedule | Round 1 down to below Court 1 | — | `Congrats, you've just created your first round robin! Click "Next" and I'll show you a few more things` — **above** the box | Next. No Back. |
| 5 | Schedule | same box | court number button | "Change court numbers here." | Next |
| 6 | Schedule | Court 1 + Court 2 | both courts | "Select one player and then another to swap them." — **above** the box | Next |
| 7 | Schedule | Actions button, +24px at the top | the button | `Now, create a new round robin by clicking "Actions" and then "New Round Robin"` | Actions only, **no Next** |
| 8 | Schedule | New Round Robin, inside the open sheet | that button | `Now click "New Round Robin".` — *new copy, worth Jeff's eye* | that button only, **no Next** |

Then the closing sheet: **Tutorial Complete!** / "You're ready to create your first group, add
players, and create your own round robins." / "Have fun playing pickleball! And thanks for
being an organizer." / **Done**.

**Card 8 shields the sheet's own Close**, so the one lit button is genuinely the only way on.
Back on card 8 closes the sheet and returns to card 7.

## Part D — the overlay

- **Root gets `pointer-events-none`.** The bug above.
- **z-index by card**: `z-40` normally, so the app's own modals (all `z-50`) come out over the
  top — that is what lets My Groups open on card 1 and the court number dialog on card 5.
  `overModal` lifts card 8 to `z-[60]` so it draws over the Actions sheet instead.
- `plain` regions: a hole in the dark, no ring, still shielded. Padding 0, so the hole is the
  button's own box.
- `live` regions: a hole, a ring, and no shield.
- `frameRects` is no longer needed for a live control inside a shielded box — a region is now
  live or it is not. It stays for nothing; **delete it** and its tests.
- **`TourBar.tsx` is deleted**, and with it `BAR_H`. `band()` becomes `EDGE` to `vh - EDGE`,
  which gives every bubble 108px more room than it had.
- `bubbleWidth(viewWidth, max?)` honours a per-bubble cap.

**The bubble carries the controls:**

```
┌────────────────────────────────┐
│ Step 1 of 8              Skip  │  1.125rem, grey; Skip underlined
│                                │
│ Message text, wrapping.        │  1rem
│                                │
│                  Back   Next   │  link buttons, teal
└────────────────────────────────┘
```

1.125rem is exactly 50% over the `text-xs` the bar used, as asked. It is now the largest text
in the box — one number to change if it reads wrong.

## Part E — the sheet

`src/components/tour/TourSheet.tsx` replaces `SplashScreen.tsx`, and serves both ends: a cream
panel with rounded top corners that slides up from the bottom over a light scrim, a small
robin, a title, body copy, and one full-width orange button. Slide is a `translate-y`
transition armed on the frame after mount, inside the existing `prefers-reduced-motion` block
in `index.css`.

App shows it in two places, from `phase`:

- `'opener'` — 2s after mount on a fresh install (`tourStage === 'none' && exampleMeta !== null`,
  read in a lazy initialiser as now). "Quick Start Tutorial" / "Let's create your first round
  robin!" / Continue.
- `'complete'` — straight after New Round Robin lands them on Players.

**Continue seeds the tutorial's premise**, in App where the roster is:

- `numCourts` → **2**, so card 2 has something to ask for.
- `selectedIds` → 10 of the 14, via a new pure `tourStartSelection(players)` in `tour.ts`:
  sort by name with the same `localeCompare` `PlayerSelector` uses, drop indices 2, 5, 8 and 9.
  On the Sample Group that is Beth R., David K., Grace F. and Greg H.

## Part F — anchors and props

| anchor | where | note |
|---|---|---|
| `active-tab` | `StepIndicator.tsx` | on the current button only |
| `generate-schedule` | `SetupPage.tsx` | `buttonRow` is rendered twice; parameterise it so only the **lower** copy carries the anchor, and the upper one stays dark |
| `new-round-robin` | `ActionsSheet.tsx` | on the New Round Robin card |
| `round-1-completed` | — | **removed**, with the `tourRound` prop that existed only for it |

Kept unchanged: `group-name`, `continue-setup`, `setup-title`, `setup-steppers`,
`select-players`, `actions-button`, `round-1`, `court-1`, `court-2`, `court-1-label`.

**Reverted**: `previewSlot` on `SchedulePage` and the `shownSlot` indirection go back to plain
`selectedSlot`.

**Added**: `hideSeatEdit`, threaded `SchedulePage → RoundCard → CourtMatchup → PlayerSeat`
beside the `tourCourt` prop that already makes that trip, hiding the pencil on a selected seat
while the tour is running.

## Verification

1. `npx tsc --noEmit`, `npx eslint src`, `npx vitest run`. **Lint `src` only.**
2. **`tourGeometry.test.ts`** — drop the `BAR_H` and `frameRects` cases, add `bubbleWidth`'s
   cap, keep `dimTiles` (pairwise disjoint, area sums, never inside a hole), `padRect`'s 24px
   top on Actions, `endAt`, `placeBubble` inside the band, `minimalScroll`.
3. **`tour.test.ts`** (new, pure) — `tourStartSelection` drops exactly those four names and
   keeps ten; every card's `hideNext`/`noBack` matches the table above; `active-tab` is on
   every card's regions.
4. **`App.tour.test.ts`** — no opener before 2s and one after (fake timers); a hand-seeded
   install (no `exampleMeta`) never gets one; Continue leaves courts at 2 and ten ticked;
   card 1 has no Next and Continue to Setup moves to card 2; Next sets courts to 3; Generate
   with too few selected stays on card 3; a real Generate lands on card 4 on the Schedule tab;
   Next twice reaches 6; Actions opens the sheet and reaches 8; New Round Robin shows no
   confirm, lands on Players, and shows the complete sheet; Done clears it and the stage is
   `done`; a remount is clean; Skip works from any card; Back walks 3 → 2 → 1.
5. **`App.tourAnchors.test.ts`** — the sweep over every anchor in the table, plus the three
   hazards that already earned tests (round reordering, a completed round losing its button,
   pairing mode swapping the panel's contents) and one new one: exactly one
   `[data-tutorial="generate-schedule"]` on screen despite two button rows.
6. **Sabotage each guard**, one at a time, each must turn the suite red: remove
   `pointer-events-none` from the overlay root; show the opener with no `exampleMeta`; drop the
   courts-2 seed; make `tourStartSelection` return all fourteen; stop card 2 setting courts to
   3; advance card 3 on a failed generate; make card 8 show the confirm; put the controls in
   the first bubble; give `plain` regions a ring; make `dimTiles` overlap; drop `hideNext`.
7. **See it.** Build, then drive Chrome for Testing on a clean profile through all eight cards
   at 390×844 and screenshot each: happy-dom has no layout engine and the geometry is the whole
   point. Check specifically that card 1's narrow bubble leaves "Add Players", Rating and Gender
   readable; that the active tab reads as normal on every card; that My Groups opens over card 1
   and closes back to it; and that card 4's and card 6's bubbles sit above their boxes.
8. Serve `dist` on the LAN for Jeff's phone. **Do not deploy and do not bump `APP_VERSION`**
   until he says so.

## Build order

Each stage leaves the app shippable.

0. **Part A** — the button swap, the rename, and `confirmNewSession`. No tour involvement.
1. **Geometry** — delete `BAR_H` and `frameRects`, add the width cap, fix the tests.
2. **The step table and store** — new phases, new fields, the eight cards, `tourStartSelection`,
   its pure tests. Nothing renders it yet.
3. **Anchors** — `active-tab`, `generate-schedule`, `new-round-robin`; remove
   `round-1-completed` and `previewSlot`; add `hideSeatEdit`. No visual change.
4. **`TourSheet`** — both ends, the 2s timer, the `pointer-events-none` fix.
5. **The overlay** — bubble controls, `plain`/`live` regions, z-index by card, `TourBar` deleted.
6. **App wiring** — the four hand-offs, the courts seed, the selection seed, card 8's sheet.
7. **Polish** — rewrite `PLANS/first-run-tour.md`, the browser drive, the screenshots.

Copy this file into the project's `PLANS/` folder as soon as plan mode exits.

---

## As built

Everything above shipped, with four changes the work itself forced.

**The z-index plan was wrong, and only a real browser could say so.** `.app-panel`
carries `z-10`, so every panel in the app — all of them `z-50` — is stacked inside
that one context. The overlay is mounted outside `.app-panel` (it has to be: that
element takes a transform when the settings drawer slides, and a transformed
ancestor becomes the containing block for its fixed children), so it wins at the
root whatever it sets. My Groups opened *underneath* the tour and could not be
closed. The overlay now **stands down instead**: `TutorialOverlay` watches for
`[data-tour-suspends]` in its measure loop and renders nothing while one is up.
Two panels carry it — `GroupPicker` and `CourtNumberDialog`, the two the tour hands
over to. `overModal` was dropped; card 8 needs nothing special, because the overlay
already draws over `.app-panel`.

**Regions and live controls split apart.** The first cut put `live` on a region,
which cannot express card 2 — a box round the heading *and* the steppers, with only
the steppers clickable. `live` is now a list of `data-tutorial` names on the step,
and the shields are `dimTiles(hole, liveRects)`: the same grid sweep that subtracts
the boxes from the darkness, subtracting the live controls from the shields.
`frameRects` was deleted; this does its job and more.

**Card 3's bubble landed on the button it was pointing at.** Generate Schedule sits
directly under the Select Players panel, so the default placement covered it. It
takes `prefer: 'above'` now.

**Reserving the step tabs was tried and reverted.** A `keepTop` on `band()` kept
bubbles off the tab strip, which card 4 wanted — but it starved card 1's first
bubble of the header space it needs, flipping it below the group name and onto
Continue to Setup. Card 4's bubble overlaps the tab row by about 25px and the tab
stays readable; that is the better trade. `band(viewHeight, keepTop)` still takes
the parameter and is tested; nothing passes it.

**Two things worth knowing next time.** `npx tsc --noEmit` checks *nothing* in this
repo — the root tsconfig is `{"files": []}` with project references, so the real
check is `npx tsc -b`, which is what `npm run build` runs. And ten of the fourteen
players is enough for three courts, not too few: the last court plays a 2v1. The
test that assumed otherwise was wrong, and Deselect All is how a failed Generate is
actually reached.

Verified: `tsc -b`, `eslint src`, 1249 tests, 15 sabotages each turning the suite
red, and a real chromium driven through all eight cards at 390x844 and 375x667 with
no bubble off screen and every live control reachable.

---

## Second round of testing, 2026-08-14

Jeff ran the whole thing on his phone and called steps 6, 7, 8 and the closing sheet
perfect. Everything below is what he asked for after that, plus the one bug he found.

**Global.** The greeting comes up after **one** second, not two. **Skip left the
bubbles** — it now sits in a fixed pill at the foot of the screen, `bg-brand-orange-light`
inside a `border-brand-orange` with grey text, and `band()` reserves `FOOT` (40px) so
no bubble is ever placed under it. In the corner of a bubble it read as one of that
card's two buttons; it is neither, and it belongs somewhere no card owns. **Back is
left-justified** and Next right, on a `justify-between` row that keeps that shape with
only one of them in it.

**The copy.** Card 1's second bubble: "Click Continue to Setup to configure your round
robin." Card 2: "Set the Number of Courts to 3 and Rounds to 10." Card 4: "Congrats!
You've just created your first round robin. Click "Next" and I'll show you a few more
things."

**Rounds joined the courts card.** `TOUR_ROUNDS_START` is 8 (the app's own default) and
`TOUR_ROUNDS_TARGET` is 10, seeded and forced exactly as the courts already were, so
Next makes the card's sentence true whichever way the host pushed the steppers.

**Card 3 was rebuilt round the upper Generate button.** The anchor moved from the lower
button row to the upper one — with fourteen players the panel fills the screen, so the
lower row is a long way past the bottom of it. The card now draws **two** boxes, the
panel and that one button, rather than one box round the whole row: the row also holds
Set Partners, and boxing it would offer a control the tour has nothing to say about.
Everything else, the lower row included, stays dark and dead.

The bubble is `align: 'left'` and its width is **derived, not chosen**: a new
`clearOf: 'generate-schedule'` makes `bubbleWidth` stop short of that button's measured
left edge. The button is the same 208px on every phone, so the room beside it is not —
148px on a 390 and 133 on a 375. A constant that cleared it on one would sit on it on
the other, which is the single thing this card must not do. Floored at `BUBBLE_MIN`.

**Card 4 draws nothing.** No boxes at all, the whole page dark but for the bubble, and
`scroll: 'top'` so the Actions button leaves a bubble's worth of room above Round 1.
The live step tab is still a plain hole, per the standing instruction that the tab looks
normal on every card from 4 on — so "the entire page is darkened" is true of everything
but that tab. **The bubble still overlaps the tab strip by about 26px**, as recorded
above: the alternative is covering the rounds panel, which Jeff ruled out explicitly.

**Card 5 boxes Court 1 alone**, not the round it sits in, which keeps COMPLETED outside
the lit area on a card about renaming a court.

**The Back bug.** Cards 1, 2 and 8 never placed the page at all, so Back into one of
them showed a bubble with its controls off the top of the screen. `scrollTo?: boolean`
became `scroll?: 'regions' | 'top' | 'none'`, defaulting to `regions`, and every card
now places itself on every arrival — the overlay's once-per-card memory is gone with it.

Verified: `tsc -b`, `eslint src`, 1260 tests, **16 sabotages** each turning the suite
red, and a real chromium driven through all eight cards at 390x844 and 375x667 with no
bubble off screen, the Generate button provably clear of its bubble at both sizes, and
COMPLETED provably outside card 5's box.
