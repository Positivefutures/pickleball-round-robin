# INBOX

Jeff's source artwork. The icon components in `src/components/icons.tsx` cite
these filenames in their comments — `INBOX/paddle.svg`, `INBOX/star.svg` and so
on — so that the provenance of each hand-inlined path is recoverable. The paths
are inlined into the components, so nothing here is loaded at runtime and
nothing breaks if a file is missing.

## Only part of this directory is tracked

The full folder is about 11MB. Most of that is one-time reference material that
was already consumed, and git history is permanent, so only the reusable sources
are committed — roughly 890KB.

**Tracked:** every `.svg`, the small `.png` sources that feed `public/`
(`Add Person`, `donate-separator`, `Donate-Top-Image`, `My Groups`,
`Select Players`, `share-top-image`), and `logo.png`, the 913×907 robin master
behind the whole icon set.

**Deliberately not tracked** — these are missing on purpose, not lost:

| File | Why not |
|---|---|
| `Donate Mockup.png`, `Share-Mockup{,-2,-3}.png`, `Players Tab.png`, `screenshot.jpg`, `Vercel.png` | 7.6MB of one-time mockups and screenshots, already built from |
| `coffee-cup-icon.png` | 2.1MB raw export. `public/donate-cup.png` (18KB) is what ships |
| `favicon.png` | byte-identical to `logo.png`, same sha256 |
| `share.png` | already in `public/share.png`, and smaller there |

All of them still live in this folder on Jeff's Mac, and the project sits inside
Dropbox, so they are backed up and synced regardless. If you have cloned this
repo and want them, ask.

## Notes on individual files

- `logo.png` and `public/icon-512.png` are **colour type 2, no alpha**, on a
  `#FEFEFE` field, and the robin's dark ring touches all four edges. Neither can
  be composited onto a coloured background without showing a white box and a
  clipped ring. `public/og-banner.png` is built on `#FEFEFE` for exactly this
  reason.
- `Select Players.svg` holds no paths at all, only three PNGs in an SVG wrapper,
  so it is unused. `icons.tsx` uses `checkbox.svg` instead and says so.
- `Partners.svg` has never been used anywhere. Its purpose is unclear.
- `Add Person.png` is a PNG, so the Add Player glyphs are still hand-drawn. They
  are waiting on a real SVG.
