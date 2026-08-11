# Session Notes

## 2026-08-05 / 06 — Setup warning, all-groups backup, mid-session Add Player

Five commits, all deployed to production. Version went 1.20.0 → **1.30.1**.

| Commit | What |
|---|---|
| `3f430a0` | Warn before leaving an edited schedule for Setup |
| `5a1e836` | Export and import every group in one file |
| `9637909` | Add a player to a session already under way (+ Reshuffle fix) |
| `ca789a2` | Stop two pairing tests failing at random |
| `748431d` | Start every step at the top of the page |

### What was built

**Setup confirmation.** The `← Setup` button on the schedule was a one-way door — Setup's only way forward is Generate, which rebuilds from scratch. It now confirms first, with "Keep Schedule" / "Go to Setup" rather than Cancel/OK. The prompt is skipped when there is nothing to lose: swaps and removals set a `pb-schedule-edited` flag (persisted, because a refresh would otherwise make an edited schedule look untouched), and completions/locks are read from state.

**All-groups export/import.** The CSV header already carried a `Group` column, so an all-groups file is the same format with more than one value in it — a row per player per group, so multi-group membership survives a round trip. `parseGroupCsv` became `parseGroupsCsv`. Splitting is deliberately conservative: a file naming one group or none stays a single group, preserving the lenient paths (legacy `players.csv`, spreadsheet-typed rosters). Import always creates new groups and never modifies existing ones.

**Add Player mid-session.** `+ Add Player` on the Sitting out line of the first unplayed round. The player is appended to sit-outs of every unplayed round; the host swaps them in or reshuffles. Candidates are group members not already playing, including anyone removed earlier.

### Decisions and findings worth remembering

- **Reshuffle used to destroy played rounds.** It picked its branch from a heuristic ("locks exist, so this is a reshuffle") that misfired whenever no padlocks were set, then rebuilt every round from a blank history and cleared the Completed checkboxes. Now split into `handleGenerate` (Setup) and `handleReshuffle` (Schedule), the latter running through `regenerateRemaining`. `reshuffleSchedule` was deleted — redundant once `regenerateRemaining` took locks, and it had no tests.
- **Sit-out order for latecomers needed no code.** `determineSitOuts` sorts by games played, most-played sits first, so a newcomer with none sorts last. With 9 players 4 rounds in, the 5 who haven't sat go first, then the 4 who have, then the newcomer — exactly the desired rule. Pinned by a test.
- **The import had to be one pass, not one call per group.** `usePlayers` closes over React state, so per-group calls would each read a stale pool and re-create players an earlier group added — precisely what an all-groups file is full of. Extracted to `lib/groupImport.ts` (`planImport`) so it is pure and testable.
- **Two pairing tests asserted probabilistic properties as absolutes** and failed ~1 run in 8 combined. Bounds are now measured: partner repeats ≤ 3 (2000 runs: 95% land on 2, rest on 3, never higher); rating cap asserts both "nothing above 0.75" and "≥90% within 0.5" (36000 courts: 0.044% exceed 0.5, never twice in one schedule). 60 consecutive clean runs after.

### Gotchas

- **`npm run lint` is unusable** — 5+ minutes, ~9,565 errors, all from `node_modules_OLD_BACKUP` (2,263 `.ts` files). ESLint's default ignore is `**/node_modules/`, which that name misses. Use **`npx eslint src`** instead. One-line fix available but not applied: `globalIgnores(['dist'])` → `globalIgnores(['dist', 'node_modules*'])` in `eslint.config.js`.
- **The Vercel CLI token is invalid** (`npx vercel --prod` fails with "The specified token is not valid"). Deploys happen by **pushing to `main`** — Vercel builds from git. Deployment status can be read through the Vercel MCP connector; ids live in `.vercel/project.json`.
- `APP_VERSION` in `src/lib/appInfo.ts` must move with every deploy — it shows in the footer and on every bug report.

---

## 2026-08-06 — The walkthrough, run headlessly

The end-to-end walkthrough is done, as an automated driver rather than by hand.
`src/App.walkthrough.test.ts` mounts the real `App` in happy-dom and clicks
through it — 7 tests, no new dependencies (`react-dom/client` + `act`, no React
Testing Library). It covers walkthrough steps 1–6:

| Step | Covered by |
|---|---|
| 1, 2 | All-groups export captured from the Blob, then re-imported into a cleared install. Four rows for three players, Ava twice; on import she arrives **once** with both `rosterIds`. |
| 3 | 9 players / 2 courts, Generate, tick rounds 1–3, Reshuffle. Rounds 1–3 identical by fingerprint and still ticked; rounds 4–8 provably changed. |
| 4 | 10 in the group / 9 playing. Add Player appears on round 4 only, lands in sit-outs of 4–8 and none of 1–3, swaps onto a court by tapping, and after Reshuffle the round-4 sitters are all people who have not sat. |
| 5 | 8 playing / 2 courts: no "Sitting out" label, `+ Add Player` still shown. A removed player reappears as the sole Add Player candidate. |
| 6 | `window.scrollTo(0, 0)` spied on across both step changes. |

Plus the Setup confirmation: silent on an untouched schedule, "Go back to Setup?"
once a round is ticked, Keep Schedule preserves it, Go to Setup leaves.

- **The tests have teeth.** Deleting the `return r` that keeps completed rounds
  verbatim in `regenerateRemaining` fails steps 3 and 4 — the driver would have
  caught the original Reshuffle bug.
- **No flake.** 25 consecutive clean runs of the file, twice.
- **`vitest.config.ts` claimed "Playwright drivers in e2e/".** No `e2e/`
  directory has ever existed in any commit. Comment corrected.
