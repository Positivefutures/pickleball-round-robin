# First-run tour

## Context

A brand-new install opens on a Sample Group it has no idea what to do with. An onboarding
tutorial shipped once (`c2bdf57`) and was taken back out a day later (`45c5d3e`) — that one
made the user *perform* all thirteen steps themselves, and it did not work out. This one is
mostly passive: eight cards, read and tap Next, with two moments where the host does the
real thing.

The removed build's spotlight overlay is worth recovering — dark surround, orange ring,
bobbing arrow, `data-tutorial` anchors. Its step engine is not; the new one is a linear
table with an index.

Outcome: a new host lands on the splash, is walked to a schedule they generated themselves,
and is shown the three things on the Schedule tab that are not discoverable (COMPLETED,
court numbers, tap-to-swap).

## Decided with Jeff

| | |
|---|---|
| Who sees it | Brand-new installs only. Gate on `exampleMeta !== null`, which is written only by the fresh-install branch of `runMigrations()`. Existing users and the beta tester never see it. |
| Sample Group | Goes from 24 players to **14**, so card 1.3 can say Select All and the first schedule still has sit-outs (3 courts = 12 seats, 2 sit out). |
| Courts / rounds | Copy says **3 courts, 8 rounds**, matching the defaults. The tour changes no session state. |
| Buttons | Back and Next in a **fixed bar at the bottom**, same place every card, plus a quiet grey **Skip**. |
| Players card | Next does the same thing as Continue to Setup. |
| Schedule card | Split in two, and the tour scrolls the boxed area into view. It won't fit otherwise. |
| Replay | None. No footer link, and the mockup's "Want a guided tour?" block is dropped. |
| Splash art | Cream + corner dots + the robin. No paddle/court line art — not an asset we have. |

## The eight cards

**Act 1 — off the splash, guided**

| # | Tab | Orange box round | Bubble(s) | Forward |
|---|---|---|---|---|
| 1.1 | Players | group name; and separately Continue to Setup | "Here is your sample group!" · "Click here to setup your first round robin." | Next, or the live Continue to Setup button |
| 1.2 | Setup | "Setup Round Robin" title + both steppers | "Imagine you've booked 3 courts and are going to do 8 rounds of play." | Next |
| 1.3 | Setup | the Select Players panel (scrolled into view) | `Click "Select All" and then click "Generate Schedule"` | **OK** — hands control back |

After OK the tour goes dormant. The host selects and generates themselves, and may go back
to Players and change anything.

**Act 2 — first arrival on the Schedule tab**

| # | Orange box round | Bubble | Forward |
|---|---|---|---|
| 2.1 | Round 1 panel down to below Court 1 | at COMPLETED: "Mark rounds as COMPLETED to collapse them" — with the banner "Congratulations on making your first round robin!" | Next |
| 2.2 | same box | at COURT 1: "Change court numbers here" | Next |
| 2.3 | Court 1 + Court 2, one seat drawn as selected | "Select one player and then another to swap them" | Next |
| 2.4 | the Actions button, grown 24px at the top so its icons aren't clipped | "To start a new session, click Actions and then Start New Session." | Next |
| 2.5 | — (no box, centred) | "You're all set! We hope you enjoy using the app." | **Done** |

Back is absent on 1.1 and 2.1 — the first card of each act. There is no going back to the
splash, and none to a state before the schedule existed.

---

## Part A — Sample Group becomes 14

`src/lib/exampleGroup.ts` — `EXAMPLE_ROSTER` drops to 14, 7 M and 7 F, two mirrored rating
ladders `3.0, 3.2, 3.5, 3.6, 3.8, 4.0, 4.5`, names taken from the existing list so nothing
new is invented: Ben T., Carlos R., David K., Frank O., Greg H., Kevin B., Paul G. / Amy C.,
Beth R., Carol M., Emma J., Karen S., Grace F., Sarah M. Update the file's doc comment,
which currently argues for twenty-four.

Counts to change: `exampleGroup.test.ts` (24→14, 12/12→7/7), `migrations.test.ts:18,26,30,53,69`,
`sync.test.ts:697`, `App.walkthrough.test.ts:719,725` (27→17).

