# Replace the green header bar with the cream banner

## Context

The app's masthead is today a flat green bar: `bg-green-700`, white text, the
title on the left and two white-outlined buttons on the right. Jeff has designed
a replacement — `INBOX/header-2.png`, with the type stripped out and re-exported
as `INBOX/header-3.png` — a cream banner with an orange wedge and halftone fade
at top left, the robin badge, teal halftone dots at bottom left, and a
photographic pickleball court cutting in diagonally from the right.

A banner cannot ship as one flat image, because the title is live text of
unpredictable length (`activeRoster.name`, or the 33-character app title on the
roster step) and the header spans every viewport from a phone to a desktop. So
the artwork is cut into two pieces pinned to the left and right edges, with the
flat cream between them doing the stretching.

The text stays exactly what it is today. The mockup's "Saturday Riverside 4.0
Group" is only a guide to size, weight and placement.

## Decisions already taken

- **Buttons float over the court**, restyled so they read on both cream and teal.
- **Artwork comes from `INBOX/header-3.png`**, which has no type baked in.
- **On a narrow phone the court slides off the right edge** — the leading
  diagonal survives, the ball is what goes over the side.
- **The ball keeps its Franklin wordmark**, as in header-3.

## Measured geometry

Everything below is sampled from `INBOX/header-3.png` (2175x723, PNG colour
type 2, opaque — same as Jeff's other exports), not eyeballed. All widths are
multiples of the header's height, `H`.

| | |
|---|---|
| Banner aspect | 3.008 : 1 |
| Left art | source x `0..766` → **1.0609H** wide |
| Flat cream middle | source x `767..1210` → 0.614H at the mockup's aspect |
| Right art | source x `1211..2174` → **1.3333H** wide |
| Title left inset | **0.66H** (badge navy ring ends at 0.54H, white halo ~0.60H) |
| Title vertical centre | 0.511H — i.e. vertically centred |
| Court diagonal | reaches in `0.231H + 1.101H × (y/H)` from the right edge |

Colours, modal-sampled:

| | |
|---|---|
| Cream | `#FBFAF6` |
| Orange | `#FE4B01` |
| Court teal | `#018394` |
| Type navy | `#051829` |

The court's diagonal means the right piece is mostly cream in its upper-left
triangle. Because both pieces ship opaque with cream baked in, the seams against
a flat `#FBFAF6` background are invisible — the same trick `account-top.png` and
`share-top.png` already use.

## Assets

Cut both pieces from `INBOX/header-3.png` at the columns above, at **264px
tall** (covers a 132px header at 2x and an 88px header at 3x).

- **`public/header-left.png`** — 280x264, PNG-8, median-cut palette. Flat art, so
  a palette suits it and keeps the badge ring and wedge edges crisp. Measured:
  **~33 KB at 64 colours, ~40 KB at 128**. Start at 128 and drop if the badge's
  drop shadow does not band.
- **`public/header-right.jpg`** — 352x264, JPEG q≈82 via `sips`. This piece is a
  photograph; PNG-24 of it is 86 KB and PNG-8 bands the ball and the shadow.

Full-colour PNG is not viable for either — the paper grain defeats it, and the
two pieces come to 156 KB at this size.

Generate them with a throwaway script in the scratchpad (decode PNG with
`zlib.inflateSync` and undo the row filters, box-filter downscale, re-encode;
`sips -s format jpeg -s formatOptions 82` for the right piece). `sharp`,
`cwebp` and ImageMagick are all absent, and only `sips` is installed. Commit the
two outputs and record the crop columns in a comment in `Header.tsx`, the same
way the other panel art arrived. Do not add a build-time generation script —
its input would be the untracked `INBOX/`.

**Both go in `RUNTIME_CACHED_PUBLIC`** in [precache.ts](src/lib/precache.ts#L41),
not `PRECACHED_PUBLIC`. `precache.test.ts` fails on any file in `public/` named
in none of the three lists, and the precache budget is 200 KB against ~125 KB
used — these would not fit. They do not need to: the header renders on the first
paint of the first visit, which is necessarily online, so the runtime cache has
them before the user is ever offline. `sw.ts`'s `RUNTIME_IMAGES` regex already
covers `.jpg`.

## The component

Rewrite [Header.tsx](src/components/layout/Header.tsx). **The props do not
change** — `title`, `settingsOpen`, `onToggleSettings`, `onPrint` all stay, so
[App.tsx:628-635](src/App.tsx#L628-L635) needs no edit.

Structure — art in two absolutely-positioned layers, title and buttons above:

```
<header>                    height: var(--hdr), bg #FBFAF6, overflow-hidden, no-print
  <img header-left.png />   inset-y-0 left-0, h-full w-auto
  <div>                     inset-y-0 right-0, overflow-hidden   ← the crop window
    <img header-right.jpg />  absolute left-0, h-full w-auto
  </div>
  <div>                     relative, flex, h-full, items-center → the title
  <div>                     absolute right, vertically centred   → the buttons
</header>
```

Three things carry the layout:

1. **`--hdr`**, set inline on the `<header>` as `clamp(88px, 21vw, 132px)`.
   Everything else is a multiple of it, so the art and the type scale together.

2. **The crop window** is what makes the court slide off. Its width is
   `min(calc(1.3333 * var(--hdr)), calc(100% - <title minimum>))`. It is anchored
   to the right edge while the image inside sits at its left edge, so when the
   window narrows it eats the image from the right — the diagonal leading edge
   survives and the ball goes over the side, which is the behaviour chosen. No
   breakpoint and no JS.

3. **Title inset** `calc(0.66 * var(--hdr))` on the left, and a right padding of
   `max(7.5rem, calc(0.95 * var(--hdr)))` so a long group name clears both the
   buttons and the court's diagonal at the title's lowest line.

The title itself: navy `#051829`, `font-bold tracking-tight leading-tight`, and a
size that has to shrink on a phone — start at `text-[clamp(1.05rem,3.4vw,1.75rem)]`
and settle it against a real screenshot. Add `line-clamp-3` so an absurd group
name cannot push the banner open.

**Buttons.** Keep both, keep their SVGs and all their ARIA. Restyle from
white-outline-on-green to something that reads on cream *and* teal, because at
the vertical centre the button block is wider than the teal is deep and its left
edge lands on cream:

- default: white fill, navy icon, hairline navy ring, small shadow
- settings open: navy fill, white icon (inverting today's `bg-white text-green-700`)

## Everything else that has to move

- **[index.html:11](index.html#L11)** — `theme-color` is `#15803d`, which is
  exactly the header green it was matching. Change to `#FBFAF6`.
- **[public/site.webmanifest](public/site.webmanifest)** — `theme_color` is the
  same green. Change to match. This is the installed PWA's title bar, so it is a
  visible change to anyone who has added the app to a home screen.
- **[src/index.css:12-13](src/index.css#L12-L13)** — the comment says `--text-2xl`
  is deliberately left unscaled in large-text mode "because only the header h1
  title uses it". Once the h1 takes an explicit clamp that is no longer true.
  Update the comment; the behaviour (header title does not scale) is unchanged.
- **[precache.ts](src/lib/precache.ts)** — add both files to
  `RUNTIME_CACHED_PUBLIC`, with a line on why the masthead is not precached.

## Deliberately not in scope

[InstructionsPanel.tsx:57](src/components/layout/InstructionsPanel.tsx#L57) has
`bg-green-700 px-6 py-2.5 text-white` — the old header bar copied onto the
instructions slide-over. When the header goes cream that panel keeps a green bar
that no longer matches anything. It is a different surface and outside "change
the header area", so I will leave it and flag it rather than restyle it
uninstructed.

## Verification

1. `npx tsc --noEmit` and `npm run lint -- src` (lint the `src` directory only —
   a full run is five minutes of noise from a stray backup folder).
2. `npm test`. `precache.test.ts` is the one that will fail if the two new files
   are not listed; nothing asserts on the header's DOM, so no test needs
   rewriting.
3. Screenshot the real thing in a browser — `playwright-core` in the scratchpad
   pointed at the chromium already on disk — at **390px, 768px and 1280px** wide,
   on the roster step (long app title) and on the schedule step (short group
   name). Confirm four things:
   - no seam where either image meets the cream
   - at 390px the court is cropped from its right and the ball is gone, with the
     diagonal intact
   - both buttons are legible where they land, cream or teal
   - the long app title fits without the banner growing
4. Set a long group name (~40 characters) and check it clamps rather than
   colliding with the court.
5. Open settings and confirm the drawer still leaves the settings button on
   screen in the visible sliver of panel.
6. Bump `APP_VERSION` in the same commit as the deploy, or bug reports name the
   wrong build.