- **Scoping matters when driving the DOM.** The roster page behind the
  Import/Export overlay has its own `<select>`, so an unscoped
  `querySelector('select')` reads the wrong control. Helpers scope to the
  overlay that contains the button being clicked.

Nothing shipped in the last session was found broken.

---

## 2026-08-06 — Special Game Types: three formats, not one

Three commits, all deployed. Version went 1.30.1 → **1.40.1**.

| Commit | What |
|---|---|
| `8cdb839` | Add mixed and equal skill games alongside gendered |
| `87d5ef1` | Version bump the first commit should have carried |
| `e649f0f` | Let a special game type land on round 1 |

### What was built

Setup's single **Play Gendered Games?** question became a **Select Special Game Types** panel holding three formats, each with its own Yes/No, its own "every N rounds", and its own badge colour on the schedule: Gendered (purple), Mixed (teal), Equal Skill (amber).

**The round plan.** Two types can fall due on the same round, so a modulo test no longer works. `planRoundTypes` in `src/lib/roundTypes.ts` walks the session: every enabled type wants round 1, then another every N rounds. On a clash the **rarer** type (bigger N) takes the round, and the loser slides to the very next round and counts on from there rather than being skipped. Sort order is rarest → longest waiting → fewest turns so far → the host's own order.

**Two new formats** in `src/lib/specialRounds.ts`. Mixed pairs each man with a woman, greedy on least-met pairs plus random restarts. Equal Skill sorts by rating and carves into bands of four, shuffling players within one 0.25 step of each other so repeated skill rounds are not the same foursome. Gendered was rewritten.

**Missed-out tracking.** Where the roster cannot fill every court with the format, it fills what it can and plays the rest as normal, recording who missed. `PairingHistory.specialMissCounts` (replacing `genderedMixedCounts`) puts them first next time that type comes round.

**Set Partners is filtered, not cancelled.** Two men stay together on a gendered round, a man and a woman on a mixed one, similarly rated players on an equal-skill one. Anyone else is split for that round alone.

### Decisions and findings worth remembering

- **"Every N rounds" now counts from round 1**, not from round N. It shipped counting from N, and Jeff found within the hour that with two types on, both dropdowns floored at 2 meant **round 1 could never be special**. The same root cause meant a session shorter than the frequency got nothing at all — every 4 rounds over 3 rounds produced no special round. Changing the seed to 1 fixed both.
- **Unlocking the frequency to 1 needed two more tie-breaks.** With two types both at every 1 round the old sort fell through to a fixed order and the same type won every round forever: `G G G G G G G G`. Adding "fewest turns so far" fixed it. That rung **must** sit above the host's chosen order — put their order higher and whatever is on top wins every tie for the whole session, which is the same starvation bug in a new costume. A test sweeps 30 rounds over five frequency combinations and four orderings.
- **Rarity has to outrank the host's order too**, which means reordering only settles a genuine tie. With Gendered every 4 and Mixed every 2, moving Mixed to the top changes nothing. The Setup preview is the answer to that: it lists the actual round numbers, read from the plan itself so it cannot drift from what Generate builds.
- **Reordering is ↑/↓ buttons, not drag.** iOS Safari has no HTML5 drag-and-drop, so a drag handle would be dead exactly where this app is used.
- **The old gendered court budget had a real bug.** Women's courts were allocated greedily first, so 12 women and 4 men on 3 courts gave the women all three and stranded the men in the sit-outs. Now shared out to maximise total gendered courts.
- **The walkthrough fixtures had the wrong gender values** — `'male' | 'female'` where the type is `'M' | 'F'`. Harmless until this session, because nothing in the walkthrough touched gender; no gendered or mixed assertion could ever have passed. Fixed.
- **`pairing.ts` was split.** The court-filling primitives moved to `src/lib/assign.ts` so the three special formats could reuse them without a circular import. `pairing.ts` is now only "how a session is built round by round" and dropped from 758 to ~270 lines.
- **Test files are excluded from `tsconfig.app.json`**, so `npx tsc --noEmit` will not catch a signature change breaking a test call site. Only `npx vitest run` does. Two test files broke silently on the `generateSchedule` signature change.
- **`APP_VERSION` was forgotten on the first deploy** and needed a follow-up commit. It is documented in `appInfo.ts` but nothing in the act of pushing reminds you.

### Gotchas (still true)

- `npm run lint` is unusable; use **`npx eslint src`**.
- Deploys are a **push to `main`**; the Vercel CLI token is still dead. Status via the Vercel MCP connector, ids in `.vercel/project.json`.
- Pairing tests are probabilistic — measure bounds before asserting them. The new special-format tests were run 8× and the full suite 6× before shipping.

---

## 2026-08-07 — Shipped as 1.50.0

One commit, `b8a1d67`, deployed to production and verified by fetching the live
bundle: it serves 1.50.0, carries the off-format note, the new title size, and
all four of Jeff's SVG paths.

---

## 2026-08-07 — The printout, checked on paper

Followed up the "nobody has printed a Mixed or Equal Skill round yet" flag by
actually printing one. A throwaway driver mounted the real App with all three
types on, wrote `.print-only` out to a file, and Chrome turned it into a PDF
with the real built CSS. That is the first time this output has been looked at
rather than asserted.

**The formats themselves came out right.** Equal Skill banded 13 players
correctly and arranged each band differently on its second outing. Mixed put a
man and a woman on every team. Sit-outs rotated one per round with nobody
twice.

**What the paper showed up:** on a gendered round with six men and six women
over three courts, two courts are gendered and the third is the four players
left over, who play an ordinary game. The printout labelled the whole round
"Gendered Round" and said nothing about court 3, so it read as a bug. Same on
screen. Six of each on three courts is an ordinary Tuesday, so this was going to
be asked about.