Existing installs keep their 24 — only new seeds change, and `exampleMeta.playerIds` records
what was actually written, so `untouchedExampleInstall()` is unaffected.

Known cosmetic drift: the screenshots in `public/instructions/` show the 24-player group.
Not worth reshooting for this.

## Part B — `src/components/tour/SplashScreen.tsx`

Full screen, cream `#FBFAF6` (the header's CREAM, `Header.tsx:40`), `corner-dots.png` in the
corners with `scaleX(-1)`/`scaleY(-1)` for the mirrored copies, `icon-512.png` at ~9rem,
headline "Try the app right away", body "We've added a sample group with 14 players. Use it
to create a round robin and see how everything works.", full-width orange Continue button.
Nothing below the button.

Add `/icon-512.png` to `PRECACHED_PUBLIC` in `src/lib/precache.ts` (`corner-dots.png` is
already earned by SetupPage).

## Part C — `src/lib/tourGeometry.ts` (pure, no DOM)

All the maths lives here so it can be tested as arithmetic — happy-dom has no layout and
every rect it reports is zero.

```ts
export const PAD = 8;                       // breathing room round a spotlit element
export const BAR_H = 108;                   // the fixed bottom bar; shared with TourBar
export const DIM = 'rgba(0, 0, 0, 0.35)';   // lighter than the app's bg-black/40 modal scrim

export function padRect(r: Rect, pad?: Partial<Record<Side, number>>): Rect
export function unionRect(rects: Rect[]): Rect | null
export function dimTiles(view: Rect, holes: Rect[]): Rect[]
export function frameRects(outer: Rect, inner: Rect): Rect[]
export function placeBubble(anchor, size, view, prefer): Placed
export function resolveBubbles(a, b, view): [Placed, Placed]
export function minimalScroll(r: Rect, top: number, bottom: number): number
```

Two things the old overlay could not do:

- **Padding is per anchor, applied before the union**, which is how the Actions button gets
  `pad: { top: 24 }` (its four icon tiles hang at `-top-[17px]`, outside its border box) without
  inflating every other box.
- **`dimTiles` subtracts rectangles by grid sweep** rather than the old four-rect trick, which
  cannot express the two separate holes card 1.1 needs without double-darkening where they
  overlap. Every hole edge becomes a grid line; cells not inside a hole are emitted. At most
  25 divs with two holes, typically 8–12.

The orange ring stays `border-2 border-brand-orange rounded-lg`, with
`boxShadow: '0 0 0 4px rgba(245,71,2,0.18)'` to hold its own against the lighter scrim.

## Part D — `src/lib/tour.ts` and the store

A linear `TOUR_STEPS` table, a module-level `index`, and a 40-line emitter read through
`useSyncExternalStore`. `getTourView()` must return a **cached** object — a fresh one per call
loops forever.

```ts
interface TourStep {
  id: string; act: 1 | 2; tab: Step;
  banner?: string;                       // 2.1's congratulations line
  regions: AnchorSpec[][];               // one orange box per region
  bubbles: BubbleSpec[];                 // 0..2, each with its own pointer
  live?: { anchor: string };             // the one control left clickable (1.1 only)
  nextLabel?: string;                    // 'OK' on 1.3, 'Done' on 2.5
  scrollTo?: boolean; lockScroll?: boolean;
}
const canBack = (i: number) => i > 0 && TOUR_STEPS[i - 1].act === TOUR_STEPS[i].act;
```

One new persisted flag in the device half of `src/lib/stores.ts`, beside `exampleMeta`,
following the `swapHintDismissed` idiom at L181-189:

```ts
export type TourStage = 'none' | 'act1' | 'await-schedule' | 'act2' | 'done';
export const tourStage = createStoredValue<TourStage>('pb-tour-stage', 'none');
```

The card index is **not** persisted; the stage is, and the card is re-derived from stage +
tab on relaunch (`resumeTour`). Closed during Act 1 and reopened on Setup resumes at 1.2.
Act 2 always restarts at 2.1 — four short cards, costs nothing.

Add `?tour=1` in `main.tsx` to reset the stage, so this can be seen on a real device without
wiping groups. Document it in the store's comment and in `PLANS/first-run-tour.md`.

## Part E — `TutorialOverlay.tsx` and `TourBar.tsx`

The overlay measures, calls the pure module, and draws. Keep the removed build's
`requestAnimationFrame` loop with a `sameRects` guard — it now watches up to four anchors per
card, and it absorbs font swap, image load, large-text and iOS's collapsing URL bar for free.
A settled screen costs four `getBoundingClientRect()` calls a frame and zero re-renders.

Clicks: transparent `pointer-events-auto` blockers over every hole, except that on card 1.1
the hole containing Continue to Setup gets `frameRects(hole, liveRect)` instead, so that one
button keeps its clicks. Advancing on the live click uses a **document capture listener**, not
a wrapper, so the real button still gets its own event.

`TourBar` is fixed at the bottom: Back (absent, not disabled, when there is none), the forward
button, and Skip underneath. `BAR_H` is imported from the geometry module by both, or the
keep-out band and the bar will drift apart.

## Part F — anchors

Nine `data-tutorial` attributes. Three are placed specifically to survive things that move:

| name | file:line | note |
|---|---|---|
| `group-name` | `RosterPage.tsx:252` | |
| `continue-setup` | `RosterPage.tsx:285` | |
| `setup-title` | `SetupPage.tsx:171` | |
| `setup-steppers` | `SessionConfig.tsx:131` | the row holding both steppers and nothing else |
| `select-players` | `SetupPage.tsx:213` | the **wrapper**, not inside `PlayerSelector` — it survives the swap to `PartnerPairing` |
| `actions-button` | `ActionsButton.tsx:44` | with `pad: { top: 24, left: 8, right: 8 }` |
| `round-1` | `SchedulePage.tsx:561` | keyed on `round.roundNumber === 1`, **not** DOM position — `orderedRounds` (L523-525) floats completed rounds to the top |
| `court-1-label` | `CourtMatchup.tsx:342` | on the `<h4>`, not the inner `<button>` — the button disappears on a completed round |
| `court-1` / `court-2` | `CourtMatchup.tsx:330` | |

Identity is threaded with two optional props: `tourRound` on `RoundCard`, `tourCourt` on
`CourtMatchup`. No anchor is needed on Generate Schedule, which sidesteps `buttonRow` being
rendered twice (`SetupPage.tsx:186` and `:233`).

**The pre-selected seat on card 2.3** — one optional prop on `SchedulePage`:

```tsx
previewSlot?: PlayerSlot | null;
const shownSlot = selectedSlot ?? previewSlot ?? null;
```

`shownSlot` replaces `selectedSlot` at exactly two render sites (L565, L580). Every handler
keeps reading `selectedSlot`, so the preview can never turn into a real swap, and it renders
the genuine selected styling rather than an imitation of it.

## Part G — App.tsx wiring

Mount the splash and overlay **after every panel, before `<PrintSchedule>`** (~L1190) — outside
`.app-panel` (L900), which gets `-translate-x-[80%]` when the drawer opens and would otherwise
become the containing block for a `position: fixed` overlay.

- Splash shown from a **lazy initialiser**, not an effect, so a fresh install never flashes a
  frame of the app first: `stores.tourStage.get() === 'none' && stores.exampleMeta.get() !== null`.
- `useLayoutEffect(() => resumeTour(...), [])` before first paint.
- **The card moves the tab, never the reverse.** An effect keyed on `tour.index` (guarded by a
  ref) calls `setStep(tour.tab)`. Watching the tab instead would fight the live Continue to
  Setup button on 1.1 and haul it straight back.
- Act 2 trigger: `if (tourStage === 'await-schedule' && step === 'schedule')`. `currentStep()`
  already refuses a stored `'schedule'` with nothing under it, so reaching that tab is proof a
  schedule exists. Fires once, because the first thing it does is move the stage.
- **Scroll lock joins App's single aggregate** at L187-190 — never a second `useScrollLock`. A
  second lock reads `window.scrollY` as 0 because a pinned body has no scroll to report, and
  releasing it jumps the user to the top (documented at `RosterPage.tsx:95-109`).
- Cards with `scrollTo` emit `scrolling: true` for one frame so the lock is *not* taken, call
  `window.scrollBy` with `minimalScroll` and `behavior: 'auto'`, then lock on the next frame —
  so `useScrollLock` captures the post-scroll offset.
- Suppress while the tour is up: `InstallBanner` (L963) and `SignInBanner` (L973), both of which
  a 14-player Sample Group would otherwise trigger straight into card 1.1; and `showSwapHint`
  (L1042). Set `swapHintDismissed` on finish — card 2.3 has taught it.

## Verification

1. `npx tsc --noEmit`, `npx eslint src`, `npx vitest run` — all clean. **Lint `src` only.**
2. **`src/lib/tourGeometry.test.ts`** (node env, pure): `padRect` gives a 24px top on the Actions
   button; padding applies per anchor before the union; `dimTiles` tiles sum to view − holes,
   never overlap pairwise, never intersect a hole; `frameRects` leaves the live rect uncovered;
   `placeBubble` stays inside `[16, W−16−w]` and above `844 − BAR_H − 16`; `resolveBubbles`
   separates two bubbles 40px apart; `minimalScroll` returns 0 when already in band.
3. **`src/App.tour.test.ts`** (happy-dom, reusing `App.walkthrough.test.ts`'s mount helpers):
   splash copy present and "Want a guided tour?" **absent**; Continue → card 1.1 with both
   bubbles, Skip, no Back; Next → Setup tab; Back → Players; card 1.3's button reads `OK`;
   OK → overlay gone, stage `await-schedule`; Select All + Generate → Act 2 banner, no Back;
   Done → stage `done` and `swapHintDismissed`; remount is clean.
   **The beta-tester guarantee:** an install seeded by hand (no `exampleMeta`) shows neither
   splash nor overlay.
   Plus: reload mid-Act-1 resumes at 1.2; never generating leaves nothing on screen; a sweep
   asserting every anchor in `TOUR_STEPS` resolves on its tab; `round-1` survives Round 2 being
   completed; `court-1-label` survives Round 1 being completed; `select-players` survives
   pairing mode; a fresh install really is 3 courts.
4. **Sabotage each guard** — one deliberate break at a time, each must turn the suite red:
   drop the `exampleMeta` half of the splash gate; key `round-1` on DOM position; move
   `court-1-label` onto the inner button; move `select-players` inside `PlayerSelector`; drop
   the Actions padding; make `dimTiles` emit overlapping tiles; trigger Act 2 without checking
   the tab; make `resumeTour` always return 0; make `canBack` just `i > 0`; make `getTourView`
   return a fresh object.
5. **See it.** Render the splash and cards 1.1, 2.1, 2.3 and 2.4 to static HTML with the real
   built CSS and screenshot at 390×844 and 375×667, normal and large-text. Then drive a real
   headless browser on a clean profile through the whole tour and screenshot each card — the
   geometry is the point of this feature and happy-dom cannot see any of it.

## Build order

Each stage leaves the app shippable.

0. **Sample Group → 14.** Roster, doc comment, and the five test files that count it.
1. **Geometry module + its tests.** Nothing imports it yet.
2. **Anchors.** All nine attributes plus the `tourRound`/`tourCourt` props, with the anchor
   sweep and the three hazard tests. No visual change at all.
3. **Store + splash.** Continue closes the splash and writes `'done'`; no engine yet.
4. **Engine + overlay, Act 1 only.** Cards 1.1–1.3, `TourBar`, the bob keyframe back in
   `index.css` under the existing `prefers-reduced-motion` block, App wiring. OK hands over.
5. **Act 2.** The five Act 2 cards, the trigger effect, `previewSlot`, `App.tour.test.ts`.
6. **Polish.** `PLANS/first-run-tour.md`, the screenshot pass, the real-browser drive.

`APP_VERSION` bumps in the deploy commit only, and only when Jeff says to deploy.
