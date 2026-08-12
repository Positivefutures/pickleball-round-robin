# Rebuild the Instructions page

## Context

The app is stable, and the Instructions page has not kept up. It still says
"Everything is stored on this device only. No account, no sync" — contradicted by the
shipped accounts feature. It says bug reports open your mail app, which stopped being
true at commit 43cda6c. It never mentions scoring, standings, Live Session Share, the
Actions sheet, guests, or signing in. And it is one long text-only scroll.

The rebuild, as decided with Jeff:

| | |
|---|---|
| **Shape** | A topic list, like the Settings drawer. Tap a topic, read a short focused page, tap Back |
| **Pictures** | One or two real screenshots per topic, about ten in all, from the live app with a fictional demo group |
| **Maintenance** | A committed script regenerates every screenshot in one command |

The parked subscriptions plan from earlier in this session should be copied to
`PLANS/subscriptions-with-stripe.md` for later; this plan replaces it in this file.

---

## 1. The panel

Rebuild [src/components/layout/InstructionsPanel.tsx](src/components/layout/InstructionsPanel.tsx)
as a two-level view. One file, following the `ActionsSheet.tsx` precedent (898 lines,
single file). Local `useState<ChapterId | null>`; no routing, no new stores.

- **Topic list** — big tappable rows, icon + title + one-line note, the exact shape of
  the Settings drawer rows. Icons come from [src/components/icons.tsx](src/components/icons.tsx)
  and follow the panel-glyph convention (`PanelGlyph.test.ts`, commit cc8f316).
- **Chapter page** — teal header gains a Back button beside Close; the chapter scrolls
  from the top; a *Next: …* link at the bottom walks the whole manual in order.
- Keep the `Section` / `Item` / `Tip` helpers — the existing copy voice is good, most
  of it survives. Screenshots sit inline with a one-line caption underneath.
- Must hold up with the `.text-large` accessibility class on.

### Chapters, nine

1. **Quick start** — the four steps, one screenshot of a finished schedule. The goal
   is a schedule in 60 seconds.
2. **1. Players & groups** — add, ratings, gender, the pencil, groups, Show All
   Players, Add to Another Group.
3. **2. Set up the session** — attendance, courts and rounds, Spots Filled, Set
   Partners, Special Game Types, the scoring toggle.
4. **3. Run the schedule** — reading a round card, the Diff badge, court numbers,
   Complete, swap, padlock + Reshuffle, entering scores on the keypad, standings,
   Player Summary, print/PDF.
5. **Mid-session changes** — the Actions sheet, card by card: Add a Player, Sub a
   Player, Add a Guest, Add a Round, Add / Remove a Court, Reshuffle, Start New
   Session.
6. **Share the session live** — start, the QR code, what viewers see and what is
   withheld, the 24-hour life of a link.
7. **Your account & sync** — sign in with an emailed code, what syncs and what stays
   on the device, a second phone, sign out, Download My Data, Delete Account.
8. **Settings menu** — the remaining drawer items, with the stale feedback copy fixed.
9. **Good to know** — the corrected storage story (on your device, synced when signed
   in), sessions surviving refresh, switching groups mid-session, how fairness works
   (partners rotate, sit-outs even out, 2v1 and singles when short).

### Copy corrections while in there

- The device-only storage claim, replaced by the two-tier truth.
- Bug reports send from inside the app now.
- Verify menu labels against the live `SettingsPanel.tsx` strings (Group vs Groups).
- All new copy per house style: short sentences, no em dashes, button names bolded
  exactly as rendered. The `Item` term separator stays as the existing typographic
  element.

---

## 2. The screenshots

**`public/instructions/*.webp`**, ~10 files, targeted at ≤40 KB each, 780 px wide
(390 @2x), captured from the real app seeded with a fictional demo group.