Courts the format could not fill are now marked: a grey **Normal game** tag
beside the court number on screen (with a title explaining why), and
**(normal game)** after the court on paper. `isCourtOfType` already existed
inside `pairing.ts` for the missed-out counts; it moved to `roundTypes.ts` as
`courtMatchesType` so the schedule and the printout ask the same question the
scheduler asked. A skill round never marks anything, because every court in one
is a band by construction.

The print tables also got `table-layout: fixed` with a 26% court column. The
extra text was widening that column, so a round carrying the note came out with
its Serving and Receiving columns shifted against every other round.

### Worth remembering

- **The print path had never been rendered.** Driving the App headlessly and
  handing `.print-only` plus `dist/assets/*.css` to
  `chrome --headless --print-to-pdf` is a two-minute check and it found
  something in the first read. Worth repeating whenever print changes.
- The gendered leftovers are unavoidable, not a scheduling failure: six men
  make one court of four with two spare, and the same for the women. Nothing to
  fix in the pairing, only in what the page says.
- **A flaky skill test was fixed on the way past.** "Keeps the rating spread far
  tighter than an ordinary round" compared the worst skill round against the
  *tightest* ordinary one, and both sides are random. Measured over 300
  schedules: the widest skill court is 0.625 every single time, while the
  tightest ordinary round dips to 0.625 about once in 300 — a tie, and
  `toBeLessThan` fails on ties. It now asserts the 0.625 ceiling directly and
  compares against the ordinary *mean* (never below 1.28 in 300 schedules).
  20 clean full-suite runs after.
- Vitest here swallows `console.log`. Measuring anything means writing the
  numbers to a file.

---

## 2026-08-07 — Icons on the Players step

Jeff asked for icons in seven places and for "My Groups" to be sized like
"Add Player". All drawn inline in a new `src/components/icons.tsx`, so the app
still ships no icon library. They take the colour of the text beside them, grey
against a heading and white inside a button.

| Where | Icon |
|---|---|
| Left of each step tab | person, sliders, clipboard |
| Right of "My Groups" | folder, for the list of groups rather than one group |
| Right of "Add Player" heading | person, the same one the Players tab carries |
| Right of the group name in the roster panel | people |
| Left of the Add Player button | person with a plus |
| Left of the Select Players button | ticked list |

The Update button, which is the same element as Add Player when a player is
being edited, keeps its bare label. A person-with-a-plus on a save button tells
the wrong story.

Then Jeff supplied a design (`INBOX/Players Tab.png`) and the tab strip was
rebuilt to match it: a light grey track, the live step raised on a white card
with a pale green border, a short thick green bar flush with the bottom of that
card, a hairline between the two idle tabs, and solid Material glyphs — filled
group, outlined cog, outlined calendar. Colours were sampled out of the
screenshot pixel by pixel rather than guessed at, and live in named constants at
the top of `StepIndicator.tsx`.

### Worth remembering

- **Sample a design, do not eyeball it.** `sips -s format bmp` turns a PNG into
  something a dozen lines of JavaScript can read directly, so the track, border,
  text, icon and bar colours came out of the image itself. Rendering the result
  at the same scale and stacking the two into one image is what showed the
  labels were still 30% too large.
- **The design's label is smaller than the app's usual `text-sm`.** It went to
  `text-xs` rather than a hand-set pixel size, because `--text-xs` is one of the
  sizes large-text mode scales and a bespoke `text-[11px]` would have been frozen
  at 11px for someone who needs it bigger.
- **The step tabs are the tightest row in the app.** Three labels and three
  icons on a phone. `whitespace-nowrap` there is a trap: a tab that cannot fit
  makes the whole page wider than the screen and everything else gets clipped
  with it. Wrapping is the lesser evil, and the nav's own padding was tightened
  to buy the room. At 360px the labels sit on one line with icons; at 320 they
  wrap, exactly as they did before icons existed.
- **`chrome --headless --window-size` does not set the layout viewport.** Pages
  lay out around 800px wide however small the window, and the screenshot then
  crops that, which looks exactly like a page overflowing its screen. This cost
  a wrong diagnosis. To check phone layout, wrap the markup in a fixed-width
  `<div style="width:390px">` and screenshot a wider window. Media queries still
  will not fire, so that trick is only good for layout that is purely
  width-driven.

---

## 2026-08-07 — A visual pass over the whole app

Jeff drove this one instruction at a time, checking each against his phone. In
order: the tab strip rebuilt from his design, icons on the Players step, the
main area and panel padding halved sideways, panel borders, popup borders, grey
button borders, panel titles unified, popup titles matched to them, and his own
SVG artwork swapped in wherever he had it.

**Where the values came from.** Colours were sampled out of his screenshot pixel
by pixel — `#f4f5f7`, `#cde6d5`, `#178c15`, `#3aa641`, `#61697c`, `#6f768d`,
`#dee1e7` — and the rest are his: `#ddd` panel borders, `#444` popup borders,
`#999` on grey buttons and steppers, `#222` titles, `#60697c` heading icons.

**Panel titles** are one style now: `text-[1.35rem] font-extrabold text-[#222]`,
across nine page panels and eleven popups. A completed round's title keeps its
grey, because that grey is what says the round has been played.

**Icons** live in `src/components/icons.tsx`, all filled paths, no library. Four
are Jeff's own artwork taken across untouched: the group (`My Groups.svg`), the
ticked box (`checkbox.svg`), the chain link (`link.svg`) and the gender symbols
(`mixed.svg`). The step tabs use Material Symbols shapes. The two Add Player
glyphs are still drawn by hand, waiting on a real SVG.

### Worth remembering

- **An `.svg` file is not necessarily vector.** `Select Players.svg` held three
  base64 PNGs in an SVG wrapper and no paths at all — using it would have put
  raster artwork back in. Check for `<path` before trusting a file; `<image ...
  data:image/png;base64` is the tell.
