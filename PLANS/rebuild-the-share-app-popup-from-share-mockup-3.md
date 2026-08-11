# Rebuild the Share App popup from Share-Mockup-3

## Context

`SharePanel` is the last of the plain `#444` popups Jeff has redesigned, and he
has supplied `INBOX/Share-Mockup-3.png` plus five assets for it. The current
panel is a bare white box with a heading, the address, a Copy link button and
Close. The mockup adds a hero illustration, a warmer two-sentence pitch, a
two-line Copy button carrying a copy glyph, and a footer line flanked by a star
and a paddle.

Two things came out of exploration that change the shape of the work:

**The panel is currently a fallback almost nobody reaches.** `handleShare` in
`src/App.tsx:129` calls the OS share sheet first and only opens `SharePanel` when
the outcome is `unsupported` or `failed`. On phones and on Chrome/Safari desktop
the native sheet takes over, so the redesign would have shown mainly on Firefox
desktop. Jeff chose to make the panel primary and keep the native sheet as a
button inside it.

**The mockup's URL and one line of copy are deliberately not what ships.** The
mockup still shows `pickleball-round-robin.vercel.app`; the app moved to
`app.pbroundrobin.com` earlier today. And the Copy button's second line is
"Then share it anywhere you'd like", not the mockup's "Tap to copy the link".

Outcome: every user who taps Share App sees the new panel, with one tap to the
native sheet where the browser has one and a copy-link path everywhere.

## Decisions already made

- **Panel always opens.** A green "Share…" button sits above Copy link and opens
  the OS sheet, rendered only where a sheet exists.
- **Keep the `border-[3px] border-[#444]` card.** Share stays matched to the
  other popups; the Donate card style remains a one-off.
- **Use `green-heart.svg` as supplied** — a green disc with the heart knocked
  out — rather than the mockup's 💚 emoji, so it renders identically everywhere.

## Values sampled from the mockup

Read out of `Share-Mockup-3.png` by dominant-ink sampling, not eyeballed:

| Element | Value |
|---|---|
| card | white (`bg-white`), no tint — see the hero warning below |
| heading ink | `#0D141D` |
| body grey | `#495668` |
| green sentence | `#029130` |
| url field | `#F8F9FB` on a `#D4D8DE` border |
| green button | **flat `#018D31`** — a vertical scan is flat top to bottom, unlike Donate's gradient |
| Close label | `#3D495A` |
| footer ink | `#717A87` |
| footer star | `#009424` |

Geometry: the card is 1240px wide in the mockup, the green button 87.7% of that
and the hero 34.8%. `max-w-sm` (384px) with `p-6` gives a 336px content width —
87.5%, so the existing card size is already right. Hero renders at roughly 134px.

## Steps

### 1. Assets

- `INBOX/share-top-image.png` → `public/share-top.png`. It is **PNG colour type
  2, no alpha**, corners sampling `#FEFEFE`, so it has near-white baked in. The
  card must stay white or the hero shows as a visible rectangle. This is the same
  trap as `donate-top.png`, but far more forgiving because `#FEFEFE` against
  `bg-white` is a one-value difference.
- The four SVGs are all real vector single paths, so inline them into
  `src/components/icons.tsx` using the existing `Solid` wrapper
  (`src/components/icons.tsx:11`) and its `viewBox` escape hatch — the same
  treatment `GroupSolidIcon` and `MixedGamesIcon` already get:

  | Asset | viewBox | Note |
  |---|---|---|
  | `copy.svg` | `0 0 24 24` | strip `fill="rgb(0,0,0)"` so it inherits |
  | `paddle.svg` | `0 0 64 64` | strip `fill="#000000"`, keep `fillRule="nonzero"` |
  | `star.svg` | `0 -10 511.98685 511` | already inherits |
  | `green-heart.svg` | `0 0 254000 254000` | **needs `fillRule="evenodd"`** on the path or the heart hole fills in |

- Promote the share glyph in `DonatePanel.tsx:13` (`LinkIcon`, which is
  `INBOX/share.svg`) into `icons.tsx` as `ShareIcon` and have both panels import
  it, rather than inlining the same artwork twice. Confirm Donate still renders
  identically afterwards.

### 2. `src/lib/share.ts` — expose sheet availability

`defaultShare()` is private, so the panel has no way to ask whether a sheet
exists. Export a `canShare()` predicate alongside it. Keep it a plain function,
not a hook — it is read at render time and never changes within a session.

