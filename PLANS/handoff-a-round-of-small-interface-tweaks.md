# Handoff: a round of small interface tweaks

Paste the block below into a fresh session.

---

We are doing a batch of **small interface tweaks** to the pickleball round robin
app. Nothing architectural. Expect a list of "make this smaller / move that /
change this wording" items, probably with screenshots.

## Where things stand

- Live at **app.pbroundrobin.com**, version **1.60**.
- `main` and `header-banner` are both at `6ff7df9` and the tree is clean.
- The last two releases were **scoring** (a scoreboard on every court plus a
  standings table) and **live session sharing** (a QR code that lets everyone at
  the court watch the session read-only on their own phone).

## Before you touch anything

Read `MEMORY.md` and follow it. The three that will bite in a UI session:

- **Never run Prettier.** There is no config, so it rewrites whole files.
- **`npx eslint src`**, never `npm run lint`, which walks a stray backup folder
  for five minutes.
- **Do not deploy.** Not a push, not a fast-forward of `main`, not a redeploy.
  Stop at the commit, say it is ready, and wait to be asked. There is a hook that
  will prompt me; the prompt is not the permission.

## How to actually see a change

Do not guess at pixels. Two routes, both already proven:

1. **Fast:** render a component to static HTML and screenshot it.
2. **Real behaviour:** playwright-core from the scratchpad, pointed at the
   chromium already on disk. `npx vite --host 0.0.0.0 --port 5173`, drive it,
   screenshot it. Signing in headlessly is possible and written up in memory.

Check the large-text mode for anything you resize: `.text-large` in `index.css`
overrides `--text-xs` through `--text-xl` but **not** `--text-2xl`, and `rem` and
`px` both resolve against the root and are unaffected.

## The interface, by file

- **Shell:** `src/App.tsx` (the one component, prop-drilled), `layout/Header.tsx`
  (the cream banner), `layout/StepIndicator.tsx` (the three tabs),
  `layout/SettingsPanel.tsx` (the drawer and its menu).
- **Step 1, players:** `roster/`.
- **Step 2, setup:** `setup/SessionConfig.tsx` has the court and round steppers
  and the Keep Score switch. `setup/SpecialTypesPanel.tsx`.
- **Step 3, schedule:** `schedule/SchedulePage.tsx` is the page.
  `RoundCard.tsx` wraps each round, `CourtMatchup.tsx` is a court,
  `Scoreboard.tsx` and `ScoreDialog.tsx` are the score, `StandingsPanel.tsx` the
  table, `ActionsSheet.tsx` the bottom sheet behind the Actions button,
  `LiveShareView.tsx` the sharing panel inside it.
- **The watcher's view:** `live/LiveSessionPage.tsx` and `live/LiveCourt.tsx`.
  This is a separate root, reached at `/?s=KEY`, and it is nobody's own app: it
  must keep showing no ratings and no balance bar.
- Panels and dialogs are hand-rolled, not from a component library. The newest
  and best-dressed family is `layout/AccountShell.tsx` with
  `layout/accountStyles.ts`. Copy that when something new is needed.

## Copy rules

Jeff edits wording closely. **No em dashes. No repeated words. Two short
sentences beats one long one.** Say the true thing plainly.

## Tests

`*.test.ts`, never `.tsx`, colocated. DOM tests need
`@vitest-environment happy-dom` in the docblock. Tests are **not** typechecked,
so assert on rendered output. When you add a guard, break it once and watch the
suite go red before you believe it.

## Things already noticed and deliberately left alone

Any of these are fair game if Jeff wants them:

1. **Yellow appears twice on a court's header row.** A tied score paints both
   score panels yellow, and the balance badge beside it already uses green,
   amber and red. Could move ties to a blue-grey.
2. **The scoreboard is not on a fixed centre.** It sits in the gap between the
   court name and the balance badge, so a 2v1 court, which has no badge, shows
   its board further right than its neighbours.
3. **The Actions sheet stands at 92% height for every view**, so a short one like
   Share Live Session has a lot of empty space under its last button.
4. **A shared link previews as the generic app card.** `og:url` and `og:image` are
   static in `index.html` and there is no server tier to make them per-session.
   This one is a real limit, not a tweak.

## First move

Ask Jeff for the list, or for the screenshots. Do not go looking for things to
change on your own.