- **Padding that measures equal can still look uneven.** The panels had 24px top
  and bottom, but the visible gap was 31.5 above and 25.5 below, because a
  heading's line box carries empty space above the capitals. The top padding is
  18px now and the gaps match. Measure the ink, not the CSS.
- **Sizes are written as arbitrary values on purpose** (`text-[1.35rem]`,
  `w-[30px]`). Tailwind only generates a class it can see written in the source,
  so these cannot be built from constants or interpolated.
- **`chrome --headless --window-size` does not set the layout viewport** — see
  the entry above. Wrapping the markup in a fixed-width div works for normal
  layout, but `position: fixed` escapes it, so popups need
  `.phone .fixed { position: absolute }` pinning them into the wrapper first.

---

## 2026-08-07 — The Donate popup, rebuilt from a mockup

Two changes. First a small one on the Setup step: the Special Game Types block
moved below the "N players will sit out each round" line, and its button gained
`min-h-10` so it stands the same 40px as the courts and rounds steppers.

Then the Donate popup, rebuilt from `INBOX/Donate Mockup.png`. It was a plain
`#444` box; it is now a `max-w-md` `rounded-2xl` card with a `#B7DBB8` border,
Jeff's coffee-cup illustration and heart separator, a tinted callout carrying
the Ko-fi address, a gradient green button and a soft grey Close. The copy and
the URL were already what the mockup showed, so nothing there changed. On a
follow-up the callout became a link too, with the same `href`, `target` and
`rel` as the button, so the panel showing the address is also the address you
can tap.

**Where the values came from.** Sampled pixel by pixel out of the mockup: card
`#FBFDFA`, border `#B7DBB8`, callout `#EFF7ED` on `#D8EBD4`, badge `#CDE7C7`
with the glyph in `#166534`, button `#1AAA3A`→`#0D8D31` rimmed `#0A7A29`, Close
`#F7F7F7`→`#EFF0F0` on `#CACBCF`, title `#032C26`.

**Assets.** `Donate-Top-Image.png` and `donate-separator.png` went to `public/`
as `donate-top.png` and `donate-separator.png`. `share.svg` is real vector and
is inlined as `LinkIcon` with its fill changed to `currentColor`. The mug on the
button started as hand-drawn inline SVG; it was replaced later the same day with
Jeff's own artwork, see the next section.

**Scope.** Jeff chose "Donate only, for now". Share, Install, Feedback and the
rest still use the `#444` popup border, so Donate deliberately does not match
them yet.

### Worth remembering

- **Jeff's two PNGs are opaque** — PNG colour type 2, no alpha channel, corners
  sampling `#FBFDFA` to `#FCFEFB`. That is the whole reason the card background
  is a flat `#FBFDFA` rather than the mockup's faint gradient: on a gradient
  each image would show as a visible rectangle. Check the colour type before
  assuming artwork will composite.
- **You cannot infer a font size from ink height in a mockup render.** Working
  back from band measurements gave three different answers for the card width,
  and acting on one of them shrank the title to `text-3xl` when `text-4xl` had
  been right all along. The two signals that do hold up: a paragraph whose line
  breaks land in the same places, and two crops crushed to the same card width
  and set side by side. Everything else is a guess dressed up as arithmetic.
- **Tailwind preflight quietly broke the comparison harness.** `img { max-width:
  100% }` capped the mockup image inside its `overflow:hidden` clip, shrinking it
  about 17% and making Jeff's type look smaller than the build's. That produced a
  wrong diagnosis and a wrong fix before it was caught. Any image positioned
  inside a clip on a page that loads the app CSS needs `max-width: none`.
- **Ask the DOM for geometry instead of counting pixels.** `chrome --headless
  --dump-dom` plus a load-time script that writes `getBoundingClientRect` values
  into `document.title` returns exact heights and gaps for every child of the
  card. It is faster and truthful where pixel bands are ambiguous.
- **Rendering one component, not a whole step.** Where the earlier trick mounted
  the App in a throwaway vitest file, a single popup is quicker to reach with
  `esbuild` on a scratch entry using `--external:react --external:react-dom
  --external:react/jsx-runtime --external:react-dom/server`, the bundle written
  into the project root so node resolves `node_modules`, then
  `renderToStaticMarkup`. Rewrite `/foo.png` to `file://…/dist/foo.png` first or
  the images 404 in the screenshot.

---

## 2026-08-07 — Jeff's coffee cup, and 1.60.0 shipped

One change, then the deploy. The hand-drawn SVG mug on the "Open Ko-fi" button
was replaced with `INBOX/coffee-cup-icon.png`, so the button now carries Jeff's
own artwork rather than an approximation of it.

**Preparing the PNG.** The source is 1536×1024 at 2.1MB, almost all of it empty.
An alpha bounding box at `alpha > 0` came back 1513×1024, which is nearly the
whole canvas: there is a near-invisible noise halo out to the edges. At
`alpha > 8` it settles to 817×741, and stays there through `alpha > 200`, so
that is the real art. Cropped to it, resized to 123×112 (a 4× buffer over the
32px it renders at), saved as `public/donate-cup.png` at 18KB.

`CupIcon` is gone from `DonatePanel.tsx`, replaced by an `<img>` at `h-8 w-auto`
with intrinsic `width`/`height` so it reserves space before load. `h-8` rather
than the old `h-7`, chosen by screenshotting all three sizes against the 18px
label. The SVG's `#0D8D31` heart-knockout trick is no longer needed — the
artwork already has a green heart on a white cup, so it reads the same way
against the green gradient.

**Shipped.** `04f7915` on top of `2389e8f`, both pushed together, deployed as
`1.60.0`. No re-bump: `2389e8f` had already set 1.60.0 and had never shipped, so
this push was still that version's first appearance.