Do **not** disturb the ordering rule documented at `share.ts:38-45`: `share()`
must be called before the first `await` or iOS spends the user gesture and the
sheet silently never opens. The panel's button calls `shareApp()` directly in its
`onClick` for exactly this reason.

### 3. `src/App.tsx` — open the panel first

`handleShare` collapses to `setShowShare(true)`. The `shareApp` import moves out
of `App.tsx` and into `SharePanel`. `showShare` still feeds the `anyPanelOpen`
expression at `App.tsx:115`, so scroll locking is unaffected.

### 4. `src/components/layout/SharePanel.tsx` — the rebuild

Structure top to bottom, keeping the existing backdrop and card container:

- hero `<img src="/share-top.png">` with intrinsic `width`/`height`
- `Share the App` heading
- pitch: grey sentence, then `Thanks for spreading the word!` in `#029130`
  followed by the heart icon
- the address in its `select-all` box, from `APP_URL` — one tap still selects the
  whole thing
- **`Share…`** button, only when `canShare()`; calls `shareApp()` and closes the
  panel on a `shared` outcome, leaves it open on `dismissed`
- **`Copy link`** button, two lines: title plus "Then share it anywhere you'd
  like", with the copy glyph on the left
- `Close`
- footer line: star, `Thanks for being part of the pickleball community!`, paddle

The existing `copied` state and its 2s timeout survive; the copied feedback moves
to the button's second line so the title stays stable. The `catch` that leaves
`copied` false when the clipboard is blocked stays as it is — the address is on
screen and selectable by hand.

### 5. Tests

Add `canShare()` cases to `src/lib/share.test.ts` alongside the existing
`shareApp` block. Note that **nothing currently tests share behaviour end to
end** — the only "shared" hit in `App.walkthrough.test.ts` is about a player in
two groups — so the `handleShare` change has no guard. Add a walkthrough case
that opens Share App and asserts the panel appears.

Tests are excluded from `tsconfig.app.json`, so a green `tsc` proves nothing
about them; run `vitest` explicitly.

## Files touched

| File | Change |
|---|---|
| `src/components/layout/SharePanel.tsx` | the rebuild |
| `src/components/icons.tsx` | four new icons + `ShareIcon` promoted from DonatePanel |
| `src/lib/share.ts` | export `canShare()` |
| `src/App.tsx` | `handleShare` opens the panel |
| `src/components/layout/DonatePanel.tsx` | import `ShareIcon` instead of its local copy |
| `public/share-top.png` | new asset |
| `src/lib/share.test.ts`, `src/App.walkthrough.test.ts` | coverage |

## Verification

- `npx tsc -b`, `npx eslint src`, `npx vitest run` — currently 177 tests across 13
  files, all passing. Lint `src` only; a bare `npm run lint` spends ~5 min on the
  dead `node_modules_OLD_BACKUP`.
- Render the real component and screenshot it, using the recipe in
  `session-notes.md`: `esbuild` a scratch entry with `--bundle --format=cjs
  --platform=node --jsx=automatic` and react externalised, `--outfile` into the
  project root so node resolves `node_modules`, then `renderToStaticMarkup`.
  Inline `dist/assets/*.css` and rewrite `/share-top.png` to a **URL-encoded**
  `file://` path — the project path has spaces and an unencoded URL fails
  silently. Delete the bundle from the project root afterwards.
- Set that screenshot beside `Share-Mockup-3.png` at a matched card width. Render
  both states of the Copy button, and both with and without the `Share…` button,
  since most desktop screenshots will not show it.
- Mount the real App headlessly to confirm Share App now opens the panel rather
  than going straight to the sheet, and that Close still dismisses.
- Check the hero seam explicitly: the card must read as one continuous white. If
  a rectangle is visible, the card has picked up a tint somewhere.
- At a 390px phone width, confirm nothing overflows — the footer line is the
  longest single run of text in the panel and the likeliest to wrap badly.

## Open, to confirm before shipping

`APP_VERSION` is `1.60.1`. This is a visible redesign plus a behaviour change to
Share App, so it wants a bump, and per your usual practice I will not push
without being asked. Both worth settling once the panel looks right.

## Deliberately not doing

- Rolling the card style out to the other popups — still your deferred call, and
  this plan keeps Share on the shared `#444` border rather than starting it.
- Changing what gets shared. `sharePayload()` stays title-plus-url with no `text`
  field, for the reason documented at `share.ts:5-10`.