| File | Shows |
|---|---|
| `quick-schedule.webp` | A generated round, the payoff shot |
| `players.webp` | The player list with ratings and gender marks |
| `player-edit.webp` | The pencil dialog |
| `setup.webp` | Attendance ticked, Spots Filled line |
| `special-types.webp` | The three formats panel |
| `partners.webp` | One pair set |
| `round-card.webp` | Courts, Diff badges, padlock, Complete |
| `keypad.webp` | Score entry |
| `standings.webp` | The standings table |
| `actions.webp` | The Actions sheet open |
| `share-qr.webp` | The live share QR panel |

**`scripts/instructions-shots.mjs`** — the committed regenerator:

- playwright-core against the chromium already on disk, viewport 390×844,
  `deviceScaleFactor: 2` — per the established technique (`--window-size` does not set
  the viewport).
- Seeds the demo group by writing the `pb-*` localStorage keys from
  [src/lib/stores.ts](src/lib/stores.ts) before the app boots, then drives the UI to
  each state. The share QR renders client-side from a seeded `shareKey`, so no
  Supabase call is needed. The account chapter reuses the headless sign-in technique
  (session made in Node, keys written before boot) against a test account; if that
  proves fiddly, that one chapter ships text-only rather than blocking the rest.
- Emits WebP via `sharp`. Neither `playwright-core` nor `sharp` joins the repo's
  dependencies: the script header documents `npm i --no-save playwright-core sharp`,
  keeping the runtime list at six.
- Demo data uses invented names, mixed genders, ratings 3.0–4.5, so every screenshot
  looks like a real Tuesday night.

**Offline decision** — every file is named in `RUNTIME_CACHED_PUBLIC` in
[src/lib/precache.ts](src/lib/precache.ts), same tier as the Donate art: cached the
first time somebody looks, never precached, so the install stays at ~90 KB.
`precache.test.ts` fails until this is done, which is that test doing its job.

In the panel: `loading="lazy"`, explicit `width`/`height` so nothing shifts, alt text
that says what the picture shows.

---

## 3. Tests

- **`src/components/layout/InstructionsPanel.test.ts`** (new, headless like its panel
  siblings — no React Testing Library):
  - every topic row opens its chapter and Back returns;
  - every image path the panel references exists in `public/instructions/`
    (filesystem check, the `terms.test.ts` pattern);
  - tripwires: the copy no longer claims device-only storage, and mentions signing in
    while `ACCOUNTS_ENABLED` is true.
- **`src/App.walkthrough.test.ts`** — the Instructions step at line 3045 updated for
  the topic-list shape.
- **`precache.test.ts`** — passes again once the new files are listed.
- Tests are not typechecked by `tsc -b`; the suite itself is the check.

---

## 4. Verification

1. Run `scripts/instructions-shots.mjs`; confirm ~10 files exist, each ≤ ~40 KB, and
   read one back at pixel level rather than eyeballing.
2. `npm test`, `npx tsc -b`, `npx eslint src` (src only; never Prettier).
3. **Prove the guards by breaking them**: point one panel image at a missing file and
   watch the new test go red; restore the device-only sentence and watch the tripwire
   fire; drop one screenshot from `precache.ts` and watch `precache.test.ts` fail.
4. Real-browser pass with playwright-core: open Instructions, tap all nine topics,
   Back from each, ride every Next link to the end, then repeat with large text
   toggled on. Screenshot the topic list and two chapter pages and send them to Jeff.
5. Airplane-mode check on a built preview: view two chapters online, go offline,
   reload — the viewed images still render from the runtime cache.
6. Stop at the commit. No deploy without the word; `APP_VERSION` bumps in the deploy
   commit when that moment comes.

## Files touched

- `src/components/layout/InstructionsPanel.tsx` — rebuilt
- `src/lib/precache.ts` — ten new runtime-cached entries
- `scripts/instructions-shots.mjs` — new
- `public/instructions/*.webp` — generated
- `src/components/layout/InstructionsPanel.test.ts` — new
- `src/App.walkthrough.test.ts` — instructions step updated

## Build order

1. Capture script and the demo seed, until all ten shots emit clean
2. Panel rebuild against those files, chapter by chapter
3. Copy corrections and the two static-page cross-checks
4. Tests, then verification 1–5, then the commit