### Worth remembering

- **Nothing in the test suite touches the Donate popup.** Grep across all 13
  `*.test.ts` files returns no match for "donate". Its three images have no
  automated safety net at all, so `git show --stat HEAD` before pushing is the
  only thing standing between a rename and a deployed broken image.
- **Verify the deploy against the live host, not the apex.** `pbroundrobin.com`
  308-redirects to `www.`, so a `curl` without `-L` returns a text/plain redirect
  body. Hashing that against the local PNG produces a mismatch that looks like a
  bad deploy and is not. The real check: `curl -sL` the asset, compare sha256
  with the file in `public/`, and grep the live JS bundle for `APP_VERSION`.
- **Pillow is not installable into the system python3.** PEP 668 blocks
  `pip install`; `python3 -m venv` in the scratchpad is the way to get it. Worth
  the setup — `sips` cannot compute an alpha bounding box, which is the whole job
  when cropping generated artwork.
- **Rendering one component, the working recipe.** `esbuild` the entry with
  `--bundle --format=cjs --platform=node --jsx=automatic` and react externalised,
  `--outfile` into the project root so node resolves `node_modules`, then
  `renderToStaticMarkup` to stdout. Wrap the markup with the built
  `dist/assets/*.css` inlined and rewrite each `/foo.png` to a URL-encoded
  `file://…/dist/foo.png` — the path has spaces in it, so an unencoded file URL
  silently fails to load. Screenshot headless Chrome with
  `--allow-file-access-from-files`. Delete the bundle from the project root
  afterwards.

---

## 2026-08-07 — Analytics, and a custom domain

Two changes, shipped together as `1.60.1`.

**Vercel Analytics.** `npm i @vercel/analytics`, then `<Analytics />` in
`main.tsx` beside `<App />`. The screenshot Jeff supplied has a framework
dropdown in its top-right corner reading **Next.js**, which is why the snippet
he quoted was `@vercel/analytics/next`. That path does not resolve in a Vite
app. The package ships one entry per framework — `./react`, `./vue`, `./astro`,
`./remix`, `./sveltekit`, `./nuxt`, `./next`, `./server` — and this app wants
`./react`. Read them off the package's own `exports` rather than guessing.

**The domain.** `APP_URL` moves from `pickleball-round-robin.vercel.app` to
`https://app.pbroundrobin.com/`. One constant covers both share routes, the OS
sheet through `share.ts` and the fallback panel that displays the address, which
is what the comment on `APP_URL` promised when it was written.

**Jeff typed the host as `wpp.pbroundrobin.com`.** It has no DNS record at all.
`app.pbroundrobin.com` does, and served the exact production bundle, so it was a
one-key typo (`w` sits next to `a`). Confirmed with him before shipping rather
than guessed, because a wrong `APP_URL` hands a dead link to everyone he shares
with and nothing in the app would notice.

### Worth remembering

- **The apex and `www.` now 404.** Both served the app earlier the same day;
  reassigning the domain moved the alias to `app.` and left the other two
  unattached. Jeff knows and chose to leave it. The consequence for us is that
  "the live site 404s" is not by itself evidence of a bad deploy — check which
  host is actually attached first.
- **Proving a runtime-injected script really mounted.** Grepping the bundle only
  shows the code shipped. `chrome --headless --virtual-time-budget=8000
  --dump-dom <url>` renders the page and dumps the DOM after hydration, where the
  injected tag appears as `<script src="/_vercel/insights/script.js"
  data-sdkn="@vercel/analytics/react" data-sdkv="2.0.1" defer>`. The `data-sdkn`
  attribute is the package naming its own entry point, so it doubles as proof the
  right one was used.
- **`@vercel/analytics` has zero dependencies** and appears in none of the repo's
  11 audit findings — those are all pre-existing dev toolchain (vite, esbuild,
  babel, postcss, rollup). Worth checking attribution before an install gets
  blamed for a scary `npm i` summary.

---

## 2026-08-07 — The Share popup, and the panel nobody was seeing

Rebuilt from `INBOX/Share-Mockup-3.png`: hero illustration, a warmer
two-sentence pitch, a two-line Copy button with a copy glyph, and a footer line
flanked by a star and a paddle. The address comes from `APP_URL`, so it shows the
new domain rather than the mockup's `vercel.app`, and the Copy button's second
line is Jeff's wording, not the mockup's. The card keeps the 3px `#444` border —
Jeff confirmed he meant "don't bother matching the mockup's border", not "go
borderless".

**The finding that changed the job.** `handleShare` called the OS share sheet
first and only opened the panel when the outcome was `unsupported` or `failed`.
On phones, and on Chrome and Safari desktop, the sheet took over — so this
redesign would have shown mainly to Firefox desktop. Jeff chose to make the panel
primary and keep the sheet as a button inside it. `canShare()` is new in
`share.ts` so the button can be left out entirely where there is no sheet rather
than offered as a dead control.

**Icons.** Jeff's star, paddle, copy and green-heart SVGs are inlined into
`icons.tsx` on the grids they were drawn on. Two existing icons got untangled at
the same time: `DonatePanel`'s local glyph was an external-link mark rather than
a share mark, so it is now `ExternalLinkIcon`, and `SettingsPanel`'s share glyph
moved into `icons.tsx` as `ShareIcon` — the drawer item and the panel button are
the same action seen twice and must not drift.

**Coverage.** 177 → 185 tests. Three for `canShare`, five walking the real App
through Share App. Worth noting the old behaviour had **no test at all**, so
nothing would have caught the change either way.

### Worth remembering

- **The green heart is a disc with a heart-shaped hole**, not the solid 💚 the
  mockup draws. `fill-rule="evenodd"` is what makes the second subpath a hole;
  drop it and the icon renders as a plain green circle. Jeff picked the SVG over
  the emoji so it looks the same on every platform.
- **Ratios measured off a mockup do not agree with each other.** Element widths
  as a fraction of the mockup's card, solved back against the browser's own
  metrics, implied card widths of 355, 379, 465, 488, 525 and 539px. The mockup
  is set in a narrower face than the app ships, so this is the font, not a bad
  measurement. Settled on `max-w-md` from what had to be true: a footer that fits
  on one line and a heading at the mockup's 43.5% of card.
- **An iframe is how you get a real phone viewport.** `--window-size` does not
  set it, but `<iframe width="390">` gives its document a genuine 390px viewport
  where `mx-4`, `max-w-*` and `position:fixed` all behave properly. Reach in with
  `contentDocument` to read geometry. At 390 the card is 358 and nothing
  overflows; the footer wraps to two lines, which reads fine.
- **`globalThis.navigator = {...}` silently does nothing on Node 18+** — it is a
  read-only accessor, so `Object.defineProperty` is required. Without it every
  SSR render came out in the no-sheet state and I screenshotted two identical
  panels believing they differed. The harness now throws if the with-sheet render
  lacks the string only it should have.
- **A Tailwind colour in a template literal's base is not overridden by the
  branch.** Both classes end up in the class list and the stylesheet's order
  decides, not yours. `text-white` in the base under a `text-[#3D495A]` branch
  painted the Copy button's title white on white. Set such properties once, per
  branch.
- **`share-top-image.png` is colour type 2, no alpha**, corners `#FEFEFE`, which
  is why the card is `bg-[#FEFEFE]` and not `bg-white`. The seam is one value out
  of 255 — below what anyone can see — but matching it costs nothing.

---

## 2026-08-07 — The app icon in share previews

Jeff shared the app from his phone and the iOS share sheet put Safari's generic
compass next to the link instead of the robin.

**Cause.** `index.html` had **no Open Graph tags at all**. iOS builds that
thumbnail by fetching the page and reading `og:image`; with nothing to read it
falls back to the generic browser icon. The page did declare favicons and an
`apple-touch-icon`, which is the easy thing to assume covers this — it does not.
The share sheet does not use either.

**Fix.** A full `og:` and `twitter:` set pointing at `/icon-512.png`, plus the
`meta description` the page had also been missing. Shipped as `1.60.3`,
`cbb9b23`.

### Worth remembering

- **The public host now lives in two files.** `APP_URL` in `appInfo.ts` and again
  in `index.html`'s `og:url` and `og:image`. Scrapers have no page context to
  resolve a leading slash against, so those must be absolute, and static HTML
  cannot import a constant. Both files carry a comment pointing at the other.
  This matters because the domain already moved once today.
- **`twitter:card` must be `summary`, not `summary_large_image`.** The icon is
  square; the large card crops to 1.91:1 and would letterbox the robin.
- **`public/share.png` is not a social image** despite the name. It is the
  screenshot of the iOS share sheet used by `InstallPanel` to illustrate "Add to
  Home Screen". The app icon is `icon-512.png`.
- **iOS caches link previews per URL and per device**, so the old compass can
  persist after a correct deploy. Appending a query string produces a URL iOS has
  not seen and forces a fresh fetch. Do not read a stale preview as a failed fix.

---

## 2026-08-08 — My Account, rebuilt from a mockup

Three deploys. Version went 1.90.0 → 1.90.1 → 1.90.2 → **1.9.1**.

| Commit | Version | What |
|---|---|---|
| `ca7a21f` | 1.90.1 | Sync note wording change, as asked |
| `997cba3` | 1.90.2 | Same note, corrected |
| `d22390d` | **1.9.1** | My Account rebuilt as three panels, new share banner |

### The wording round trip, worth reading before touching that string again

Jeff asked to change "Your groups and players are saved to your account" to
"…**haven't** saved to your account", and it shipped as 1.90.1. That string
lives in the `saved` branch of `SyncNote()` — the **success** state, rendered in
a green box. It only draws when the outbox is empty and everything has gone up.

The flag went out with the deploy but landed at the bottom of a long message.
Jeff hit it on his phone the next morning and asked why the app was telling him
his data had not saved. It now reads "have been saved to your account."

**The lesson is about where a caveat goes, not about the copy.** A warning that
the change contradicts the state it renders in belongs in the first line, not
under a list of verification output.

### The rebuild

The account popup was the one panel never brought up to the Donate/Share
standard: `border-[3px] border-[#444]`, a `text-[1.35rem]` heading, `text-sm`
grey copy, no hero, and Change email / Sign out / Close as three identical grey
slabs. Jeff's word was "confusing and unattractive".

It is now three screens instead of eight states in one card:

- **`SignInPanel`** — the mockup: hero, "My Account", green "You are not signed
  in", three icon rows, `you@example.com` placeholder, solid green CTA, the
  "New here?" couplet, lock plus "No password needed."
- **`AccountPanel`** — now a router plus the signed-in screen. Change Email and
  Sign Out became two-line rows, so they read as a list against the one Close
  button.
- **`MergeChoicePanel`** — the decision takes the whole card, **no Close and no
  backdrop dismiss**. As a note above Sign out, the easiest thing to do with the
  most consequential question in the app was walk past it.
- `AccountShell.tsx` and `accountStyles.ts` hold the shared card and tokens.
  Tokens are a plain `.ts`: a `.tsx` exporting both components and constants
  trips `react-refresh/only-export-components`.

Four icons went into `icons.tsx` verbatim from Jeff's SVGs (`My Groups.svg`,
`sync.svg`, `security.svg`, `lock.svg`). The mockup drew a pale green disc
behind each and Jeff cut it, so the icons carry the green alone.

**Colours were sampled, not eyeballed:** green `#3D7E34` from the button fill,
confirmed against the icon glyphs at `#3E7A33`; card `#FEFEFE`, which is also
the background `Account-top.png` was exported against.

### Two faults only the render showed

- **The green button drew itself in its disabled colour the moment the panel
  opened**, because it was disabled until you typed — the exact "looks dead"
  fault just criticised in the old panel, reintroduced. It now stays solid and
  validates on tap, in all three places that pattern appeared.
- **The merge counts wrapped unevenly.** "2 groups, 14 players" broke to two
  lines at 390px while "1 group, 9 players" did not, so the two halves of the
  comparison sat at different heights. Label now sits above value.

Neither is visible in the source. Both were obvious in a screenshot.

### The share banner, and a comment that had gone false

`index.html` documents a check: iOS square-crops the middle of `og:image` for
its share sheet, so the important content must sit inside the centre 630×630.
**Running that crop is the whole point of writing it down.** Jeff's first
replacement put the type hard right and the crop cut it to "Pickleba / Round Ro
/ Generato". He supplied a recomposed version; that one keeps all three lines of
the name, the tagline, the badge and the address.

The robin now falls outside the square. The comment claimed the robin *and* the
type both survive, and `og:image:alt` said the robin sat *above* the name. Both
were corrected — left alone, the next person to recompose that artwork would
have followed a note that no longer described the file.

### Worth remembering

- **Look at every state, not the one you changed.** A harness that stubs
  `lib/auth` and `lib/sync` (esbuild `onResolve` redirecting `/lib/(auth|sync)$/`
  to stub modules), mounts the real panel in happy-dom, drives it with `act()`
  and writes each state's `innerHTML` out, renders all eight in about four
  seconds. It found both layout faults above.
- **Resolve the hashed CSS filename, never pin it.** `dist/assets/index-*.css`
  changed hash between two runs; the pinned path screenshotted stale CSS and
  showed none of the new classes. `readdirSync(DIST).find(f => f.endsWith('.css'))`.
- **`fileURLToPath`, not `.pathname`.** The project path contains spaces, so
  `new URL(...).pathname` percent-encodes and esbuild silently wrote its bundle
  into a directory that does not exist. Same trap as the `file://` URLs, in a new
  place.
- **A harness that matches buttons by label is coupled to the copy.** Renaming
  "Change email" to "Change Email" broke the render mid-run, and the screenshot
  step then quietly used stale markup. `startsWith` plus checking the render
  actually completed.
- **Jeff reset the version series to `1.9.1`.** By the documented scheme 1.90 →
  2.0.0 was next; he chose 1.9.1 instead. It sorts *below* the 1.90.2 it
  replaced, which was flagged and accepted, so bug reports spanning the two will
  look out of order. Carry on from 1.9.1.

---

## Snapshot — 2026-08-07 (superseded, kept for its design backlog)

**`1.60.3` is live at https://app.pbroundrobin.com.** The app also moved to a
custom domain today. Five commits went out across four deploys:

| Commit | Version | What |
|---|---|---|
| `2389e8f` | 1.60.0 | Donate popup rebuilt from the mockup, Special Game Types moved below the sit-out line |
| `04f7915` | 1.60.0 | Jeff's coffee cup on the Ko-fi button |
| `04381dc` | 1.60.1 | Vercel Analytics, and `APP_URL` moved to `app.pbroundrobin.com` |
| `bfe1a5f` | 1.60.2 | Share App popup rebuilt, and opened on every browser rather than as a fallback |
| `cbb9b23` | 1.60.3 | `og:`/`twitter:` tags so share previews show the app icon |

Suite is **185 tests** across 13 files, up from 177. `tsc -b`, `npx eslint src`
and the full suite all pass.

**Every deploy was verified against the live site, not a READY build.** The live
bundle carries `1.60.3`; `/share-top.png` and `/donate-cup.png` both return 200
with sha256 matching the files in `public/`; the three Donate images return 200;
all fifteen `og:`/`twitter:` tags serve and `og:image` returns 200 `image/png`;
and a headless DOM dump shows the app rendering with the analytics tag injected
as `data-sdkn="@vercel/analytics/react"`.

**In progress:** nothing mid-edit. The tracked tree is clean and in sync with
`origin/main`.

**Immediate next step:** nothing queued. Jeff has been working through visual
tweaks one at a time, so more of those are likely. Analytics started from zero
when it went live at 1.60.1, so there should be real numbers to look at now.

**Half-finished from the design, if he asks:**

- Gendered Games and Equal Skill Level Games have no icon in the Special Game
  Types panel. `TYPE_ICONS` in `SpecialTypesPanel.tsx` takes one per type; only
  `mixed` has artwork so far.
- The Add Player glyphs, heading and button, are still hand-drawn. `Add
  Person.png` is in INBOX but it is a PNG, so it is waiting on a real SVG.
- `Partners.svg` arrived and has not been used anywhere. Unclear what it is for.
- His design puts the heading icons on the **left**; ours are on the right,
  because he asked for that before the design arrived. He has not asked to move
  them.
- His design shows a pale blue circle behind the group-name icon, a green bar
  down the left of the My Groups card, and a green tint on that panel. None of
  those are built.
- Instructions and the settings drawer were left out of the border and title
  work: both are white text on green, not cards.

**Worth watching now it is in real use:**

- Equal Skill still has the least real-world exposure, though the paper check
  showed it banding a 13-player group correctly and varying the foursomes
  between rounds. A group where everyone is 4.0 still behaves like a normal
  round, which is correct but does not look like anything is happening.
- Reordering only settles a tie. If Jeff moves a type up and the preview does
  not change, that is the rarity rule, not a bug.
- `FEATURE WISH LIST` holds one item and it is cut off mid-sentence: a left
  slide-out menu, "the main screen should move over 75% of the way, so you can
  still see the d". Needs finishing before it can be built.
- Jeff's icon artwork lives in the untracked `INBOX/`, and `icons.tsx` cites
  those filenames in its comments. The paths are inlined so nothing breaks, but
  the sources are not in git. See the open decision below — this was raised at
  the end of the session and not settled.

**Open questions / pending decisions:**

- **Whether to commit the untracked files, and which.** Raised at the end of the session and left undecided. Four candidates: `INBOX/` (11MB, 29 files — the source artwork behind every inlined icon, currently on Jeff's Mac only), `.claude/skills/` (36KB, a senior-frontend skill), `FEATURE WISH LIST` (4KB), and `session-notes.md` (40KB). `.claude/settings.local.json` holds machine-specific permissions and should be gitignored rather than committed. The `INBOX/` half is the real decision: 11MB in git history is permanent, and roughly 8MB of it is one-time mockup screenshots rather than reusable source art. Nothing is blocked either way; the tracked tree is clean and everything shipped.
- **A wide social banner, if Jeff wants one.** `og:image` currently points at the square `icon-512.png` with `twitter:card=summary`, which is right for the iOS share sheet. A 1200×630 card would look better in Messages and Slack previews, but it needs artwork that does not exist yet — the robin plus the app name, composed. Offered, not started.
- Whether to apply the `eslint.config.js` ignore fix, or delete `node_modules_OLD_BACKUP` outright (147MB, believed dead).
- Whether test files should be typechecked. They are excluded from `tsconfig.app.json`, which is why two broken call sites got past `tsc` this session.
- An empty group cannot survive an all-groups round trip: a row-per-player CSV cannot represent one. Accepted, not fixed.
- Minor accepted edge case: removing a player then re-adding them empties `removedIds`, which re-enables the Completed checkboxes even though those rounds were rebuilt around the removal.
- Gender is a strict `'M' | 'F'` union with no third option. Gendered and Mixed rounds both assume it.
- Donate now looks unlike every other popup. Jeff chose "Donate only, for now" over rolling the new card style out, so whether the others follow is still open. Surveyed since: **17 card sites across 15 files, and no shared modal primitive** — every popup repeats the backdrop and card markup inline. The backdrop string is byte-identical everywhere, so extracting a `ModalCard` first would beat 17 hand edits. Three would not convert: `InstructionsPanel` (full-screen), `SettingsPanel` (slide-out drawer, no backdrop, `z-0`), `InstallBanner` (inline, not an overlay). Five of the 17 depend on `max-h` / `overflow-y-auto` / `overscroll-contain` that the Donate card does not have, so their scrolling would have to be carried across deliberately.
- The Donate hero and separator are raster PNGs with the card's near-white baked in. If the card background ever changes, both need re-exporting with alpha or they will show as rectangles. `donate-cup.png` is the exception — it has a real alpha channel and composites onto the green button correctly.

---

## Current State — 2026-08-08

**`1.9.1` is live at https://app.pbroundrobin.com**, commit `d22390d`, verified
against the live host: the footer reads v1.9.1, the app renders, a signed-out
visitor still does not preload the Supabase chunk, `/account-top.png` and
`/og-banner.png` both return 200, and the bundle carries "My Account", "Email me
a login code", "merges these duplicates", "Requires confirming" and "Your data
stays safe".

Suite is **260 tests across 18 files**. `tsc -b`, `npx eslint src` and the full
suite all pass. Tracked tree is clean and in sync with `origin/main`.

### Accounts and sync: phases 0 through 4 are shipped

The plan lives outside the repo at
`~/.claude/plans/pickleball-round-robin-generator-linked-mitten.md`. Seven
phases; **0, 1, 2, 3 and 4 are done and live.** The server is the source of
truth, two devices reconcile, and the ask-then-combine flow works — Jeff
confirmed phone and desktop now show matching groups.

Supabase is configured with RLS on all four tables, SMTP through Resend, and
both email templates carry a working `href` and `{{ .Token }}`.

### In progress

Nothing mid-edit.

### Immediate next step

**The accounts plan is finished.** Phase 2b shipped on 2026-08-11 along with
phases 5 and 6 before it, so every numbered phase is done. What is left is the
launch checklist, whose first unticked item is the full restore test into a
scratch Supabase project (Tier B, item 4).

### Open questions and pending decisions

- **The version series restarted at `1.9.1`** and now sorts below the 1.90.2 it
  replaced. Flagged and accepted. Next deploy carries on from 1.9.1.
- **`og-banner.png` is 958KB.** Within every platform's limit, but heavy for a
  scraper fetch. Not optimised; nobody has asked.
- **`INBOX/` is now partly tracked.** The assets this session's code cites are
  committed, so `icons.tsx`'s "verbatim from `INBOX/lock.svg`" comments are
  checkable. `coffee-cup-icon.png` and `favicon.png` were left untracked as
  unrelated leftovers. The wider "commit all of INBOX?" question from 2026-08-07
  is still unsettled.
- The design backlog and the older open questions in the superseded snapshot
  above are all still live: Add Player glyphs, `Partners.svg`, heading icons on
  the left, the `eslint.config.js` ignore fix, whether tests should be
  typechecked, `node_modules_OLD_BACKUP`.
- `FEATURE WISH LIST` still holds one item cut off mid-sentence.

### Worth watching

- **`MergeChoicePanel` has never been seen by a real user in a real conflict.**
  It was verified as a rendered component with fabricated counts. The one live
  exercise of that path was the seed race, and Phase 4 removed the race.
- The three new panels have **no automated coverage**. Nothing in the 260 tests
  mounts them; the eight-state render harness is a throwaway, not a test.
